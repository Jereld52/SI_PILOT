from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.assets import SupplierRef
from app.schemas.common import ORMModel

CommercialKind = Literal["quote", "purchase_order"]
CommercialStatus = Literal[
    "draft",
    "sent",
    "accepted",
    "refused",
    "expired",
    "converted",
    "confirmed",
    "delivered",
    "cancelled",
]


class CommercialDocumentCreate(BaseModel):
    kind: CommercialKind
    supplier_id: UUID
    reference: str = Field(default="", max_length=80)
    engagement_number: str | None = Field(default=None, max_length=80)
    object: str = Field(min_length=1, max_length=255)
    status: CommercialStatus = "draft"
    issue_date: date = Field(default_factory=date.today)
    valid_until: date | None = None
    expected_date: date | None = None
    amount_ht: float | None = Field(default=None, ge=0)
    amount_ttc: float | None = Field(default=None, ge=0)
    vat_rate: float | None = Field(default=None, ge=0, le=100)
    budget_line_id: UUID | None = None
    contract_id: UUID | None = None
    document_id: UUID | None = None
    notes: str | None = None


class CommercialDocumentUpdate(BaseModel):
    kind: CommercialKind | None = None
    supplier_id: UUID | None = None
    reference: str | None = Field(default=None, max_length=80)
    engagement_number: str | None = Field(default=None, max_length=80)
    object: str | None = Field(default=None, min_length=1, max_length=255)
    status: CommercialStatus | None = None
    issue_date: date | None = None
    valid_until: date | None = None
    expected_date: date | None = None
    amount_ht: float | None = Field(default=None, ge=0)
    amount_ttc: float | None = Field(default=None, ge=0)
    vat_rate: float | None = Field(default=None, ge=0, le=100)
    budget_line_id: UUID | None = None
    contract_id: UUID | None = None
    document_id: UUID | None = None
    notes: str | None = None


class CommercialDocumentRead(ORMModel):
    id: UUID
    kind: str
    reference: str
    engagement_number: str | None = None
    object: str
    supplier_id: UUID
    supplier: SupplierRef
    status: str
    issue_date: date
    valid_until: date | None = None
    expected_date: date | None = None
    amount_ht: float | None = None
    amount_ttc: float | None = None
    vat_rate: float | None = None
    budget_line_id: UUID | None = None
    contract_id: UUID | None = None
    document_id: UUID | None = None
    source_document_id: UUID | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


class CommercialQuoteConvertRequest(BaseModel):
    engagement_number: str = Field(min_length=1, max_length=80)
    expected_date: date | None = None
    notes: str | None = None
