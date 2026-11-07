from datetime import datetime

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
