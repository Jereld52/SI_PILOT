from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.schemas.assets import SupplierRef
from app.schemas.common import ORMModel
from app.schemas.tickets import TicketUserRef


class ContractCategoryRead(ORMModel):
    id: UUID
    code: str
    name: str
    is_active: bool


class ContractCreate(BaseModel):
    supplier_id: UUID
    reference: str = Field(min_length=1, max_length=80)
    object: str = Field(min_length=1, max_length=255)
    category_id: UUID | None = None
    start_date: date | None = None
    end_date: date | None = None
    duration_months: int | None = Field(default=None, ge=0, le=600)
    amount_ht: float | None = Field(default=None, ge=0)
    amount_ttc: float | None = Field(default=None, ge=0)
    vat_rate: float | None = Field(default=None, ge=0, le=100)
    annual_cost: float | None = Field(default=None, ge=0)
    monthly_cost: float | None = Field(default=None, ge=0)
    notice_days: int | None = Field(default=None, ge=0, le=730)
    auto_renew: bool = False
    responsible_user_id: UUID | None = None
    contact_name: str | None = Field(default=None, max_length=150)
    contact_email: EmailStr | None = None
    status: Literal["draft", "active", "expiring", "expired", "terminated"] = "active"
    comments: str | None = None


class ContractUpdate(BaseModel):
    supplier_id: UUID | None = None
    reference: str | None = Field(default=None, min_length=1, max_length=80)
    object: str | None = Field(default=None, min_length=1, max_length=255)
    category_id: UUID | None = None
    start_date: date | None = None
    end_date: date | None = None
    duration_months: int | None = Field(default=None, ge=0, le=600)
    amount_ht: float | None = Field(default=None, ge=0)
    amount_ttc: float | None = Field(default=None, ge=0)
    vat_rate: float | None = Field(default=None, ge=0, le=100)
    annual_cost: float | None = Field(default=None, ge=0)
    monthly_cost: float | None = Field(default=None, ge=0)
    notice_days: int | None = Field(default=None, ge=0, le=730)
    auto_renew: bool | None = None
    responsible_user_id: UUID | None = None
    contact_name: str | None = Field(default=None, max_length=150)
    contact_email: EmailStr | None = None
    status: Literal["draft", "active", "expiring", "expired", "terminated"] | None = None
    comments: str | None = None


class ContractRead(ORMModel):
    id: UUID
    supplier_id: UUID
    supplier: SupplierRef
    reference: str
    object: str
    category_id: UUID | None = None
    category: ContractCategoryRead | None = None
    start_date: date | None = None
    end_date: date | None = None
    duration_months: int | None = None
    amount_ht: float | None = None
    amount_ttc: float | None = None
    vat_rate: float | None = None
    annual_cost: float | None = None
    monthly_cost: float | None = None
    notice_days: int | None = None
    auto_renew: bool
    responsible_user_id: UUID | None = None
    responsible: TicketUserRef | None = None
    contact_name: str | None = None
    contact_email: str | None = None
    status: str
    comments: str | None = None
    days_to_end: int | None = None
    alert_level: str | None = None
    renewal_deadline: date | None = None
    created_at: datetime
    updated_at: datetime
