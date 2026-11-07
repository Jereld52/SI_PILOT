from fastapi import APIRouter

from app.api.v1 import (
    admin,
    agents,
    assets,
    audit,
    auth,
    budget,
    contracts,
    dashboard,
    exports,
    health,
    imports,
    interventions,
    licenses,
    mobile,
    notifications,
    referentials,
    rgpd,
    search,
    stock,
    suppliers,
    tickets,
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
api_router.include_router(exports.router)
api_router.include_router(suppliers.router)
api_router.include_router(licenses.router)
api_router.include_router(stock.router)
api_router.include_router(tickets.router)
api_router.include_router(interventions.router)
api_router.include_router(rgpd.router)
api_router.include_router(contracts.router)
api_router.include_router(budget.router)
