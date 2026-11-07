from typing import Any

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.logging import get_logger

logger = get_logger(__name__)


class AppError(Exception):
    """Erreur métier normalisée, exposée en Problem Details."""

    status_code = 400
    code = "APPLICATION_ERROR"
    title = "Erreur applicative"

    def __init__(
        self,
        detail: str,
        *,
        code: str | None = None,
        status_code: int | None = None,
        fields: list[dict[str, Any]] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(detail)
        self.detail = detail
        if code:
            self.code = code
        if status_code:
            self.status_code = status_code
        self.fields = fields or []
        self.headers = headers or {}


class AuthenticationError(AppError):
    status_code = 401
    code = "AUTHENTICATION_REQUIRED"
    title = "Authentification requise"


class PermissionDeniedError(AppError):
    status_code = 403
    code = "PERMISSION_DENIED"
    title = "Accès refusé"


class NotFoundError(AppError):
    status_code = 404
    code = "NOT_FOUND"
    title = "Ressource introuvable"


class ConflictError(AppError):
    status_code = 409
    code = "CONFLICT"
    title = "Conflit de données"


class ValidationAppError(AppError):
    status_code = 422
    code = "VALIDATION_ERROR"
    title = "Données invalides"


class RateLimitError(AppError):
    status_code = 429
    code = "RATE_LIMITED"
    title = "Trop de requêtes"


class VersionConflictError(ConflictError):
    code = "VERSION_CONFLICT"
    title = "Conflit de version"


def problem_response(
    *,
    status_code: int,
    code: str,
    title: str,
    detail: str,
    request: Request,
    fields: list[dict[str, Any]] | None = None,
) -> JSONResponse:
    request_id = getattr(request.state, "request_id", None)
    return JSONResponse(
        status_code=status_code,
        content={
            "type": f"https://si-pnfor.local/errors/{code.lower()}",
            "title": title,
            "status": status_code,
            "detail": detail,
            "instance": str(request.url.path),
            "code": code,
            "request_id": request_id,
            "errors": fields or [],
        },
        media_type="application/problem+json",
    )


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    response = problem_response(
        status_code=exc.status_code,
        code=exc.code,
        title=exc.title,
        detail=exc.detail,
        request=request,
        fields=exc.fields,
    )
    for name, value in exc.headers.items():
        response.headers[name] = value
    return response


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    fields = []
    for error in exc.errors():
        location = [str(part) for part in error.get("loc", []) if part not in ("body", "query")]
        fields.append(
            {
                "field": ".".join(location),
                "message": error.get("msg", "Valeur invalide"),
                "type": error.get("type", "validation_error"),
            }
        )
    return problem_response(
        status_code=422,
        code="VALIDATION_ERROR",
        title="Données invalides",
        detail="Un ou plusieurs champs sont invalides.",
        request=request,
        fields=fields,
    )


async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    request_id = getattr(request.state, "request_id", None)
    logger.exception("unhandled_error", path=request.url.path, request_id=request_id, error=str(exc))
    return problem_response(
        status_code=500,
        code="INTERNAL_ERROR",
        title="Erreur interne",
        detail="Une erreur interne est survenue. Contactez l'administrateur avec l'identifiant de requête.",
        request=request,
    )
