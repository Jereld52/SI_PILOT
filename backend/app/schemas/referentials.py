from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import ORMModel


class ServiceRef(ORMModel):
    id: UUID
    code: str
    name: str


class LocationRef(ORMModel):
    id: UUID
    code: str | None = None
    name: str


class ServiceCreate(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=150)
    parent_id: UUID | None = None
    manager_user_id: UUID | None = None
    is_active: bool = True


class ServiceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    parent_id: UUID | None = None
    manager_user_id: UUID | None = None
    is_active: bool | None = None


class ServiceRead(ServiceRef):
    parent_id: UUID | None = None
    manager_user_id: UUID | None = None
    is_active: bool
    created_at: datetime


class LocationCreate(BaseModel):
    code: str | None = Field(default=None, max_length=50)
    name: str = Field(min_length=1, max_length=150)
    address: str | None = Field(default=None, max_length=255)
    postal_code: str | None = Field(default=None, max_length=20)
    city: str | None = Field(default=None, max_length=120)
    building: str | None = Field(default=None, max_length=120)
    floor: str | None = Field(default=None, max_length=50)
    room: str | None = Field(default=None, max_length=50)
    notes: str | None = None
    is_active: bool = True


class LocationUpdate(BaseModel):
    code: str | None = Field(default=None, max_length=50)
    name: str | None = Field(default=None, min_length=1, max_length=150)
    address: str | None = Field(default=None, max_length=255)
    postal_code: str | None = Field(default=None, max_length=20)
    city: str | None = Field(default=None, max_length=120)
    building: str | None = Field(default=None, max_length=120)
    floor: str | None = Field(default=None, max_length=50)
    room: str | None = Field(default=None, max_length=50)
    notes: str | None = None
    is_active: bool | None = None


class LocationRead(LocationRef):
    address: str | None = None
    postal_code: str | None = None
    city: str | None = None
    building: str | None = None
    floor: str | None = None
    room: str | None = None
    notes: str | None = None
    is_active: bool
    created_at: datetime


class AssetCategoryCreate(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=120)
    icon: str | None = Field(default=None, max_length=50)
    is_infrastructure: bool = False
    is_workstation: bool = False
    requires_network_fields: bool = False
    default_life_months: int = Field(default=60, ge=0, le=240)
    tag_prefix: str | None = Field(default=None, max_length=20)
    tag_template: str = Field(default="PNFOR-{PREFIX}-{YEAR}-{SEQ:4}", max_length=120)
    tag_sequence_mode: Literal["year", "global"] = "year"
    is_active: bool = True
    sort_order: int = 0

    @field_validator("tag_template")
    @classmethod
    def template_has_sequence(cls, value: str) -> str:
        if "{SEQ" not in value:
            raise ValueError("Le modèle doit contenir {SEQ} ou {SEQ:4} pour garantir l'unicité.")
        return value


class AssetCategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    icon: str | None = Field(default=None, max_length=50)
    is_infrastructure: bool | None = None
    is_workstation: bool | None = None
    requires_network_fields: bool | None = None
    default_life_months: int | None = Field(default=None, ge=0, le=240)
    tag_prefix: str | None = Field(default=None, max_length=20)
    tag_template: str | None = Field(default=None, max_length=120)
    tag_sequence_mode: Literal["year", "global"] | None = None
    is_active: bool | None = None
    sort_order: int | None = None

    @field_validator("tag_template")
    @classmethod
    def template_has_sequence(cls, value: str | None) -> str | None:
        if value is not None and "{SEQ" not in value:
            raise ValueError("Le modèle doit contenir {SEQ} ou {SEQ:4} pour garantir l'unicité.")
        return value


class AssetCategoryRead(ORMModel):
    id: UUID
    code: str
    name: str
    icon: str | None = None
    is_infrastructure: bool
    is_workstation: bool
    requires_network_fields: bool
    default_life_months: int
    tag_prefix: str | None = None
    tag_template: str
    tag_sequence_mode: str
    is_active: bool
    sort_order: int
    created_at: datetime
