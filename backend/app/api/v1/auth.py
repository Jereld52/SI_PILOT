from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_client_ip, get_current_session, get_current_user
from app.core.config import settings
from app.core.errors import AuthenticationError, NotFoundError, RateLimitError
from app.core.logging import get_logger
from app.core.permissions import permission_codes
from app.core.rate_limit import login_limiter
from app.core.security import (
    generate_csrf_token,
    generate_token,
    hash_token,
    validate_password_strength,
)
from app.db.session import get_db
from app.models.auth import AuthSession, PasswordResetToken, User
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    LoginResponse,
    MeResponse,
    MfaCodeRequest,
    MfaDisableRequest,
    MfaEnableResponse,
    MfaSetupResponse,
    MfaStatusResponse,
    MfaVerifyRequest,
    ResetPasswordRequest,
    SessionRead,
    UserRead,
)
from app.schemas.common import MessageResponse
from app.services import auth_service
from app.services.audit_service import write_audit

router = APIRouter(prefix="/auth", tags=["Authentification"])
logger = get_logger(__name__)


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def _is_https(request: Request) -> bool:
    if request.url.scheme == "https":
        return True
    if settings.trust_proxy_headers:
        forwarded = request.headers.get("x-forwarded-proto", "")
        return forwarded.split(",")[0].strip().lower() == "https"
    return False


def _cookie_secure(request: Request) -> bool:
    return settings.secure_cookies or _is_https(request)


def _set_auth_cookies(
    response: Response, token: str, csrf_token: str, request: Request
) -> None:
    max_age = settings.session_absolute_days * 24 * 3600
    secure = _cookie_secure(request)
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        max_age=max_age,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
    )
    response.set_cookie(
        key=settings.csrf_cookie_name,
        value=csrf_token,
        max_age=max_age,
        httponly=False,
        secure=secure,
        samesite="lax",
        path="/",
    )


def _clear_auth_cookies(response: Response, request: Request) -> None:
    secure = _cookie_secure(request)
    response.delete_cookie(
        settings.session_cookie_name, path="/", secure=secure, samesite="lax"
    )
    response.delete_cookie(
        settings.csrf_cookie_name, path="/", secure=secure, samesite="lax"
    )


def _login_response(user: User, session: AuthSession, csrf_token: str) -> LoginResponse:
    return LoginResponse(
        user=UserRead.model_validate(user),
        permissions=sorted(permission_codes(user)),
        csrf_token=csrf_token,
        expires_at=session.expires_at,
    )


@router.post("/login", response_model=LoginResponse)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> LoginResponse:
    key = f"{get_client_ip(request)}:{payload.email.lower()}"
    allowed, retry_after = login_limiter.check(key, limit=5, window_seconds=900)
    if not allowed:
        raise RateLimitError(
            "Trop de tentatives de connexion. Réessayez dans quelques minutes.",
            headers={"Retry-After": str(retry_after)},
        )

    outcome = auth_service.authenticate(
        db,
        email=payload.email,
        password=payload.password,
        request=request,
    )
    login_limiter.reset(key)
    if outcome.challenge_token:
        return LoginResponse(
            mfa_required=True, challenge_token=outcome.challenge_token
        )
    if outcome.session is None or outcome.token is None:
        raise AuthenticationError("Connexion impossible.")
    csrf_token = generate_csrf_token()
    _set_auth_cookies(response, outcome.token, csrf_token, request)
    return _login_response(outcome.user, outcome.session, csrf_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, db: Session = Depends(get_db)) -> Response:
    token = request.cookies.get(settings.session_cookie_name)
    if token:
        try:
            session = auth_service.get_session(db, token, request)
            auth_service.logout(db, session, request)
        except AuthenticationError:
            db.rollback()
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    _clear_auth_cookies(response, request)
    return response


@router.get("/mfa", response_model=MfaStatusResponse)
def mfa_status(
    session: AuthSession = Depends(get_current_session),
) -> MfaStatusResponse:
    enabled, configured = auth_service.mfa_status(session.user)
    return MfaStatusResponse(enabled=enabled, configured=configured)


@router.post("/mfa/setup", response_model=MfaSetupResponse)
def mfa_setup(
    request: Request,
    session: AuthSession = Depends(get_current_session),
    db: Session = Depends(get_db),
) -> MfaSetupResponse:
    secret, uri, qr_code = auth_service.setup_mfa(
        db, session.user, request=request
    )
    return MfaSetupResponse(
        secret=secret, provisioning_uri=uri, qr_code_data_url=qr_code
    )


@router.post("/mfa/enable", response_model=MfaEnableResponse)
def mfa_enable(
    payload: MfaCodeRequest,
    request: Request,
    session: AuthSession = Depends(get_current_session),
    db: Session = Depends(get_db),
) -> MfaEnableResponse:
    codes = auth_service.enable_mfa(
        db, session.user, code=payload.code, request=request
    )
    return MfaEnableResponse(
        message="Authentification multifacteur activée. Conservez les codes de secours.",
        recovery_codes=codes,
    )


@router.post("/mfa/disable", response_model=MessageResponse)
def mfa_disable(
    payload: MfaDisableRequest,
    request: Request,
    session: AuthSession = Depends(get_current_session),
    db: Session = Depends(get_db),
) -> MessageResponse:
    auth_service.disable_mfa(
        db,
        session.user,
        password=payload.password,
        code=payload.code,
        request=request,
        current_session_id=session.id,
    )
    return MessageResponse(
        message="Authentification multifacteur désactivée. Les autres sessions ont été révoquées."
    )


@router.post("/mfa/verify", response_model=LoginResponse)
def mfa_verify(
    payload: MfaVerifyRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> LoginResponse:
    key = f"mfa:{get_client_ip(request)}"
    allowed, retry_after = login_limiter.check(key, limit=10, window_seconds=900)
    if not allowed:
        raise RateLimitError(
            "Trop de tentatives de vérification. Réessayez dans quelques minutes.",
            headers={"Retry-After": str(retry_after)},
        )
    outcome = auth_service.verify_mfa_challenge(
        db,
        challenge_token=payload.challenge_token,
        code=payload.code,
        request=request,
    )
    login_limiter.reset(key)
    if outcome.session is None or outcome.token is None:
        raise AuthenticationError("Vérification impossible.")
    csrf_token = generate_csrf_token()
    _set_auth_cookies(response, outcome.token, csrf_token, request)
    return _login_response(outcome.user, outcome.session, csrf_token)


@router.get("/me", response_model=MeResponse)
def me(user: User = Depends(get_current_user)) -> MeResponse:
    codes = sorted(permission_codes(user))
    modules = sorted({code.split(".", 1)[0] for code in codes})
    return MeResponse(
        user=UserRead.model_validate(user),
        permissions=codes,
        modules=modules,
    )


@router.post("/change-password", response_model=MessageResponse)
def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    session: AuthSession = Depends(get_current_session),
    db: Session = Depends(get_db),
) -> MessageResponse:
    auth_service.change_password(
        db,
        user=session.user,
        current_password=payload.current_password,
        new_password=payload.new_password,
        request=request,
        current_session_id=session.id,
    )
    return MessageResponse(message="Mot de passe modifié. Les autres sessions ont été révoquées.")


@router.get("/sessions", response_model=list[SessionRead])
def sessions(
    session: AuthSession = Depends(get_current_session),
    db: Session = Depends(get_db),
) -> list[SessionRead]:
    items = auth_service.list_sessions(db, session.user_id)
    return [
        SessionRead(
            id=item.id,
            ip=item.ip,
            user_agent=item.user_agent,
            created_at=item.created_at,
            last_seen_at=item.last_seen_at,
            expires_at=item.expires_at,
            is_current=item.id == session.id,
        )
        for item in items
    ]


@router.delete("/sessions/{session_id}", response_model=MessageResponse)
def revoke_session(
    session_id: UUID,
    request: Request,
    session: AuthSession = Depends(get_current_session),
    db: Session = Depends(get_db),
) -> MessageResponse:
    target = db.scalar(
        select(AuthSession).where(
            AuthSession.id == session_id,
            AuthSession.user_id == session.user_id,
            AuthSession.revoked_at.is_(None),
        )
    )
    if target is None:
        raise NotFoundError("Session introuvable.")
    auth_service.revoke_session(db, target, request, session.user)
    return MessageResponse(message="Session révoquée.")


@router.post("/forgot-password", response_model=MessageResponse, status_code=202)
def forgot_password(
    payload: ForgotPasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> MessageResponse:
    user = auth_service.find_user_by_email(db, payload.email)
    if user and user.is_active:
        token = generate_token(32)
        db.add(
            PasswordResetToken(
                user_id=user.id,
                token_hash=hash_token(token),
                expires_at=datetime.now(UTC) + timedelta(hours=1),
                created_at=datetime.now(UTC),
            )
        )
        write_audit(
            db,
            module="auth",
            action="password_reset_requested",
            actor=user,
            entity_type="user",
            entity_id=str(user.id),
            request=request,
        )
        db.commit()
        if not settings.is_production:
            logger.info("password_reset_token_dev", email=user.email, token=token)
    else:
        db.rollback()
    return MessageResponse(
        message="Si un compte correspond à cette adresse, une procédure de réinitialisation a été créée."
    )


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(
    payload: ResetPasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> MessageResponse:
    reset = db.scalar(
        select(PasswordResetToken).where(
            PasswordResetToken.token_hash == hash_token(payload.token),
            PasswordResetToken.used_at.is_(None),
        )
    )
    if reset is None or _aware(reset.expires_at) <= datetime.now(UTC):
        raise AuthenticationError("Lien de réinitialisation invalide ou expiré.")
    user = db.get(User, reset.user_id)
    if user is None or not user.is_active:
        raise AuthenticationError("Compte indisponible.")

    errors = validate_password_strength(payload.new_password)
    if errors:
        raise AuthenticationError(" ".join(errors), code="WEAK_PASSWORD")

    from app.core.security import hash_password

    user.password_hash = hash_password(payload.new_password)
    user.must_change_password = False
    user.password_changed_at = datetime.now(UTC)
    reset.used_at = datetime.now(UTC)
    auth_service.revoke_all_sessions(db, user.id)
    write_audit(
        db,
        module="auth",
        action="password_reset_completed",
        actor=user,
        entity_type="user",
        entity_id=str(user.id),
        request=request,
    )
    db.commit()
    return MessageResponse(message="Mot de passe réinitialisé. Vous pouvez vous connecter.")
