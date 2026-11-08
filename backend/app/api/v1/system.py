from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.db.session import get_db
from app.models.auth import User
from app.services import system_service

router = APIRouter(prefix="/admin", tags=["Système"])


@router.get("/diagnostics")
def diagnostics(
    _: User = Depends(require_permission("admin.settings.read")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return system_service.get_diagnostics(db)


@router.get("/about")
def about(
    _: User = Depends(require_permission("admin.settings.read")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return system_service.get_about(db)
