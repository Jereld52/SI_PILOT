from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.schemas.common import ORMModel
from app.schemas.referentials import LocationRef


class NetworkShareCreate(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    unc_path: str = Field(min_length=1, max_length=512)
    drive_letter: str | None = Field(default=None, max_length=8)
    location_id: UUID | None = None
    responsible: str | None = Field(default=None, max_length=180)
    description: str | None = None
    warning_percent: int = Field(default=20, ge=1, le=99)
    critical_percent: int = Field(default=10, ge=0, le=99)
    min_free_gb: float | None = Field(default=None, ge=0, le=1_000_000)
    is_active: bool = True
    sort_order: int = Field(default=0, ge=0, le=10_000)

    @model_validator(mode="after")
    def validate_thresholds(self):
        if self.critical_percent >= self.warning_percent:
            raise ValueError("Le seuil critique doit être inférieur au seuil d'alerte.")
        return self


class NetworkShareUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=180)
    unc_path: str | None = Field(default=None, min_length=1, max_length=512)
    drive_letter: str | None = Field(default=None, max_length=8)
    location_id: UUID | None = None
    responsible: str | None = Field(default=None, max_length=180)
    description: str | None = None
    warning_percent: int | None = Field(default=None, ge=1, le=99)
    critical_percent: int | None = Field(default=None, ge=0, le=99)
    min_free_gb: float | None = Field(default=None, ge=0, le=1_000_000)
    is_active: bool | None = None
    sort_order: int | None = Field(default=None, ge=0, le=10_000)


class NetworkShareRead(ORMModel):
    id: UUID
    name: str
    unc_path: str
    drive_letter: str | None = None
    location_id: UUID | None = None
    location: LocationRef | None = None
    responsible: str | None = None
    description: str | None = None
    warning_percent: int
    critical_percent: int
    min_free_gb: float | None = None
    is_active: bool
    sort_order: int
    last_checked_at: datetime | None = None
    last_status: str
    last_total_bytes: int | None = None
    last_used_bytes: int | None = None
    last_free_bytes: int | None = None
    last_error: str | None = None
    created_at: datetime
    updated_at: datetime


class NetworkShareSummary(BaseModel):
    total: int
    ok: int
    warning: int
    critical: int
    error: int
    unknown: int
    total_bytes: int
    free_bytes: int


class NetworkShareOverview(BaseModel):
    items: list[NetworkShareRead]
    summary: NetworkShareSummary
    alerts: list[NetworkShareRead]
