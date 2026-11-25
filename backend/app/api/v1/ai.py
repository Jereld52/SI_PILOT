from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.core.errors import PermissionDeniedError, ValidationAppError
from app.core.permissions import has_permission
from app.db.session import get_db
from app.models.auth import User
from app.models.tickets import TicketCategory, TicketPriority
from app.schemas.ai import (
    AiActionExecuteResponse,
    AiActionProposal,
    AiChatRequest,
    AiChatResponse,
    AiConfigRead,
    AiConfigUpdate,
    AiModelsResponse,
    AiStatusRead,
    AiTestResponse,
    AiToolInfo,
)
from app.schemas.calendar import ActionItemCreate
from app.schemas.communication import CommunicationCreate, MeetingCreate
from app.schemas.tickets import TicketCreate
from app.services import (
    ai_service,
    ai_tools_service,
    calendar_service,
    communication_service,
    tickets_service,
)

router = APIRouter(prefix="/ai", tags=["Assistant IA"])
admin_router = APIRouter(prefix="/admin/ai", tags=["Administration assistant IA"])


@router.get("/status", response_model=AiStatusRead)
def get_status(
    _: User = Depends(require_permission("ai.use")),
    db: Session = Depends(get_db),
) -> AiStatusRead:
    return ai_service.get_status(db)


@router.get("/tools", response_model=list[AiToolInfo])
def list_tools(
    actor: User = Depends(require_permission("ai.use")),
) -> list[dict[str, str]]:
    return ai_tools_service.list_tools(actor)


@router.post("/chat", response_model=AiChatResponse)
def chat(
    payload: AiChatRequest,
    request: Request,
    actor: User = Depends(require_permission("ai.use")),
    db: Session = Depends(get_db),
) -> AiChatResponse:
    return ai_service.chat(
        db,
        payload.messages,
        actor=actor,
        include_context=payload.include_context,
        context=payload.context,
        request=request,
    )


def _ticket_category(db: Session, code: str | None):
    category = None
    if code:
        category = db.scalar(
            select(TicketCategory).where(
                TicketCategory.code == code,
                TicketCategory.is_active.is_(True),
            )
        )
    if category is None:
        category = db.scalar(
            select(TicketCategory)
            .where(TicketCategory.is_active.is_(True))
            .order_by(TicketCategory.sort_order)
        )
    if category is None:
        raise ValidationAppError("Aucune catégorie de demande active n'est configurée.")
    return category


def _ticket_priority(db: Session, code: str):
    priority = db.scalar(
        select(TicketPriority).where(
            TicketPriority.code == code,
            TicketPriority.is_active.is_(True),
        )
    )
    if priority is None:
        priority = db.scalar(
            select(TicketPriority)
            .where(TicketPriority.is_active.is_(True))
            .order_by(TicketPriority.level.desc())
        )
    if priority is None:
        raise ValidationAppError("Aucune priorité de demande active n'est configurée.")
    return priority


@router.post("/actions/execute", response_model=AiActionExecuteResponse)
def execute_action(
    payload: AiActionProposal,
    request: Request,
    actor: User = Depends(require_permission("ai.use")),
    db: Session = Depends(get_db),
) -> AiActionExecuteResponse:
    if payload.type == "create_ticket":
        if not has_permission(actor, "tickets.create"):
            raise PermissionDeniedError("Vous ne pouvez pas créer de demande IT.")
        category = _ticket_category(db, payload.category)
        priority = _ticket_priority(db, payload.priority)
        ticket = tickets_service.create_ticket(
            db,
            TicketCreate(
                subject=payload.title,
                description=payload.description,
                category_id=category.id,
                priority_id=priority.id,
                source="manual",
            ),
            actor=actor,
            request=request,
        )
        return AiActionExecuteResponse(
            message=f"Demande {ticket.reference} créée : {ticket.subject}",
            link=f"/demandes?ticket={ticket.id}",
        )
    if payload.type == "create_meeting":
        if not has_permission(actor, "meetings.manage"):
            raise PermissionDeniedError("Vous ne pouvez pas créer de réunion.")
        if payload.scheduled_at is None:
            raise ValidationAppError("La date de la réunion est manquante.")
        meeting = communication_service.create_meeting(
            db,
            MeetingCreate(
                title=payload.title,
                scheduled_at=payload.scheduled_at,
                duration_minutes=payload.duration_minutes or 60,
                location=payload.location,
                agenda=payload.description,
                status="planned",
            ),
            actor=actor,
            request=request,
        )
        return AiActionExecuteResponse(
            message=f"Réunion créée : {meeting.title}",
            link=f"/communication/reunions?meeting={meeting.id}",
        )
    if payload.type == "create_communication":
        if not has_permission(actor, "communications.manage"):
            raise PermissionDeniedError("Vous ne pouvez pas créer de communication.")
        communication = communication_service.create_communication(
            db,
            CommunicationCreate(
                title=payload.title,
                body=payload.description or payload.title,
                category="information",
                audience="all",
                channel="in_app",
                status="draft",
                author_user_id=actor.id,
            ),
            actor=actor,
            request=request,
        )
        return AiActionExecuteResponse(
            message=f"Brouillon de communication créé : {communication.title}",
            link="/communication/communications",
        )

    if not has_permission(actor, "actions.create"):
        raise PermissionDeniedError("Vous ne pouvez pas créer d'action.")
    due_at = None
    if payload.due_date:
        due_at = datetime.combine(
            payload.due_date, datetime.min.time(), tzinfo=UTC
        ).replace(hour=9)
    action = calendar_service.create_action(
        db,
        ActionItemCreate(
            title=payload.title,
            description=payload.description,
            module="ai",
            priority=payload.priority,
            due_date=due_at,
            owner_user_id=actor.id,
        ),
        actor=actor,
        request=request,
    )
    return AiActionExecuteResponse(
        message=f"Action créée : {action.title}",
        link="/calendrier?tab=actions",
    )


@admin_router.get("/config", response_model=AiConfigRead)
def get_config(
    _: User = Depends(require_permission("ai.configure")),
    db: Session = Depends(get_db),
) -> AiConfigRead:
    return ai_service.get_settings(db)


@admin_router.put("/config", response_model=AiConfigRead)
def update_config(
    payload: AiConfigUpdate,
    request: Request,
    actor: User = Depends(require_permission("ai.configure")),
    db: Session = Depends(get_db),
) -> AiConfigRead:
    return ai_service.update_settings(db, payload, actor=actor, request=request)


@admin_router.get("/models", response_model=AiModelsResponse)
def list_models(
    _: User = Depends(require_permission("ai.configure")),
    db: Session = Depends(get_db),
) -> AiModelsResponse:
    return ai_service.list_models(db)


@admin_router.post("/test", response_model=AiTestResponse)
def test_connection(
    request: Request,
    actor: User = Depends(require_permission("ai.configure")),
    db: Session = Depends(get_db),
) -> AiTestResponse:
    return ai_service.test_connection(db, actor=actor, request=request)
