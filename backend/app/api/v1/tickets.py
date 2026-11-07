from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.core.pagination import PageParams, page_params, paginate_items
from app.db.session import get_db
from app.models.auth import User
from app.schemas.common import Page
from app.schemas.tickets import (
    TicketAssignRequest,
    TicketCommentCreate,
    TicketCreate,
    TicketDetailRead,
    TicketMeta,
    TicketRead,
    TicketTimeEntryCreate,
    TicketTransitionRequest,
    TicketUpdate,
    TicketUserRef,
)
from app.services import tickets_service

router = APIRouter(prefix="/tickets", tags=["Demandes IT"])


@router.get("", response_model=Page[TicketRead])
def list_tickets(
    q: str | None = Query(None, max_length=120),
    status: str | None = Query(None, max_length=50),
    priority: str | None = Query(None, max_length=50),
    category: str | None = Query(None, max_length=50),
    assignee_id: UUID | None = None,
    unassigned: bool = False,
    include_closed: bool = True,
    params: PageParams = Depends(page_params),
    _: User = Depends(require_permission("tickets.read")),
    db: Session = Depends(get_db),
) -> dict:
    items = tickets_service.list_tickets(
        db,
        q=q,
        status_code=status,
        priority_code=priority,
        category_code=category,
        assignee_id=assignee_id,
        unassigned=unassigned,
        include_closed=include_closed,
    )
    return paginate_items(items, params)


@router.get("/meta", response_model=TicketMeta)
def ticket_meta(
    _: User = Depends(require_permission("tickets.read")),
    db: Session = Depends(get_db),
):
    return tickets_service.ticket_meta(db)


@router.get("/assignees", response_model=list[TicketUserRef])
def list_assignees(
    _: User = Depends(require_permission("tickets.read")),
    db: Session = Depends(get_db),
):
    return [TicketUserRef.model_validate(user) for user in tickets_service.assignable_users(db)]


@router.post("", response_model=TicketDetailRead, status_code=201)
def create_ticket(
    payload: TicketCreate,
    request: Request,
    actor: User = Depends(require_permission("tickets.create")),
    db: Session = Depends(get_db),
):
    return tickets_service.create_ticket(db, payload, actor=actor, request=request)


@router.get("/{ticket_id}", response_model=TicketDetailRead)
def get_ticket(
    ticket_id: UUID,
    _: User = Depends(require_permission("tickets.read")),
    db: Session = Depends(get_db),
):
    return tickets_service.get_ticket_detail(db, ticket_id)


@router.patch("/{ticket_id}", response_model=TicketDetailRead)
def update_ticket(
    ticket_id: UUID,
    payload: TicketUpdate,
    request: Request,
    actor: User = Depends(require_permission("tickets.update")),
    db: Session = Depends(get_db),
):
    ticket = tickets_service.get_ticket(db, ticket_id)
    return tickets_service.update_ticket(db, ticket, payload, actor=actor, request=request)


@router.post("/{ticket_id}/assign", response_model=TicketDetailRead)
def assign_ticket(
    ticket_id: UUID,
    payload: TicketAssignRequest,
    request: Request,
    actor: User = Depends(require_permission("tickets.assign")),
    db: Session = Depends(get_db),
):
    ticket = tickets_service.get_ticket(db, ticket_id)
    return tickets_service.assign_ticket(db, ticket, payload, actor=actor, request=request)


@router.post("/{ticket_id}/transition", response_model=TicketDetailRead)
def transition_ticket(
    ticket_id: UUID,
    payload: TicketTransitionRequest,
    request: Request,
    actor: User = Depends(require_permission("tickets.transition")),
    db: Session = Depends(get_db),
):
    ticket = tickets_service.get_ticket(db, ticket_id)
    return tickets_service.transition_ticket(
        db, ticket, payload, actor=actor, request=request
    )


@router.post("/{ticket_id}/comments", response_model=TicketDetailRead, status_code=201)
def add_comment(
    ticket_id: UUID,
    payload: TicketCommentCreate,
    request: Request,
    actor: User = Depends(require_permission("tickets.comment")),
    db: Session = Depends(get_db),
):
    ticket = tickets_service.get_ticket(db, ticket_id)
    return tickets_service.add_comment(db, ticket, payload, actor=actor, request=request)


@router.post("/{ticket_id}/time-entries", response_model=TicketDetailRead, status_code=201)
def add_time_entry(
    ticket_id: UUID,
    payload: TicketTimeEntryCreate,
    request: Request,
    actor: User = Depends(require_permission("tickets.update")),
    db: Session = Depends(get_db),
):
    ticket = tickets_service.get_ticket(db, ticket_id)
    return tickets_service.add_time_entry(db, ticket, payload, actor=actor, request=request)
