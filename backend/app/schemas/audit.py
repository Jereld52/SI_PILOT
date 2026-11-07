from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.schemas.common import ORMModel


class AuditLogRead(ORMModel):
    id: int
    occurred_at: datetime
    actor_user_id: UUID | None = None
    actor_label: str | None = None
    module: str
    action: str
    entity_type: str | None = None
    entity_id: str | None = None
    entity_label: str | None = None
    before_json: str | None = None
    after_json: str | None = None
    diff_json: str | None = None
    ip: str | None = None
    user_agent: str | None = None
    request_id: str | None = None
    source: str
    status: str


class AuditSummary(BaseModel):
    total: int
    modules: dict[str, int]
