import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.errors import (
    AppError,
    app_error_handler,
    problem_response,
    unhandled_error_handler,
    validation_error_handler,
)
from app.core.logging import configure_logging, get_logger
from app.core.security import validate_csrf
from app.db.session import check_database

configure_logging()
logger = get_logger(__name__)

UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
CSRF_EXEMPT_PATHS = {
    "/api/v1/auth/login",
    "/api/v1/auth/forgot-password",
    "/api/v1/auth/reset-password",
}


class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault(
            "Permissions-Policy", "geolocation=(), microphone=(), camera=()"
        )
        response.headers.setdefault(
            "Content-Security-Policy",
            "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; "
            "script-src 'self'; connect-src 'self' http://localhost:5173 http://127.0.0.1:5173 "
            "ws://localhost:5173 ws://127.0.0.1:5173; font-src 'self' data:; "
            "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
        )
        if settings.is_production and settings.secure_cookies:
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
            )
        return response


class CSRFMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if (
            request.method in UNSAFE_METHODS
            and request.url.path.startswith("/api/")
            and request.url.path not in CSRF_EXEMPT_PATHS
        ):
            session_token = request.cookies.get(settings.session_cookie_name)
            if session_token:
                header_token = request.headers.get("x-csrf-token")
                cookie_token = request.cookies.get(settings.csrf_cookie_name)
                if not validate_csrf(header_token, cookie_token):
                    return problem_response(
                        status_code=status.HTTP_403_FORBIDDEN,
                        code="CSRF_INVALID",
                        title="Jeton CSRF invalide",
                        detail="Rechargez la page et réessayez.",
                        request=request,
                    )

            origin = request.headers.get("origin")
            if origin and origin not in settings.cors_origin_list:
                return problem_response(
                    status_code=status.HTTP_403_FORBIDDEN,
                    code="ORIGIN_NOT_ALLOWED",
                    title="Origine non autorisée",
                    detail="Cette origine n'est pas autorisée à appeler l'API.",
                    request=request,
                )
        return await call_next(request)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(
        "application_start",
        app=settings.app_name,
        version=settings.app_version,
        environment=settings.app_env,
    )
    if not check_database():
        logger.error("database_unavailable_at_startup")
    yield
    logger.info("application_stop")


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="Cockpit de pilotage du système d'information du Parc national de forêts.",
        docs_url="/api/docs",
        redoc_url=None,
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"],
    )
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(CSRFMiddleware)
    app.add_middleware(RequestIDMiddleware)

    app.add_exception_handler(AppError, app_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, validation_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, unhandled_error_handler)

    app.include_router(api_router, prefix=settings.api_prefix)

    if not settings.serve_frontend:
        @app.get("/", include_in_schema=False)
        def root() -> JSONResponse:
            return JSONResponse(
                {
                    "name": settings.app_name,
                    "version": settings.app_version,
                    "docs": "/api/docs",
                    "health": f"{settings.api_prefix}/health/live",
                }
            )

    if settings.serve_frontend:
        dist = Path(settings.frontend_dist).resolve()
        assets = dist / "assets"
        if assets.is_dir():
            app.mount("/assets", StaticFiles(directory=assets), name="assets")

        @app.get("/{full_path:path}", include_in_schema=False)
        def spa(full_path: str):
            if full_path.startswith(("api/", "docs")):
                return JSONResponse({"detail": "Not Found"}, status_code=404)
            candidate = (dist / full_path).resolve()
            if full_path and candidate.is_file() and (candidate == dist or dist in candidate.parents):
                return FileResponse(candidate)
            index = dist / "index.html"
            if index.is_file():
                return FileResponse(index)
            return JSONResponse(
                {"detail": "Frontend non construit. Exécutez npm run build."},
                status_code=503,
            )

    return app


app = create_app()
