from fastapi import APIRouter

from app.api.v1 import (
    admin,
    agents,
    assets,
    audit,
    auth,
    dashboard,
    health,
    imports,
    mobile,
    notifications,
    referentials,
    search,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(dashboard.router)
api_router.include_router(search.router)
api_router.include_router(notifications.router)
api_router.include_router(admin.router)
api_router.include_router(audit.router)
api_router.include_router(referentials.router)
api_router.include_router(agents.router)
api_router.include_router(assets.router)
api_router.include_router(mobile.router)
api_router.include_router(imports.router)
