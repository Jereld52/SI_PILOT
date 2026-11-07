from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel
from app.schemas.tickets import TicketUserRef


class InterventionCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    ticket_id: UUID | None = None
    asset_id: UUID | None = None
    supplier_id: UUID | None = None
    type: Literal["preventive", "corrective", "installation", "audit", "other"] = "corrective"
    scheduled_at: datetime | None = None
    technician_user_id: UUID | None = None
    status: Literal["planned", "in_progress", "done", "cancelled"] = "planned"
    report: str | None = None
    duration_minutes: int | None = Field(default=None, ge=0, le=24 * 60 * 60)
    cost: float | None = Field(default=None, ge=0)


class InterventionUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    ticket_id: UUID | None = None
    asset_id: UUID | None = None
    supplier_id: UUID | None = None
    type: Literal["preventive", "corrective", "installation", "audit", "other"] | None = None
    scheduled_at: datetime | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None
    technician_user_id: UUID | None = None
    status: Literal["planned", "in_progress", "done", "cancelled"] | None = None
    report: str | None = None
    duration_minutes: int | None = Field(default=None, ge=0, le=24 * 60 * 60)
    cost: float | None = Field(default=None, ge=0)


class InterventionRead(ORMModel):
    id: UUID
    reference: str
    title: str
    description: str | None = None
    ticket_id: UUID | None = None
    ticket_reference: str | None = None
    asset_id: UUID | None = None
    asset_label: str | None = None
    supplier_id: UUID | None = None
    supplier_name: str | None = None
    type: str
    scheduled_at: datetime | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None
    technician_user_id: UUID | None = None
    technician: TicketUserRef | None = None
    status: str
    report: str | None = None
    duration_minutes: int | None = None
    cost: float | None = None
    created_at: datetime
    updated_at: datetime
