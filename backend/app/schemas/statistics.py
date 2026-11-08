from datetime import date, datetime

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
