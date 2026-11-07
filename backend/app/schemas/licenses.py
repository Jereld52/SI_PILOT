from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class LicenseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    vendor: str | None = Field(default=None, max_length=150)
    license_type: str | None = Field(default=None, max_length=80)
    seats: int | None = Field(default=None, ge=0, le=1_000_000)
    seats_used: int | None = Field(default=None, ge=0, le=1_000_000)
    start_date: date | None = None
    end_date: date | None = None
    contract_id: UUID | None = None
    annual_cost: float | None = Field(default=None, ge=0)
    notes: str | None = None
    is_active: bool = True


class LicenseUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=180)
    vendor: str | None = Field(default=None, max_length=150)
    license_type: str | None = Field(default=None, max_length=80)
    seats: int | None = Field(default=None, ge=0, le=1_000_000)
    seats_used: int | None = Field(default=None, ge=0, le=1_000_000)
    start_date: date | None = None
    end_date: date | None = None
    contract_id: UUID | None = None
    annual_cost: float | None = Field(default=None, ge=0)
    notes: str | None = None
    is_active: bool | None = None


class LicenseRead(ORMModel):
    id: UUID
    name: str
    vendor: str | None = None
    license_type: str | None = None
    seats: int | None = None
    seats_used: int | None = None
    start_date: date | None = None
    end_date: date | None = None
    contract_id: UUID | None = None
    annual_cost: float | None = None
    notes: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
