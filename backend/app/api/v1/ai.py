from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.db.session import get_db
from app.models.auth import User
from app.schemas.ai import (
    AiChatRequest,
    AiChatResponse,
    AiConfigRead,
    AiConfigUpdate,
    AiStatusRead,
    AiTestResponse,
)
from app.services import ai_service

router = APIRouter(prefix="/ai", tags=["Assistant IA"])
admin_router = APIRouter(prefix="/admin/ai", tags=["Administration assistant IA"])


@router.get("/status", response_model=AiStatusRead)
def get_status(
    _: User = Depends(require_permission("ai.use")),
    db: Session = Depends(get_db),
) -> AiStatusRead:
    return ai_service.get_status(db)


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
        request=request,
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


@admin_router.post("/test", response_model=AiTestResponse)
def test_connection(
    request: Request,
    actor: User = Depends(require_permission("ai.configure")),
    db: Session = Depends(get_db),
) -> AiTestResponse:
    return ai_service.test_connection(db, actor=actor, request=request)
