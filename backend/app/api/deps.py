from collections.abc import Callable

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import AuthenticationError, PermissionDeniedError
from app.core.permissions import has_permission
from app.db.session import get_db
from app.models.auth import AuthSession, User
from app.services.auth_service import get_session


def get_client_ip(request: Request) -> str:
    if settings.trust_proxy_headers:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def get_current_session(
    request: Request,
    db: Session = Depends(get_db),
) -> AuthSession:
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        raise AuthenticationError("Vous devez être connecté.")
    return get_session(db, token, request)


def get_current_user(session: AuthSession = Depends(get_current_session)) -> User:
    return session.user


def require_permission(code: str) -> Callable[..., User]:
    def dependency(user: User = Depends(get_current_user)) -> User:
        if not has_permission(user, code):
            raise PermissionDeniedError(
                "Votre rôle ne permet pas cette action.",
                code="PERMISSION_DENIED",
                fields=[{"field": "permission", "message": code}],
            )
        return user

    return dependency


def require_any_permission(*codes: str) -> Callable[..., User]:
    def dependency(user: User = Depends(get_current_user)) -> User:
        if not any(has_permission(user, code) for code in codes):
            raise PermissionDeniedError(
                "Votre rôle ne permet pas cette action.",
                code="PERMISSION_DENIED",
                fields=[{"field": "permission", "message": ", ".join(codes)}],
            )
        return user

    return dependency
