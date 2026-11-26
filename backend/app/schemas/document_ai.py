from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

DocumentKind = Literal[
    "contract", "quote", "purchase_order", "invoice", "license", "other"
]
DocumentTarget = Literal[
    "documentation", "quote", "purchase_order", "contract", "license", "invoice"
]


class DocumentDuplicateRead(BaseModel):
    kind: str
    id: UUID
    label: str
    detail: str | None = None
    reason: str
    severity: str = "warning"
    link: str | None = None


class DocumentAnalysisRead(BaseModel):
    token: str
    filename: str
    document_type: DocumentKind
    title: str
    supplier: str | None = None
    reference: str | None = None
    engagement_number: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    amount_ht: float | None = None
    amount_ttc: float | None = None
    vat_rate: float | None = None
    summary: str = ""
    suggested_targets: list[DocumentTarget] = Field(default_factory=list)
    confidence: float = 0.0
    warnings: list[str] = Field(default_factory=list)
    text_excerpt: str = ""
    ocr_used: bool = False
    duplicates: list[DocumentDuplicateRead] = Field(default_factory=list)


class DocumentIntegrationRequest(BaseModel):
    target: DocumentTarget
    title: str = Field(min_length=1, max_length=255)
    document_type: DocumentKind = "other"
    supplier: str | None = Field(default=None, max_length=150)
    reference: str | None = Field(default=None, max_length=80)
    engagement_number: str | None = Field(default=None, max_length=80)
    start_date: date | None = None
    end_date: date | None = None
    amount_ht: float | None = Field(default=None, ge=0)
    amount_ttc: float | None = Field(default=None, ge=0)
    vat_rate: float | None = Field(default=None, ge=0, le=100)
    summary: str | None = None
    budget_line_id: UUID | None = None


class DocumentIntegrationRead(BaseModel):
    message: str
    link: str = ""
    document_id: UUID | None = None


class DocumentIntakeHistoryRead(BaseModel):
    id: UUID
    token: str
    batch_id: str | None = None
    filename: str
    status: str
    document_type: str
    title: str | None = None
    supplier: str | None = None
    reference: str | None = None
    amount_ttc: float | None = None
    target: str | None = None
    link: str | None = None
    document_id: UUID | None = None
    error_message: str | None = None
    ocr_used: bool = False
    created_at: datetime
    integrated_at: datetime | None = None
