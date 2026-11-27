from datetime import date

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.db.session import get_db
from app.models.auth import User
from app.schemas.dashboard import (
    DashboardActivity,
    DashboardAlerts,
    DashboardCharts,
    DashboardCockpit,
    DashboardSummary,
    DashboardTiles,
    DashboardTilesUpdate,
    DashboardToday,
)
from app.services import dashboard_cockpit_service, dashboard_service, dashboard_today_service

router = APIRouter(prefix="/dashboard", tags=["Vue générale"])


@router.get("/cockpit", response_model=DashboardCockpit)
def cockpit(
    _: User = Depends(require_permission("dashboard.read")),
    db: Session = Depends(get_db),
) -> DashboardCockpit:
    return dashboard_cockpit_service.get_cockpit(db)


@router.get("/today", response_model=DashboardToday)
def today(
    actor: User = Depends(require_permission("dashboard.read")),
    db: Session = Depends(get_db),
) -> DashboardToday:
    return dashboard_today_service.get_today(db, actor)


@router.get("/today/export.ics")
def today_export_ics(
    actor: User = Depends(require_permission("dashboard.read")),
    db: Session = Depends(get_db),
) -> Response:
    content = dashboard_today_service.build_day_ics(db, actor)
    filename = f"plan-du-jour-{date.today().isoformat()}.ics"
    return Response(
        content=content,
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


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


@router.get("/tiles", response_model=DashboardTiles)
def get_tiles(
    user: User = Depends(require_permission("dashboard.read")),
    db: Session = Depends(get_db),
) -> DashboardTiles:
    return DashboardTiles(tiles=dashboard_service.get_dashboard_tiles(db, user))


@router.put("/tiles", response_model=DashboardTiles)
def update_tiles(
    payload: DashboardTilesUpdate,
    user: User = Depends(require_permission("dashboard.read")),
    db: Session = Depends(get_db),
) -> DashboardTiles:
    tiles = dashboard_service.set_dashboard_tiles(db, user, payload.tiles)
    return DashboardTiles(tiles=tiles)
