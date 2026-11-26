from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.db.session import get_db
from app.models.auth import User
from app.schemas.data_quality import DataQualityOverview
from app.services import data_quality_service

router = APIRouter(prefix="/data-quality", tags=["Qualité des données"])


@router.get("/overview", response_model=DataQualityOverview)
def overview(
    actor: User = Depends(require_permission("dashboard.read")),
    db: Session = Depends(get_db),
) -> DataQualityOverview:
    return data_quality_service.get_overview(db, actor)
