from __future__ import annotations

from datetime import datetime
from uuid import UUID

from app.core.errors import ConflictError, NotFoundError, ValidationAppError
from app.models.auth import User
from app.models.organization import Agent, Location
from app.models.reservations import EquipmentReservation, ReservableEquipment
from app.schemas.reservations import (
    EquipmentReservationCreate,
    EquipmentReservationRead,
    EquipmentReservationUpdate,
    ReservableEquipmentCreate,
    ReservableEquipmentRead,
    ReservableEquipmentUpdate,
)
from app.services.audit_service import write_audit
from fastapi import Request
from sqlalchemy import select
from sqlalchemy.orm import Session


def _equipment_read(row: ReservableEquipment) -> ReservableEquipmentRead:
    return ReservableEquipmentRead.model_validate(row)


def _reservation_read(row: EquipmentReservation) -> EquipmentReservationRead:
    data = EquipmentReservationRead.model_validate(row)
    data.created_by_label = row.created_by_label
    return data


def reservation_read(row: EquipmentReservation) -> EquipmentReservationRead:
    return _reservation_read(row)


def list_equipments(
    db: Session, *, include_inactive: bool = False
) -> list[ReservableEquipmentRead]:
    statement = select(ReservableEquipment)
    if not include_inactive:
        statement = statement.where(ReservableEquipment.is_active.is_(True))
    rows = db.scalars(
        statement.order_by(ReservableEquipment.sort_order, ReservableEquipment.name)
    ).all()
    return [_equipment_read(row) for row in rows]


def get_equipment(db: Session, equipment_id: UUID) -> ReservableEquipment:
    row = db.get(ReservableEquipment, equipment_id)
    if row is None:
        raise NotFoundError("Matériel réservable introuvable.")
    return row


def _validate_location(db: Session, location_id: UUID | None) -> None:
    if location_id and db.get(Location, location_id) is None:
        raise NotFoundError("Site introuvable.")


def _check_equipment_name(
    db: Session, name: str, *, exclude_id: UUID | None = None
) -> None:
    statement = select(ReservableEquipment).where(
        ReservableEquipment.name == name.strip()
    )
    if exclude_id:
        statement = statement.where(ReservableEquipment.id != exclude_id)
    if db.scalar(statement):
        raise ConflictError("Un matériel réservable porte déjà ce nom.")


def create_equipment(
    db: Session,
    payload: ReservableEquipmentCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> ReservableEquipmentRead:
    _validate_location(db, payload.location_id)
    _check_equipment_name(db, payload.name)
    row = ReservableEquipment(**payload.model_dump())
    db.add(row)
    db.flush()
    write_audit(
        db,
        module="reservations",
        action="reservable_equipment_created",
        actor=actor,
        entity_type="reservable_equipment",
        entity_id=str(row.id),
        entity_label=row.name,
        after={"category": row.category, "is_active": row.is_active},
        request=request,
    )
    db.commit()
    db.refresh(row)
    return _equipment_read(row)


def update_equipment(
    db: Session,
    row: ReservableEquipment,
    payload: ReservableEquipmentUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> ReservableEquipmentRead:
    data = payload.model_dump(exclude_unset=True)
    if "location_id" in data:
        _validate_location(db, data["location_id"])
    if "name" in data and data["name"]:
        _check_equipment_name(db, data["name"], exclude_id=row.id)
    before = {"name": row.name, "is_active": row.is_active}
    for field, value in data.items():
        setattr(row, field, value)
    write_audit(
        db,
        module="reservations",
        action="reservable_equipment_updated",
        actor=actor,
        entity_type="reservable_equipment",
        entity_id=str(row.id),
        entity_label=row.name,
        before=before,
        after={"name": row.name, "is_active": row.is_active},
        request=request,
    )
    db.commit()
    db.refresh(row)
    return _equipment_read(row)


def archive_equipment(
    db: Session,
    row: ReservableEquipment,
    *,
    actor: User,
    request: Request | None = None,
) -> ReservableEquipmentRead:
    row.is_active = False
    write_audit(
        db,
        module="reservations",
        action="reservable_equipment_archived",
        actor=actor,
        entity_type="reservable_equipment",
        entity_id=str(row.id),
        entity_label=row.name,
        after={"is_active": False},
        request=request,
    )
    db.commit()
    db.refresh(row)
    return _equipment_read(row)


def get_reservation(db: Session, reservation_id: UUID) -> EquipmentReservation:
    row = db.get(EquipmentReservation, reservation_id)
    if row is None:
        raise NotFoundError("Réservation introuvable.")
    return row


def _check_conflict(
    db: Session,
    *,
    equipment_id: UUID,
    start_at: datetime,
    end_at: datetime,
    exclude_id: UUID | None = None,
) -> None:
    statement = select(EquipmentReservation).where(
        EquipmentReservation.equipment_id == equipment_id,
        EquipmentReservation.status != "cancelled",
        EquipmentReservation.start_at < end_at,
        EquipmentReservation.end_at > start_at,
    )
    if exclude_id:
        statement = statement.where(EquipmentReservation.id != exclude_id)
    conflict = db.scalar(
        statement.order_by(EquipmentReservation.start_at).limit(1)
    )
    if conflict is not None:
        raise ConflictError(
            "Ce matériel est déjà réservé sur ce créneau "
            f"({conflict.start_at:%d/%m/%Y %H:%M} → {conflict.end_at:%d/%m/%Y %H:%M})."
        )


def _validate_period(start_at: datetime, end_at: datetime) -> None:
    if end_at <= start_at:
        raise ValidationAppError(
            "La fin de réservation doit être postérieure au début.",
            fields=[{"field": "end_at", "message": "Fin invalide."}],
        )


def _apply_requester(
    db: Session,
    *,
    requester_agent_id: UUID | None,
    requester_name: str | None,
    requester_email: str | None,
) -> tuple[str | None, str | None]:
    if not requester_agent_id:
        return requester_name.strip() if requester_name else None, (
            requester_email.strip() if requester_email else None
        )
    agent = db.get(Agent, requester_agent_id)
    if agent is None:
        raise NotFoundError("Agent demandeur introuvable.")
    name = requester_name.strip() if requester_name else (
        f"{agent.first_name} {agent.last_name}".strip()
    )
    email = requester_email.strip() if requester_email else agent.email_pro
    return name, email


def list_reservations(
    db: Session,
    *,
    start: datetime | None = None,
    end: datetime | None = None,
    equipment_id: UUID | None = None,
    include_cancelled: bool = False,
) -> list[EquipmentReservationRead]:
    statement = select(EquipmentReservation)
    if not include_cancelled:
        statement = statement.where(EquipmentReservation.status != "cancelled")
    if equipment_id:
        statement = statement.where(EquipmentReservation.equipment_id == equipment_id)
    if start:
        statement = statement.where(EquipmentReservation.end_at > start)
    if end:
        statement = statement.where(EquipmentReservation.start_at < end)
    rows = db.scalars(
        statement.order_by(
            EquipmentReservation.start_at, EquipmentReservation.equipment_id
        )
    ).unique().all()
    return [_reservation_read(row) for row in rows]


def create_reservation(
    db: Session,
    payload: EquipmentReservationCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> EquipmentReservationRead:
    equipment = get_equipment(db, payload.equipment_id)
    if not equipment.is_active:
        raise ValidationAppError("Ce matériel n'est plus disponible à la réservation.")
    _validate_period(payload.start_at, payload.end_at)
    _check_conflict(
        db,
        equipment_id=payload.equipment_id,
        start_at=payload.start_at,
        end_at=payload.end_at,
    )
    requester_name, requester_email = _apply_requester(
        db,
        requester_agent_id=payload.requester_agent_id,
        requester_name=payload.requester_name,
        requester_email=payload.requester_email,
    )
    row = EquipmentReservation(
        equipment_id=payload.equipment_id,
        requester_agent_id=payload.requester_agent_id,
        requester_name=requester_name,
        requester_email=requester_email,
        purpose=payload.purpose,
        start_at=payload.start_at,
        end_at=payload.end_at,
        notes=payload.notes,
        status="confirmed",
        created_by_id=actor.id,
    )
    db.add(row)
    db.flush()
    write_audit(
        db,
        module="reservations",
        action="reservation_created",
        actor=actor,
        entity_type="equipment_reservation",
        entity_id=str(row.id),
        entity_label=f"{equipment.name} — {row.purpose}",
        after={
            "equipment": equipment.name,
            "start_at": row.start_at.isoformat(),
            "end_at": row.end_at.isoformat(),
        },
        request=request,
    )
    db.commit()
    db.refresh(row)
    return _reservation_read(row)


def update_reservation(
    db: Session,
    row: EquipmentReservation,
    payload: EquipmentReservationUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> EquipmentReservationRead:
    data = payload.model_dump(exclude_unset=True)
    equipment_id = data.get("equipment_id", row.equipment_id)
    equipment = get_equipment(db, equipment_id)
    start_at = data.get("start_at", row.start_at)
    end_at = data.get("end_at", row.end_at)
    status = data.get("status", row.status)
    _validate_period(start_at, end_at)
    if status != "cancelled":
        _check_conflict(
            db,
            equipment_id=equipment_id,
            start_at=start_at,
            end_at=end_at,
            exclude_id=row.id,
        )
    if "requester_agent_id" in data or "requester_name" in data or "requester_email" in data:
        name, email = _apply_requester(
            db,
            requester_agent_id=data.get("requester_agent_id", row.requester_agent_id),
            requester_name=data.get("requester_name", row.requester_name),
            requester_email=data.get("requester_email", row.requester_email),
        )
        data["requester_name"] = name
        data["requester_email"] = email
    before = {
        "equipment": row.equipment.name,
        "start_at": row.start_at.isoformat(),
        "end_at": row.end_at.isoformat(),
        "status": row.status,
    }
    for field, value in data.items():
        setattr(row, field, value)
    write_audit(
        db,
        module="reservations",
        action="reservation_updated",
        actor=actor,
        entity_type="equipment_reservation",
        entity_id=str(row.id),
        entity_label=f"{equipment.name} — {row.purpose}",
        before=before,
        after={
            "equipment": row.equipment.name,
            "start_at": row.start_at.isoformat(),
            "end_at": row.end_at.isoformat(),
            "status": row.status,
        },
        request=request,
    )
    db.commit()
    db.refresh(row)
    return _reservation_read(row)


def cancel_reservation(
    db: Session,
    row: EquipmentReservation,
    *,
    actor: User,
    request: Request | None = None,
) -> EquipmentReservationRead:
    row.status = "cancelled"
    write_audit(
        db,
        module="reservations",
        action="reservation_cancelled",
        actor=actor,
        entity_type="equipment_reservation",
        entity_id=str(row.id),
        entity_label=f"{row.equipment.name} — {row.purpose}",
        after={"status": "cancelled"},
        request=request,
    )
    db.commit()
    db.refresh(row)
    return _reservation_read(row)
