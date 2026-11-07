from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel
from app.schemas.tickets import TicketUserRef


class ProcessingActivityCreate(BaseModel):
    reference: str | None = Field(default=None, max_length=40)
    name: str = Field(min_length=1, max_length=180)
    purpose: str | None = None
    legal_basis: str | None = Field(default=None, max_length=120)
    data_categories: str | None = None
    data_subjects: str | None = None
    recipients: str | None = None
    retention_period: str | None = Field(default=None, max_length=120)
    security_measures: str | None = None
    suppliers: str | None = None
    owner_user_id: UUID | None = None
    dpo_notes: str | None = None
    status: Literal["draft", "active", "archived"] = "draft"
    last_review_at: date | None = None
    next_review_at: date | None = None


class ProcessingActivityUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=180)
    purpose: str | None = None
    legal_basis: str | None = Field(default=None, max_length=120)
    data_categories: str | None = None
    data_subjects: str | None = None
    recipients: str | None = None
    retention_period: str | None = Field(default=None, max_length=120)
    security_measures: str | None = None
    suppliers: str | None = None
    owner_user_id: UUID | None = None
    dpo_notes: str | None = None
    status: Literal["draft", "active", "archived"] | None = None
    last_review_at: date | None = None
    next_review_at: date | None = None


class ProcessingActivityRead(ORMModel):
    id: UUID
    reference: str
    name: str
    purpose: str | None = None
    legal_basis: str | None = None
    data_categories: str | None = None
    data_subjects: str | None = None
    recipients: str | None = None
    retention_period: str | None = None
    security_measures: str | None = None
    suppliers: str | None = None
    owner_user_id: UUID | None = None
    owner: TicketUserRef | None = None
    dpo_notes: str | None = None
    status: str
    last_review_at: date | None = None
    next_review_at: date | None = None
    created_at: datetime
    updated_at: datetime


class DataCollectionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    collection_type: Literal["form", "survey", "contact_list", "registration", "event", "ad_hoc"]
    purpose: str | None = None
    processing_activity_id: UUID | None = None
    data_categories: str | None = None
    subjects_count: int | None = Field(default=None, ge=0)
    collected_at: date | None = None
    retention_end: date | None = None
    status: Literal["active", "archived", "deleted"] = "active"
    notes: str | None = None


class DataCollectionUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=180)
    collection_type: Literal["form", "survey", "contact_list", "registration", "event", "ad_hoc"] | None = None
    purpose: str | None = None
    processing_activity_id: UUID | None = None
    data_categories: str | None = None
    subjects_count: int | None = Field(default=None, ge=0)
    collected_at: date | None = None
    retention_end: date | None = None
    status: Literal["active", "archived", "deleted"] | None = None
    notes: str | None = None


class DataCollectionRead(ORMModel):
    id: UUID
    name: str
    collection_type: str
    purpose: str | None = None
    processing_activity_id: UUID | None = None
    processing_activity: ProcessingActivityRead | None = None
    data_categories: str | None = None
    subjects_count: int | None = None
    collected_at: date | None = None
    retention_end: date | None = None
    status: str
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


class DpoRequestCreate(BaseModel):
    subject: str = Field(min_length=1, max_length=255)
    requester_name: str | None = Field(default=None, max_length=180)
    requester_type: str | None = Field(default=None, max_length=40)
    description: str | None = None
    due_date: date | None = None
    status: Literal["new", "in_progress", "answered", "closed"] = "new"


class DpoRequestUpdate(BaseModel):
    subject: str | None = Field(default=None, min_length=1, max_length=255)
    requester_name: str | None = Field(default=None, max_length=180)
    requester_type: str | None = Field(default=None, max_length=40)
    description: str | None = None
    response: str | None = None
    recommendations: str | None = None
    due_date: date | None = None
    status: Literal["new", "in_progress", "answered", "closed"] | None = None


class DpoRequestRead(ORMModel):
    id: UUID
    reference: str
    subject: str
    requester_name: str | None = None
    requester_type: str | None = None
    description: str | None = None
    response: str | None = None
    recommendations: str | None = None
    due_date: date | None = None
    status: str
    closed_at: datetime | None = None
    created_by_id: UUID | None = None
    created_at: datetime
    updated_at: datetime


class RightsRequestCreate(BaseModel):
    request_type: Literal["access", "rectification", "erasure", "objection", "portability", "limitation"]
    requester_name: str | None = Field(default=None, max_length=180)
    processing_activity_id: UUID | None = None
    received_at: date | None = None
    due_date: date | None = None
    status: Literal["new", "in_progress", "answered", "closed"] = "new"


class RightsRequestUpdate(BaseModel):
    request_type: Literal["access", "rectification", "erasure", "objection", "portability", "limitation"] | None = None
    requester_name: str | None = Field(default=None, max_length=180)
    processing_activity_id: UUID | None = None
    received_at: date | None = None
    due_date: date | None = None
    status: Literal["new", "in_progress", "answered", "closed"] | None = None
    response: str | None = None
    resolution: str | None = None


class RightsRequestRead(ORMModel):
    id: UUID
    reference: str
    request_type: str
    requester_name: str | None = None
    processing_activity_id: UUID | None = None
    processing_activity: ProcessingActivityRead | None = None
    received_at: date | None = None
    due_date: date | None = None
    status: str
    response: str | None = None
    resolution: str | None = None
    closed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class DataBreachCreate(BaseModel):
    occurred_at: datetime | None = None
    discovered_at: datetime | None = None
    description: str | None = None
    severity: Literal["low", "medium", "high", "critical"] = "medium"
    affected_count: int | None = Field(default=None, ge=0)
    containment: str | None = None
    cnil_notified_at: datetime | None = None
    subjects_notified_at: datetime | None = None
    status: Literal["open", "contained", "closed"] = "open"
    lessons_learned: str | None = None


class DataBreachUpdate(BaseModel):
    occurred_at: datetime | None = None
    discovered_at: datetime | None = None
    description: str | None = None
    severity: Literal["low", "medium", "high", "critical"] | None = None
    affected_count: int | None = Field(default=None, ge=0)
    containment: str | None = None
    cnil_notified_at: datetime | None = None
    subjects_notified_at: datetime | None = None
    status: Literal["open", "contained", "closed"] | None = None
    lessons_learned: str | None = None


class DataBreachRead(ORMModel):
    id: UUID
    reference: str
    occurred_at: datetime | None = None
    discovered_at: datetime | None = None
    description: str | None = None
    severity: str
    affected_count: int | None = None
    containment: str | None = None
    cnil_notified_at: datetime | None = None
    subjects_notified_at: datetime | None = None
    status: str
    lessons_learned: str | None = None
    created_at: datetime
    updated_at: datetime


class RgpdDeadline(BaseModel):
    id: UUID
    kind: str
    label: str
    due_date: date | None = None
    status: str
    link: str


class RgpdOverview(BaseModel):
    processing_total: int
    processing_active: int
    collections_total: int
    open_requests: int
    open_rights: int
    open_breaches: int
    reviews_due: int
    deadlines: list[RgpdDeadline]
