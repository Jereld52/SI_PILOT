from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.db.session import get_db
from app.models.auth import User
from app.schemas.wapt import (
    WaptActionResponse,
    WaptConfigRead,
    WaptConfigUpdate,
    WaptHostPackageRead,
    WaptHostRead,
    WaptPackageAction,
    WaptPackageRead,
    WaptSyncResponse,
    WaptTestResponse,
)
from app.services import wapt_service
from app.services.audit_service import write_audit

router = APIRouter(prefix="/admin/wapt", tags=["Administration WAPT"])


@router.get("/config", response_model=WaptConfigRead)
def get_config(
    _: User = Depends(require_permission("admin.settings.read")),
    db: Session = Depends(get_db),
) -> WaptConfigRead:
    return wapt_service.get_settings(db)


@router.put("/config", response_model=WaptConfigRead)
def update_config(
    payload: WaptConfigUpdate,
    request: Request,
    actor: User = Depends(require_permission("admin.settings.manage")),
    db: Session = Depends(get_db),
) -> WaptConfigRead:
    return wapt_service.update_settings(db, payload, actor=actor, request=request)


@router.post("/test", response_model=WaptTestResponse)
def test_connection(
    _: User = Depends(require_permission("admin.settings.manage")),
    db: Session = Depends(get_db),
) -> WaptTestResponse:
    return wapt_service.test_connection(wapt_service.get_config(db))


@router.post("/sync", response_model=WaptSyncResponse)
def sync_inventory(
    request: Request,
    actor: User = Depends(require_permission("admin.settings.manage")),
    db: Session = Depends(get_db),
) -> WaptSyncResponse:
    return wapt_service.sync_inventory(db, actor=actor, request=request)


@router.get("/hosts", response_model=list[WaptHostRead])
def list_hosts(
    _: User = Depends(require_permission("admin.settings.read")),
    db: Session = Depends(get_db),
) -> list[WaptHostRead]:
    return wapt_service.fetch_hosts(wapt_service.get_config(db))


@router.get("/packages", response_model=list[WaptPackageRead])
def list_packages(
    _: User = Depends(require_permission("admin.settings.read")),
    db: Session = Depends(get_db),
) -> list[WaptPackageRead]:
    return wapt_service.fetch_packages(wapt_service.get_config(db))


@router.get("/hosts/{uuid}/packages", response_model=list[WaptHostPackageRead])
def list_host_packages(
    uuid: str,
    _: User = Depends(require_permission("admin.settings.read")),
    db: Session = Depends(get_db),
) -> list[WaptHostPackageRead]:
    return wapt_service.fetch_host_packages(wapt_service.get_config(db), uuid)


@router.post("/hosts/{uuid}/install", response_model=WaptActionResponse)
def install_package(
    uuid: str,
    payload: WaptPackageAction,
    request: Request,
    actor: User = Depends(require_permission("admin.settings.manage")),
    db: Session = Depends(get_db),
) -> WaptActionResponse:
    result = wapt_service.install_package(
        wapt_service.get_config(db), uuid, payload.package
    )
    write_audit(
        db,
        module="admin",
        action="wapt_package_install_requested",
        actor=actor,
        entity_type="wapt_host",
        entity_id=uuid,
        entity_label=f"{uuid} — {payload.package}",
        after={"package": payload.package},
        request=request,
    )
    db.commit()
    return result


@router.post("/hosts/{uuid}/uninstall", response_model=WaptActionResponse)
def uninstall_package(
    uuid: str,
    payload: WaptPackageAction,
    request: Request,
    actor: User = Depends(require_permission("admin.settings.manage")),
    db: Session = Depends(get_db),
) -> WaptActionResponse:
    result = wapt_service.uninstall_package(
        wapt_service.get_config(db), uuid, payload.package
    )
    write_audit(
        db,
        module="admin",
        action="wapt_package_uninstall_requested",
        actor=actor,
        entity_type="wapt_host",
        entity_id=uuid,
        entity_label=f"{uuid} — {payload.package}",
        after={"package": payload.package},
        request=request,
    )
    db.commit()
    return result
