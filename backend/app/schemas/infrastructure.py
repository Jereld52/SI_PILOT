from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel
from app.schemas.referentials import LocationRef
from app.schemas.stock import StockAssetRef
from app.schemas.tickets import TicketUserRef


class InfraEquipmentCreate(BaseModel):
    asset_id: UUID | None = None
    name: str = Field(min_length=1, max_length=180)
    type: Literal[
        "server", "vm", "switch", "router", "firewall", "nas", "access_point", "ups", "other"
    ] = "server"
    ip_address: str | None = Field(default=None, max_length=64)
    mac_address: str | None = Field(default=None, max_length=50)
    role: str | None = Field(default=None, max_length=150)
    location_id: UUID | None = None
    os_name: str | None = Field(default=None, max_length=80)
    os_version: str | None = Field(default=None, max_length=80)
    config_notes: str | None = None
    criticality: Literal["low", "medium", "high", "critical"] = "medium"
    status: Literal["active", "maintenance", "offline", "retired"] = "active"
    responsible_user_id: UUID | None = None
    parent_id: UUID | None = None
    map_x: float | None = None
    map_y: float | None = None


class InfraEquipmentUpdate(BaseModel):
    asset_id: UUID | None = None
    name: str | None = Field(default=None, min_length=1, max_length=180)
    type: Literal[
        "server", "vm", "switch", "router", "firewall", "nas", "access_point", "ups", "other"
    ] | None = None
    ip_address: str | None = Field(default=None, max_length=64)
    mac_address: str | None = Field(default=None, max_length=50)
    role: str | None = Field(default=None, max_length=150)
    location_id: UUID | None = None
    os_name: str | None = Field(default=None, max_length=80)
    os_version: str | None = Field(default=None, max_length=80)
    config_notes: str | None = None
    criticality: Literal["low", "medium", "high", "critical"] | None = None
    status: Literal["active", "maintenance", "offline", "retired"] | None = None
    responsible_user_id: UUID | None = None
    parent_id: UUID | None = None
    map_x: float | None = None
    map_y: float | None = None


class InfraEquipmentRead(ORMModel):
    id: UUID
    asset_id: UUID | None = None
    asset: StockAssetRef | None = None
    name: str
    type: str
    ip_address: str | None = None
    mac_address: str | None = None
    role: str | None = None
    location_id: UUID | None = None
    location: LocationRef | None = None
    os_name: str | None = None
    os_version: str | None = None
    config_notes: str | None = None
    criticality: str
    status: str
    responsible_user_id: UUID | None = None
    responsible: TicketUserRef | None = None
    parent_id: UUID | None = None
    map_x: float | None = None
    map_y: float | None = None
    last_check_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class InfraDependencyCreate(BaseModel):
    source_id: UUID
    target_id: UUID
    dependency_type: str = Field(default="network", max_length=50)
    description: str | None = Field(default=None, max_length=255)


class InfraDependencyRead(ORMModel):
    id: UUID
    source_id: UUID
    source_name: str
    target_id: UUID
    target_name: str
    dependency_type: str
    description: str | None = None


class MonitoringCheckCreate(BaseModel):
    infra_id: UUID
    check_type: Literal["ping", "snmp", "http", "tcp", "agent"]
    config_json: str | None = None
    interval_seconds: int = Field(default=300, ge=30, le=86_400)
    is_enabled: bool = False


class MonitoringCheckUpdate(BaseModel):
    check_type: Literal["ping", "snmp", "http", "tcp", "agent"] | None = None
    config_json: str | None = None
    interval_seconds: int | None = Field(default=None, ge=30, le=86_400)
    is_enabled: bool | None = None


class MonitoringCheckRead(ORMModel):
    id: UUID
    infra_id: UUID
    infra_name: str
    check_type: str
    config_json: str | None = None
    interval_seconds: int
    is_enabled: bool
    requires_authorization: bool
    authorized_by_id: UUID | None = None
    authorized_by: TicketUserRef | None = None
    authorized_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class MonitoringResultCreate(BaseModel):
    status: Literal["up", "down", "unknown"]
    latency_ms: int | None = Field(default=None, ge=0)
    message: str | None = None


class MonitoringResultRead(ORMModel):
    id: UUID
    check_id: UUID
    checked_at: datetime
    status: str
    latency_ms: int | None = None
    message: str | None = None
