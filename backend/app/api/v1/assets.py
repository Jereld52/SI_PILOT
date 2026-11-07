from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.core.pagination import PageParams, page_params, paginate_items
from app.db.session import get_db
from app.models.auth import User
from app.schemas.assets import (
    AssetAssignmentRead,
    AssetAssignRequest,
    AssetCreate,
    AssetRead,
    AssetReturnRequest,
    AssetStatusRequest,
    AssetTagPreview,
    AssetUpdate,
)
from app.schemas.common import Page
from app.services import assets_service, referentials_service

router = APIRouter(prefix="/assets", tags=["Parc informatique"])


@router.get("", response_model=Page[AssetRead])
def list_assets(
    q: str | None = Query(None, max_length=120),
    category_id: UUID | None = None,
    status: str | None = Query(None, max_length=30),
    agent_id: UUID | None = None,
    service_id: UUID | None = None,
    include_archived: bool = False,
    params: PageParams = Depends(page_params),
    _: User = Depends(require_permission("assets.read")),
    db: Session = Depends(get_db),
) -> dict:
    items = assets_service.list_assets(
        db,
        q=q,
        category_id=category_id,
        status=status,
        agent_id=agent_id,
        service_id=service_id,
        include_archived=include_archived,
    )
    return paginate_items(items, params)


@router.post("", response_model=AssetRead, status_code=201)
def create_asset(
    payload: AssetCreate,
    request: Request,
    actor: User = Depends(require_permission("assets.create")),
    db: Session = Depends(get_db),
):
    return assets_service.create_asset(db, payload, actor=actor, request=request)


@router.get("/next-tag", response_model=AssetTagPreview)
def next_tag(
    category_id: UUID,
    _: User = Depends(require_permission("assets.read")),
    db: Session = Depends(get_db),
):
    category = referentials_service.get_asset_category(db, category_id)
    return assets_service.peek_asset_tag(db, category)


@router.get("/{asset_id}", response_model=AssetRead)
def get_asset(
    asset_id: UUID,
    _: User = Depends(require_permission("assets.read")),
    db: Session = Depends(get_db),
):
    return assets_service.get_asset(db, asset_id)


@router.get("/{asset_id}/history", response_model=list[AssetAssignmentRead])
def get_asset_history(
    asset_id: UUID,
    _: User = Depends(require_permission("assets.read")),
    db: Session = Depends(get_db),
):
    assets_service.get_asset(db, asset_id)
    return assets_service.get_asset_history(db, asset_id)


@router.patch("/{asset_id}", response_model=AssetRead)
def update_asset(
    asset_id: UUID,
    payload: AssetUpdate,
    request: Request,
    actor: User = Depends(require_permission("assets.update")),
    db: Session = Depends(get_db),
):
    asset = assets_service.get_asset(db, asset_id)
    return assets_service.update_asset(db, asset, payload, actor=actor, request=request)


@router.delete("/{asset_id}", response_model=AssetRead)
def archive_asset(
    asset_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("assets.delete")),
    db: Session = Depends(get_db),
):
    asset = assets_service.get_asset(db, asset_id)
    return assets_service.archive_asset(db, asset, actor=actor, request=request)


@router.post("/{asset_id}/assign", response_model=AssetRead)
def assign_asset(
    asset_id: UUID,
    payload: AssetAssignRequest,
    request: Request,
    actor: User = Depends(require_permission("assets.assign")),
    db: Session = Depends(get_db),
):
    asset = assets_service.get_asset(db, asset_id)
    return assets_service.assign_asset(db, asset, payload, actor=actor, request=request)


@router.post("/{asset_id}/return", response_model=AssetRead)
def return_asset(
    asset_id: UUID,
    payload: AssetReturnRequest,
    request: Request,
    actor: User = Depends(require_permission("assets.assign")),
    db: Session = Depends(get_db),
):
    asset = assets_service.get_asset(db, asset_id)
    return assets_service.return_asset(db, asset, payload, actor=actor, request=request)


@router.post("/{asset_id}/status", response_model=AssetRead)
def set_asset_status(
    asset_id: UUID,
    payload: AssetStatusRequest,
    request: Request,
    actor: User = Depends(require_permission("assets.update")),
    db: Session = Depends(get_db),
):
    asset = assets_service.get_asset(db, asset_id)
    return assets_service.set_asset_status(db, asset, payload, actor=actor, request=request)
