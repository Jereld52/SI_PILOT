from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from uuid import UUID

from app.core.errors import ConflictError, NotFoundError, ValidationAppError
from app.core.permissions import has_permission
from app.models.auth import User
from app.models.organization import (
    Agent,
    ChecklistRun,
    ChecklistRunItem,
    ChecklistTemplate,
)
from app.schemas.onboarding import (
    AgentTimeline,
    ChecklistItemUpdate,
    ChecklistRunCreate,
    ChecklistRunItemRead,
    ChecklistRunRead,
    ChecklistRunUpdate,
    ChecklistTemplateRead,
    OnboardingAlert,
    OnboardingBriefing,
)
from app.services.audit_service import write_audit
from fastapi import Request
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload


def _permission_for_type(run_type: str) -> str:
    return "agents.onboarding" if run_type == "onboarding" else "agents.offboarding"


def require_manage(actor: User, run_type: str) -> None:
    if not (
        has_permission(actor, _permission_for_type(run_type))
        or has_permission(actor, "agents.update")
    ):
        from app.core.errors import PermissionDeniedError

        raise PermissionDeniedError(
            "Votre rôle ne permet pas de gérer ce type de dossier."
        )


def _agent_name(agent: Agent) -> str:
    return f"{agent.first_name} {agent.last_name}"


def _run_read(run: ChecklistRun, *, include_items: bool = False) -> ChecklistRunRead:
    items = list(run.items)
    total = len(items)
    done = sum(1 for item in items if item.is_done)
    required = [item for item in items if item.is_required]
    required_done = sum(1 for item in required if item.is_done)
    basis_total = len(required) or total
    basis_done = required_done if required else done
    progress = round(basis_done * 100 / basis_total) if basis_total else 0
    today = date.today()
    is_overdue = (
        run.status == "in_progress"
        and run.due_date is not None
        and run.due_date < today
    )
    return ChecklistRunRead(
        id=run.id,
        template_id=run.template_id,
        template_name=run.template.name if run.template else "",
        agent_id=run.agent_id,
        agent_name=_agent_name(run.agent) if run.agent else "",
        agent_service=run.agent.service.name if run.agent and run.agent.service else "",
        type=run.type,
        status=run.status,
        started_at=run.started_at,
        due_date=run.due_date,
        completed_at=run.completed_at,
        notes=run.notes,
        total_items=total,
        done_items=done,
        required_total=len(required),
        required_done=required_done,
        progress_percent=progress,
        is_overdue=is_overdue,
        items=[
            ChecklistRunItemRead(
                id=item.id,
                label=item.label,
                is_required=item.is_required,
                is_done=item.is_done,
                done_at=item.done_at,
                notes=item.notes,
            )
            for item in items
        ]
        if include_items
        else [],
    )


def list_templates(
    db: Session, *, template_type: str | None = None
) -> list[ChecklistTemplateRead]:
    statement = (
        select(ChecklistTemplate)
        .options(selectinload(ChecklistTemplate.items))
        .where(ChecklistTemplate.is_active.is_(True))
    )
    if template_type:
        statement = statement.where(ChecklistTemplate.type == template_type)
    rows = db.scalars(statement.order_by(ChecklistTemplate.name)).all()
    return [ChecklistTemplateRead.model_validate(row) for row in rows]


def list_runs(
    db: Session,
    *,
    run_type: str | None = None,
    status: str | None = None,
    query: str | None = None,
    overdue_only: bool = False,
    limit: int = 200,
) -> list[ChecklistRunRead]:
    statement = select(ChecklistRun).options(selectinload(ChecklistRun.items))
    if run_type:
        statement = statement.where(ChecklistRun.type == run_type)
    if status:
        statement = statement.where(ChecklistRun.status == status)
    if overdue_only:
        statement = statement.where(
            ChecklistRun.status == "in_progress",
            ChecklistRun.due_date.is_not(None),
            ChecklistRun.due_date < date.today(),
        )
    if query:
        pattern = f"%{query.strip()}%"
        statement = statement.join(Agent, Agent.id == ChecklistRun.agent_id).where(
            or_(
                Agent.first_name.ilike(pattern),
                Agent.last_name.ilike(pattern),
                Agent.email_pro.ilike(pattern),
                Agent.login.ilike(pattern),
            )
        )
    rows = db.scalars(
        statement.order_by(
            ChecklistRun.due_date.asc().nullslast(),
            ChecklistRun.started_at.desc(),
        ).limit(limit)
    ).all()
    return [_run_read(row) for row in rows]


def get_run(db: Session, run_id: UUID) -> ChecklistRun:
    run = db.scalar(
        select(ChecklistRun)
        .options(selectinload(ChecklistRun.items))
        .where(ChecklistRun.id == run_id)
    )
    if run is None:
        raise NotFoundError("Dossier d'arrivée ou de départ introuvable.")
    return run


def get_run_read(db: Session, run_id: UUID) -> ChecklistRunRead:
    return _run_read(get_run(db, run_id), include_items=True)


def create_run(
    db: Session,
    payload: ChecklistRunCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> ChecklistRunRead:
    require_manage(actor, payload.type)
    agent = db.get(Agent, payload.agent_id)
    if agent is None:
        raise NotFoundError("Agent introuvable.")
    if payload.template_id:
        template = db.get(ChecklistTemplate, payload.template_id)
    else:
        template = db.scalar(
            select(ChecklistTemplate).where(
                ChecklistTemplate.type == payload.type,
                ChecklistTemplate.is_active.is_(True),
            )
        )
    if template is None:
        raise NotFoundError("Modèle de checklist introuvable.")
    if template.type != payload.type:
        raise ValidationAppError(
            "Le modèle sélectionné ne correspond pas au type de dossier."
        )
    existing = db.scalar(
        select(ChecklistRun).where(
            ChecklistRun.agent_id == agent.id,
            ChecklistRun.type == payload.type,
            ChecklistRun.status == "in_progress",
        )
    )
    if existing is not None:
        raise ConflictError(
            f"Un dossier {payload.type} est déjà en cours pour cet agent."
        )
    due_date = payload.due_date
    if due_date is None:
        due_date = (
            agent.arrival_date if payload.type == "onboarding" else agent.departure_date
        )
    run = ChecklistRun(
        template_id=template.id,
        agent_id=agent.id,
        type=payload.type,
        status="in_progress",
        started_at=date.today(),
        due_date=due_date,
        notes=payload.notes,
        created_by_id=actor.id,
    )
    db.add(run)
    db.flush()
    for template_item in sorted(template.items, key=lambda item: item.position):
        db.add(
            ChecklistRunItem(
                run_id=run.id,
                template_item_id=template_item.id,
                label=template_item.label,
                is_required=template_item.is_required,
            )
        )
    write_audit(
        db,
        module="agents",
        action=f"{payload.type}_run_created",
        actor=actor,
        entity_type="checklist_run",
        entity_id=str(run.id),
        entity_label=f"{_agent_name(agent)} — {template.name}",
        after={"type": payload.type, "due_date": str(due_date or "")},
        request=request,
    )
    db.commit()
    db.refresh(run)
    return get_run_read(db, run.id)


def update_run(
    db: Session,
    run: ChecklistRun,
    payload: ChecklistRunUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> ChecklistRunRead:
    require_manage(actor, run.type)
    data = payload.model_dump(exclude_unset=True)
    if "status" in data and data["status"] is not None:
        status = data["status"]
        run.status = status
        if status == "completed":
            run.completed_at = date.today()
        elif status == "in_progress":
            run.completed_at = None
    if "due_date" in data:
        run.due_date = payload.due_date
    if "notes" in data:
        run.notes = payload.notes
    write_audit(
        db,
        module="agents",
        action=f"{run.type}_run_updated",
        actor=actor,
        entity_type="checklist_run",
        entity_id=str(run.id),
        entity_label=f"{_agent_name(run.agent)} — {run.template.name}",
        after={"status": run.status, "due_date": str(run.due_date or "")},
        request=request,
    )
    db.commit()
    return get_run_read(db, run.id)


def update_item(
    db: Session,
    run: ChecklistRun,
    item_id: UUID,
    payload: ChecklistItemUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> ChecklistRunRead:
    require_manage(actor, run.type)
    item = db.get(ChecklistRunItem, item_id)
    if item is None or item.run_id != run.id:
        raise NotFoundError("Tâche de checklist introuvable.")
    item.is_done = payload.is_done
    item.done_at = date.today() if payload.is_done else None
    item.done_by_id = actor.id if payload.is_done else None
    if payload.notes is not None:
        item.notes = payload.notes
    required = [entry for entry in run.items if entry.is_required]
    if required and all(entry.is_done for entry in required):
        run.status = "completed"
        run.completed_at = date.today()
    elif run.status == "completed":
        run.status = "in_progress"
        run.completed_at = None
    write_audit(
        db,
        module="agents",
        action="checklist_item_toggled",
        actor=actor,
        entity_type="checklist_run_item",
        entity_id=str(item.id),
        entity_label=f"{_agent_name(run.agent)} — {item.label}",
        after={"is_done": item.is_done},
        request=request,
    )
    db.commit()
    return get_run_read(db, run.id)


def get_agent_timeline(db: Session, agent_id: UUID) -> AgentTimeline:
    agent = db.get(Agent, agent_id)
    if agent is None:
        raise NotFoundError("Agent introuvable.")
    rows = db.scalars(
        select(ChecklistRun)
        .options(selectinload(ChecklistRun.items))
        .where(ChecklistRun.agent_id == agent.id)
        .order_by(ChecklistRun.started_at.desc().nullslast())
    ).all()
    return AgentTimeline(
        agent_id=agent.id,
        agent_name=_agent_name(agent),
        runs=[_run_read(row) for row in rows],
    )


def briefing(db: Session, *, actor: User | None = None) -> OnboardingBriefing:
    today = date.today()
    horizon = today + timedelta(days=30)
    items: list[OnboardingAlert] = []
    counts = {
        "upcoming_arrivals": 0,
        "upcoming_departures": 0,
        "in_progress": 0,
        "overdue": 0,
        "missing_onboarding": 0,
        "missing_offboarding": 0,
    }

    arrivals = db.scalars(
        select(Agent)
        .where(
            Agent.arrival_date.is_not(None),
            Agent.arrival_date >= today,
            Agent.arrival_date <= horizon,
            Agent.status != "departed",
        )
        .order_by(Agent.arrival_date.asc())
    ).all()
    counts["upcoming_arrivals"] = len(arrivals)
    for agent in arrivals:
        arrival = agent.arrival_date
        assert arrival is not None
        run = db.scalar(
            select(ChecklistRun).where(
                ChecklistRun.agent_id == agent.id,
                ChecklistRun.type == "onboarding",
                ChecklistRun.status.in_(("in_progress", "completed")),
            )
        )
        if run is None:
            counts["missing_onboarding"] += 1
            items.append(
                OnboardingAlert(
                    severity="high" if (arrival - today).days <= 7 else "medium",
                    title=f"Arrivée sans dossier : {_agent_name(agent)}",
                    detail=(
                        f"Arrivée le {arrival:%d/%m/%Y} sans dossier "
                        "d'arrivée ouvert."
                    ),
                    agent_id=agent.id,
                    link=f"/arrivees-departs?agent={agent.id}",
                )
            )

    departures = db.scalars(
        select(Agent)
        .where(
            Agent.departure_date.is_not(None),
            Agent.departure_date >= today,
            Agent.departure_date <= horizon,
            Agent.status != "departed",
        )
        .order_by(Agent.departure_date.asc())
    ).all()
    counts["upcoming_departures"] = len(departures)
    for agent in departures:
        departure = agent.departure_date
        assert departure is not None
        run = db.scalar(
            select(ChecklistRun).where(
                ChecklistRun.agent_id == agent.id,
                ChecklistRun.type == "offboarding",
                ChecklistRun.status.in_(("in_progress", "completed")),
            )
        )
        if run is None:
            counts["missing_offboarding"] += 1
            items.append(
                OnboardingAlert(
                    severity="high" if (departure - today).days <= 7 else "medium",
                    title=f"Départ sans dossier : {_agent_name(agent)}",
                    detail=(
                        f"Départ le {departure:%d/%m/%Y} sans dossier "
                        "de départ ouvert."
                    ),
                    agent_id=agent.id,
                    link=f"/arrivees-departs?agent={agent.id}",
                )
            )

    runs = db.scalars(
        select(ChecklistRun)
        .options(selectinload(ChecklistRun.items))
        .where(ChecklistRun.status == "in_progress")
        .order_by(ChecklistRun.due_date.asc().nullslast())
    ).all()
    counts["in_progress"] = len(runs)
    for run in runs:
        read = _run_read(run)
        if read.is_overdue:
            counts["overdue"] += 1
            items.append(
                OnboardingAlert(
                    severity="critical" if run.type == "offboarding" else "high",
                    title=f"Dossier {run.type} en retard : {read.agent_name}",
                    detail=(
                        f"Échéance {run.due_date:%d/%m/%Y}, "
                        f"{read.required_done}/{read.required_total} tâche(s) obligatoire(s) faite(s)."
                    ),
                    agent_id=run.agent_id,
                    run_id=run.id,
                    link=f"/arrivees-departs?run={run.id}",
                )
            )
        elif read.progress_percent < 50 and run.due_date is not None:
            items.append(
                OnboardingAlert(
                    severity="medium",
                    title=f"Dossier {run.type} peu avancé : {read.agent_name}",
                    detail=(
                        f"{read.progress_percent}% réalisé, échéance "
                        f"{run.due_date:%d/%m/%Y}."
                    ),
                    agent_id=run.agent_id,
                    run_id=run.id,
                    link=f"/arrivees-departs?run={run.id}",
                )
            )

    departed = db.scalars(
        select(Agent)
        .where(Agent.status == "departed", Agent.departure_date.is_not(None))
        .order_by(Agent.departure_date.desc())
        .limit(30)
    ).all()
    for agent in departed:
        completed = db.scalar(
            select(ChecklistRun).where(
                ChecklistRun.agent_id == agent.id,
                ChecklistRun.type == "offboarding",
                ChecklistRun.status == "completed",
            )
        )
        if completed is None:
            items.append(
                OnboardingAlert(
                    severity="medium",
                    title=f"Départ incomplet : {_agent_name(agent)}",
                    detail="Aucun dossier de départ clôturé pour cet agent.",
                    agent_id=agent.id,
                    link=f"/arrivees-departs?agent={agent.id}",
                )
            )

    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
    items.sort(key=lambda item: severity_order.get(item.severity, 5))
    return OnboardingBriefing(
        generated_at=datetime.now(UTC),
        counts=counts,
        items=items[:40],
        runs=[_run_read(run) for run in runs[:40]],
    )
