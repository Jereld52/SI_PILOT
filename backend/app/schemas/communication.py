from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.agents import AgentRef
from app.schemas.common import ORMModel
from app.schemas.referentials import ServiceRef
from app.schemas.tickets import TicketUserRef

CommunicationCategory = Literal[
    "information", "maintenance", "security", "change", "event", "other"
]
CommunicationAudience = Literal["all", "service", "role", "users"]
CommunicationChannel = Literal["in_app", "email", "both"]
CommunicationStatus = Literal["draft", "scheduled", "published", "archived"]

MeetingType = Literal[
    "team", "service", "project", "manager_1on1", "crisis", "other"
]
MeetingStatus = Literal["planned", "done", "cancelled"]

PointStatus = Literal["open", "in_progress", "blocked", "done"]
PointPriority = Literal["low", "medium", "high"]

TrainingStatus = Literal["planned", "in_progress", "completed", "cancelled"]


class CommunicationRoleRef(ORMModel):
    id: UUID
    code: str
    name: str


class CommunicationCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    body: str = Field(min_length=1)
    category: CommunicationCategory = "information"
    audience: CommunicationAudience = "all"
    audience_service_id: UUID | None = None
    audience_role_id: UUID | None = None
    audience_user_ids: list[UUID] = Field(default_factory=list)
    channel: CommunicationChannel = "in_app"
    status: CommunicationStatus = "draft"
    is_pinned: bool = False
    scheduled_at: datetime | None = None
    expires_at: datetime | None = None
    author_user_id: UUID | None = None


class CommunicationUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    body: str | None = Field(default=None, min_length=1)
    category: CommunicationCategory | None = None
    audience: CommunicationAudience | None = None
    audience_service_id: UUID | None = None
    audience_role_id: UUID | None = None
    audience_user_ids: list[UUID] | None = None
    channel: CommunicationChannel | None = None
    status: CommunicationStatus | None = None
    is_pinned: bool | None = None
    scheduled_at: datetime | None = None
    expires_at: datetime | None = None
    author_user_id: UUID | None = None


class CommunicationRead(BaseModel):
    id: UUID
    title: str
    body: str
    category: str
    audience: str
    audience_service_id: UUID | None = None
    audience_service: ServiceRef | None = None
    audience_role_id: UUID | None = None
    audience_role: CommunicationRoleRef | None = None
    audience_user_ids: list[UUID] = Field(default_factory=list)
    audience_users: list[TicketUserRef] = Field(default_factory=list)
    audience_label: str = ""
    channel: str
    status: str
    is_pinned: bool
    scheduled_at: datetime | None = None
    published_at: datetime | None = None
    expires_at: datetime | None = None
    author_user_id: UUID | None = None
    author: TicketUserRef | None = None
    read_count: int = 0
    recipient_count: int = 0
    is_read: bool = False
    created_at: datetime
    updated_at: datetime


class MeetingCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    meeting_type: MeetingType = "team"
    scheduled_at: datetime
    duration_minutes: int = Field(default=60, ge=5, le=1440)
    location: str | None = Field(default=None, max_length=255)
    visio_url: str | None = Field(default=None, max_length=500)
    organizer_user_id: UUID | None = None
    participant_user_ids: list[UUID] = Field(default_factory=list)
    agenda: str | None = None
    notes: str | None = None
    decisions: str | None = None
    status: MeetingStatus = "planned"


class MeetingUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    meeting_type: MeetingType | None = None
    scheduled_at: datetime | None = None
    duration_minutes: int | None = Field(default=None, ge=5, le=1440)
    location: str | None = Field(default=None, max_length=255)
    visio_url: str | None = Field(default=None, max_length=500)
    organizer_user_id: UUID | None = None
    participant_user_ids: list[UUID] | None = None
    agenda: str | None = None
    notes: str | None = None
    decisions: str | None = None
    status: MeetingStatus | None = None


class MeetingRead(BaseModel):
    id: UUID
    title: str
    meeting_type: str
    scheduled_at: datetime
    duration_minutes: int
    location: str | None = None
    visio_url: str | None = None
    organizer_user_id: UUID | None = None
    organizer: TicketUserRef | None = None
    participant_user_ids: list[UUID] = Field(default_factory=list)
    participants: list[TicketUserRef] = Field(default_factory=list)
    agenda: str | None = None
    notes: str | None = None
    decisions: str | None = None
    status: str
    open_point_count: int = 0
    created_at: datetime
    updated_at: datetime


class MeetingPointCreate(BaseModel):
    meeting_id: UUID | None = None
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    status: PointStatus = "open"
    priority: PointPriority = "medium"
    due_date: date | None = None
    next_review_at: date | None = None
    last_discussed_at: date | None = None
    owner_user_id: UUID | None = None
    notes: str | None = None


class MeetingPointUpdate(BaseModel):
    meeting_id: UUID | None = None
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    status: PointStatus | None = None
    priority: PointPriority | None = None
    due_date: date | None = None
    next_review_at: date | None = None
    last_discussed_at: date | None = None
    owner_user_id: UUID | None = None
    notes: str | None = None


class MeetingPointRead(BaseModel):
    id: UUID
    meeting_id: UUID | None = None
    meeting_title: str | None = None
    title: str
    description: str | None = None
    status: str
    priority: str
    due_date: date | None = None
    next_review_at: date | None = None
    last_discussed_at: date | None = None
    owner_user_id: UUID | None = None
    owner: TicketUserRef | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


class TrainingCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    provider: str | None = Field(default=None, max_length=180)
    description: str | None = None
    category: str | None = Field(default=None, max_length=40)
    start_date: date | None = None
    end_date: date | None = None
    duration_hours: float | None = Field(default=None, ge=0)
    location: str | None = Field(default=None, max_length=255)
    mandatory: bool = False
    cost: float | None = Field(default=None, ge=0)
    status: TrainingStatus = "planned"
    capacity: int | None = Field(default=None, ge=1)
    participant_agent_ids: list[UUID] = Field(default_factory=list)
    notes: str | None = None


class TrainingUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    provider: str | None = Field(default=None, max_length=180)
    description: str | None = None
    category: str | None = Field(default=None, max_length=40)
    start_date: date | None = None
    end_date: date | None = None
    duration_hours: float | None = Field(default=None, ge=0)
    location: str | None = Field(default=None, max_length=255)
    mandatory: bool | None = None
    cost: float | None = Field(default=None, ge=0)
    status: TrainingStatus | None = None
    capacity: int | None = Field(default=None, ge=1)
    participant_agent_ids: list[UUID] | None = None
    notes: str | None = None


class TrainingRead(BaseModel):
    id: UUID
    title: str
    provider: str | None = None
    description: str | None = None
    category: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    duration_hours: float | None = None
    location: str | None = None
    mandatory: bool
    cost: float | None = None
    status: str
    capacity: int | None = None
    participant_agent_ids: list[UUID] = Field(default_factory=list)
    participants: list[AgentRef] = Field(default_factory=list)
    notes: str | None = None
    created_at: datetime
    updated_at: datetime
