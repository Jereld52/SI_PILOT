from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.agents import AgentRef
from app.schemas.common import ORMModel
from app.schemas.referentials import LocationRef


class ReservableEquipmentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    category: Literal["video", "audio", "screen", "accessory", "other"] = "other"
    description: str | None = None
    location_id: UUID | None = None
    is_active: bool = True
    sort_order: int = Field(default=0, ge=0, le=10_000)
    notes: str | None = None


class ReservableEquipmentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=180)
    category: Literal["video", "audio", "screen", "accessory", "other"] | None = None
    description: str | None = None
    location_id: UUID | None = None
    is_active: bool | None = None
    sort_order: int | None = Field(default=None, ge=0, le=10_000)
    notes: str | None = None


class ReservableEquipmentRead(ORMModel):
    id: UUID
    name: str
    category: str
    description: str | None = None
    location_id: UUID | None = None
    location: LocationRef | None = None
    is_active: bool
    sort_order: int
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


class EquipmentReservationCreate(BaseModel):
    equipment_id: UUID
    requester_agent_id: UUID | None = None
    requester_name: str | None = Field(default=None, max_length=180)
    requester_email: str | None = Field(default=None, max_length=255)
    purpose: str = Field(min_length=1, max_length=255)
    start_at: datetime
    end_at: datetime
    notes: str | None = None


class EquipmentReservationUpdate(BaseModel):
    equipment_id: UUID | None = None
    requester_agent_id: UUID | None = None
    requester_name: str | None = Field(default=None, max_length=180)
    requester_email: str | None = Field(default=None, max_length=255)
    purpose: str | None = Field(default=None, min_length=1, max_length=255)
    start_at: datetime | None = None
    end_at: datetime | None = None
    status: Literal["confirmed", "cancelled"] | None = None
    notes: str | None = None


class EquipmentReservationRead(ORMModel):
    id: UUID
    equipment_id: UUID
    equipment: ReservableEquipmentRead
    requester_agent_id: UUID | None = None
    requester_agent: AgentRef | None = None
    requester_name: str | None = None
    requester_email: str | None = None
    purpose: str
    start_at: datetime
    end_at: datetime
    status: str
    notes: str | None = None
    created_by_id: UUID | None = None
    created_by_label: str | None = None
    created_at: datetime
    updated_at: datetime
