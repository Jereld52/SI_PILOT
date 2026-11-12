from datetime import datetime

from pydantic import BaseModel, Field


class VeeamConfigRead(BaseModel):
    enabled: bool = False
    base_url: str = ""
    username: str = ""
    api_version: str = "1.2-rev1"
    verify_tls: bool = True
    timeout_seconds: int = 30
    password_set: bool = False
    configured: bool = False


class VeeamConfigUpdate(BaseModel):
    enabled: bool = False
    base_url: str = Field(default="", max_length=500)
    username: str = Field(default="", max_length=255)
    password: str | None = Field(default=None, max_length=255)
    api_version: str = Field(default="1.2-rev1", max_length=30)
    verify_tls: bool = True
    timeout_seconds: int = Field(default=30, ge=5, le=300)


class VeeamTestResponse(BaseModel):
    ok: bool
    message: str
    job_count: int = 0


class VeeamJobRead(BaseModel):
    id: str
    name: str
    type: str = ""
    disabled: bool = False
    last_result: str = ""
    last_session_at: str | None = None
    last_duration_seconds: int | None = None
    last_message: str | None = None


class VeeamSessionRead(BaseModel):
    id: str
    name: str
    job_id: str = ""
    job_name: str = ""
    session_type: str = ""
    state: str = ""
    result: str = ""
    message: str | None = None
    creation_time: str | None = None
    end_time: str | None = None
    duration_seconds: int | None = None
    progress_percent: int | None = None


class VeeamRepositoryRead(BaseModel):
    id: str
    name: str
    type: str = ""
    host: str = ""
    path: str = ""
    state: str = ""
    capacity_bytes: int | None = None
    free_bytes: int | None = None
    used_bytes: int | None = None
    free_percent: float | None = None


class VeeamOverview(BaseModel):
    generated_at: datetime
    summary: dict[str, int | float | str | None] = Field(default_factory=dict)
    jobs: list[VeeamJobRead] = Field(default_factory=list)
    sessions: list[VeeamSessionRead] = Field(default_factory=list)
    repositories: list[VeeamRepositoryRead] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
