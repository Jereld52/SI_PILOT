from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

from app.core.errors import NotFoundError, ValidationAppError
from app.db.base import utcnow
from app.models.assets import Asset
from app.models.auth import User
from app.models.organization import Agent, Service
from app.models.tickets import (
    Ticket,
    TicketAsset,
    TicketCategory,
    TicketComment,
    TicketHistory,
    TicketPriority,
    TicketStatus,
    TicketTimeEntry,
)
from app.schemas.stock import StockAssetRef
from app.schemas.tickets import (
    TicketAssignRequest,
    TicketCategoryRead,
    TicketCommentCreate,
    TicketCommentRead,
    TicketCreate,
    TicketDetailRead,
    TicketHistoryRead,
    TicketMeta,
    TicketPriorityRead,
    TicketRead,
    TicketStatusCount,
    TicketStatusRead,
    TicketTimeEntryCreate,
    TicketTimeEntryRead,
    TicketTransitionRequest,
    TicketUpdate,
)
from app.services.audit_service import write_audit
from app.services.reference_service import next_reference
from fastapi import Request
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session


def _require(db: Session, model, entity_id: UUID, message: str):
    row = db.get(model, entity_id)
    if row is None:
        raise NotFoundError(message)
    return row


def _get_asset_ids(db: Session, asset_ids: list[UUID]) -> list[Asset]:
    if not asset_ids:
        return []
    assets = list(db.scalars(select(Asset).where(Asset.id.in_(asset_ids))).all())
    if len(assets) != len(set(asset_ids)):
        raise NotFoundError("Un équipement lié est introuvable.")
    return assets


def _set_assets(db: Session, ticket: Ticket, asset_ids: list[UUID]) -> None:
    assets = _get_asset_ids(db, asset_ids)
    db.execute(delete(TicketAsset).where(TicketAsset.ticket_id == ticket.id))
    for asset in assets:
        db.add(TicketAsset(ticket_id=ticket.id, asset_id=asset.id, relation="concerned"))


def _add_history(
    db: Session,
    ticket: Ticket,
    *,
    actor: User,
    field: str,
    old_value: str | None = None,
    new_value: str | None = None,
    note: str | None = None,
) -> None:
    db.add(
        TicketHistory(
            ticket_id=ticket.id,
            actor_user_id=actor.id,
            field=field,
            old_value=old_value[:512] if old_value else None,
            new_value=new_value[:512] if new_value else None,
            note=note,
        )
    )


def _apply_status(ticket: Ticket, status: TicketStatus) -> None:
    ticket.status_id = status.id
    now = utcnow()
    if status.is_closed:
        ticket.closed_at = now
        if ticket.resolved_at is None:
            ticket.resolved_at = now
    else:
        ticket.closed_at = None
        if status.code == "resolved":
            ticket.resolved_at = now
        else:
            ticket.resolved_at = None


def _first_response(ticket: Ticket) -> None:
    if ticket.first_response_at is None:
        ticket.first_response_at = utcnow()


def list_tickets(
    db: Session,
    *,
    q: str | None = None,
    status_code: str | None = None,
    priority_code: str | None = None,
    category_code: str | None = None,
    assignee_id: UUID | None = None,
    unassigned: bool = False,
    include_closed: bool = True,
) -> list[Ticket]:
    statement = select(Ticket).join(TicketStatus, Ticket.status_id == TicketStatus.id)
    if not include_closed:
        statement = statement.where(TicketStatus.is_closed.is_(False))
    if q:
        pattern = f"%{q.strip()}%"
        statement = statement.where(
            or_(
                Ticket.reference.ilike(pattern),
                Ticket.subject.ilike(pattern),
                Ticket.description.ilike(pattern),
            )
        )
    if status_code:
        statement = statement.where(TicketStatus.code == status_code)
    if priority_code:
        statement = statement.join(
            TicketPriority, Ticket.priority_id == TicketPriority.id
        ).where(TicketPriority.code == priority_code)
    if category_code:
        statement = statement.join(
            TicketCategory, Ticket.category_id == TicketCategory.id
        ).where(TicketCategory.code == category_code)
    if assignee_id:
        statement = statement.where(Ticket.assignee_user_id == assignee_id)
    if unassigned:
        statement = statement.where(Ticket.assignee_user_id.is_(None))
    return list(db.scalars(statement.order_by(Ticket.opened_at.desc())).all())


def get_ticket(db: Session, ticket_id: UUID) -> Ticket:
    return _require(db, Ticket, ticket_id, "Demande IT introuvable.")


def assignable_users(db: Session) -> list[User]:
    return list(
        db.scalars(
            select(User)
            .where(User.is_active.is_(True))
            .order_by(User.last_name, User.first_name)
        ).all()
    )


def get_ticket_detail(db: Session, ticket_id: UUID) -> TicketDetailRead:
    ticket = get_ticket(db, ticket_id)
    detail = TicketDetailRead.model_validate(ticket)
    assets = db.scalars(
        select(Asset)
        .join(TicketAsset, TicketAsset.asset_id == Asset.id)
        .where(TicketAsset.ticket_id == ticket.id)
        .order_by(Asset.name)
    ).all()
    detail.assets = [StockAssetRef.model_validate(asset) for asset in assets]
    comments = db.scalars(
        select(TicketComment)
        .where(TicketComment.ticket_id == ticket.id)
        .order_by(TicketComment.created_at)
    ).all()
    detail.comments = [TicketCommentRead.model_validate(comment) for comment in comments]
    history = db.scalars(
        select(TicketHistory)
        .where(TicketHistory.ticket_id == ticket.id)
        .order_by(TicketHistory.occurred_at)
    ).all()
    detail.history = [TicketHistoryRead.model_validate(row) for row in history]
    entries = db.scalars(
        select(TicketTimeEntry)
        .where(TicketTimeEntry.ticket_id == ticket.id)
        .order_by(TicketTimeEntry.performed_on)
    ).all()
    detail.time_entries = [TicketTimeEntryRead.model_validate(row) for row in entries]
    return detail


def ticket_meta(db: Session) -> TicketMeta:
    categories = list(
        db.scalars(
            select(TicketCategory)
            .where(TicketCategory.is_active.is_(True))
            .order_by(TicketCategory.sort_order, TicketCategory.name)
        ).all()
    )
    statuses = list(
        db.scalars(
            select(TicketStatus)
            .where(TicketStatus.is_active.is_(True))
            .order_by(TicketStatus.sort_order)
        ).all()
    )
    priorities = list(
        db.scalars(
            select(TicketPriority)
            .where(TicketPriority.is_active.is_(True))
            .order_by(TicketPriority.level)
        ).all()
    )
    counts = dict(
        db.execute(
            select(TicketStatus.code, func.count(Ticket.id))
            .join(Ticket, Ticket.status_id == TicketStatus.id)
            .group_by(TicketStatus.code)
        ).all()
    )
    open_count = (
        db.scalar(
            select(func.count())
            .select_from(Ticket)
            .join(TicketStatus, Ticket.status_id == TicketStatus.id)
            .where(TicketStatus.is_closed.is_(False))
        )
        or 0
    )
    unassigned_count = (
        db.scalar(
            select(func.count())
            .select_from(Ticket)
            .join(TicketStatus, Ticket.status_id == TicketStatus.id)
            .where(TicketStatus.is_closed.is_(False), Ticket.assignee_user_id.is_(None))
        )
        or 0
    )
    return TicketMeta(
        categories=[TicketCategoryRead.model_validate(item) for item in categories],
        statuses=[TicketStatusRead.model_validate(item) for item in statuses],
        priorities=[TicketPriorityRead.model_validate(item) for item in priorities],
        status_counts=[
            TicketStatusCount(code=status.code, name=status.name, count=counts.get(status.code, 0))
            for status in statuses
        ],
        open_count=open_count,
        unassigned_count=unassigned_count,
    )


def create_ticket(
    db: Session,
    payload: TicketCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> TicketDetailRead:
    category = _require(db, TicketCategory, payload.category_id, "Catégorie introuvable.")
    priority = _require(db, TicketPriority, payload.priority_id, "Priorité introuvable.")
    new_status = db.scalar(select(TicketStatus).where(TicketStatus.code == "new"))
    if new_status is None:
        raise ValidationAppError("Le statut « Nouveau » n'est pas configuré.")
    if payload.requester_agent_id:
        _require(db, Agent, payload.requester_agent_id, "Agent demandeur introuvable.")
    if payload.service_id:
        _require(db, Service, payload.service_id, "Service introuvable.")
    if payload.assignee_user_id:
        _require(db, User, payload.assignee_user_id, "Utilisateur assigné introuvable.")
    _get_asset_ids(db, payload.asset_ids)

    due_at = payload.due_at
    if due_at is None and priority.resolution_hours:
        due_at = datetime.now(UTC) + timedelta(hours=priority.resolution_hours)

    ticket = Ticket(
        reference=next_reference(db, key="ticket", prefix="DEM"),
        subject=payload.subject.strip(),
        description=payload.description,
        requester_agent_id=payload.requester_agent_id,
        service_id=payload.service_id,
        category_id=category.id,
        priority_id=priority.id,
        status_id=new_status.id,
        assignee_user_id=payload.assignee_user_id,
        source=payload.source,
        due_at=due_at,
        created_by_id=actor.id,
        updated_by_id=actor.id,
    )
    db.add(ticket)
    db.flush()
    if payload.asset_ids:
        _set_assets(db, ticket, payload.asset_ids)
    _add_history(
        db,
        ticket,
        actor=actor,
        field="created",
        new_value=ticket.reference,
        note="Demande créée.",
    )
    if payload.assignee_user_id:
        _first_response(ticket)
    write_audit(
        db,
        module="tickets",
        action="ticket_created",
        actor=actor,
        entity_type="ticket",
        entity_id=str(ticket.id),
        entity_label=f"{ticket.reference} — {ticket.subject}",
        after={"reference": ticket.reference, "priority": priority.code, "category": category.code},
        request=request,
    )
    db.commit()
    db.refresh(ticket)
    return get_ticket_detail(db, ticket.id)


def update_ticket(
    db: Session,
    ticket: Ticket,
    payload: TicketUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> TicketDetailRead:
    data = payload.model_dump(exclude_unset=True)
    asset_ids = data.pop("asset_ids", None)

    if data.get("category_id"):
        _require(db, TicketCategory, data["category_id"], "Catégorie introuvable.")
    if data.get("priority_id"):
        _require(db, TicketPriority, data["priority_id"], "Priorité introuvable.")
    if data.get("requester_agent_id"):
        _require(db, Agent, data["requester_agent_id"], "Agent demandeur introuvable.")
    if data.get("service_id"):
        _require(db, Service, data["service_id"], "Service introuvable.")
    if data.get("assignee_user_id"):
        _require(db, User, data["assignee_user_id"], "Utilisateur assigné introuvable.")

    before = {
        "subject": ticket.subject,
        "category_id": str(ticket.category_id),
        "priority_id": str(ticket.priority_id),
        "assignee_user_id": str(ticket.assignee_user_id) if ticket.assignee_user_id else None,
        "due_at": ticket.due_at.isoformat() if ticket.due_at else None,
    }
    if "subject" in data and data["subject"]:
        data["subject"] = str(data["subject"]).strip()
    for field, value in data.items():
        setattr(ticket, field, value)
    if asset_ids is not None:
        _set_assets(db, ticket, asset_ids)
        _add_history(db, ticket, actor=actor, field="assets", note="Équipements liés mis à jour.")

    for field in ("category_id", "priority_id", "assignee_user_id", "subject"):
        if field in data:
            _add_history(
                db,
                ticket,
                actor=actor,
                field=field,
                old_value=before.get(field),
                new_value=str(data[field]) if data[field] is not None else None,
            )
    ticket.updated_by_id = actor.id
    write_audit(
        db,
        module="tickets",
        action="ticket_updated",
        actor=actor,
        entity_type="ticket",
        entity_id=str(ticket.id),
        entity_label=f"{ticket.reference} — {ticket.subject}",
        before=before,
        after={
            "subject": ticket.subject,
            "category_id": str(ticket.category_id),
            "priority_id": str(ticket.priority_id),
            "assignee_user_id": str(ticket.assignee_user_id) if ticket.assignee_user_id else None,
        },
        request=request,
    )
    db.commit()
    db.refresh(ticket)
    return get_ticket_detail(db, ticket.id)


def assign_ticket(
    db: Session,
    ticket: Ticket,
    payload: TicketAssignRequest,
    *,
    actor: User,
    request: Request | None = None,
) -> TicketDetailRead:
    if payload.assignee_user_id:
        _require(db, User, payload.assignee_user_id, "Utilisateur assigné introuvable.")
    previous = ticket.assignee_user_id
    ticket.assignee_user_id = payload.assignee_user_id
    ticket.updated_by_id = actor.id
    _first_response(ticket)
    _add_history(
        db,
        ticket,
        actor=actor,
        field="assignee_user_id",
        old_value=str(previous) if previous else None,
        new_value=str(payload.assignee_user_id) if payload.assignee_user_id else None,
        note=payload.note,
    )
    write_audit(
        db,
        module="tickets",
        action="ticket_assigned",
        actor=actor,
        entity_type="ticket",
        entity_id=str(ticket.id),
        entity_label=ticket.reference,
        before={"assignee_user_id": str(previous) if previous else None},
        after={"assignee_user_id": str(ticket.assignee_user_id) if ticket.assignee_user_id else None},
        request=request,
    )
    db.commit()
    db.refresh(ticket)
    return get_ticket_detail(db, ticket.id)


def transition_ticket(
    db: Session,
    ticket: Ticket,
    payload: TicketTransitionRequest,
    *,
    actor: User,
    request: Request | None = None,
) -> TicketDetailRead:
    status = _require(db, TicketStatus, payload.status_id, "Statut introuvable.")
    previous = ticket.status_id
    previous_code = ticket.status.code
    _apply_status(ticket, status)
    if payload.resolution is not None:
        ticket.resolution = payload.resolution
    ticket.updated_by_id = actor.id
    _first_response(ticket)
    _add_history(
        db,
        ticket,
        actor=actor,
        field="status",
        old_value=previous_code,
        new_value=status.code,
        note=payload.note,
    )
    write_audit(
        db,
        module="tickets",
        action="ticket_status_changed",
        actor=actor,
        entity_type="ticket",
        entity_id=str(ticket.id),
        entity_label=ticket.reference,
        before={"status_id": str(previous), "status": previous_code},
        after={"status_id": str(status.id), "status": status.code},
        request=request,
    )
    db.commit()
    db.refresh(ticket)
    return get_ticket_detail(db, ticket.id)


def add_comment(
    db: Session,
    ticket: Ticket,
    payload: TicketCommentCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> TicketDetailRead:
    comment = TicketComment(
        ticket_id=ticket.id,
        author_user_id=actor.id,
        body=payload.body.strip(),
        is_internal=payload.is_internal,
    )
    db.add(comment)
    _first_response(ticket)
    ticket.updated_by_id = actor.id
    _add_history(
        db,
        ticket,
        actor=actor,
        field="comment",
        note="Commentaire interne" if payload.is_internal else "Commentaire ajouté",
    )
    write_audit(
        db,
        module="tickets",
        action="ticket_commented",
        actor=actor,
        entity_type="ticket",
        entity_id=str(ticket.id),
        entity_label=ticket.reference,
        after={"is_internal": payload.is_internal},
        request=request,
    )
    db.commit()
    db.refresh(ticket)
    return get_ticket_detail(db, ticket.id)


def add_time_entry(
    db: Session,
    ticket: Ticket,
    payload: TicketTimeEntryCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> TicketDetailRead:
    entry = TicketTimeEntry(
        ticket_id=ticket.id,
        user_id=actor.id,
        minutes=payload.minutes,
        performed_on=payload.performed_on or utcnow(),
        comment=payload.comment,
    )
    db.add(entry)
    ticket.time_spent_minutes = (ticket.time_spent_minutes or 0) + payload.minutes
    ticket.updated_by_id = actor.id
    _add_history(
        db,
        ticket,
        actor=actor,
        field="time_spent_minutes",
        new_value=str(payload.minutes),
        note=payload.comment,
    )
    write_audit(
        db,
        module="tickets",
        action="ticket_time_logged",
        actor=actor,
        entity_type="ticket",
        entity_id=str(ticket.id),
        entity_label=ticket.reference,
        after={"minutes": payload.minutes},
        request=request,
    )
    db.commit()
    db.refresh(ticket)
    return get_ticket_detail(db, ticket.id)


def ticket_read(ticket: Ticket) -> TicketRead:
    return TicketRead.model_validate(ticket)
