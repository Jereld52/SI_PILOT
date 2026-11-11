from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_permission
from app.db.session import get_db
from app.models.auth import User
from app.schemas.onboarding import (
    AgentTimeline,
    ChecklistItemUpdate,
    ChecklistRunCreate,
    ChecklistRunRead,
    ChecklistRunUpdate,
    ChecklistTemplateRead,
    OnboardingBriefing,
)
from app.services import onboarding_service

router = APIRouter(prefix="/onboarding", tags=["Arrivées et départs"])


@router.get("/templates", response_model=list[ChecklistTemplateRead])
def list_templates(
    template_type: str | None = Query(None, alias="type", max_length=20),
    _: User = Depends(require_permission("agents.read")),
    db: Session = Depends(get_db),
) -> list[ChecklistTemplateRead]:
    return onboarding_service.list_templates(db, template_type=template_type)


@router.get("/runs", response_model=list[ChecklistRunRead])
def list_runs(
    run_type: str | None = Query(None, alias="type", max_length=20),
    status: str | None = Query(None, max_length=20),
    q: str | None = Query(None, max_length=120),
    overdue_only: bool = False,
    _: User = Depends(require_permission("agents.read")),
    db: Session = Depends(get_db),
) -> list[ChecklistRunRead]:
    return onboarding_service.list_runs(
        db,
        run_type=run_type,
        status=status,
        query=q,
        overdue_only=overdue_only,
    )


@router.post("/runs", response_model=ChecklistRunRead, status_code=201)
def create_run(
    payload: ChecklistRunCreate,
    request: Request,
    actor: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChecklistRunRead:
    return onboarding_service.create_run(db, payload, actor=actor, request=request)


@router.get("/runs/{run_id}", response_model=ChecklistRunRead)
def get_run(
    run_id: UUID,
    _: User = Depends(require_permission("agents.read")),
    db: Session = Depends(get_db),
) -> ChecklistRunRead:
    return onboarding_service.get_run_read(db, run_id)


@router.patch("/runs/{run_id}", response_model=ChecklistRunRead)
def update_run(
    run_id: UUID,
    payload: ChecklistRunUpdate,
    request: Request,
    actor: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChecklistRunRead:
    run = onboarding_service.get_run(db, run_id)
    return onboarding_service.update_run(
        db, run, payload, actor=actor, request=request
    )


@router.post("/runs/{run_id}/items/{item_id}", response_model=ChecklistRunRead)
def update_item(
    run_id: UUID,
    item_id: UUID,
    payload: ChecklistItemUpdate,
    request: Request,
    actor: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChecklistRunRead:
    run = onboarding_service.get_run(db, run_id)
    return onboarding_service.update_item(
        db, run, item_id, payload, actor=actor, request=request
    )


@router.get("/briefing", response_model=OnboardingBriefing)
def get_briefing(
    actor: User = Depends(require_permission("agents.read")),
    db: Session = Depends(get_db),
) -> OnboardingBriefing:
    return onboarding_service.briefing(db, actor=actor)


@router.get("/agents/{agent_id}/timeline", response_model=AgentTimeline)
def agent_timeline(
    agent_id: UUID,
    _: User = Depends(require_permission("agents.read")),
    db: Session = Depends(get_db),
) -> AgentTimeline:
    return onboarding_service.get_agent_timeline(db, agent_id)
