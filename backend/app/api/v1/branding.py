from __future__ import annotations

from fastapi import APIRouter, Depends, File, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.core.errors import NotFoundError
from app.db.session import get_db
from app.models.auth import User
from app.schemas.branding import BrandingRead, BrandingUpdate
from app.services import branding_service

router = APIRouter(tags=["Identité"])


@router.get("/branding", response_model=BrandingRead)
def read_branding(db: Session = Depends(get_db)) -> BrandingRead:
    return branding_service.get_branding(db)


@router.get("/branding/logo")
def read_branding_logo(db: Session = Depends(get_db)):
    path = branding_service.logo_path(db)
    if path is None:
        raise NotFoundError("Logo introuvable.")
    return FileResponse(
        path,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=300"},
    )


@router.put("/admin/branding", response_model=BrandingRead)
def update_branding(
    payload: BrandingUpdate,
    request: Request,
    actor: User = Depends(require_permission("admin.settings.manage")),
    db: Session = Depends(get_db),
) -> BrandingRead:
    return branding_service.update_branding(db, payload, actor=actor, request=request)


@router.post("/admin/branding/logo", response_model=BrandingRead)
async def upload_branding_logo(
    request: Request,
    file: UploadFile = File(...),
    actor: User = Depends(require_permission("admin.settings.manage")),
    db: Session = Depends(get_db),
) -> BrandingRead:
    content = await file.read(branding_service.LOGO_MAX_BYTES + 1)
    return branding_service.save_logo(
        db,
        content=content,
        original_name=(file.filename or "logo")[:255],
        actor=actor,
        request=request,
    )


@router.delete("/admin/branding/logo", response_model=BrandingRead)
def delete_branding_logo(
    request: Request,
    actor: User = Depends(require_permission("admin.settings.manage")),
    db: Session = Depends(get_db),
) -> BrandingRead:
    return branding_service.delete_logo(db, actor=actor, request=request)
