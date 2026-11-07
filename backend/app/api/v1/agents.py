from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.core.pagination import PageParams, page_params, paginate_items
from app.db.session import get_db
from app.models.auth import User
from app.schemas.agents import AgentAssetRead, AgentCreate, AgentRead, AgentUpdate
from app.schemas.common import Page
from app.services import agents_service

router = APIRouter(prefix="/agents", tags=["Agents"])


@router.get("", response_model=Page[AgentRead])
def list_agents(
    q: str | None = Query(None, max_length=120),
    service_id: UUID | None = None,
    status: str | None = Query(None, max_length=20),
    params: PageParams = Depends(page_params),
    _: User = Depends(require_permission("agents.read")),
    db: Session = Depends(get_db),
) -> dict:
    items = agents_service.list_agents(db, q=q, service_id=service_id, status=status)
    return paginate_items(items, params)


@router.post("", response_model=AgentRead, status_code=201)
def create_agent(
    payload: AgentCreate,
    request: Request,
    actor: User = Depends(require_permission("agents.create")),
    db: Session = Depends(get_db),
):
    return agents_service.create_agent(db, payload, actor=actor, request=request)


@router.get("/{agent_id}", response_model=AgentRead)
def get_agent(
    agent_id: UUID,
    _: User = Depends(require_permission("agents.read")),
    db: Session = Depends(get_db),
):
    return agents_service.get_agent(db, agent_id)


@router.get("/{agent_id}/assets", response_model=list[AgentAssetRead])
def get_agent_assets(
    agent_id: UUID,
    _: User = Depends(require_permission("agents.read")),
    db: Session = Depends(get_db),
):
    agents_service.get_agent(db, agent_id)
    return agents_service.list_agent_assets(db, agent_id)


@router.patch("/{agent_id}", response_model=AgentRead)
def update_agent(
    agent_id: UUID,
    payload: AgentUpdate,
    request: Request,
    actor: User = Depends(require_permission("agents.update")),
    db: Session = Depends(get_db),
):
    agent = agents_service.get_agent(db, agent_id)
    return agents_service.update_agent(db, agent, payload, actor=actor, request=request)


@router.delete("/{agent_id}", response_model=AgentRead)
def archive_agent(
    agent_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("agents.delete")),
    db: Session = Depends(get_db),
):
    agent = agents_service.get_agent(db, agent_id)
    return agents_service.archive_agent(db, agent, actor=actor, request=request)
