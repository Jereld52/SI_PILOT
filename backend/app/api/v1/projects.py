from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.db.session import get_db
from app.models.auth import User
from app.schemas.projects import (
    DecisionCreate,
    DecisionUpdate,
    MilestoneCreate,
    MilestoneUpdate,
    ProjectCreate,
    ProjectDetailRead,
    ProjectRead,
    ProjectUpdate,
    RiskCreate,
    RiskUpdate,
    TaskCreate,
    TaskUpdate,
)
from app.services import projects_service

router = APIRouter(prefix="/projects", tags=["Projets"])


@router.get("", response_model=list[ProjectRead])
def list_projects(
    q: str | None = Query(None, max_length=120),
    status: str | None = Query(None, max_length=30),
    priority: str | None = Query(None, max_length=20),
    _: User = Depends(require_permission("projects.read")),
    db: Session = Depends(get_db),
):
    return projects_service.list_projects(db, q=q, status=status, priority=priority)


@router.post("", response_model=ProjectRead, status_code=201)
def create_project(
    payload: ProjectCreate,
    request: Request,
    actor: User = Depends(require_permission("projects.create")),
    db: Session = Depends(get_db),
):
    return projects_service.create_project(db, payload, actor=actor, request=request)


@router.get("/{project_id}", response_model=ProjectDetailRead)
def get_project(
    project_id: UUID,
    _: User = Depends(require_permission("projects.read")),
    db: Session = Depends(get_db),
):
    return projects_service.get_project_detail(db, project_id)


@router.patch("/{project_id}", response_model=ProjectRead)
def update_project(
    project_id: UUID,
    payload: ProjectUpdate,
    request: Request,
    actor: User = Depends(require_permission("projects.update")),
    db: Session = Depends(get_db),
):
    project = projects_service.get_project(db, project_id)
    return projects_service.update_project(
        db, project, payload, actor=actor, request=request
    )


@router.delete("/{project_id}", response_model=ProjectRead)
def archive_project(
    project_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("projects.delete")),
    db: Session = Depends(get_db),
):
    project = projects_service.get_project(db, project_id)
    return projects_service.archive_project(db, project, actor=actor, request=request)


# --- Jalons ------------------------------------------------------------------


@router.post("/{project_id}/milestones", response_model=ProjectDetailRead, status_code=201)
def create_milestone(
    project_id: UUID,
    payload: MilestoneCreate,
    request: Request,
    actor: User = Depends(require_permission("projects.manage")),
    db: Session = Depends(get_db),
):
    project = projects_service.get_project(db, project_id)
    return projects_service.create_milestone(db, project, payload, actor=actor, request=request)


@router.patch("/milestones/{milestone_id}", response_model=ProjectDetailRead)
def update_milestone(
    milestone_id: UUID,
    payload: MilestoneUpdate,
    request: Request,
    actor: User = Depends(require_permission("projects.manage")),
    db: Session = Depends(get_db),
):
    milestone = projects_service.get_milestone(db, milestone_id)
    return projects_service.update_milestone(
        db, milestone, payload, actor=actor, request=request
    )


@router.delete("/milestones/{milestone_id}", response_model=ProjectDetailRead)
def delete_milestone(
    milestone_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("projects.manage")),
    db: Session = Depends(get_db),
):
    milestone = projects_service.get_milestone(db, milestone_id)
    return projects_service.delete_milestone(db, milestone, actor=actor, request=request)


# --- Tâches ------------------------------------------------------------------


@router.post("/{project_id}/tasks", response_model=ProjectDetailRead, status_code=201)
def create_task(
    project_id: UUID,
    payload: TaskCreate,
    request: Request,
    actor: User = Depends(require_permission("projects.manage")),
    db: Session = Depends(get_db),
):
    project = projects_service.get_project(db, project_id)
    return projects_service.create_task(db, project, payload, actor=actor, request=request)


@router.patch("/tasks/{task_id}", response_model=ProjectDetailRead)
def update_task(
    task_id: UUID,
    payload: TaskUpdate,
    request: Request,
    actor: User = Depends(require_permission("projects.manage")),
    db: Session = Depends(get_db),
):
    task = projects_service.get_task(db, task_id)
    return projects_service.update_task(db, task, payload, actor=actor, request=request)


@router.delete("/tasks/{task_id}", response_model=ProjectDetailRead)
def delete_task(
    task_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("projects.manage")),
    db: Session = Depends(get_db),
):
    task = projects_service.get_task(db, task_id)
    return projects_service.delete_task(db, task, actor=actor, request=request)


# --- Risques -----------------------------------------------------------------


@router.post("/{project_id}/risks", response_model=ProjectDetailRead, status_code=201)
def create_risk(
    project_id: UUID,
    payload: RiskCreate,
    request: Request,
    actor: User = Depends(require_permission("projects.manage")),
    db: Session = Depends(get_db),
):
    project = projects_service.get_project(db, project_id)
    return projects_service.create_risk(db, project, payload, actor=actor, request=request)


@router.patch("/risks/{risk_id}", response_model=ProjectDetailRead)
def update_risk(
    risk_id: UUID,
    payload: RiskUpdate,
    request: Request,
    actor: User = Depends(require_permission("projects.manage")),
    db: Session = Depends(get_db),
):
    risk = projects_service.get_risk(db, risk_id)
    return projects_service.update_risk(db, risk, payload, actor=actor, request=request)


@router.delete("/risks/{risk_id}", response_model=ProjectDetailRead)
def delete_risk(
    risk_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("projects.manage")),
    db: Session = Depends(get_db),
):
    risk = projects_service.get_risk(db, risk_id)
    return projects_service.delete_risk(db, risk, actor=actor, request=request)


# --- Décisions ---------------------------------------------------------------


@router.post("/{project_id}/decisions", response_model=ProjectDetailRead, status_code=201)
def create_decision(
    project_id: UUID,
    payload: DecisionCreate,
    request: Request,
    actor: User = Depends(require_permission("projects.manage")),
    db: Session = Depends(get_db),
):
    project = projects_service.get_project(db, project_id)
    return projects_service.create_decision(
        db, project, payload, actor=actor, request=request
    )


@router.patch("/decisions/{decision_id}", response_model=ProjectDetailRead)
def update_decision(
    decision_id: UUID,
    payload: DecisionUpdate,
    request: Request,
    actor: User = Depends(require_permission("projects.manage")),
    db: Session = Depends(get_db),
):
    decision = projects_service.get_decision(db, decision_id)
    return projects_service.update_decision(
        db, decision, payload, actor=actor, request=request
    )


@router.delete("/decisions/{decision_id}", response_model=ProjectDetailRead)
def delete_decision(
    decision_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("projects.manage")),
    db: Session = Depends(get_db),
):
    decision = projects_service.get_decision(db, decision_id)
    return projects_service.delete_decision(
        db, decision, actor=actor, request=request
    )
