from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.db.session import get_db
from app.models.auth import User
from app.schemas.ldap import (
    LdapConfigRead,
    LdapConfigUpdate,
    LdapDirectoryActionResponse,
    LdapDirectoryGroupList,
    LdapDirectoryUserCreate,
    LdapDirectoryUserList,
    LdapDirectoryUserUpdate,
    LdapGroupMembershipUpdate,
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


@router.get("/directory/users", response_model=LdapDirectoryUserList)
def search_directory_users(
    q: str | None = Query(None, max_length=120),
    limit: int = Query(200, ge=1, le=500),
    _: User = Depends(require_permission("admin.settings.read")),
    db: Session = Depends(get_db),
):
    return ldap_service.search_directory_users(db, query=q, limit=limit)


@router.get("/directory/groups", response_model=LdapDirectoryGroupList)
def list_directory_groups(
    q: str | None = Query(None, max_length=120),
    limit: int = Query(500, ge=1, le=1000),
    _: User = Depends(require_permission("admin.settings.read")),
    db: Session = Depends(get_db),
):
    return ldap_service.list_directory_groups(db, query=q, limit=limit)


@router.get("/directory/user-groups", response_model=LdapDirectoryGroupList)
def get_user_groups(
    user_dn: str = Query(..., min_length=1, max_length=1000),
    _: User = Depends(require_permission("admin.settings.read")),
    db: Session = Depends(get_db),
):
    return ldap_service.get_user_groups(db, user_dn)


@router.post("/directory/users", response_model=LdapDirectoryActionResponse)
def create_directory_user(
    payload: LdapDirectoryUserCreate,
    request: Request,
    actor: User = Depends(require_permission("admin.settings.manage")),
    db: Session = Depends(get_db),
):
    return ldap_service.create_directory_user(
        db, payload, actor=actor, request=request
    )


@router.patch("/directory/users", response_model=LdapDirectoryActionResponse)
def update_directory_user(
    payload: LdapDirectoryUserUpdate,
    request: Request,
    actor: User = Depends(require_permission("admin.settings.manage")),
    db: Session = Depends(get_db),
):
    return ldap_service.update_directory_user(
        db, payload, actor=actor, request=request
    )


@router.put("/directory/groups", response_model=LdapDirectoryActionResponse)
def update_group_memberships(
    payload: LdapGroupMembershipUpdate,
    request: Request,
    actor: User = Depends(require_permission("admin.settings.manage")),
    db: Session = Depends(get_db),
):
    return ldap_service.update_group_memberships(
        db, payload, actor=actor, request=request
    )
