import json
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import require_permission
from app.core.errors import ConflictError, NotFoundError, ValidationAppError
from app.core.pagination import PageParams, page_params, paginate
from app.core.security import hash_password
from app.db.session import get_db
from app.models.auth import Permission, Role, User
from app.models.setting import Setting
from app.schemas.admin import SettingRead, SettingUpdate
from app.schemas.auth import (
    AdminResetPasswordRequest,
    PermissionRead,
    RolePermissionsUpdateRequest,
    RoleWithPermissions,
    UserCreateRequest,
    UserRead,
    UserUpdateRequest,
)
from app.schemas.common import MessageResponse, Page
from app.schemas.mail import SmtpSettingsRead, SmtpSettingsUpdate, SmtpTestRequest
from app.services import auth_service, email_service
from app.services.audit_service import write_audit

router = APIRouter(prefix="/admin", tags=["Administration"])


@router.get("/users", response_model=Page[UserRead])
def list_users(
    q: str | None = Query(None, max_length=120),
    role_code: str | None = None,
    is_active: bool | None = None,
    params: PageParams = Depends(page_params),
    _: User = Depends(require_permission("admin.users.read")),
    db: Session = Depends(get_db),
) -> dict:
    statement = select(User).join(Role)
    if q:
        pattern = f"%{q.strip()}%"
        statement = statement.where(
            or_(
                User.email.ilike(pattern),
                User.first_name.ilike(pattern),
                User.last_name.ilike(pattern),
            )
        )
    if role_code:
        statement = statement.where(Role.code == role_code)
    if is_active is not None:
        statement = statement.where(User.is_active.is_(is_active))

    sort_columns = {
        "email": User.email,
        "last_name": User.last_name,
        "created_at": User.created_at,
        "last_login_at": User.last_login_at,
    }
    column = sort_columns.get(params.sort or "last_name", User.last_name)
    statement = statement.order_by(column.asc() if params.order == "asc" else column.desc())
    return paginate(db, statement, params)


@router.post("/users", response_model=UserRead, status_code=201)
def create_user(
    payload: UserCreateRequest,
    request: Request,
    actor: User = Depends(require_permission("admin.users.manage")),
    db: Session = Depends(get_db),
) -> User:
    return auth_service.create_user(
        db,
        email=str(payload.email),
        password=payload.password,
        first_name=payload.first_name,
        last_name=payload.last_name,
        role_id=payload.role_id,
        data_scope=payload.data_scope,
        is_active=payload.is_active,
        actor=actor,
        request=request,
    )


@router.get("/users/{user_id}", response_model=UserRead)
def get_user(
    user_id: UUID,
    _: User = Depends(require_permission("admin.users.read")),
    db: Session = Depends(get_db),
) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise NotFoundError("Utilisateur introuvable.")
    return user


@router.patch("/users/{user_id}", response_model=UserRead)
def update_user(
    user_id: UUID,
    payload: UserUpdateRequest,
    request: Request,
    actor: User = Depends(require_permission("admin.users.manage")),
    db: Session = Depends(get_db),
) -> User:
    target = db.get(User, user_id)
    if target is None:
        raise NotFoundError("Utilisateur introuvable.")

    before = {
        "first_name": target.first_name,
        "last_name": target.last_name,
        "role": target.role.code,
        "data_scope": target.data_scope,
        "is_active": target.is_active,
    }

    if payload.is_active is False and target.id == actor.id:
        raise ConflictError("Vous ne pouvez pas désactiver votre propre compte.")
    if payload.is_active is False or (payload.role_id and payload.role_id != target.role_id):
        auth_service.ensure_not_last_admin(db, target)

    revoke_sessions = False
    if payload.first_name is not None:
        target.first_name = payload.first_name.strip()
    if payload.last_name is not None:
        target.last_name = payload.last_name.strip()
    if payload.role_id is not None and payload.role_id != target.role_id:
        role = db.get(Role, payload.role_id)
        if role is None:
            raise NotFoundError("Rôle introuvable.")
        target.role_id = role.id
        revoke_sessions = True
    if payload.data_scope is not None and payload.data_scope != target.data_scope:
        target.data_scope = payload.data_scope
        revoke_sessions = True
    if payload.is_active is not None and payload.is_active != target.is_active:
        target.is_active = payload.is_active
        revoke_sessions = True

    if revoke_sessions:
        auth_service.revoke_all_sessions(db, target.id)

    after = {
        "first_name": target.first_name,
        "last_name": target.last_name,
        "role": target.role.code,
        "data_scope": target.data_scope,
        "is_active": target.is_active,
    }
    write_audit(
        db,
        module="admin",
        action="user_updated",
        actor=actor,
        entity_type="user",
        entity_id=str(target.id),
        entity_label=target.email,
        before=before,
        after=after,
        request=request,
    )
    db.commit()
    db.refresh(target)
    return target


@router.post("/users/{user_id}/reset-password", response_model=MessageResponse)
def admin_reset_password(
    user_id: UUID,
    payload: AdminResetPasswordRequest,
    request: Request,
    actor: User = Depends(require_permission("admin.users.manage")),
    db: Session = Depends(get_db),
) -> MessageResponse:
    target = db.get(User, user_id)
    if target is None:
        raise NotFoundError("Utilisateur introuvable.")
    target.password_hash = hash_password(payload.new_password)
    target.must_change_password = True
    auth_service.revoke_all_sessions(db, target.id)
    write_audit(
        db,
        module="admin",
        action="user_password_reset",
        actor=actor,
        entity_type="user",
        entity_id=str(target.id),
        entity_label=target.email,
        request=request,
    )
    db.commit()
    return MessageResponse(message="Mot de passe réinitialisé et sessions révoquées.")


@router.post("/users/{user_id}/revoke-sessions", response_model=MessageResponse)
def admin_revoke_sessions(
    user_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("admin.users.manage")),
    db: Session = Depends(get_db),
) -> MessageResponse:
    target = db.get(User, user_id)
    if target is None:
        raise NotFoundError("Utilisateur introuvable.")
    count = auth_service.revoke_all_sessions(db, target.id)
    write_audit(
        db,
        module="admin",
        action="user_sessions_revoked",
        actor=actor,
        entity_type="user",
        entity_id=str(target.id),
        entity_label=target.email,
        after={"revoked_sessions": count},
        request=request,
    )
    db.commit()
    return MessageResponse(message=f"{count} session(s) révoquée(s).")


@router.post("/users/{user_id}/mfa/reset", response_model=MessageResponse)
def admin_reset_mfa(
    user_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("admin.users.manage")),
    db: Session = Depends(get_db),
) -> MessageResponse:
    target = db.get(User, user_id)
    if target is None:
        raise NotFoundError("Utilisateur introuvable.")
    auth_service.reset_user_mfa(db, target, actor=actor, request=request)
    return MessageResponse(
        message="MFA réinitialisée. L'utilisateur devra la reconfigurer et se reconnecter."
    )


@router.get("/roles", response_model=list[RoleWithPermissions])
def list_roles(
    _: User = Depends(require_permission("admin.roles.read")),
    db: Session = Depends(get_db),
) -> list[Role]:
    return list(
        db.scalars(
            select(Role).options(selectinload(Role.permissions)).order_by(Role.name)
        ).all()
    )


@router.get("/permissions", response_model=list[PermissionRead])
def list_permissions(
    _: User = Depends(require_permission("admin.roles.read")),
    db: Session = Depends(get_db),
) -> list[Permission]:
    return list(db.scalars(select(Permission).order_by(Permission.module, Permission.action)).all())


@router.put("/roles/{role_id}/permissions", response_model=RoleWithPermissions)
def update_role_permissions(
    role_id: UUID,
    payload: RolePermissionsUpdateRequest,
    request: Request,
    actor: User = Depends(require_permission("admin.roles.manage")),
    db: Session = Depends(get_db),
) -> Role:
    role = db.scalar(select(Role).options(selectinload(Role.permissions)).where(Role.id == role_id))
    if role is None:
        raise NotFoundError("Rôle introuvable.")
    if role.code == "admin":
        raise ConflictError(
            "Le rôle Administrateur est verrouillé pour éviter tout risque de perte d'accès."
        )

    permissions = list(
        db.scalars(select(Permission).where(Permission.code.in_(payload.permission_codes))).all()
    )
    found_codes = {permission.code for permission in permissions}
    unknown = sorted(set(payload.permission_codes) - found_codes)
    if unknown:
        raise ConflictError("Permissions inconnues.", fields=[
            {"field": "permission_codes", "message": code} for code in unknown
        ])

    before = sorted(permission.code for permission in role.permissions)
    role.permissions = permissions
    after = sorted(payload.permission_codes)
    write_audit(
        db,
        module="admin",
        action="role_permissions_updated",
        actor=actor,
        entity_type="role",
        entity_id=str(role.id),
        entity_label=role.code,
        before={"permissions": before},
        after={"permissions": after},
        request=request,
    )
    db.commit()
    db.refresh(role)
    return role


@router.get("/settings/smtp", response_model=SmtpSettingsRead)
def get_smtp_settings(
    _: User = Depends(require_permission("admin.settings.read")),
    db: Session = Depends(get_db),
) -> SmtpSettingsRead:
    return email_service.get_settings(db)


@router.put("/settings/smtp", response_model=SmtpSettingsRead)
def update_smtp_settings(
    payload: SmtpSettingsUpdate,
    request: Request,
    actor: User = Depends(require_permission("admin.settings.manage")),
    db: Session = Depends(get_db),
) -> SmtpSettingsRead:
    return email_service.update_settings(db, payload, actor=actor, request=request)


@router.post("/settings/smtp/test", response_model=MessageResponse)
def test_smtp_settings(
    payload: SmtpTestRequest,
    request: Request,
    actor: User = Depends(require_permission("admin.settings.manage")),
    db: Session = Depends(get_db),
) -> MessageResponse:
    message = email_service.send_test_email(
        db, str(payload.to_email), actor=actor, request=request
    )
    return MessageResponse(message=message)


@router.get("/settings", response_model=list[SettingRead])
def list_settings(
    _: User = Depends(require_permission("admin.settings.read")),
    db: Session = Depends(get_db),
) -> list[SettingRead]:
    settings_rows = db.scalars(select(Setting).order_by(Setting.category, Setting.key)).all()
    result: list[SettingRead] = []
    for setting in settings_rows:
        try:
            value = json.loads(setting.value_json) if setting.value_json else None
        except json.JSONDecodeError:
            value = setting.value_json
        result.append(
            SettingRead(
                key=setting.key,
                value="********" if setting.is_secret and value else value,
                category=setting.category,
                is_secret=setting.is_secret,
                description=setting.description,
                updated_at=setting.updated_at,
            )
        )
    return result


@router.put("/settings/{key}", response_model=SettingRead)
def update_setting(
    key: str,
    payload: SettingUpdate,
    request: Request,
    actor: User = Depends(require_permission("admin.settings.manage")),
    db: Session = Depends(get_db),
) -> SettingRead:
    setting = db.get(Setting, key)
    if setting is None:
        raise NotFoundError("Paramètre introuvable.")
    if setting.is_secret:
        raise ValidationAppError(
            "Ce paramètre contient un secret : utilisez l'écran dédié pour le modifier."
        )
    before = setting.value_json
    setting.value_json = json.dumps(payload.value, ensure_ascii=False)
    write_audit(
        db,
        module="admin",
        action="setting_updated",
        actor=actor,
        entity_type="setting",
        entity_id=setting.key,
        entity_label=setting.key,
        before={"value": before},
        after={"value": setting.value_json},
        request=request,
    )
    db.commit()
    db.refresh(setting)
    return SettingRead(
        key=setting.key,
        value=payload.value,
        category=setting.category,
        is_secret=setting.is_secret,
        description=setting.description,
        updated_at=setting.updated_at,
    )
