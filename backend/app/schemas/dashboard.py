from datetime import date, datetime

from pydantic import BaseModel


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
