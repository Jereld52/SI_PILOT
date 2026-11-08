from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from app.core.errors import ConflictError, NotFoundError
from app.models.auth import User
from app.models.projects import (
    Project,
    ProjectDecision,
    ProjectMilestone,
    ProjectRisk,
    ProjectTask,
)
from app.schemas.projects import (
    DecisionCreate,
    DecisionRead,
    DecisionUpdate,
    MilestoneCreate,
    MilestoneRead,
    MilestoneUpdate,
    ProjectCreate,
    ProjectDetailRead,
    ProjectRead,
    ProjectUpdate,
    RiskCreate,
    RiskRead,
    RiskUpdate,
    TaskCreate,
    TaskRead,
    TaskUpdate,
)
from app.services.audit_service import write_audit
from fastapi import Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session


def _require(db: Session, model, entity_id: UUID, message: str):
    row = db.get(model, entity_id)
    if row is None:
        raise NotFoundError(message)
    return row


def _validate_user(db: Session, user_id: UUID | None) -> None:
    if user_id and db.get(User, user_id) is None:
        raise NotFoundError("Utilisateur introuvable.")


def _project_read(project: Project) -> ProjectRead:
    data = ProjectRead.model_validate(project)
    data.planned_budget = (
        float(project.planned_budget) if project.planned_budget is not None else None
    )
    data.milestone_count = len(project.milestones)
    data.task_count = len(project.tasks)
    data.open_task_count = sum(1 for task in project.tasks if task.status != "done")
    data.risk_count = len(project.risks)
    return data


def _risk_read(risk: ProjectRisk) -> RiskRead:
    data = RiskRead.model_validate(risk)
    data.score = risk.probability * risk.impact
    return data


def _detail(project: Project) -> ProjectDetailRead:
    detail = ProjectDetailRead.model_validate(project)
    read = _project_read(project)
    detail.milestone_count = read.milestone_count
    detail.task_count = read.task_count
    detail.open_task_count = read.open_task_count
    detail.risk_count = read.risk_count
    detail.milestones = [MilestoneRead.model_validate(item) for item in project.milestones]
    detail.tasks = [TaskRead.model_validate(item) for item in project.tasks]
    detail.risks = [_risk_read(item) for item in project.risks]
    detail.decisions = [
        DecisionRead.model_validate(item) for item in project.decisions
    ]
    return detail


def list_projects(
    db: Session,
    *,
    q: str | None = None,
    status: str | None = None,
    priority: str | None = None,
) -> list[ProjectRead]:
    statement = select(Project)
    if status:
        statement = statement.where(Project.status == status)
    if priority:
        statement = statement.where(Project.priority == priority)
    if q:
        pattern = f"%{q.strip()}%"
        statement = statement.where(
            or_(
                Project.code.ilike(pattern),
                Project.name.ilike(pattern),
                Project.description.ilike(pattern),
            )
        )
    rows = db.scalars(statement.order_by(Project.due_date.asc().nullslast(), Project.name)).all()
    return [_project_read(row) for row in rows]


def get_project(db: Session, project_id: UUID) -> Project:
    return _require(db, Project, project_id, "Projet introuvable.")


def get_project_detail(db: Session, project_id: UUID) -> ProjectDetailRead:
    return _detail(get_project(db, project_id))


def _check_code(db: Session, code: str, *, exclude_id: UUID | None = None) -> None:
    statement = select(Project).where(func.lower(Project.code) == code.lower())
    if exclude_id:
        statement = statement.where(Project.id != exclude_id)
    if db.scalar(statement):
        raise ConflictError("Un projet utilise déjà ce code.")


def _recalculate_progress(project: Project) -> None:
    if not project.tasks:
        return
    done = sum(1 for task in project.tasks if task.status == "done")
    project.progress_percent = round(done * 100 / len(project.tasks))


def create_project(
    db: Session,
    payload: ProjectCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> ProjectRead:
    _validate_user(db, payload.owner_user_id)
    code = payload.code.strip()
    _check_code(db, code)
    data = payload.model_dump(exclude={"code", "planned_budget"})
    project = Project(
        **data,
        code=code,
        planned_budget=(
            Decimal(str(payload.planned_budget))
            if payload.planned_budget is not None
            else None
        ),
        created_by_id=actor.id,
    )
    db.add(project)
    db.flush()
    write_audit(
        db,
        module="projects",
        action="project_created",
        actor=actor,
        entity_type="project",
        entity_id=str(project.id),
        entity_label=f"{project.code} — {project.name}",
        after={"status": project.status, "priority": project.priority},
        request=request,
    )
    db.commit()
    db.refresh(project)
    return _project_read(project)


def update_project(
    db: Session,
    project: Project,
    payload: ProjectUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> ProjectRead:
    data = payload.model_dump(exclude_unset=True)
    if "owner_user_id" in data:
        _validate_user(db, data["owner_user_id"])
    if "code" in data and data["code"]:
        code = str(data["code"]).strip()
        _check_code(db, code, exclude_id=project.id)
        data["code"] = code
    if "planned_budget" in data and data["planned_budget"] is not None:
        data["planned_budget"] = Decimal(str(data["planned_budget"]))
    before = {"status": project.status, "progress_percent": project.progress_percent}
    for field, value in data.items():
        setattr(project, field, value)
    write_audit(
        db,
        module="projects",
        action="project_updated",
        actor=actor,
        entity_type="project",
        entity_id=str(project.id),
        entity_label=f"{project.code} — {project.name}",
        before=before,
        after={"status": project.status, "progress_percent": project.progress_percent},
        request=request,
    )
    db.commit()
    db.refresh(project)
    return _project_read(project)


def archive_project(
    db: Session, project: Project, *, actor: User, request: Request | None = None
) -> ProjectRead:
    previous = project.status
    project.status = "cancelled"
    write_audit(
        db,
        module="projects",
        action="project_archived",
        actor=actor,
        entity_type="project",
        entity_id=str(project.id),
        entity_label=f"{project.code} — {project.name}",
        before={"status": previous},
        after={"status": "cancelled"},
        request=request,
    )
    db.commit()
    db.refresh(project)
    return _project_read(project)


# --- Jalons ------------------------------------------------------------------


def create_milestone(
    db: Session,
    project: Project,
    payload: MilestoneCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> ProjectDetailRead:
    milestone = ProjectMilestone(project_id=project.id, **payload.model_dump())
    db.add(milestone)
    db.flush()
    write_audit(
        db,
        module="projects",
        action="milestone_created",
        actor=actor,
        entity_type="project_milestone",
        entity_id=str(milestone.id),
        entity_label=milestone.name,
        request=request,
    )
    db.commit()
    db.refresh(project)
    return get_project_detail(db, project.id)


def get_milestone(db: Session, milestone_id: UUID) -> ProjectMilestone:
    return _require(db, ProjectMilestone, milestone_id, "Jalon introuvable.")


def update_milestone(
    db: Session,
    milestone: ProjectMilestone,
    payload: MilestoneUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> ProjectDetailRead:
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(milestone, field, value)
    write_audit(
        db,
        module="projects",
        action="milestone_updated",
        actor=actor,
        entity_type="project_milestone",
        entity_id=str(milestone.id),
        entity_label=milestone.name,
        request=request,
    )
    db.commit()
    return get_project_detail(db, milestone.project_id)


def delete_milestone(
    db: Session, milestone: ProjectMilestone, *, actor: User, request: Request | None = None
) -> ProjectDetailRead:
    project_id = milestone.project_id
    write_audit(
        db,
        module="projects",
        action="milestone_deleted",
        actor=actor,
        entity_type="project_milestone",
        entity_id=str(milestone.id),
        entity_label=milestone.name,
        request=request,
    )
    db.delete(milestone)
    db.commit()
    return get_project_detail(db, project_id)


# --- Tâches ------------------------------------------------------------------


def create_task(
    db: Session,
    project: Project,
    payload: TaskCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> ProjectDetailRead:
    if payload.milestone_id:
        milestone = get_milestone(db, payload.milestone_id)
        if milestone.project_id != project.id:
            raise NotFoundError("Jalon introuvable pour ce projet.")
    _validate_user(db, payload.assignee_user_id)
    task = ProjectTask(project_id=project.id, **payload.model_dump())
    db.add(task)
    db.flush()
    _recalculate_progress(project)
    write_audit(
        db,
        module="projects",
        action="task_created",
        actor=actor,
        entity_type="project_task",
        entity_id=str(task.id),
        entity_label=task.title,
        request=request,
    )
    db.commit()
    db.refresh(project)
    return get_project_detail(db, project.id)


def get_task(db: Session, task_id: UUID) -> ProjectTask:
    return _require(db, ProjectTask, task_id, "Tâche introuvable.")


def update_task(
    db: Session,
    task: ProjectTask,
    payload: TaskUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> ProjectDetailRead:
    data = payload.model_dump(exclude_unset=True)
    if data.get("milestone_id"):
        milestone = get_milestone(db, data["milestone_id"])
        if milestone.project_id != task.project_id:
            raise NotFoundError("Jalon introuvable pour ce projet.")
    if "assignee_user_id" in data:
        _validate_user(db, data["assignee_user_id"])
    for field, value in data.items():
        setattr(task, field, value)
    project = get_project(db, task.project_id)
    _recalculate_progress(project)
    write_audit(
        db,
        module="projects",
        action="task_updated",
        actor=actor,
        entity_type="project_task",
        entity_id=str(task.id),
        entity_label=task.title,
        after={"status": task.status},
        request=request,
    )
    db.commit()
    db.refresh(project)
    return get_project_detail(db, task.project_id)


def delete_task(
    db: Session, task: ProjectTask, *, actor: User, request: Request | None = None
) -> ProjectDetailRead:
    project_id = task.project_id
    project = get_project(db, project_id)
    write_audit(
        db,
        module="projects",
        action="task_deleted",
        actor=actor,
        entity_type="project_task",
        entity_id=str(task.id),
        entity_label=task.title,
        request=request,
    )
    db.delete(task)
    db.flush()
    _recalculate_progress(project)
    db.commit()
    db.refresh(project)
    return get_project_detail(db, project_id)


# --- Risques -----------------------------------------------------------------


def create_risk(
    db: Session,
    project: Project,
    payload: RiskCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> ProjectDetailRead:
    _validate_user(db, payload.owner_user_id)
    risk = ProjectRisk(project_id=project.id, **payload.model_dump())
    db.add(risk)
    db.flush()
    write_audit(
        db,
        module="projects",
        action="risk_created",
        actor=actor,
        entity_type="project_risk",
        entity_id=str(risk.id),
        entity_label=risk.description[:80],
        after={"score": risk.probability * risk.impact},
        request=request,
    )
    db.commit()
    db.refresh(project)
    return get_project_detail(db, project.id)


def get_risk(db: Session, risk_id: UUID) -> ProjectRisk:
    return _require(db, ProjectRisk, risk_id, "Risque introuvable.")


def update_risk(
    db: Session,
    risk: ProjectRisk,
    payload: RiskUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> ProjectDetailRead:
    data = payload.model_dump(exclude_unset=True)
    if "owner_user_id" in data:
        _validate_user(db, data["owner_user_id"])
    for field, value in data.items():
        setattr(risk, field, value)
    write_audit(
        db,
        module="projects",
        action="risk_updated",
        actor=actor,
        entity_type="project_risk",
        entity_id=str(risk.id),
        entity_label=risk.description[:80],
        after={"score": risk.probability * risk.impact},
        request=request,
    )
    db.commit()
    return get_project_detail(db, risk.project_id)


def delete_risk(
    db: Session, risk: ProjectRisk, *, actor: User, request: Request | None = None
) -> ProjectDetailRead:
    project_id = risk.project_id
    write_audit(
        db,
        module="projects",
        action="risk_deleted",
        actor=actor,
        entity_type="project_risk",
        entity_id=str(risk.id),
        entity_label=risk.description[:80],
        request=request,
    )
    db.delete(risk)
    db.commit()
    return get_project_detail(db, project_id)


# --- Décisions ---------------------------------------------------------------


def create_decision(
    db: Session,
    project: Project,
    payload: DecisionCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> ProjectDetailRead:
    decision = ProjectDecision(project_id=project.id, **payload.model_dump())
    db.add(decision)
    db.flush()
    write_audit(
        db,
        module="projects",
        action="decision_created",
        actor=actor,
        entity_type="project_decision",
        entity_id=str(decision.id),
        entity_label=decision.title,
        request=request,
    )
    db.commit()
    db.refresh(project)
    return get_project_detail(db, project.id)


def get_decision(db: Session, decision_id: UUID) -> ProjectDecision:
    return _require(db, ProjectDecision, decision_id, "Décision introuvable.")


def update_decision(
    db: Session,
    decision: ProjectDecision,
    payload: DecisionUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> ProjectDetailRead:
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(decision, field, value)
    write_audit(
        db,
        module="projects",
        action="decision_updated",
        actor=actor,
        entity_type="project_decision",
        entity_id=str(decision.id),
        entity_label=decision.title,
        request=request,
    )
    db.commit()
    return get_project_detail(db, decision.project_id)


def delete_decision(
    db: Session,
    decision: ProjectDecision,
    *,
    actor: User,
    request: Request | None = None,
) -> ProjectDetailRead:
    project_id = decision.project_id
    write_audit(
        db,
        module="projects",
        action="decision_deleted",
        actor=actor,
        entity_type="project_decision",
        entity_id=str(decision.id),
        entity_label=decision.title,
        request=request,
    )
    db.delete(decision)
    db.commit()
    return get_project_detail(db, project_id)
