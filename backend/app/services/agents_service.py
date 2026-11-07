from __future__ import annotations

from datetime import date
from uuid import UUID

from app.core.errors import ConflictError, NotFoundError
from app.models.assets import Asset
from app.models.auth import User
from app.models.organization import Agent, Location, Service
from app.schemas.agents import AgentAssetRead, AgentCreate, AgentUpdate
from app.services.audit_service import write_audit
from fastapi import Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session


def list_agents(
    db: Session,
    *,
    q: str | None = None,
    service_id: UUID | None = None,
    status: str | None = None,
) -> list[Agent]:
    statement = select(Agent)
    if q:
        pattern = f"%{q.strip()}%"
        statement = statement.where(
            or_(
                Agent.first_name.ilike(pattern),
                Agent.last_name.ilike(pattern),
                Agent.email_pro.ilike(pattern),
                Agent.login.ilike(pattern),
            )
        )
    if service_id:
        statement = statement.where(Agent.service_id == service_id)
    if status:
        statement = statement.where(Agent.status == status)
    return list(db.scalars(statement.order_by(Agent.last_name, Agent.first_name)).all())


def get_agent(db: Session, agent_id: UUID) -> Agent:
    agent = db.get(Agent, agent_id)
    if agent is None:
        raise NotFoundError("Agent introuvable.")
    return agent


def _validate_links(db: Session, service_id: UUID | None, location_id: UUID | None) -> None:
    if service_id and db.get(Service, service_id) is None:
        raise NotFoundError("Service introuvable.")
    if location_id and db.get(Location, location_id) is None:
        raise NotFoundError("Site introuvable.")


def create_agent(
    db: Session,
    payload: AgentCreate,
    *,
    actor: User,
    request: Request | None = None,
    commit: bool = True,
    source: str = "api",
) -> Agent:
    email = str(payload.email_pro).strip().lower()
    if db.scalar(select(Agent).where(func.lower(Agent.email_pro) == email)):
        raise ConflictError("Un agent utilise déjà cette adresse e-mail.")
    if payload.login and db.scalar(select(Agent).where(Agent.login == payload.login)):
        raise ConflictError("Cet identifiant de connexion est déjà utilisé.")
    _validate_links(db, payload.service_id, payload.location_id)
    data = payload.model_dump()
    data["email_pro"] = email
    agent = Agent(**data)
    db.add(agent)
    db.flush()
    write_audit(
        db,
        module="agents",
        action="agent_created",
        actor=actor,
        entity_type="agent",
        entity_id=str(agent.id),
        entity_label=f"{agent.first_name} {agent.last_name}",
        after={"email_pro": agent.email_pro, "service_id": str(agent.service_id) if agent.service_id else None},
        request=request,
        source=source,
    )
    if commit:
        db.commit()
        db.refresh(agent)
    else:
        db.flush()
    return agent


def update_agent(
    db: Session,
    agent: Agent,
    payload: AgentUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> Agent:
    data = payload.model_dump(exclude_unset=True)
    if "email_pro" in data and data["email_pro"] is not None:
        email = str(data["email_pro"]).strip().lower()
        existing = db.scalar(
            select(Agent).where(func.lower(Agent.email_pro) == email, Agent.id != agent.id)
        )
        if existing:
            raise ConflictError("Un agent utilise déjà cette adresse e-mail.")
        data["email_pro"] = email
    if data.get("login"):
        existing = db.scalar(select(Agent).where(Agent.login == data["login"], Agent.id != agent.id))
        if existing:
            raise ConflictError("Cet identifiant de connexion est déjà utilisé.")
    _validate_links(db, data.get("service_id"), data.get("location_id"))
    before = {
        "first_name": agent.first_name,
        "last_name": agent.last_name,
        "email_pro": agent.email_pro,
        "service_id": str(agent.service_id) if agent.service_id else None,
        "status": agent.status,
    }
    for field, value in data.items():
        setattr(agent, field, value)
    write_audit(
        db,
        module="agents",
        action="agent_updated",
        actor=actor,
        entity_type="agent",
        entity_id=str(agent.id),
        entity_label=f"{agent.first_name} {agent.last_name}",
        before=before,
        after={
            "first_name": agent.first_name,
            "last_name": agent.last_name,
            "email_pro": agent.email_pro,
            "service_id": str(agent.service_id) if agent.service_id else None,
            "status": agent.status,
        },
        request=request,
    )
    db.commit()
    db.refresh(agent)
    return agent


def archive_agent(
    db: Session, agent: Agent, *, actor: User, request: Request | None = None
) -> Agent:
    before = {"status": agent.status, "departure_date": str(agent.departure_date) if agent.departure_date else None}
    agent.status = "departed"
    if agent.departure_date is None:
        agent.departure_date = date.today()
    write_audit(
        db,
        module="agents",
        action="agent_archived",
        actor=actor,
        entity_type="agent",
        entity_id=str(agent.id),
        entity_label=f"{agent.first_name} {agent.last_name}",
        before=before,
        after={"status": agent.status, "departure_date": str(agent.departure_date)},
        request=request,
    )
    db.commit()
    db.refresh(agent)
    return agent


def list_agent_assets(db: Session, agent_id: UUID) -> list[AgentAssetRead]:
    rows = db.scalars(
        select(Asset)
        .where(Asset.assigned_agent_id == agent_id, Asset.archived_at.is_(None))
        .order_by(Asset.name)
    ).all()
    return [
        AgentAssetRead(
            id=asset.id,
            asset_tag=asset.asset_tag,
            name=asset.name,
            category_name=asset.category.name if asset.category else None,
            status=asset.status,
        )
        for asset in rows
    ]
