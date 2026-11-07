from fastapi import APIRouter

from app.api.v1 import admin, audit, auth, dashboard, health, notifications, search

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(dashboard.router)
api_router.include_router(search.router)
api_router.include_router(notifications.router)
api_router.include_router(admin.router)
api_router.include_router(audit.router)
