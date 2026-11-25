from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

DocumentKind = Literal["contract", "quote", "invoice", "license", "other"]
DocumentTarget = Literal["documentation", "contract", "license", "invoice"]


class DocumentAnalysisRead(BaseModel):
    token: str
    filename: str
    document_type: DocumentKind
    title: str
    supplier: str | None = None
    reference: str | None = None
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


class DocumentIntegrationRequest(BaseModel):
    target: DocumentTarget
    title: str = Field(min_length=1, max_length=255)
    document_type: DocumentKind = "other"
    supplier: str | None = Field(default=None, max_length=150)
    reference: str | None = Field(default=None, max_length=80)
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
