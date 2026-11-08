from __future__ import annotations

from datetime import datetime, timedelta
from uuid import UUID

from app.core.errors import NotFoundError
from app.db.base import utcnow
from app.models.auth import User
from app.models.calendar import ActionItem, CalendarEvent
from app.schemas.calendar import (
    ActionItemCreate,
    ActionItemRead,
    ActionItemUpdate,
    CalendarEventCreate,
    CalendarEventRead,
    CalendarEventUpdate,
    CalendarOverview,
)
from app.services.audit_service import write_audit
from fastapi import Request
from sqlalchemy import or_, select
from sqlalchemy.orm import Session


def _require(db: Session, model, entity_id: UUID, message: str):
    row = db.get(model, entity_id)
    if row is None:
        raise NotFoundError(message)
    return row


def _validate_user(db: Session, user_id: UUID | None) -> None:
    if user_id and db.get(User, user_id) is None:
        raise NotFoundError("Utilisateur introuvable.")


def list_events(
    db: Session,
    *,
    q: str | None = None,
    event_type: str | None = None,
    status: str | None = None,
    start_from: datetime | None = None,
    start_to: datetime | None = None,
) -> list[CalendarEventRead]:
    statement = select(CalendarEvent)
    if event_type:
        statement = statement.where(CalendarEvent.event_type == event_type)
    if status:
        statement = statement.where(CalendarEvent.status == status)
    if start_from:
        statement = statement.where(CalendarEvent.start_at >= start_from)
    if start_to:
        statement = statement.where(CalendarEvent.start_at <= start_to)
    if q:
        pattern = f"%{q.strip()}%"
        statement = statement.where(
            or_(
                CalendarEvent.title.ilike(pattern),
                CalendarEvent.description.ilike(pattern),
                CalendarEvent.location.ilike(pattern),
            )
        )
    rows = db.scalars(statement.order_by(CalendarEvent.start_at)).all()
    return [CalendarEventRead.model_validate(row) for row in rows]


def get_event(db: Session, event_id: UUID) -> CalendarEvent:
    return _require(db, CalendarEvent, event_id, "Événement introuvable.")


def create_event(
    db: Session,
    payload: CalendarEventCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> CalendarEventRead:
    _validate_user(db, payload.owner_user_id)
    event = CalendarEvent(**payload.model_dump(), created_by_id=actor.id)
    db.add(event)
    db.flush()
    write_audit(
        db,
        module="calendar",
        action="event_created",
        actor=actor,
        entity_type="calendar_event",
        entity_id=str(event.id),
        entity_label=event.title,
        after={"type": event.event_type, "start_at": event.start_at.isoformat()},
        request=request,
    )
    db.commit()
    db.refresh(event)
    return CalendarEventRead.model_validate(event)


def update_event(
    db: Session,
    event: CalendarEvent,
    payload: CalendarEventUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> CalendarEventRead:
    data = payload.model_dump(exclude_unset=True)
    if "owner_user_id" in data:
        _validate_user(db, data["owner_user_id"])
    for field, value in data.items():
        setattr(event, field, value)
    write_audit(
        db,
        module="calendar",
        action="event_updated",
        actor=actor,
        entity_type="calendar_event",
        entity_id=str(event.id),
        entity_label=event.title,
        request=request,
    )
    db.commit()
    db.refresh(event)
    return CalendarEventRead.model_validate(event)


def delete_event(
    db: Session, event: CalendarEvent, *, actor: User, request: Request | None = None
) -> None:
    write_audit(
        db,
        module="calendar",
        action="event_deleted",
        actor=actor,
        entity_type="calendar_event",
        entity_id=str(event.id),
        entity_label=event.title,
        request=request,
    )
    db.delete(event)
    db.commit()


def list_actions(
    db: Session,
    *,
    q: str | None = None,
    status: str | None = None,
    module: str | None = None,
) -> list[ActionItemRead]:
    statement = select(ActionItem)
    if status:
        statement = statement.where(ActionItem.status == status)
    if module:
        statement = statement.where(ActionItem.module == module)
    if q:
        pattern = f"%{q.strip()}%"
        statement = statement.where(
            or_(ActionItem.title.ilike(pattern), ActionItem.description.ilike(pattern))
        )
    rows = db.scalars(
        statement.order_by(ActionItem.due_date.asc().nullslast(), ActionItem.created_at.desc())
    ).all()
    return [ActionItemRead.model_validate(row) for row in rows]


def get_action(db: Session, action_id: UUID) -> ActionItem:
    return _require(db, ActionItem, action_id, "Action introuvable.")


def create_action(
    db: Session,
    payload: ActionItemCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> ActionItemRead:
    _validate_user(db, payload.owner_user_id)
    action = ActionItem(**payload.model_dump(), created_by_id=actor.id)
    if action.status == "done":
        action.completed_at = utcnow()
    db.add(action)
    db.flush()
    write_audit(
        db,
        module="calendar",
        action="action_created",
        actor=actor,
        entity_type="action_item",
        entity_id=str(action.id),
        entity_label=action.title,
        after={"status": action.status, "priority": action.priority},
        request=request,
    )
    db.commit()
    db.refresh(action)
    return ActionItemRead.model_validate(action)


def update_action(
    db: Session,
    action: ActionItem,
    payload: ActionItemUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> ActionItemRead:
    data = payload.model_dump(exclude_unset=True)
    if "owner_user_id" in data:
        _validate_user(db, data["owner_user_id"])
    for field, value in data.items():
        setattr(action, field, value)
    if action.status == "done" and action.completed_at is None:
        action.completed_at = utcnow()
    if action.status != "done":
        action.completed_at = None
    write_audit(
        db,
        module="calendar",
        action="action_updated",
        actor=actor,
        entity_type="action_item",
        entity_id=str(action.id),
        entity_label=action.title,
        after={"status": action.status},
        request=request,
    )
    db.commit()
    db.refresh(action)
    return ActionItemRead.model_validate(action)


def delete_action(
    db: Session, action: ActionItem, *, actor: User, request: Request | None = None
) -> None:
    write_audit(
        db,
        module="calendar",
        action="action_deleted",
        actor=actor,
        entity_type="action_item",
        entity_id=str(action.id),
        entity_label=action.title,
        request=request,
    )
    db.delete(action)
    db.commit()


def overview(db: Session) -> CalendarOverview:
    now = utcnow()
    horizon = now + timedelta(days=30)
    planned_events = len(
        list(
            db.scalars(
                select(CalendarEvent).where(
                    CalendarEvent.status == "planned",
                    CalendarEvent.start_at >= now,
                    CalendarEvent.start_at <= horizon,
                )
            ).all()
        )
    )
    open_actions = len(
        list(
            db.scalars(
                select(ActionItem).where(
                    ActionItem.status.in_(("todo", "in_progress", "blocked"))
                )
            ).all()
        )
    )
    overdue_actions = len(
        list(
            db.scalars(
                select(ActionItem).where(
                    ActionItem.status.in_(("todo", "in_progress", "blocked")),
                    ActionItem.due_date.is_not(None),
                    ActionItem.due_date < now,
                )
            ).all()
        )
    )
    next_events = db.scalars(
        select(CalendarEvent)
        .where(CalendarEvent.status == "planned", CalendarEvent.start_at >= now)
        .order_by(CalendarEvent.start_at)
        .limit(5)
    ).all()
    next_actions = db.scalars(
        select(ActionItem)
        .where(
            ActionItem.status.in_(("todo", "in_progress", "blocked")),
            ActionItem.due_date.is_not(None),
        )
        .order_by(ActionItem.due_date)
        .limit(5)
    ).all()
    return CalendarOverview(
        planned_events=planned_events,
        overdue_actions=overdue_actions,
        open_actions=open_actions,
        next_events=[CalendarEventRead.model_validate(row) for row in next_events],
        next_actions=[ActionItemRead.model_validate(row) for row in next_actions],
    )
