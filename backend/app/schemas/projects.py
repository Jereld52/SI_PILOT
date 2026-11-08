from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel
from app.schemas.tickets import TicketUserRef


class ProjectCreate(BaseModel):
    code: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=180)
    description: str | None = None
    objectives: str | None = None
    owner_user_id: UUID | None = None
    start_date: date | None = None
    due_date: date | None = None
    planned_budget: float | None = Field(default=None, ge=0)
    priority: Literal["low", "medium", "high", "critical"] = "medium"
    status: Literal["idea", "planned", "in_progress", "on_hold", "done", "cancelled"] = "planned"
    progress_percent: int = Field(default=0, ge=0, le=100)


class ProjectUpdate(BaseModel):
    code: str | None = Field(default=None, min_length=1, max_length=40)
    name: str | None = Field(default=None, min_length=1, max_length=180)
    description: str | None = None
    objectives: str | None = None
    owner_user_id: UUID | None = None
    start_date: date | None = None
    due_date: date | None = None
    planned_budget: float | None = Field(default=None, ge=0)
    priority: Literal["low", "medium", "high", "critical"] | None = None
    status: Literal["idea", "planned", "in_progress", "on_hold", "done", "cancelled"] | None = None
    progress_percent: int | None = Field(default=None, ge=0, le=100)


class ProjectRead(ORMModel):
    id: UUID
    code: str
    name: str
    description: str | None = None
    objectives: str | None = None
    owner_user_id: UUID | None = None
    owner: TicketUserRef | None = None
    start_date: date | None = None
    due_date: date | None = None
    planned_budget: float | None = None
    priority: str
    status: str
    progress_percent: int
    milestone_count: int = 0
    task_count: int = 0
    open_task_count: int = 0
    risk_count: int = 0
    created_at: datetime
    updated_at: datetime


class MilestoneCreate(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    description: str | None = None
    due_date: date | None = None
    completed_at: date | None = None
    status: Literal["todo", "in_progress", "done", "cancelled"] = "todo"
    weight: int = Field(default=1, ge=1, le=100)


class MilestoneUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=180)
    description: str | None = None
    due_date: date | None = None
    completed_at: date | None = None
    status: Literal["todo", "in_progress", "done", "cancelled"] | None = None
    weight: int | None = Field(default=None, ge=1, le=100)


class MilestoneRead(ORMModel):
    id: UUID
    project_id: UUID
    name: str
    description: str | None = None
    due_date: date | None = None
    completed_at: date | None = None
    status: str
    weight: int
    created_at: datetime
    updated_at: datetime


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    milestone_id: UUID | None = None
    status: Literal["todo", "in_progress", "blocked", "done"] = "todo"
    priority: Literal["low", "medium", "high", "critical"] = "medium"
    assignee_user_id: UUID | None = None
    due_date: date | None = None
    position: int = Field(default=0, ge=0)


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    milestone_id: UUID | None = None
    status: Literal["todo", "in_progress", "blocked", "done"] | None = None
    priority: Literal["low", "medium", "high", "critical"] | None = None
    assignee_user_id: UUID | None = None
    due_date: date | None = None
    position: int | None = Field(default=None, ge=0)


class TaskRead(ORMModel):
    id: UUID
    project_id: UUID
    milestone_id: UUID | None = None
    title: str
    description: str | None = None
    status: str
    priority: str
    assignee_user_id: UUID | None = None
    due_date: date | None = None
    position: int
    created_at: datetime
    updated_at: datetime


class RiskCreate(BaseModel):
    description: str = Field(min_length=1)
    probability: int = Field(default=3, ge=1, le=5)
    impact: int = Field(default=3, ge=1, le=5)
    mitigation: str | None = None
    owner_user_id: UUID | None = None
    status: Literal["open", "mitigated", "closed"] = "open"


class RiskUpdate(BaseModel):
    description: str | None = Field(default=None, min_length=1)
    probability: int | None = Field(default=None, ge=1, le=5)
    impact: int | None = Field(default=None, ge=1, le=5)
    mitigation: str | None = None
    owner_user_id: UUID | None = None
    status: Literal["open", "mitigated", "closed"] | None = None


class RiskRead(ORMModel):
    id: UUID
    project_id: UUID
    description: str
    probability: int
    impact: int
    score: int = 0
    mitigation: str | None = None
    owner_user_id: UUID | None = None
    status: str
    created_at: datetime
    updated_at: datetime


class DecisionCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    decision_date: date | None = None
    decided_by: str | None = Field(default=None, max_length=255)
    document_id: UUID | None = None


class DecisionUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    decision_date: date | None = None
    decided_by: str | None = Field(default=None, max_length=255)
    document_id: UUID | None = None


class DecisionRead(ORMModel):
    id: UUID
    project_id: UUID
    title: str
    description: str | None = None
    decision_date: date | None = None
    decided_by: str | None = None
    document_id: UUID | None = None
    created_at: datetime
    updated_at: datetime


class ProjectDetailRead(ProjectRead):
    milestones: list[MilestoneRead] = Field(default_factory=list)
    tasks: list[TaskRead] = Field(default_factory=list)
    risks: list[RiskRead] = Field(default_factory=list)
    decisions: list[DecisionRead] = Field(default_factory=list)
