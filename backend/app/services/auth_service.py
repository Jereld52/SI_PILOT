import base64
import io
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

import pyotp
import qrcode
from app.core.config import settings
from app.core.crypto import decrypt_secret, encrypt_secret
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
from app.models.auth import (
    AuthSession,
    MfaChallenge,
    MfaRecoveryCode,
    Role,
    User,
)
from app.services import branding_service
from app.services.audit_service import write_audit
from fastapi import Request
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

MFA_CHALLENGE_MINUTES = 5
MFA_MAX_ATTEMPTS = 5
MFA_RECOVERY_CODE_COUNT = 10


@dataclass
class AuthOutcome:
    user: User
    session: AuthSession | None = None
    token: str | None = None
    challenge_token: str | None = None


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


def _create_session(
    db: Session, user: User, request: Request, now: datetime
) -> tuple[AuthSession, str]:
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
    return session, token


def authenticate(
    db: Session,
    *,
    email: str,
    password: str,
    request: Request,
) -> AuthOutcome:
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

    if user.mfa_enabled:
        db.execute(
            delete(MfaChallenge).where(
                MfaChallenge.user_id == user.id, MfaChallenge.expires_at < now
            )
        )
        challenge_token = generate_token(32)
        db.add(
            MfaChallenge(
                user_id=user.id,
                token_hash=hash_token(challenge_token),
                created_at=now,
                expires_at=now + timedelta(minutes=MFA_CHALLENGE_MINUTES),
            )
        )
        write_audit(
            db,
            module="auth",
            action="login_mfa_required",
            actor=user,
            entity_type="user",
            entity_id=str(user.id),
            request=request,
        )
        db.commit()
        return AuthOutcome(user=user, challenge_token=challenge_token)

    user.last_login_at = now
    session, token = _create_session(db, user, request, now)
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
    return AuthOutcome(user=user, session=session, token=token)


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


# --- Authentification multifacteur (TOTP) ------------------------------------


def mfa_status(user: User) -> tuple[bool, bool]:
    return user.mfa_enabled, bool(user.mfa_secret_encrypted)


def _mfa_secret(user: User) -> str:
    if not user.mfa_secret_encrypted:
        raise ValidationAppError(
            "Aucune configuration MFA en cours. Lancez d'abord l'activation."
        )
    secret = decrypt_secret(user.mfa_secret_encrypted)
    if not secret:
        raise ValidationAppError("La clé MFA est illisible. Recommencez la configuration.")
    return secret


def _normalize_recovery_code(code: str) -> str:
    return code.replace("-", "").replace(" ", "").strip().upper()


def _verify_totp(user: User, code: str) -> bool:
    secret = _mfa_secret(user)
    normalized = code.strip().replace(" ", "")
    return pyotp.TOTP(secret).verify(normalized, valid_window=1)


def _verify_recovery_code(db: Session, user: User, code: str) -> bool:
    normalized = _normalize_recovery_code(code)
    if len(normalized) < 6:
        return False
    rows = db.scalars(
        select(MfaRecoveryCode).where(
            MfaRecoveryCode.user_id == user.id,
            MfaRecoveryCode.used_at.is_(None),
        )
    ).all()
    for row in rows:
        if verify_password(normalized, row.code_hash):
            row.used_at = _now()
            return True
    return False


def _verify_second_factor(db: Session, user: User, code: str) -> bool:
    if _verify_totp(user, code):
        return True
    return _verify_recovery_code(db, user, code)


def setup_mfa(
    db: Session, user: User, *, request: Request | None = None
) -> tuple[str, str, str]:
    if user.mfa_enabled:
        raise ConflictError(
            "L'authentification multifacteur est déjà activée. Désactivez-la avant de recommencer."
        )
    secret = pyotp.random_base32()
    user.mfa_secret_encrypted = encrypt_secret(secret)
    branding = branding_service.get_branding(db)
    uri = pyotp.TOTP(secret).provisioning_uri(
        name=user.email, issuer_name=branding.app_name
    )
    image = qrcode.make(uri)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    data_url = "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode(
        "ascii"
    )
    write_audit(
        db,
        module="auth",
        action="mfa_setup_started",
        actor=user,
        entity_type="user",
        entity_id=str(user.id),
        request=request,
    )
    db.commit()
    return secret, uri, data_url


def enable_mfa(
    db: Session,
    user: User,
    *,
    code: str,
    request: Request | None = None,
) -> list[str]:
    if user.mfa_enabled:
        raise ConflictError("L'authentification multifacteur est déjà activée.")
    if not user.mfa_secret_encrypted:
        raise ValidationAppError(
            "Aucune configuration MFA en cours. Lancez d'abord l'activation."
        )
    if not _verify_totp(user, code):
        raise AuthenticationError(
            "Code d'authentification invalide. Vérifiez l'heure de votre téléphone.",
            code="INVALID_MFA_CODE",
        )
    user.mfa_enabled = True
    db.execute(delete(MfaRecoveryCode).where(MfaRecoveryCode.user_id == user.id))
    recovery_codes: list[str] = []
    for _ in range(MFA_RECOVERY_CODE_COUNT):
        raw = (
            f"{secrets.token_hex(3).upper()}-{secrets.token_hex(2).upper()}"
        )
        recovery_codes.append(raw)
        db.add(
            MfaRecoveryCode(
                user_id=user.id,
                code_hash=hash_password(_normalize_recovery_code(raw)),
            )
        )
    write_audit(
        db,
        module="auth",
        action="mfa_enabled",
        actor=user,
        entity_type="user",
        entity_id=str(user.id),
        request=request,
    )
    db.commit()
    return recovery_codes


def verify_mfa_challenge(
    db: Session,
    *,
    challenge_token: str,
    code: str,
    request: Request,
) -> AuthOutcome:
    now = _now()
    challenge = db.scalar(
        select(MfaChallenge).where(
            MfaChallenge.token_hash == hash_token(challenge_token),
            MfaChallenge.consumed_at.is_(None),
        )
    )
    if challenge is None or _aware(challenge.expires_at) <= now:
        raise AuthenticationError(
            "Demande de vérification invalide ou expirée. Reconnectez-vous.",
            code="INVALID_MFA_CHALLENGE",
        )
    if challenge.attempts >= MFA_MAX_ATTEMPTS:
        challenge.consumed_at = now
        db.commit()
        raise AuthenticationError(
            "Trop de tentatives. Reconnectez-vous pour recommencer.",
            code="MFA_TOO_MANY_ATTEMPTS",
        )
    user = challenge.user
    if not user.is_active:
        challenge.consumed_at = now
        db.commit()
        raise AuthenticationError("Compte désactivé.")

    if not _verify_second_factor(db, user, code):
        challenge.attempts += 1
        write_audit(
            db,
            module="auth",
            action="login_mfa_failed",
            actor=user,
            entity_type="user",
            entity_id=str(user.id),
            request=request,
            status="failure",
        )
        db.commit()
        raise AuthenticationError(
            "Code d'authentification invalide.", code="INVALID_MFA_CODE"
        )

    challenge.consumed_at = now
    user.last_login_at = now
    user.failed_attempts = 0
    user.locked_until = None
    session, token = _create_session(db, user, request, now)
    write_audit(
        db,
        module="auth",
        action="login_mfa",
        actor=user,
        entity_type="user",
        entity_id=str(user.id),
        request=request,
    )
    db.commit()
    db.refresh(user)
    db.refresh(session)
    return AuthOutcome(user=user, session=session, token=token)


def disable_mfa(
    db: Session,
    user: User,
    *,
    password: str,
    code: str,
    request: Request | None = None,
    current_session_id: UUID | None = None,
) -> None:
    if not verify_password(password, user.password_hash):
        raise AuthenticationError("Mot de passe incorrect.", code="INVALID_PASSWORD")
    if not user.mfa_enabled:
        raise ConflictError("L'authentification multifacteur n'est pas activée.")
    if not _verify_second_factor(db, user, code):
        raise AuthenticationError(
            "Code d'authentification invalide.", code="INVALID_MFA_CODE"
        )
    user.mfa_enabled = False
    user.mfa_secret_encrypted = None
    db.execute(delete(MfaRecoveryCode).where(MfaRecoveryCode.user_id == user.id))
    revoke_all_sessions(db, user.id, keep_id=current_session_id)
    write_audit(
        db,
        module="auth",
        action="mfa_disabled",
        actor=user,
        entity_type="user",
        entity_id=str(user.id),
        request=request,
    )
    db.commit()


def reset_user_mfa(
    db: Session,
    target: User,
    *,
    actor: User,
    request: Request | None = None,
) -> None:
    target.mfa_enabled = False
    target.mfa_secret_encrypted = None
    db.execute(delete(MfaRecoveryCode).where(MfaRecoveryCode.user_id == target.id))
    db.execute(delete(MfaChallenge).where(MfaChallenge.user_id == target.id))
    revoke_all_sessions(db, target.id)
    write_audit(
        db,
        module="admin",
        action="user_mfa_reset",
        actor=actor,
        entity_type="user",
        entity_id=str(target.id),
        entity_label=target.email,
        request=request,
    )
    db.commit()
