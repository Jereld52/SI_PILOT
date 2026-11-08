from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel
from app.schemas.tickets import TicketUserRef


class CalendarEventCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    event_type: Literal[
        "maintenance",
        "intervention",
        "deadline",
        "renewal",
        "audit",
        "project",
        "meeting",
        "action",
        "other",
    ]
    start_at: datetime
    end_at: datetime | None = None
    all_day: bool = False
    location: str | None = Field(default=None, max_length=255)
    description: str | None = None
    owner_user_id: UUID | None = None
    status: Literal["planned", "done", "cancelled"] = "planned"
    priority: Literal["low", "medium", "high", "critical"] = "medium"
    related_type: str | None = Field(default=None, max_length=80)
    related_id: UUID | None = None
    reminder_minutes: int | None = Field(default=None, ge=0, le=10_080)


class CalendarEventUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    event_type: Literal[
        "maintenance",
        "intervention",
        "deadline",
        "renewal",
        "audit",
        "project",
        "meeting",
        "action",
        "other",
    ] | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    all_day: bool | None = None
    location: str | None = Field(default=None, max_length=255)
    description: str | None = None
    owner_user_id: UUID | None = None
    status: Literal["planned", "done", "cancelled"] | None = None
    priority: Literal["low", "medium", "high", "critical"] | None = None
    related_type: str | None = Field(default=None, max_length=80)
    related_id: UUID | None = None
    reminder_minutes: int | None = Field(default=None, ge=0, le=10_080)


class CalendarEventRead(ORMModel):
    id: UUID
    title: str
    event_type: str
    start_at: datetime
    end_at: datetime | None = None
    all_day: bool
    location: str | None = None
    description: str | None = None
    owner_user_id: UUID | None = None
    owner: TicketUserRef | None = None
    status: str
    priority: str
    related_type: str | None = None
    related_id: UUID | None = None
    reminder_minutes: int | None = None
    created_at: datetime
    updated_at: datetime


class ActionItemCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    module: str | None = Field(default=None, max_length=50)
    priority: Literal["low", "medium", "high", "critical"] = "medium"
    status: Literal["todo", "in_progress", "blocked", "done", "cancelled"] = "todo"
    due_date: datetime | None = None
    owner_user_id: UUID | None = None
    related_type: str | None = Field(default=None, max_length=80)
    related_id: UUID | None = None


class ActionItemUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    module: str | None = Field(default=None, max_length=50)
    priority: Literal["low", "medium", "high", "critical"] | None = None
    status: Literal["todo", "in_progress", "blocked", "done", "cancelled"] | None = None
    due_date: datetime | None = None
    owner_user_id: UUID | None = None
    related_type: str | None = Field(default=None, max_length=80)
    related_id: UUID | None = None


class ActionItemRead(ORMModel):
    id: UUID
    title: str
    description: str | None = None
    module: str | None = None
    priority: str
    status: str
    due_date: datetime | None = None
    owner_user_id: UUID | None = None
    owner: TicketUserRef | None = None
    related_type: str | None = None
    related_id: UUID | None = None
    source: str
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class CalendarOverview(BaseModel):
    planned_events: int
    overdue_actions: int
    open_actions: int
    next_events: list[CalendarEventRead]
    next_actions: list[ActionItemRead]
