from datetime import date
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.core.errors import PermissionDeniedError
from app.core.permissions import has_permission
from app.db.session import get_db
from app.models.auth import User
from app.schemas.statistics import StatisticsOverview, StatsCommercial
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


@router.get("/commercial", response_model=StatsCommercial)
def commercial_overview(
    start: date | None = None,
    end: date | None = None,
    granularity: Granularity = Query("month"),
    kind: Literal["quote", "purchase_order"] | None = None,
    status: str | None = Query(None, max_length=30),
    supplier_id: UUID | None = None,
    with_engagement: bool | None = None,
    q: str | None = Query(None, max_length=120),
    actor: User = Depends(require_permission("statistics.read")),
    db: Session = Depends(get_db),
) -> StatsCommercial:
    if not has_permission(actor, "suppliers.read"):
        raise PermissionDeniedError(
            "Vous ne pouvez pas consulter les statistiques d'achats."
        )
    return statistics_service.get_commercial_overview(
        db,
        start=start,
        end=end,
        granularity=granularity,
        kind=kind,
        status=status,
        supplier_id=supplier_id,
        with_engagement=with_engagement,
        q=q,
    )
