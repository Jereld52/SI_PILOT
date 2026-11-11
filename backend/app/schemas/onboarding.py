from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class ChecklistTemplateItemRead(ORMModel):
    id: UUID
    position: int
    label: str
    description: str | None = None
    responsible_role: str | None = None
    is_required: bool


class ChecklistTemplateRead(ORMModel):
    id: UUID
    code: str
    name: str
    type: str
    description: str | None = None
    is_active: bool
    items: list[ChecklistTemplateItemRead] = Field(default_factory=list)


class ChecklistRunItemRead(ORMModel):
    id: UUID
    label: str
    is_required: bool
    is_done: bool
    done_at: date | None = None
    notes: str | None = None


class ChecklistRunRead(BaseModel):
    id: UUID
    template_id: UUID
    template_name: str = ""
    agent_id: UUID
    agent_name: str = ""
    agent_service: str = ""
    type: str
    status: str
    started_at: date | None = None
    due_date: date | None = None
    completed_at: date | None = None
    notes: str | None = None
    total_items: int = 0
    done_items: int = 0
    required_total: int = 0
    required_done: int = 0
    progress_percent: int = 0
    is_overdue: bool = False
    items: list[ChecklistRunItemRead] = Field(default_factory=list)


class ChecklistRunCreate(BaseModel):
    agent_id: UUID
    type: Literal["onboarding", "offboarding"]
    template_id: UUID | None = None
    due_date: date | None = None
    notes: str | None = None


class ChecklistRunUpdate(BaseModel):
    status: Literal["in_progress", "completed", "cancelled"] | None = None
    due_date: date | None = None
    notes: str | None = None


class ChecklistItemUpdate(BaseModel):
    is_done: bool
    notes: str | None = Field(default=None, max_length=2000)


class OnboardingAlert(BaseModel):
    severity: Literal["critical", "high", "medium", "low", "info"]
    title: str
    detail: str
    agent_id: UUID | None = None
    run_id: UUID | None = None
    link: str | None = None


class OnboardingBriefing(BaseModel):
    generated_at: datetime
    counts: dict[str, int] = Field(default_factory=dict)
    items: list[OnboardingAlert] = Field(default_factory=list)
    runs: list[ChecklistRunRead] = Field(default_factory=list)


class AgentTimeline(BaseModel):
    agent_id: UUID
    agent_name: str
    runs: list[ChecklistRunRead] = Field(default_factory=list)
