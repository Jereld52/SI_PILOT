from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.core.pagination import PageParams, page_params, paginate_items
from app.db.session import get_db
from app.models.auth import User
from app.schemas.common import Page
from app.schemas.stock import StockMovementCreate, StockMovementRead, StockSummaryItem
from app.services import stock_service

router = APIRouter(prefix="/stock", tags=["Stock"])


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
