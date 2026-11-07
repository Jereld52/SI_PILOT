from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel
from app.schemas.referentials import AssetCategoryRead


class StockAssetRef(ORMModel):
    id: UUID
    asset_tag: str
    name: str


class StockMovementCreate(BaseModel):
    asset_id: UUID | None = None
    category_id: UUID | None = None
    direction: Literal["in", "out", "adjustment"]
    quantity: int = Field(default=1, ge=1, le=10_000)
    reason: str | None = Field(default=None, max_length=255)
    reference: str | None = Field(default=None, max_length=120)
    moved_at: datetime | None = None


class StockMovementRead(ORMModel):
    id: UUID
    asset_id: UUID | None = None
    asset: StockAssetRef | None = None
    category_id: UUID | None = None
    category: AssetCategoryRead | None = None
    direction: str
    quantity: int
    reason: str | None = None
    reference: str | None = None
    moved_at: datetime
    created_by_id: UUID | None = None
    created_by_label: str | None = None


class StockSummaryItem(BaseModel):
    category_id: UUID
    category_name: str
    in_stock: int
    in_service: int
    maintenance: int
    broken: int
    total: int
