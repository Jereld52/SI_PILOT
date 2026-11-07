from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.core.pagination import PageParams, page_params, paginate
from app.db.session import get_db
from app.models.audit import AuditLog
from app.models.auth import User
from app.schemas.audit import AuditLogRead, AuditSummary
from app.schemas.common import Page

router = APIRouter(prefix="/audit-logs", tags=["Journal d'audit"])


@router.get("", response_model=Page[AuditLogRead])
def list_audit_logs(
    actor: str | None = Query(None, max_length=255),
    module: str | None = Query(None, max_length=50),
    action: str | None = Query(None, max_length=60),
    status: str | None = Query(None, max_length=20),
    entity_type: str | None = Query(None, max_length=80),
    q: str | None = Query(None, max_length=120),
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    params: PageParams = Depends(page_params),
    _: User = Depends(require_permission("audit.read")),
    db: Session = Depends(get_db),
) -> dict:
    statement = select(AuditLog)
    if actor:
        statement = statement.where(AuditLog.actor_label.ilike(f"%{actor.strip()}%"))
    if module:
        statement = statement.where(AuditLog.module == module)
    if action:
        statement = statement.where(AuditLog.action == action)
    if status:
        statement = statement.where(AuditLog.status == status)
    if entity_type:
        statement = statement.where(AuditLog.entity_type == entity_type)
    if q:
        pattern = f"%{q.strip()}%"
        statement = statement.where(
            or_(
                AuditLog.entity_id.ilike(pattern),
                AuditLog.entity_label.ilike(pattern),
                AuditLog.request_id.ilike(pattern),
            )
        )
    if date_from:
        statement = statement.where(AuditLog.occurred_at >= date_from)
    if date_to:
        statement = statement.where(AuditLog.occurred_at <= date_to)

    statement = statement.order_by(AuditLog.occurred_at.desc(), AuditLog.id.desc())
    return paginate(db, statement, params)


@router.get("/summary", response_model=AuditSummary)
def audit_summary(
    _: User = Depends(require_permission("audit.read")),
    db: Session = Depends(get_db),
) -> AuditSummary:
    rows = db.execute(
        select(AuditLog.module, func.count()).group_by(AuditLog.module).order_by(func.count().desc())
    ).all()
    return AuditSummary(total=sum(row[1] for row in rows), modules={row[0]: row[1] for row in rows})
