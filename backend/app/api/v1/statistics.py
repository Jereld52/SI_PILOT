from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.db.session import get_db
from app.models.auth import User
from app.schemas.statistics import StatisticsOverview
from app.services import statistics_service
from app.services.periods import Granularity

router = APIRouter(prefix="/statistics", tags=["Statistiques"])


@router.get("/overview", response_model=StatisticsOverview)
def overview(
    start: date | None = None,
    end: date | None = None,
    granularity: Granularity = Query("month"),
    _: User = Depends(require_permission("statistics.read")),
    db: Session = Depends(get_db),
):
    return statistics_service.get_overview(
        db, start=start, end=end, granularity=granularity
    )
