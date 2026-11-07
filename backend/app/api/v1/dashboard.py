from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.db.session import get_db
from app.models.auth import User
from app.schemas.dashboard import (
    DashboardActivity,
    DashboardAlerts,
    DashboardCharts,
    DashboardSummary,
)
from app.services import dashboard_service

router = APIRouter(prefix="/dashboard", tags=["Vue générale"])


@router.get("/summary", response_model=DashboardSummary)
def summary(
    _: User = Depends(require_permission("dashboard.read")),
    db: Session = Depends(get_db),
) -> DashboardSummary:
    return dashboard_service.get_summary(db)


@router.get("/charts", response_model=DashboardCharts)
def charts(
    _: User = Depends(require_permission("dashboard.read")),
    db: Session = Depends(get_db),
) -> DashboardCharts:
    return dashboard_service.get_charts(db)


@router.get("/alerts", response_model=DashboardAlerts)
def alerts(
    _: User = Depends(require_permission("dashboard.read")),
    db: Session = Depends(get_db),
) -> DashboardAlerts:
    return dashboard_service.get_alerts(db)


@router.get("/activity", response_model=DashboardActivity)
def activity(
    _: User = Depends(require_permission("dashboard.read")),
    db: Session = Depends(get_db),
) -> DashboardActivity:
    return dashboard_service.get_activity(db)
