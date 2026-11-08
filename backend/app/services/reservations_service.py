from __future__ import annotations

from calendar import monthrange
from datetime import UTC, date, datetime, timedelta
from uuid import UUID

from app.core.errors import ConflictError, NotFoundError, PermissionDeniedError, ValidationAppError
from app.core.permissions import has_permission
from app.db.base import utcnow
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
    ReservationAvailability,
    ReservationConflict,
)
from app.services import notifications_service
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


def _find_conflict(
    db: Session,
    *,
    equipment_id: UUID,
    start_at: datetime,
    end_at: datetime,
    exclude_id: UUID | None = None,
) -> EquipmentReservation | None:
    statement = select(EquipmentReservation).where(
        EquipmentReservation.equipment_id == equipment_id,
        EquipmentReservation.status.notin_(("cancelled", "returned")),
        EquipmentReservation.start_at < end_at,
        EquipmentReservation.end_at > start_at,
    )
    if exclude_id:
        statement = statement.where(EquipmentReservation.id != exclude_id)
    return db.scalar(statement.order_by(EquipmentReservation.start_at).limit(1))


def _check_conflict(
    db: Session,
    *,
    equipment_id: UUID,
    start_at: datetime,
    end_at: datetime,
    exclude_id: UUID | None = None,
) -> None:
    conflict = _find_conflict(
        db,
        equipment_id=equipment_id,
        start_at=start_at,
        end_at=end_at,
        exclude_id=exclude_id,
    )
    if conflict is not None:
        raise ConflictError(
            "Ce matériel est déjà réservé sur ce créneau "
            f"({conflict.start_at:%d/%m/%Y %H:%M} → {conflict.end_at:%d/%m/%Y %H:%M})."
        )


def check_availability(
    db: Session,
    *,
    equipment_id: UUID,
    start_at: datetime,
    end_at: datetime,
    exclude_id: UUID | None = None,
) -> ReservationAvailability:
    equipment = get_equipment(db, equipment_id)
    _validate_period(start_at, end_at)
    conflict = _find_conflict(
        db,
        equipment_id=equipment_id,
        start_at=start_at,
        end_at=end_at,
        exclude_id=exclude_id,
    )
    if conflict is None:
        return ReservationAvailability(available=True)
    return ReservationAvailability(
        available=False,
        conflict=ReservationConflict(
            id=conflict.id,
            equipment_name=equipment.name,
            requester_name=conflict.requester_name or conflict.requester_email,
            purpose=conflict.purpose,
            start_at=conflict.start_at,
            end_at=conflict.end_at,
        ),
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


def _add_months(value: datetime, months: int) -> datetime:
    month = value.month - 1 + months
    year = value.year + month // 12
    month = month % 12 + 1
    day = min(value.day, monthrange(year, month)[1])
    return value.replace(year=year, month=month, day=day)


def _occurrences(
    start_at: datetime,
    end_at: datetime,
    recurrence: str,
    recurrence_until: date | None,
) -> list[tuple[datetime, datetime]]:
    if recurrence == "none":
        return [(start_at, end_at)]
    if recurrence_until is None:
        raise ValidationAppError(
            "Indiquez une date de fin pour la réservation récurrente.",
            fields=[{"field": "recurrence_until", "message": "Date de fin requise."}],
        )
    if recurrence_until < start_at.date():
        raise ValidationAppError(
            "La fin de récurrence doit être postérieure au début de la réservation."
        )
    duration = end_at - start_at
    occurrences: list[tuple[datetime, datetime]] = []
    current = start_at
    while current.date() <= recurrence_until:
        if len(occurrences) >= 100:
            raise ValidationAppError(
                "Une série est limitée à 100 occurrences. Raccourcissez la période."
            )
        occurrences.append((current, current + duration))
        if recurrence == "daily":
            current += timedelta(days=1)
        elif recurrence == "weekly":
            current += timedelta(days=7)
        else:
            current = _add_months(current, 1)
    return occurrences


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
    if payload.kind == "unavailability" and not has_permission(
        actor, "reservations.manage"
    ):
        raise PermissionDeniedError(
            "Seuls les gestionnaires peuvent déclarer une indisponibilité."
        )
    _validate_period(payload.start_at, payload.end_at)
    requester_name, requester_email = _apply_requester(
        db,
        requester_agent_id=payload.requester_agent_id,
        requester_name=payload.requester_name,
        requester_email=payload.requester_email,
    )
    occurrences = _occurrences(
        payload.start_at, payload.end_at, payload.recurrence, payload.recurrence_until
    )
    status = "blocked" if payload.kind == "unavailability" else "confirmed"
    rows: list[EquipmentReservation] = []
    for occurrence_start, occurrence_end in occurrences:
        _check_conflict(
            db,
            equipment_id=payload.equipment_id,
            start_at=occurrence_start,
            end_at=occurrence_end,
        )
        row = EquipmentReservation(
            equipment_id=payload.equipment_id,
            requester_agent_id=payload.requester_agent_id,
            requester_name=requester_name,
            requester_email=requester_email,
            purpose=payload.purpose,
            start_at=occurrence_start,
            end_at=occurrence_end,
            notes=payload.notes,
            status=status,
            kind=payload.kind,
            created_by_id=actor.id,
        )
        db.add(row)
        rows.append(row)
    db.flush()
    first = rows[0]
    notifications_service.notify_reservation(
        db,
        first,
        event="unavailability" if payload.kind == "unavailability" else "created",
    )
    write_audit(
        db,
        module="reservations",
        action="reservation_created",
        actor=actor,
        entity_type="equipment_reservation",
        entity_id=str(first.id),
        entity_label=f"{equipment.name} — {first.purpose}",
        after={
            "equipment": equipment.name,
            "start_at": first.start_at.isoformat(),
            "end_at": rows[-1].end_at.isoformat(),
            "occurrences": len(rows),
            "kind": payload.kind,
            "recurrence": payload.recurrence,
        },
        request=request,
    )
    db.commit()
    db.refresh(first)
    return _reservation_read(first)


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
    if status not in ("cancelled", "returned"):
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
    notifications_service.notify_reservation(
        db, row, event="cancelled" if row.status == "cancelled" else "updated"
    )
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
    notifications_service.notify_reservation(db, row, event="cancelled")
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


def check_out(
    db: Session,
    row: EquipmentReservation,
    *,
    actor: User,
    request: Request | None = None,
) -> EquipmentReservationRead:
    if row.status != "confirmed":
        raise ValidationAppError("Seule une réservation confirmée peut être sortie.")
    row.status = "checked_out"
    row.checked_out_at = utcnow()
    notifications_service.notify_reservation(db, row, event="checkout")
    write_audit(
        db,
        module="reservations",
        action="reservation_checked_out",
        actor=actor,
        entity_type="equipment_reservation",
        entity_id=str(row.id),
        entity_label=f"{row.equipment.name} — {row.purpose}",
        after={"status": "checked_out", "checked_out_at": row.checked_out_at.isoformat()},
        request=request,
    )
    db.commit()
    db.refresh(row)
    return _reservation_read(row)


def return_material(
    db: Session,
    row: EquipmentReservation,
    *,
    actor: User,
    request: Request | None = None,
) -> EquipmentReservationRead:
    if row.status not in ("confirmed", "checked_out"):
        raise ValidationAppError("Ce matériel ne peut pas être retourné dans cet état.")
    row.status = "returned"
    row.returned_at = utcnow()
    if row.checked_out_at is None:
        row.checked_out_at = row.returned_at
    notifications_service.notify_reservation(db, row, event="return")
    write_audit(
        db,
        module="reservations",
        action="reservation_returned",
        actor=actor,
        entity_type="equipment_reservation",
        entity_id=str(row.id),
        entity_label=f"{row.equipment.name} — {row.purpose}",
        after={"status": "returned", "returned_at": row.returned_at.isoformat()},
        request=request,
    )
    db.commit()
    db.refresh(row)
    return _reservation_read(row)


def _ics_escape(value: str) -> str:
    return (
        value.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\n", "\\n")
    )


def export_ics(
    db: Session,
    *,
    start: datetime | None = None,
    end: datetime | None = None,
) -> str:
    statement = select(EquipmentReservation).where(
        EquipmentReservation.status.notin_(("cancelled",))
    )
    if start:
        statement = statement.where(EquipmentReservation.end_at > start)
    if end:
        statement = statement.where(EquipmentReservation.start_at < end)
    rows = db.scalars(
        statement.order_by(EquipmentReservation.start_at)
    ).unique().all()
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//SI PNFor PILOTE//Reservations//FR",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:Reservations de materiel - SI PNFor PILOTE",
    ]
    for row in rows:
        unavailable = row.kind == "unavailability"
        summary = (
            f"[Indisponible] {row.equipment.name}"
            if unavailable
            else f"[Reservation] {row.equipment.name}"
        )
        if row.requester_name and not unavailable:
            summary += f" — {row.requester_name}"
        description = [
            f"Motif : {row.purpose}",
            f"Demandeur : {row.requester_name or 'Non precise'}",
        ]
        if row.requester_email:
            description.append(f"E-mail : {row.requester_email}")
        if row.notes:
            description.append(f"Notes : {row.notes}")
        location = row.equipment.location.name if row.equipment.location else ""
        lines.extend(
            [
                "BEGIN:VEVENT",
                f"UID:{row.id}@si-pnfor-pilote",
                f"DTSTAMP:{stamp}",
                f"DTSTART:{row.start_at.astimezone(UTC).strftime('%Y%m%dT%H%M%SZ')}",
                f"DTEND:{row.end_at.astimezone(UTC).strftime('%Y%m%dT%H%M%SZ')}",
                f"SUMMARY:{_ics_escape(summary)}",
                f"DESCRIPTION:{_ics_escape(chr(10).join(description))}",
                f"LOCATION:{_ics_escape(location)}",
                "STATUS:CONFIRMED",
                "END:VEVENT",
            ]
        )
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"
