from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

SchedulerJob = Literal["checks", "veeam", "backup", "digest"]
BackupFrequency = Literal["daily", "weekly"]


class SchedulerConfigRead(BaseModel):
    enabled: bool = False
    checks_interval_seconds: int = 60
    veeam_enabled: bool = True
    veeam_hour: int = 6
    veeam_minute: int = 0
    veeam_stale_hours: int = 48
    backup_enabled: bool = True
    backup_frequency: BackupFrequency = "daily"
    backup_weekday: int = 0
    backup_hour: int = 2
    backup_minute: int = 0
    backup_retention_days: int = 30
    backup_keep_min: int = 3
    digest_enabled: bool = True
    digest_hour: int = 7
    digest_minute: int = 30
    digest_emails: str = ""
    smtp_configured: bool = False


class SchedulerConfigUpdate(BaseModel):
    enabled: bool = False
    checks_interval_seconds: int = Field(default=60, ge=30, le=3600)
    veeam_enabled: bool = True
    veeam_hour: int = Field(default=6, ge=0, le=23)
    veeam_minute: int = Field(default=0, ge=0, le=59)
    veeam_stale_hours: int = Field(default=48, ge=6, le=720)
    backup_enabled: bool = True
    backup_frequency: BackupFrequency = "daily"
    backup_weekday: int = Field(default=0, ge=0, le=6)
    backup_hour: int = Field(default=2, ge=0, le=23)
    backup_minute: int = Field(default=0, ge=0, le=59)
    backup_retention_days: int = Field(default=30, ge=1, le=3650)
    backup_keep_min: int = Field(default=3, ge=1, le=100)
    digest_enabled: bool = True
    digest_hour: int = Field(default=7, ge=0, le=23)
    digest_minute: int = Field(default=30, ge=0, le=59)
    digest_emails: str = Field(default="", max_length=1000)


class SchedulerRunRead(BaseModel):
    id: str
    job: str
    trigger: str
    started_at: datetime
    finished_at: datetime | None = None
    status: str
    summary: str | None = None
    details: dict[str, Any] | None = None
    duration_ms: int | None = None


class SchedulerRunResponse(BaseModel):
    run: SchedulerRunRead
    message: str
