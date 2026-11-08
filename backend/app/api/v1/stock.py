from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.core.pagination import PageParams, page_params, paginate_items
from app.db.session import get_db
from app.models.auth import User
from app.schemas.common import Page
from app.schemas.stock import (
    StockItemCreate,
    StockItemDetailRead,
    StockItemMovementCreate,
    StockItemMovementRead,
    StockItemRead,
    StockItemUpdate,
    StockMovementCreate,
    StockMovementRead,
    StockOverview,
    StockSummaryItem,
)
from app.services import stock_items_service, stock_service

router = APIRouter(prefix="/stock", tags=["Stock"])


@router.get("/overview", response_model=StockOverview)
def overview(
    _: User = Depends(require_permission("stock.read")),
    db: Session = Depends(get_db),
):
    return stock_items_service.overview(db)


@router.get("/items", response_model=list[StockItemRead])
def list_items(
    q: str | None = Query(None, max_length=120),
    category: str | None = Query(None, max_length=40),
    low_only: bool = False,
    include_archived: bool = False,
    _: User = Depends(require_permission("stock.read")),
    db: Session = Depends(get_db),
):
    return stock_items_service.list_items(
        db,
        q=q,
        category=category,
        low_only=low_only,
        include_archived=include_archived,
    )


@router.post("/items", response_model=StockItemDetailRead, status_code=201)
def create_item(
    payload: StockItemCreate,
    request: Request,
    actor: User = Depends(require_permission("stock.manage")),
    db: Session = Depends(get_db),
):
    return stock_items_service.create_item(db, payload, actor=actor, request=request)


@router.get("/items/{item_id}", response_model=StockItemDetailRead)
def get_item(
    item_id: UUID,
    _: User = Depends(require_permission("stock.read")),
    db: Session = Depends(get_db),
):
    return stock_items_service.get_item_detail(db, item_id)


@router.patch("/items/{item_id}", response_model=StockItemDetailRead)
def update_item(
    item_id: UUID,
    payload: StockItemUpdate,
    request: Request,
    actor: User = Depends(require_permission("stock.manage")),
    db: Session = Depends(get_db),
):
    item = stock_items_service.get_item(db, item_id)
    return stock_items_service.update_item(db, item, payload, actor=actor, request=request)


@router.delete("/items/{item_id}", response_model=StockItemRead)
def archive_item(
    item_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("stock.manage")),
    db: Session = Depends(get_db),
):
    item = stock_items_service.get_item(db, item_id)
    return stock_items_service.archive_item(db, item, actor=actor, request=request)


@router.get("/items/{item_id}/movements", response_model=list[StockItemMovementRead])
def list_item_movements(
    item_id: UUID,
    _: User = Depends(require_permission("stock.read")),
    db: Session = Depends(get_db),
):
    detail = stock_items_service.get_item_detail(db, item_id)
    return detail.movements


@router.post(
    "/items/{item_id}/movements",
    response_model=StockItemDetailRead,
    status_code=201,
)
def create_item_movement(
    item_id: UUID,
    payload: StockItemMovementCreate,
    request: Request,
    actor: User = Depends(require_permission("stock.manage")),
    db: Session = Depends(get_db),
):
    return stock_items_service.create_movement(
        db, item_id, payload, actor=actor, request=request
    )


@router.get("/movements", response_model=Page[StockMovementRead])
def list_movements(
    q: str | None = Query(None, max_length=120),
    direction: str | None = Query(None, max_length=20),
    category_id: UUID | None = None,
    params: PageParams = Depends(page_params),
    _: User = Depends(require_permission("stock.read")),
    db: Session = Depends(get_db),
) -> dict:
    items = stock_service.list_movements(
        db, q=q, direction=direction, category_id=category_id
    )
    return paginate_items(items, params)


@router.post("/movements", response_model=StockMovementRead, status_code=201)
def create_movement(
    payload: StockMovementCreate,
    request: Request,
    actor: User = Depends(require_permission("stock.manage")),
    db: Session = Depends(get_db),
):
    return stock_service.create_movement(db, payload, actor=actor, request=request)


@router.get("/summary", response_model=list[StockSummaryItem])
def get_summary(
    _: User = Depends(require_permission("stock.read")),
    db: Session = Depends(get_db),
):
    return stock_service.stock_summary(db)
