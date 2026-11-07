from datetime import UTC, datetime, timedelta
from uuid import UUID

from app.core.config import settings
from app.core.errors import (
    AuthenticationError,
    ConflictError,
    NotFoundError,
    ValidationAppError,
)
from app.core.security import (
    generate_token,
    hash_password,
    hash_token,
    password_needs_rehash,
    validate_password_strength,
    verify_password,
)
from app.models.auth import AuthSession, Role, User
from app.services.audit_service import write_audit
from fastapi import Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session


def _now() -> datetime:
    return datetime.now(UTC)


def _aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def _validate_password(password: str) -> None:
    errors = validate_password_strength(password)
    if errors:
        raise ValidationAppError(
            "Mot de passe trop faible.",
            code="WEAK_PASSWORD",
            fields=[{"field": "password", "message": error} for error in errors],
        )


def find_user_by_email(db: Session, email: str) -> User | None:
    normalized = email.strip().lower()
    return db.scalar(select(User).where(func.lower(User.email) == normalized))


def authenticate(
    db: Session,
    *,
    email: str,
    password: str,
    request: Request,
) -> tuple[User, AuthSession, str]:
    user = find_user_by_email(db, email)
    now = _now()

    if user is None or not user.is_active:
        write_audit(
            db,
            module="auth",
            action="login_failed",
            actor_label=email.strip().lower(),
            entity_type="user",
            request=request,
            status="failure",
        )
        db.commit()
        raise AuthenticationError("Adresse e-mail ou mot de passe incorrect.")

    locked_until = _aware(user.locked_until) if user.locked_until else None
    if locked_until and locked_until > now:
        write_audit(
            db,
            module="auth",
            action="login_locked",
            actor=user,
            entity_type="user",
            entity_id=str(user.id),
            request=request,
            status="failure",
        )
        db.commit()
        raise AuthenticationError(
            "Compte temporairement verrouillé. Réessayez dans quelques minutes.",
            code="ACCOUNT_LOCKED",
        )

    if not verify_password(password, user.password_hash):
        user.failed_attempts += 1
        if user.failed_attempts >= 5:
            user.locked_until = now + timedelta(minutes=15)
        write_audit(
            db,
            module="auth",
            action="login_failed",
            actor=user,
            entity_type="user",
            entity_id=str(user.id),
            request=request,
            status="failure",
        )
        db.commit()
        raise AuthenticationError("Adresse e-mail ou mot de passe incorrect.")

    if password_needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)

    user.failed_attempts = 0
    user.locked_until = None
    user.last_login_at = now

    token = generate_token(32)
    session = AuthSession(
        user_id=user.id,
        token_hash=hash_token(token),
        ip=request.client.host if request.client else None,
        user_agent=(request.headers.get("user-agent") or "")[:512] or None,
        created_at=now,
        last_seen_at=now,
        expires_at=now + timedelta(days=settings.session_absolute_days),
    )
    db.add(session)
    write_audit(
        db,
        module="auth",
        action="login",
        actor=user,
        entity_type="user",
        entity_id=str(user.id),
        request=request,
    )
    db.commit()
    db.refresh(user)
    db.refresh(session)
    return user, session, token


def get_session(db: Session, token: str, request: Request) -> AuthSession:
    session = db.scalar(select(AuthSession).where(AuthSession.token_hash == hash_token(token)))
    now = _now()

    if session is None:
        raise AuthenticationError("Session invalide ou expirée.")

    if session.revoked_at is not None:
        raise AuthenticationError("Session révoquée.")

    if _aware(session.expires_at) <= now:
        session.revoked_at = now
        db.commit()
        raise AuthenticationError("Session expirée.")

    idle_limit = _aware(session.last_seen_at) + timedelta(minutes=settings.session_idle_minutes)
    if idle_limit <= now:
        session.revoked_at = now
        db.commit()
        raise AuthenticationError("Session expirée pour inactivité.")

    if not session.user.is_active:
        session.revoked_at = now
        db.commit()
        raise AuthenticationError("Compte désactivé.")

    if (now - _aware(session.last_seen_at)).total_seconds() > 300:
        session.last_seen_at = now
        db.commit()

    return session


def logout(db: Session, session: AuthSession, request: Request) -> None:
    session.revoked_at = _now()
    write_audit(
        db,
        module="auth",
        action="logout",
        actor=session.user,
        entity_type="user",
        entity_id=str(session.user_id),
        request=request,
    )
    db.commit()


def revoke_session(db: Session, session: AuthSession, request: Request, actor: User) -> None:
    session.revoked_at = _now()
    write_audit(
        db,
        module="auth",
        action="session_revoked",
        actor=actor,
        entity_type="session",
        entity_id=str(session.id),
        request=request,
    )
    db.commit()


def list_sessions(db: Session, user_id: UUID) -> list[AuthSession]:
    return list(
        db.scalars(
            select(AuthSession)
            .where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
            .order_by(AuthSession.last_seen_at.desc())
        ).all()
    )


def revoke_all_sessions(db: Session, user_id: UUID, *, keep_id: UUID | None = None) -> int:
    now = _now()
    sessions = db.scalars(
        select(AuthSession).where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
    ).all()
    count = 0
    for session in sessions:
        if keep_id and session.id == keep_id:
            continue
        session.revoked_at = now
        count += 1
    return count


def change_password(
    db: Session,
    *,
    user: User,
    current_password: str,
    new_password: str,
    request: Request,
    current_session_id: UUID | None = None,
) -> None:
    if not verify_password(current_password, user.password_hash):
        raise AuthenticationError("Mot de passe actuel incorrect.", code="INVALID_PASSWORD")
    if verify_password(new_password, user.password_hash):
        raise ConflictError("Le nouveau mot de passe doit être différent de l'ancien.")
    _validate_password(new_password)

    user.password_hash = hash_password(new_password)
    user.must_change_password = False
    user.password_changed_at = _now()
    revoke_all_sessions(db, user.id, keep_id=current_session_id)
    write_audit(
        db,
        module="auth",
        action="password_changed",
        actor=user,
        entity_type="user",
        entity_id=str(user.id),
        request=request,
    )
    db.commit()


def create_user(
    db: Session,
    *,
    email: str,
    password: str,
    first_name: str,
    last_name: str,
    role_id: UUID,
    data_scope: str = "own",
    is_active: bool = True,
    must_change_password: bool = True,
    actor: User | None = None,
    request: Request | None = None,
) -> User:
    normalized_email = email.strip().lower()
    if find_user_by_email(db, normalized_email):
        raise ConflictError("Un utilisateur utilise déjà cette adresse e-mail.")
    _validate_password(password)
    role = db.get(Role, role_id)
    if role is None:
        raise NotFoundError("Rôle introuvable.")
    if data_scope not in {"all", "service", "own"}:
        raise ConflictError("Portée de données invalide.")

    user = User(
        email=normalized_email,
        password_hash=hash_password(password),
        first_name=first_name.strip(),
        last_name=last_name.strip(),
        role_id=role.id,
        data_scope=data_scope,
        is_active=is_active,
        must_change_password=must_change_password,
    )
    db.add(user)
    db.flush()
    write_audit(
        db,
        module="admin",
        action="user_created",
        actor=actor,
        entity_type="user",
        entity_id=str(user.id),
        entity_label=user.email,
        after={"email": user.email, "role": role.code, "data_scope": user.data_scope},
        request=request,
    )
    db.commit()
    db.refresh(user)
    return user


def _active_admin_count(db: Session) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(User)
            .join(Role)
            .where(User.is_active.is_(True), Role.code == "admin")
        )
        or 0
    )


def ensure_not_last_admin(db: Session, user: User) -> None:
    if user.role.code == "admin" and user.is_active and _active_admin_count(db) <= 1:
        raise ConflictError(
            "Impossible de désactiver ou de rétrograder le dernier administrateur actif."
        )
