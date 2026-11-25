from typing import Literal

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.db.session import get_db
from app.models.auth import User
from app.schemas.scheduler import (
    SchedulerConfigRead,
    SchedulerConfigUpdate,
    SchedulerRunRead,
    SchedulerRunResponse,
)
from app.services import scheduler_service
from app.services.audit_service import write_audit

router = APIRouter(prefix="/admin/scheduler", tags=["Veille et planification"])

SchedulerJob = Literal["checks", "veeam", "backup", "digest", "report"]


@router.get("/config", response_model=SchedulerConfigRead)
def get_config(
    _: User = Depends(require_permission("admin.settings.read")),
    db: Session = Depends(get_db),
) -> SchedulerConfigRead:
    return scheduler_service.get_settings(db)


@router.put("/config", response_model=SchedulerConfigRead)
def update_config(
    payload: SchedulerConfigUpdate,
    request: Request,
    actor: User = Depends(require_permission("admin.settings.manage")),
    db: Session = Depends(get_db),
) -> SchedulerConfigRead:
    return scheduler_service.update_settings(db, payload, actor=actor, request=request)


@router.get("/runs", response_model=list[SchedulerRunRead])
def list_runs(
    limit: int = Query(25, ge=1, le=100),
    _: User = Depends(require_permission("admin.settings.read")),
    db: Session = Depends(get_db),
) -> list[SchedulerRunRead]:
    return scheduler_service.list_runs(db, limit=limit)


@router.post("/run/{job}", response_model=SchedulerRunResponse)
def run_job(
    job: SchedulerJob,
    request: Request,
    actor: User = Depends(require_permission("admin.settings.manage")),
    db: Session = Depends(get_db),
) -> SchedulerRunResponse:
    run = scheduler_service.execute_job(db, job, trigger="manual", force=True)
    write_audit(
        db,
        module="admin",
        action="scheduler_job_run",
        actor=actor,
        entity_type="scheduler",
        entity_id=job,
        entity_label=scheduler_service.JOB_LABELS.get(job, job),
        after={"status": run.status, "summary": run.summary},
        request=request,
    )
    db.commit()
    return SchedulerRunResponse(
        run=scheduler_service.run_read(run),
        message=run.summary or scheduler_service.JOB_LABELS.get(job, job),
    )
