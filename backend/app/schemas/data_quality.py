from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class DataQualityItem(BaseModel):
    id: str
    title: str
    detail: str | None = None
    severity: str = "warning"
    href: str = ""
    action_label: str = "Ouvrir"
    permission: str | None = None
    module_key: str | None = None
    entity_type: str | None = None
    entity_id: str | None = None


class DataQualitySection(BaseModel):
    key: str
    label: str
    description: str
    items: list[DataQualityItem] = Field(default_factory=list)
    total: int = 0
    critical: int = 0


class DataQualityOverview(BaseModel):
    generated_at: datetime
    total: int
    critical: int
    sections: list[DataQualitySection]
