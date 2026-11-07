from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.agents import AgentRef
from app.schemas.common import ORMModel
from app.schemas.referentials import AssetCategoryRead, LocationRef, ServiceRef


class SupplierRef(ORMModel):
    id: UUID
    name: str


class AssetCreate(BaseModel):
    asset_tag: str | None = Field(default=None, max_length=60)
    external_id: str | None = Field(default=None, max_length=120)
    name: str = Field(min_length=1, max_length=180)
    category_id: UUID
    brand: str | None = Field(default=None, max_length=100)
    model: str | None = Field(default=None, max_length=150)
    serial_number: str | None = Field(default=None, max_length=150)
    mac_address: str | None = Field(default=None, max_length=50)
    ip_address: str | None = Field(default=None, max_length=64)
    hostname: str | None = Field(default=None, max_length=120)
    os_name: str | None = Field(default=None, max_length=80)
    os_version: str | None = Field(default=None, max_length=80)
    purchase_date: date | None = None
    commissioning_date: date | None = None
    warranty_end: date | None = None
    supplier_id: UUID | None = None
    purchase_price: float | None = Field(default=None, ge=0)
    status: Literal["in_service", "in_stock", "maintenance", "broken", "to_renew", "retired"] = "in_stock"
    condition: Literal["new", "good", "fair", "poor", "out_of_service"] = "good"
    assigned_agent_id: UUID | None = None
    service_id: UUID | None = None
    location_id: UUID | None = None
    comments: str | None = None
    external_data_json: str | None = None
    is_critical: bool = False


class AssetUpdate(BaseModel):
    asset_tag: str | None = Field(default=None, max_length=60)
    external_id: str | None = Field(default=None, max_length=120)
    name: str | None = Field(default=None, min_length=1, max_length=180)
    category_id: UUID | None = None
    brand: str | None = Field(default=None, max_length=100)
    model: str | None = Field(default=None, max_length=150)
    serial_number: str | None = Field(default=None, max_length=150)
    mac_address: str | None = Field(default=None, max_length=50)
    ip_address: str | None = Field(default=None, max_length=64)
    hostname: str | None = Field(default=None, max_length=120)
    os_name: str | None = Field(default=None, max_length=80)
    os_version: str | None = Field(default=None, max_length=80)
    purchase_date: date | None = None
    commissioning_date: date | None = None
    warranty_end: date | None = None
    supplier_id: UUID | None = None
    purchase_price: float | None = Field(default=None, ge=0)
    status: Literal["in_service", "in_stock", "maintenance", "broken", "to_renew", "retired"] | None = None
    condition: Literal["new", "good", "fair", "poor", "out_of_service"] | None = None
    assigned_agent_id: UUID | None = None
    service_id: UUID | None = None
    location_id: UUID | None = None
    comments: str | None = None
    is_critical: bool | None = None


class AssetRead(ORMModel):
    id: UUID
    asset_tag: str
    external_id: str | None = None
    name: str
    category_id: UUID
    category: AssetCategoryRead
    brand: str | None = None
    model: str | None = None
    serial_number: str | None = None
    mac_address: str | None = None
    ip_address: str | None = None
    hostname: str | None = None
    os_name: str | None = None
    os_version: str | None = None
    purchase_date: date | None = None
    commissioning_date: date | None = None
    warranty_end: date | None = None
    supplier_id: UUID | None = None
    supplier: SupplierRef | None = None
    purchase_price: float | None = None
    status: str
    condition: str
    assigned_agent_id: UUID | None = None
    assigned_agent: AgentRef | None = None
    service_id: UUID | None = None
    service: ServiceRef | None = None
    location_id: UUID | None = None
    location: LocationRef | None = None
    comments: str | None = None
    is_critical: bool
    wapt_status: str | None = None
    wapt_reachable: str | None = None
    wapt_last_seen: str | None = None
    wapt_last_user: str | None = None
    wapt_groups: str | None = None
    wapt_domain: str | None = None
    archived_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class AssetDetailRead(AssetRead):
    external_data: dict[str, Any] | None = None


class AssetTagPreview(BaseModel):
    tag: str
    prefix: str | None = None
    template: str
    next_sequence: int
    year: int


class AssetAssignRequest(BaseModel):
    agent_id: UUID
    service_id: UUID | None = None
    location_id: UUID | None = None
    reason: str | None = Field(default=None, max_length=255)


class AssetReturnRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=255)


class AssetStatusRequest(BaseModel):
    status: Literal["in_service", "in_stock", "maintenance", "broken", "to_renew", "retired"]
    reason: str | None = Field(default=None, max_length=255)


class AssetAssignmentRead(BaseModel):
    id: UUID
    agent_id: UUID | None = None
    agent_name: str | None = None
    service_name: str | None = None
    location_name: str | None = None
    started_at: datetime
    ended_at: datetime | None = None
    reason: str | None = None
