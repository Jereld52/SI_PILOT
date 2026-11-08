from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.db.session import get_db
from app.models.auth import User
from app.schemas.ldap import (
    LdapConfigRead,
    LdapConfigUpdate,
    LdapPreviewResponse,
    LdapSyncRequest,
    LdapSyncResponse,
    LdapTestResponse,
)
from app.services import ldap_service

router = APIRouter(prefix="/ldap", tags=["Active Directory"])


@router.get("/config", response_model=LdapConfigRead)
def get_config(
    _: User = Depends(require_permission("admin.settings.read")),
    db: Session = Depends(get_db),
):
    return ldap_service.get_config(db)


@router.put("/config", response_model=LdapConfigRead)
def update_config(
    payload: LdapConfigUpdate,
    request: Request,
    actor: User = Depends(require_permission("admin.settings.manage")),
    db: Session = Depends(get_db),
):
    return ldap_service.update_config(db, payload, actor=actor, request=request)


@router.post("/test", response_model=LdapTestResponse)
def test_connection(
    _: User = Depends(require_permission("admin.settings.read")),
    db: Session = Depends(get_db),
):
    return ldap_service.test_connection(db)


@router.post("/preview", response_model=LdapPreviewResponse)
def preview_sync(
    update_existing: bool = True,
    _: User = Depends(require_permission("imports.preview")),
    db: Session = Depends(get_db),
):
    return ldap_service.preview_sync(db, update_existing=update_existing)


@router.post("/sync", response_model=LdapSyncResponse)
def sync_agents(
    payload: LdapSyncRequest,
    request: Request,
    actor: User = Depends(require_permission("imports.apply")),
    db: Session = Depends(get_db),
):
    return ldap_service.sync_agents(
        db,
        update_existing=payload.update_existing,
        actor=actor,
        request=request,
    )
