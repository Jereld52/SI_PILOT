from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.agents import AgentRef
from app.schemas.common import ORMModel
from app.schemas.referentials import ServiceRef
from app.schemas.stock import StockAssetRef


class TicketUserRef(ORMModel):
    id: UUID
    email: str
    first_name: str
    last_name: str


class TicketCategoryRead(ORMModel):
    id: UUID
    code: str
    name: str
    description: str | None = None
    sla_hours: int | None = None
    is_active: bool
    sort_order: int


class TicketStatusRead(ORMModel):
    id: UUID
    code: str
    name: str
    is_closed: bool
    color: str | None = None
    sort_order: int
    is_active: bool


class TicketPriorityRead(ORMModel):
    id: UUID
    code: str
    name: str
    level: int
    color: str | None = None
    response_hours: int | None = None
    resolution_hours: int | None = None
    is_active: bool


class TicketCreate(BaseModel):
    subject: str = Field(min_length=1, max_length=255)
    description: str | None = None
    requester_agent_id: UUID | None = None
    service_id: UUID | None = None
    category_id: UUID
    priority_id: UUID
    assignee_user_id: UUID | None = None
    source: Literal["manual", "direct", "email", "phone", "portal", "import"] = "manual"
    asset_ids: list[UUID] = Field(default_factory=list)
    due_at: datetime | None = None


class TicketUpdate(BaseModel):
    subject: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    requester_agent_id: UUID | None = None
    service_id: UUID | None = None
    category_id: UUID | None = None
    priority_id: UUID | None = None
    assignee_user_id: UUID | None = None
    asset_ids: list[UUID] | None = None
    due_at: datetime | None = None
    resolution: str | None = None
    satisfaction_score: int | None = Field(default=None, ge=0, le=5)


class TicketAssignRequest(BaseModel):
    assignee_user_id: UUID | None = None
    note: str | None = Field(default=None, max_length=500)


class TicketTransitionRequest(BaseModel):
    status_id: UUID
    resolution: str | None = None
    note: str | None = Field(default=None, max_length=500)


class TicketCommentCreate(BaseModel):
    body: str = Field(min_length=1)
    is_internal: bool = False


class TicketTimeEntryCreate(BaseModel):
    minutes: int = Field(ge=1, le=24 * 60)
    performed_on: datetime | None = None
    comment: str | None = None


class TicketCommentRead(ORMModel):
    id: UUID
    body: str
    is_internal: bool
    author: TicketUserRef | None = None
    created_at: datetime
    edited_at: datetime | None = None


class TicketHistoryRead(ORMModel):
    id: UUID
    occurred_at: datetime
    actor_user_id: UUID | None = None
    field: str
    old_value: str | None = None
    new_value: str | None = None
    note: str | None = None


class TicketTimeEntryRead(ORMModel):
    id: UUID
    user_id: UUID | None = None
    minutes: int
    performed_on: datetime
    comment: str | None = None
    created_at: datetime


class TicketRead(ORMModel):
    id: UUID
    reference: str
    subject: str
    description: str | None = None
    requester_agent_id: UUID | None = None
    requester_agent: AgentRef | None = None
    service_id: UUID | None = None
    service: ServiceRef | None = None
    category_id: UUID
    category: TicketCategoryRead
    priority_id: UUID
    priority: TicketPriorityRead
    status_id: UUID
    status: TicketStatusRead
    assignee_user_id: UUID | None = None
    assignee: TicketUserRef | None = None
    source: str
    opened_at: datetime
    first_response_at: datetime | None = None
    resolved_at: datetime | None = None
    closed_at: datetime | None = None
    due_at: datetime | None = None
    resolution: str | None = None
    time_spent_minutes: int
    satisfaction_score: int | None = None
    created_at: datetime
    updated_at: datetime


class TicketDetailRead(TicketRead):
    assets: list[StockAssetRef] = Field(default_factory=list)
    comments: list[TicketCommentRead] = Field(default_factory=list)
    history: list[TicketHistoryRead] = Field(default_factory=list)
    time_entries: list[TicketTimeEntryRead] = Field(default_factory=list)


class TicketStatusCount(BaseModel):
    code: str
    name: str
    count: int


class TicketMeta(BaseModel):
    categories: list[TicketCategoryRead]
    statuses: list[TicketStatusRead]
    priorities: list[TicketPriorityRead]
    status_counts: list[TicketStatusCount]
    open_count: int
    unassigned_count: int
