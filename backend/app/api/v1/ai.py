from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.db.session import get_db
from app.models.auth import User
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
from app.services import ai_service, ai_tools_service, calendar_service

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


@router.post("/actions/execute", response_model=AiActionExecuteResponse)
def execute_action(
    payload: AiActionProposal,
    request: Request,
    _: User = Depends(require_permission("ai.use")),
    actor: User = Depends(require_permission("actions.create")),
    db: Session = Depends(get_db),
) -> AiActionExecuteResponse:
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
