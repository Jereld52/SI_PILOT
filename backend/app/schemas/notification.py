from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.schemas.common import ORMModel


class NotificationRead(ORMModel):
    id: UUID
    type: str
    severity: str
    title: str
    body: str | None = None
    link: str | None = None
    entity_type: str | None = None
    entity_id: str | None = None
    read_at: datetime | None = None
    created_at: datetime


class NotificationCount(BaseModel):
    unread: int
    total: int
