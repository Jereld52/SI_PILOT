from __future__ import annotations

from decimal import Decimal, InvalidOperation
from uuid import UUID

from app.core.errors import NotFoundError, ValidationAppError
from app.db.base import utcnow
from app.models.assets import Asset, Supplier
from app.models.auth import User
from app.models.tickets import Intervention, Ticket
from app.schemas.interventions import InterventionCreate, InterventionRead, InterventionUpdate
from app.services.audit_service import write_audit
from app.services.reference_service import next_reference
from fastapi import Request
from sqlalchemy import or_, select
from sqlalchemy.orm import Session


def _decimal(value: float | None) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError) as exc:
        raise ValidationAppError("Coût invalide.") from exc


def _validate_links(
    db: Session,
    *,
    ticket_id: UUID | None,
    asset_id: UUID | None,
    supplier_id: UUID | None,
    technician_user_id: UUID | None,
) -> None:
    if ticket_id and db.get(Ticket, ticket_id) is None:
        raise NotFoundError("Demande IT introuvable.")
    if asset_id and db.get(Asset, asset_id) is None:
        raise NotFoundError("Équipement introuvable.")
    if supplier_id and db.get(Supplier, supplier_id) is None:
        raise NotFoundError("Fournisseur introuvable.")
    if technician_user_id and db.get(User, technician_user_id) is None:
        raise NotFoundError("Technicien introuvable.")


def _read(intervention: Intervention) -> InterventionRead:
    data = InterventionRead.model_validate(intervention)
    data.cost = float(intervention.cost) if intervention.cost is not None else None
    return data


def list_interventions(
    db: Session,
    *,
    q: str | None = None,
    status: str | None = None,
    ticket_id: UUID | None = None,
    asset_id: UUID | None = None,
) -> list[InterventionRead]:
    statement = select(Intervention)
    if status:
        statement = statement.where(Intervention.status == status)
    if ticket_id:
        statement = statement.where(Intervention.ticket_id == ticket_id)
    if asset_id:
        statement = statement.where(Intervention.asset_id == asset_id)
    if q:
        pattern = f"%{q.strip()}%"
        statement = statement.where(
            or_(
                Intervention.reference.ilike(pattern),
                Intervention.title.ilike(pattern),
                Intervention.description.ilike(pattern),
            )
        )
    rows = db.scalars(
        statement.order_by(Intervention.scheduled_at.desc().nullslast(), Intervention.created_at.desc())
    ).all()
    return [_read(row) for row in rows]


def get_intervention(db: Session, intervention_id: UUID) -> Intervention:
    intervention = db.get(Intervention, intervention_id)
    if intervention is None:
        raise NotFoundError("Intervention introuvable.")
    return intervention


def get_intervention_read(db: Session, intervention_id: UUID) -> InterventionRead:
    return _read(get_intervention(db, intervention_id))


def create_intervention(
    db: Session,
    payload: InterventionCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> InterventionRead:
    _validate_links(
        db,
        ticket_id=payload.ticket_id,
        asset_id=payload.asset_id,
        supplier_id=payload.supplier_id,
        technician_user_id=payload.technician_user_id,
    )
    data = payload.model_dump(exclude={"cost"})
    intervention = Intervention(
        **data,
        reference=next_reference(db, key="intervention", prefix="INT"),
        cost=_decimal(payload.cost),
        created_by_id=actor.id,
    )
    db.add(intervention)
    db.flush()
    write_audit(
        db,
        module="interventions",
        action="intervention_created",
        actor=actor,
        entity_type="intervention",
        entity_id=str(intervention.id),
        entity_label=f"{intervention.reference} — {intervention.title}",
        after={"type": intervention.type, "status": intervention.status},
        request=request,
    )
    db.commit()
    db.refresh(intervention)
    return _read(intervention)


def update_intervention(
    db: Session,
    intervention: Intervention,
    payload: InterventionUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> InterventionRead:
    data = payload.model_dump(exclude_unset=True)
    _validate_links(
        db,
        ticket_id=data.get("ticket_id"),
        asset_id=data.get("asset_id"),
        supplier_id=data.get("supplier_id"),
        technician_user_id=data.get("technician_user_id"),
    )
    if "cost" in data:
        data["cost"] = _decimal(data["cost"])
    previous_status = intervention.status
    for field, value in data.items():
        setattr(intervention, field, value)

    if intervention.status == "in_progress" and intervention.started_at is None:
        intervention.started_at = utcnow()
    if intervention.status == "done" and intervention.ended_at is None:
        intervention.ended_at = utcnow()
    if (
        intervention.duration_minutes is None
        and intervention.started_at is not None
        and intervention.ended_at is not None
    ):
        delta = intervention.ended_at - intervention.started_at
        intervention.duration_minutes = max(0, int(delta.total_seconds() // 60))

    write_audit(
        db,
        module="interventions",
        action="intervention_updated",
        actor=actor,
        entity_type="intervention",
        entity_id=str(intervention.id),
        entity_label=f"{intervention.reference} — {intervention.title}",
        before={"status": previous_status},
        after={"status": intervention.status},
        request=request,
    )
    db.commit()
    db.refresh(intervention)
    return _read(intervention)
