from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.schemas.common import ORMModel


class SupplierContactInput(BaseModel):
    id: UUID | None = None
    name: str = Field(min_length=1, max_length=150)
    role: str | None = Field(default=None, max_length=120)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=50)
    is_primary: bool = False


class SupplierContactRead(ORMModel):
    id: UUID
    name: str
    role: str | None = None
    email: str | None = None
    phone: str | None = None
    is_primary: bool


class SupplierCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    type: str | None = Field(default=None, max_length=80)
    siret: str | None = Field(default=None, max_length=20)
    contact_name: str | None = Field(default=None, max_length=150)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=50)
    address: str | None = Field(default=None, max_length=255)
    website: str | None = Field(default=None, max_length=255)
    notes: str | None = None
    is_active: bool = True
    contacts: list[SupplierContactInput] = Field(default_factory=list)


class SupplierUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    type: str | None = Field(default=None, max_length=80)
    siret: str | None = Field(default=None, max_length=20)
    contact_name: str | None = Field(default=None, max_length=150)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=50)
    address: str | None = Field(default=None, max_length=255)
    website: str | None = Field(default=None, max_length=255)
    notes: str | None = None
    is_active: bool | None = None
    contacts: list[SupplierContactInput] | None = None


class SupplierRead(ORMModel):
    id: UUID
    name: str
    type: str | None = None
    siret: str | None = None
    contact_name: str | None = None
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    website: str | None = None
    notes: str | None = None
    is_active: bool
    contacts: list[SupplierContactRead] = Field(default_factory=list)
    asset_count: int = 0
    license_count: int = 0
    created_at: datetime
    updated_at: datetime
