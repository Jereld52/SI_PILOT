from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.api.deps import require_any_permission, require_permission
from app.db.session import get_db
from app.models.auth import User
from app.schemas.referentials import (
    AssetCategoryCreate,
    AssetCategoryRead,
    AssetCategoryUpdate,
    LocationCreate,
    LocationRead,
    LocationUpdate,
    ServiceCreate,
    ServiceRead,
    ServiceUpdate,
)
from app.services import referentials_service

router = APIRouter(tags=["Référentiels"])

READ_PERMISSIONS = ("referentials.read", "agents.read", "assets.read")


@router.get("/services", response_model=list[ServiceRead])
def list_services(
    q: str | None = Query(None, max_length=120),
    include_inactive: bool = False,
    _: User = Depends(require_any_permission(*READ_PERMISSIONS)),
    db: Session = Depends(get_db),
):
    return referentials_service.list_services(db, q=q, include_inactive=include_inactive)


@router.post("/services", response_model=ServiceRead, status_code=201)
def create_service(
    payload: ServiceCreate,
    request: Request,
    actor: User = Depends(require_permission("referentials.manage")),
    db: Session = Depends(get_db),
):
    return referentials_service.create_service(db, payload, actor=actor, request=request)


@router.patch("/services/{service_id}", response_model=ServiceRead)
def update_service(
    service_id: UUID,
    payload: ServiceUpdate,
    request: Request,
    actor: User = Depends(require_permission("referentials.manage")),
    db: Session = Depends(get_db),
):
    service = referentials_service.get_service(db, service_id)
    return referentials_service.update_service(db, service, payload, actor=actor, request=request)


@router.get("/locations", response_model=list[LocationRead])
def list_locations(
    q: str | None = Query(None, max_length=120),
    include_inactive: bool = False,
    _: User = Depends(require_any_permission(*READ_PERMISSIONS)),
    db: Session = Depends(get_db),
):
    return referentials_service.list_locations(db, q=q, include_inactive=include_inactive)


@router.post("/locations", response_model=LocationRead, status_code=201)
def create_location(
    payload: LocationCreate,
    request: Request,
    actor: User = Depends(require_permission("referentials.manage")),
    db: Session = Depends(get_db),
):
    return referentials_service.create_location(db, payload, actor=actor, request=request)


@router.patch("/locations/{location_id}", response_model=LocationRead)
def update_location(
    location_id: UUID,
    payload: LocationUpdate,
    request: Request,
    actor: User = Depends(require_permission("referentials.manage")),
    db: Session = Depends(get_db),
):
    location = referentials_service.get_location(db, location_id)
    return referentials_service.update_location(db, location, payload, actor=actor, request=request)


@router.get("/asset-categories", response_model=list[AssetCategoryRead])
def list_asset_categories(
    include_inactive: bool = False,
    _: User = Depends(require_any_permission(*READ_PERMISSIONS)),
    db: Session = Depends(get_db),
):
    return referentials_service.list_asset_categories(db, include_inactive=include_inactive)


@router.post("/asset-categories", response_model=AssetCategoryRead, status_code=201)
def create_asset_category(
    payload: AssetCategoryCreate,
    request: Request,
    actor: User = Depends(require_permission("referentials.manage")),
    db: Session = Depends(get_db),
):
    return referentials_service.create_asset_category(db, payload, actor=actor, request=request)


@router.patch("/asset-categories/{category_id}", response_model=AssetCategoryRead)
def update_asset_category(
    category_id: UUID,
    payload: AssetCategoryUpdate,
    request: Request,
    actor: User = Depends(require_permission("referentials.manage")),
    db: Session = Depends(get_db),
):
    category = referentials_service.get_asset_category(db, category_id)
    return referentials_service.update_asset_category(db, category, payload, actor=actor, request=request)
