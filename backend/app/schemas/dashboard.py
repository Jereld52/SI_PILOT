from datetime import date, datetime

from pydantic import BaseModel, Field


class KpiValue(BaseModel):
    key: str
    label: str
    value: int | float
    unit: str | None = None
    hint: str | None = None
    severity: str = "neutral"
    link: str | None = None


class ChartPoint(BaseModel):
    label: str
    value: float
    color: str | None = None


class ChartSeries(BaseModel):
    key: str
    label: str
    points: list[ChartPoint]
    unit: str | None = None


class AlertItem(BaseModel):
    id: str
    severity: str
    title: str
    detail: str | None = None
    link: str | None = None
    category: str


class ActivityItem(BaseModel):
    id: str
    occurred_at: datetime
    actor: str | None = None
    module: str
    action: str
    label: str | None = None
    status: str
    link: str | None = None


class DashboardSummary(BaseModel):
    kpis: list[KpiValue]
    generated_at: datetime


class DashboardCharts(BaseModel):
    series: list[ChartSeries]
    generated_at: datetime


class DashboardAlerts(BaseModel):
    items: list[AlertItem]
    generated_at: datetime


class DashboardActivity(BaseModel):
    items: list[ActivityItem]
    generated_at: datetime


class CockpitModule(BaseModel):
    key: str
    label: str
    href: str
    primary: int
    primary_label: str
    secondary: int
    secondary_label: str
    hint: str
    tone: str


class CockpitDeadline(BaseModel):
    id: str
    kind: str
    label: str
    due_date: date
    severity: str
    href: str


class DashboardCockpit(BaseModel):
    modules: list[CockpitModule]
    deadlines: list[CockpitDeadline]
    generated_at: datetime


class DashboardTiles(BaseModel):
    tiles: list[str]


class DashboardTilesUpdate(BaseModel):
    tiles: list[str]


class TodayItem(BaseModel):
    id: str
    title: str
    detail: str | None = None
    severity: str = "info"
    href: str = ""
    action_label: str = "Ouvrir"
    due_date: date | None = None
    permission: str | None = None
    module_key: str | None = None


class TodaySection(BaseModel):
    key: str
    label: str
    items: list[TodayItem]


class DayPlanItem(BaseModel):
    id: str
    kind: str
    title: str
    detail: str | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    all_day: bool = False
    location: str | None = None
    travel: bool = False
    severity: str = "info"
    href: str = ""
    action_label: str = "Ouvrir"
    permission: str | None = None
    module_key: str | None = None


class DayPlanSummary(BaseModel):
    meetings: int = 0
    interventions: int = 0
    reservations: int = 0
    events: int = 0
    actions: int = 0
    tickets: int = 0
    travels: int = 0
    busy_minutes: int = 0
    free_minutes: int = 0
    conflicts: int = 0
    first_start: datetime | None = None
    last_end: datetime | None = None


class DayPlan(BaseModel):
    date: date
    items: list[DayPlanItem] = Field(default_factory=list)
    summary: DayPlanSummary = Field(default_factory=DayPlanSummary)
    suggestions: list[str] = Field(default_factory=list)


class DashboardToday(BaseModel):
    generated_at: datetime
    total: int
    urgent: int
    sections: list[TodaySection]
    plan: DayPlan
