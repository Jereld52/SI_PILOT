from fastapi import APIRouter, Response, status

from app.core.config import settings
from app.db.session import check_database

router = APIRouter(tags=["Santé"])


@router.get("/health/live")
def live() -> dict:
    return {
        "status": "ok",
        "service": settings.app_name,
        "version": settings.app_version,
        "environment": settings.app_env,
    }


@router.get("/health/ready")
def ready(response: Response) -> dict:
    database_ok = check_database()
    if not database_ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {
        "status": "ok" if database_ok else "degraded",
        "database": "ok" if database_ok else "unavailable",
        "version": settings.app_version,
    }


@router.get("/version")
def version() -> dict:
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "environment": settings.app_env,
    }
