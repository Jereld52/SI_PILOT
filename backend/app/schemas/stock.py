from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.agents import AgentRef
from app.schemas.assets import SupplierRef
from app.schemas.common import ORMModel
from app.schemas.referentials import AssetCategoryRead, LocationRef


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


StockCategory = Literal[
    "keyboard",
    "mouse",
    "monitor",
    "headset",
    "dock",
    "webcam",
    "cable",
    "adapter",
    "toner",
    "paper",
    "battery",
    "consumable",
    "other",
]


class StockItemCreate(BaseModel):
    reference: str | None = Field(default=None, max_length=80)
    name: str = Field(min_length=1, max_length=180)
    category: StockCategory
    brand: str | None = Field(default=None, max_length=100)
    model: str | None = Field(default=None, max_length=150)
    supplier_id: UUID | None = None
    location_id: UUID | None = None
    unit: str = Field(default="pièce", max_length=30)
    initial_quantity: int = Field(default=0, ge=0, le=1_000_000)
    min_quantity: int = Field(default=0, ge=0, le=1_000_000)
    unit_price: float | None = Field(default=None, ge=0)
    notes: str | None = None


class StockItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=180)
    category: StockCategory | None = None
    brand: str | None = Field(default=None, max_length=100)
    model: str | None = Field(default=None, max_length=150)
    supplier_id: UUID | None = None
    location_id: UUID | None = None
    unit: str | None = Field(default=None, max_length=30)
    min_quantity: int | None = Field(default=None, ge=0, le=1_000_000)
    unit_price: float | None = Field(default=None, ge=0)
    notes: str | None = None
    status: Literal["active", "archived"] | None = None


class StockItemRead(ORMModel):
    id: UUID
    reference: str
    name: str
    category: str
    brand: str | None = None
    model: str | None = None
    supplier_id: UUID | None = None
    supplier: SupplierRef | None = None
    location_id: UUID | None = None
    location: LocationRef | None = None
    unit: str
    quantity: int
    min_quantity: int
    unit_price: float | None = None
    stock_value: float = 0
    is_low: bool = False
    is_out: bool = False
    status: str
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


class StockItemMovementCreate(BaseModel):
    direction: Literal["in", "out", "adjustment"]
    quantity: int = Field(ge=1, le=1_000_000)
    reason: str | None = Field(default=None, max_length=255)
    reference: str | None = Field(default=None, max_length=120)
    recipient_agent_id: UUID | None = None
    moved_at: datetime | None = None


class StockItemMovementRead(ORMModel):
    id: UUID
    stock_item_id: UUID | None = None
    direction: str
    quantity: int
    quantity_after: int | None = None
    recipient_agent_id: UUID | None = None
    recipient_agent: AgentRef | None = None
    reason: str | None = None
    reference: str | None = None
    moved_at: datetime
    created_by_id: UUID | None = None
    created_by_label: str | None = None


class StockItemDetailRead(StockItemRead):
    movements: list[StockItemMovementRead] = Field(default_factory=list)


class StockCategorySummary(BaseModel):
    category: str
    items: int
    units: int
    value: float


class StockOverview(BaseModel):
    total_items: int
    total_units: int
    total_value: float
    low_stock_count: int
    out_of_stock_count: int
    categories: list[StockCategorySummary]
    low_stock_items: list[StockItemRead]
