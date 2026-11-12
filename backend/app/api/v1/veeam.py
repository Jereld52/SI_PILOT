from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.db.session import get_db
from app.models.auth import User
from app.schemas.veeam import (
    VeeamConfigRead,
    VeeamConfigUpdate,
    VeeamOverview,
    VeeamTestResponse,
)
from app.services import veeam_service

router = APIRouter(prefix="/veeam", tags=["Sauvegardes Veeam"])
admin_router = APIRouter(prefix="/admin/veeam", tags=["Administration Veeam"])


@router.get("/overview", response_model=VeeamOverview)
def overview(
    refresh: bool = Query(False),
    _: User = Depends(require_permission("security.read")),
    db: Session = Depends(get_db),
) -> VeeamOverview:
    return veeam_service.get_overview(db, force=refresh)


@admin_router.get("/config", response_model=VeeamConfigRead)
def get_config(
    _: User = Depends(require_permission("admin.settings.read")),
    db: Session = Depends(get_db),
) -> VeeamConfigRead:
    return veeam_service.get_settings(db)


@admin_router.put("/config", response_model=VeeamConfigRead)
def update_config(
    payload: VeeamConfigUpdate,
    request: Request,
    actor: User = Depends(require_permission("admin.settings.manage")),
    db: Session = Depends(get_db),
) -> VeeamConfigRead:
    return veeam_service.update_settings(db, payload, actor=actor, request=request)


@admin_router.post("/test", response_model=VeeamTestResponse)
def test_connection(
    request: Request,
    actor: User = Depends(require_permission("admin.settings.manage")),
    db: Session = Depends(get_db),
) -> VeeamTestResponse:
    return veeam_service.test_connection(db, actor=actor, request=request)
