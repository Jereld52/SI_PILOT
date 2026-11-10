from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.db.session import get_db
from app.models.auth import User
from app.schemas.wapt import (
    WaptActionResponse,
    WaptAssetRead,
    WaptAssetSoftwareRead,
    WaptPackageAction,
    WaptPackageRead,
    WaptSoftwareOverview,
    WaptSoftwareSyncResponse,
)
from app.services import wapt_service
from app.services.audit_service import write_audit

router = APIRouter(prefix="/wapt", tags=["Logiciels WAPT"])


@router.get("/overview", response_model=WaptSoftwareOverview)
def software_overview(
    _: User = Depends(require_permission("assets.read")),
    db: Session = Depends(get_db),
) -> WaptSoftwareOverview:
    return wapt_service.get_software_overview(db)


@router.post("/sync", response_model=WaptSoftwareSyncResponse)
def sync_software(
    request: Request,
    actor: User = Depends(require_permission("assets.update")),
    db: Session = Depends(get_db),
) -> WaptSoftwareSyncResponse:
    return wapt_service.sync_software(db, actor=actor, request=request)


@router.get("/packages", response_model=list[WaptPackageRead])
def list_packages(
    _: User = Depends(require_permission("assets.read")),
    db: Session = Depends(get_db),
) -> list[WaptPackageRead]:
    return wapt_service.fetch_packages(wapt_service.get_config(db))


@router.get("/assets", response_model=list[WaptAssetRead])
def list_assets(
    _: User = Depends(require_permission("assets.read")),
    db: Session = Depends(get_db),
) -> list[WaptAssetRead]:
    return wapt_service.list_wapt_assets(db)


@router.get("/assets/{asset_id}/software", response_model=WaptAssetSoftwareRead)
def asset_software(
    asset_id: UUID,
    _: User = Depends(require_permission("assets.read")),
    db: Session = Depends(get_db),
) -> WaptAssetSoftwareRead:
    return wapt_service.get_asset_software(db, asset_id)


@router.post("/assets/{asset_id}/install", response_model=WaptActionResponse)
def install_package(
    asset_id: UUID,
    payload: WaptPackageAction,
    request: Request,
    actor: User = Depends(require_permission("assets.update")),
    db: Session = Depends(get_db),
) -> WaptActionResponse:
    result = wapt_service.install_package_for_asset(db, asset_id, payload.package)
    write_audit(
        db,
        module="assets",
        action="wapt_package_install_requested",
        actor=actor,
        entity_type="asset",
        entity_id=str(asset_id),
        entity_label=f"{asset_id} — {payload.package}",
        after={"package": payload.package},
        request=request,
    )
    db.commit()
    return result


@router.post("/assets/{asset_id}/uninstall", response_model=WaptActionResponse)
def uninstall_package(
    asset_id: UUID,
    payload: WaptPackageAction,
    request: Request,
    actor: User = Depends(require_permission("assets.update")),
    db: Session = Depends(get_db),
) -> WaptActionResponse:
    result = wapt_service.uninstall_package_for_asset(db, asset_id, payload.package)
    write_audit(
        db,
        module="assets",
        action="wapt_package_uninstall_requested",
        actor=actor,
        entity_type="asset",
        entity_id=str(asset_id),
        entity_label=f"{asset_id} — {payload.package}",
        after={"package": payload.package},
        request=request,
    )
    db.commit()
    return result
