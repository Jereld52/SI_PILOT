from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.db.session import get_db
from app.models.auth import User
from app.schemas.licenses import LicenseCreate, LicenseRead, LicenseUpdate
from app.services import licenses_service

router = APIRouter(prefix="/licenses", tags=["Licences"])


@router.get("", response_model=list[LicenseRead])
def list_licenses(
    q: str | None = Query(None, max_length=120),
    active_only: bool = False,
    expiring_before: date | None = None,
    _: User = Depends(require_permission("licenses.read")),
    db: Session = Depends(get_db),
):
    return licenses_service.list_licenses(
        db, q=q, active_only=active_only, expiring_before=expiring_before
    )


@router.get("/{license_id}", response_model=LicenseRead)
def get_license(
    license_id: UUID,
    _: User = Depends(require_permission("licenses.read")),
    db: Session = Depends(get_db),
):
    return licenses_service.get_license_read(db, license_id)


@router.post("", response_model=LicenseRead, status_code=201)
def create_license(
    payload: LicenseCreate,
    request: Request,
    actor: User = Depends(require_permission("licenses.manage")),
    db: Session = Depends(get_db),
):
    return licenses_service.create_license(db, payload, actor=actor, request=request)


@router.patch("/{license_id}", response_model=LicenseRead)
def update_license(
    license_id: UUID,
    payload: LicenseUpdate,
    request: Request,
    actor: User = Depends(require_permission("licenses.manage")),
    db: Session = Depends(get_db),
):
    license_row = licenses_service.get_license(db, license_id)
    return licenses_service.update_license(
        db, license_row, payload, actor=actor, request=request
    )
