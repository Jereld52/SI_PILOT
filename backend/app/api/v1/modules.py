from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.db.session import get_db
from app.models.auth import User
from app.schemas.modules import (
    ModuleSettingsRead,
    ModuleSettingsUpdate,
    ModuleStatusRead,
)
from app.services import modules_service

router = APIRouter(prefix="/modules", tags=["Modules"])
admin_router = APIRouter(prefix="/admin/modules", tags=["Administration modules"])


@router.get("/status", response_model=ModuleStatusRead)
def module_status(
    _: User = Depends(require_permission("dashboard.read")),
    db: Session = Depends(get_db),
) -> ModuleStatusRead:
    return ModuleStatusRead(disabled=modules_service.get_disabled(db))


@admin_router.get("", response_model=ModuleSettingsRead)
def get_module_settings(
    _: User = Depends(require_permission("admin.settings.read")),
    db: Session = Depends(get_db),
) -> ModuleSettingsRead:
    return modules_service.get_settings(db)


@admin_router.put("", response_model=ModuleSettingsRead)
def update_module_settings(
    payload: ModuleSettingsUpdate,
    request: Request,
    actor: User = Depends(require_permission("admin.settings.manage")),
    db: Session = Depends(get_db),
) -> ModuleSettingsRead:
    return modules_service.update_settings(db, payload, actor=actor, request=request)
