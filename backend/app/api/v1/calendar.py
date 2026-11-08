from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.db.session import get_db
from app.models.auth import User
from app.schemas.calendar import (
    ActionItemCreate,
    ActionItemRead,
    ActionItemUpdate,
    CalendarEventCreate,
    CalendarEventRead,
    CalendarEventUpdate,
    CalendarOverview,
)
from app.services import calendar_service

router = APIRouter(prefix="/calendar", tags=["Calendrier"])


@router.get("/overview", response_model=CalendarOverview)
def overview(
    _: User = Depends(require_permission("calendar.read")),
    db: Session = Depends(get_db),
):
    return calendar_service.overview(db)


@router.get("/events", response_model=list[CalendarEventRead])
def list_events(
    q: str | None = Query(None, max_length=120),
    event_type: str | None = Query(None, max_length=30),
    status: str | None = Query(None, max_length=20),
    start_from: datetime | None = None,
    start_to: datetime | None = None,
    _: User = Depends(require_permission("calendar.read")),
    db: Session = Depends(get_db),
):
    return calendar_service.list_events(
        db,
        q=q,
        event_type=event_type,
        status=status,
        start_from=start_from,
        start_to=start_to,
    )


@router.post("/events", response_model=CalendarEventRead, status_code=201)
def create_event(
    payload: CalendarEventCreate,
    request: Request,
    actor: User = Depends(require_permission("calendar.create")),
    db: Session = Depends(get_db),
):
    return calendar_service.create_event(db, payload, actor=actor, request=request)


@router.get("/events/{event_id}", response_model=CalendarEventRead)
def get_event(
    event_id: UUID,
    _: User = Depends(require_permission("calendar.read")),
    db: Session = Depends(get_db),
):
    return CalendarEventRead.model_validate(calendar_service.get_event(db, event_id))


@router.patch("/events/{event_id}", response_model=CalendarEventRead)
def update_event(
    event_id: UUID,
    payload: CalendarEventUpdate,
    request: Request,
    actor: User = Depends(require_permission("calendar.update")),
    db: Session = Depends(get_db),
):
    event = calendar_service.get_event(db, event_id)
    return calendar_service.update_event(db, event, payload, actor=actor, request=request)


@router.delete("/events/{event_id}", status_code=204)
def delete_event(
    event_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("calendar.delete")),
    db: Session = Depends(get_db),
):
    event = calendar_service.get_event(db, event_id)
    calendar_service.delete_event(db, event, actor=actor, request=request)


@router.get("/actions", response_model=list[ActionItemRead])
def list_actions(
    q: str | None = Query(None, max_length=120),
    status: str | None = Query(None, max_length=20),
    module: str | None = Query(None, max_length=50),
    _: User = Depends(require_permission("calendar.read")),
    db: Session = Depends(get_db),
):
    return calendar_service.list_actions(db, q=q, status=status, module=module)


@router.post("/actions", response_model=ActionItemRead, status_code=201)
def create_action(
    payload: ActionItemCreate,
    request: Request,
    actor: User = Depends(require_permission("actions.create")),
    db: Session = Depends(get_db),
):
    return calendar_service.create_action(db, payload, actor=actor, request=request)


@router.get("/actions/{action_id}", response_model=ActionItemRead)
def get_action(
    action_id: UUID,
    _: User = Depends(require_permission("calendar.read")),
    db: Session = Depends(get_db),
):
    return ActionItemRead.model_validate(calendar_service.get_action(db, action_id))


@router.patch("/actions/{action_id}", response_model=ActionItemRead)
def update_action(
    action_id: UUID,
    payload: ActionItemUpdate,
    request: Request,
    actor: User = Depends(require_permission("actions.update")),
    db: Session = Depends(get_db),
):
    action = calendar_service.get_action(db, action_id)
    return calendar_service.update_action(db, action, payload, actor=actor, request=request)


@router.delete("/actions/{action_id}", status_code=204)
def delete_action(
    action_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("actions.update")),
    db: Session = Depends(get_db),
):
    action = calendar_service.get_action(db, action_id)
    calendar_service.delete_action(db, action, actor=actor, request=request)
