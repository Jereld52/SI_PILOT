from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class BudgetCategoryRead(ORMModel):
    id: UUID
    code: str
    name: str
    is_active: bool
    sort_order: int


class BudgetCreate(BaseModel):
    year: int = Field(ge=2000, le=2100)
    name: str = Field(min_length=1, max_length=150)
    status: Literal["draft", "voted", "closed"] = "draft"
    notes: str | None = None


class BudgetUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    status: Literal["draft", "voted", "closed"] | None = None
    notes: str | None = None


class BudgetLineCreate(BaseModel):
    category_id: UUID
    label: str = Field(min_length=1, max_length=180)
    planned_amount: float | None = Field(default=None, ge=0)
    voted_amount: float | None = Field(default=None, ge=0)
    contract_id: UUID | None = None
    notes: str | None = None


class BudgetLineUpdate(BaseModel):
    category_id: UUID | None = None
    label: str | None = Field(default=None, min_length=1, max_length=180)
    planned_amount: float | None = Field(default=None, ge=0)
    voted_amount: float | None = Field(default=None, ge=0)
    contract_id: UUID | None = None
    notes: str | None = None


class BudgetLineRead(ORMModel):
    id: UUID
    budget_id: UUID
    category_id: UUID
    category: BudgetCategoryRead
    label: str
    planned_amount: float | None = None
    voted_amount: float | None = None
    contract_id: UUID | None = None
    notes: str | None = None
    committed_amount: float = 0
    invoiced_amount: float = 0
    available_amount: float = 0
    created_at: datetime
    updated_at: datetime


class BudgetCommitmentCreate(BaseModel):
    budget_line_id: UUID
    reference: str | None = Field(default=None, max_length=80)
    object: str = Field(min_length=1, max_length=255)
    amount_ht: float | None = Field(default=None, ge=0)
    amount_ttc: float | None = Field(default=None, ge=0)
    ordered_at: date | None = None
    supplier_id: UUID | None = None
    contract_id: UUID | None = None
    status: Literal["draft", "quoted", "ordered", "delivered", "invoiced", "cancelled"] = "draft"
    notes: str | None = None


class BudgetCommitmentUpdate(BaseModel):
    budget_line_id: UUID | None = None
    reference: str | None = Field(default=None, max_length=80)
    object: str | None = Field(default=None, min_length=1, max_length=255)
    amount_ht: float | None = Field(default=None, ge=0)
    amount_ttc: float | None = Field(default=None, ge=0)
    ordered_at: date | None = None
    supplier_id: UUID | None = None
    contract_id: UUID | None = None
    status: Literal["draft", "quoted", "ordered", "delivered", "invoiced", "cancelled"] | None = None
    notes: str | None = None


class BudgetCommitmentRead(ORMModel):
    id: UUID
    budget_line_id: UUID
    line_label: str | None = None
    reference: str | None = None
    object: str
    amount_ht: float | None = None
    amount_ttc: float | None = None
    ordered_at: date | None = None
    supplier_id: UUID | None = None
    supplier_name: str | None = None
    contract_id: UUID | None = None
    status: str
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


class BudgetInvoiceCreate(BaseModel):
    budget_line_id: UUID
    commitment_id: UUID | None = None
    invoice_number: str | None = Field(default=None, max_length=80)
    invoice_date: date | None = None
    amount_ht: float | None = Field(default=None, ge=0)
    amount_ttc: float | None = Field(default=None, ge=0)
    vat_rate: float | None = Field(default=None, ge=0, le=100)
    paid_at: date | None = None
    status: Literal["received", "validated", "paid", "disputed"] = "received"
    supplier_id: UUID | None = None


class BudgetInvoiceUpdate(BaseModel):
    budget_line_id: UUID | None = None
    commitment_id: UUID | None = None
    invoice_number: str | None = Field(default=None, max_length=80)
    invoice_date: date | None = None
    amount_ht: float | None = Field(default=None, ge=0)
    amount_ttc: float | None = Field(default=None, ge=0)
    vat_rate: float | None = Field(default=None, ge=0, le=100)
    paid_at: date | None = None
    status: Literal["received", "validated", "paid", "disputed"] | None = None
    supplier_id: UUID | None = None


class BudgetInvoiceRead(ORMModel):
    id: UUID
    budget_line_id: UUID
    line_label: str | None = None
    commitment_id: UUID | None = None
    invoice_number: str | None = None
    invoice_date: date | None = None
    amount_ht: float | None = None
    amount_ttc: float | None = None
    vat_rate: float | None = None
    paid_at: date | None = None
    status: str
    supplier_id: UUID | None = None
    supplier_name: str | None = None
    created_at: datetime
    updated_at: datetime


class BudgetRead(ORMModel):
    id: UUID
    year: int
    name: str
    status: str
    planned_total: float | None = None
    voted_total: float | None = None
    committed_total: float = 0
    invoiced_total: float = 0
    paid_total: float = 0
    available_total: float = 0
    notes: str | None = None
    validated_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class BudgetDetailRead(BudgetRead):
    lines: list[BudgetLineRead] = Field(default_factory=list)
    commitments: list[BudgetCommitmentRead] = Field(default_factory=list)
    invoices: list[BudgetInvoiceRead] = Field(default_factory=list)
