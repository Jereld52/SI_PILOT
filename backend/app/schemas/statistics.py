from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field


class StatsKpi(BaseModel):
    key: str
    label: str
    value: int | float
    unit: str | None = None
    hint: str | None = None
    severity: str = "neutral"


class StatsPeriodPoint(BaseModel):
    key: str
    label: str
    created: int = 0
    resolved: int = 0
    closed: int = 0


class StatsPoint(BaseModel):
    label: str
    value: float
    color: str | None = None


class StatsBudgetCategory(BaseModel):
    label: str
    voted: float = 0
    committed: float = 0
    invoiced: float = 0


class StatsBudget(BaseModel):
    year: int
    status: str
    voted: float = 0
    committed: float = 0
    invoiced: float = 0
    available: float = 0
    categories: list[StatsBudgetCategory] = Field(default_factory=list)


class StatsCommercialRow(BaseModel):
    id: UUID
    kind: str
    reference: str
    object: str
    supplier: str
    status: str
    issue_date: date
    due_date: date | None = None
    engagement_number: str | None = None
    amount_ht: float | None = None
    amount_ttc: float | None = None
    budget_line: str | None = None
    contract_reference: str | None = None
    document_id: UUID | None = None
    created_at: datetime


class StatsCommercial(BaseModel):
    start: date
    end: date
    generated_at: datetime
    kind: str | None = None
    status: str | None = None
    supplier_id: UUID | None = None
    with_engagement: bool | None = None
    q: str | None = None
    kpis: list[StatsKpi]
    by_status: list[StatsPoint]
    by_supplier: list[StatsPoint]
    by_kind: list[StatsPoint]
    periods: list[StatsPeriodPoint]
    documents: list[StatsCommercialRow]


class StatisticsOverview(BaseModel):
    start: date
    end: date
    granularity: str
    generated_at: datetime
    kpis: list[StatsKpi]
    ticket_periods: list[StatsPeriodPoint]
    intervention_periods: list[StatsPeriodPoint]
    security_periods: list[StatsPeriodPoint]
    tickets_by_status: list[StatsPoint]
    tickets_by_priority: list[StatsPoint]
    tickets_by_category: list[StatsPoint]
    tickets_by_assignee: list[StatsPoint]
    assets_by_status: list[StatsPoint]
    assets_by_category: list[StatsPoint]
    interventions_by_status: list[StatsPoint]
    contracts_by_status: list[StatsPoint]
    projects_by_status: list[StatsPoint]
    security_by_severity: list[StatsPoint]
    mobile_by_status: list[StatsPoint]
    documents_by_status: list[StatsPoint]
    budget: StatsBudget | None = None
