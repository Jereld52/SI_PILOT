from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.schemas.common import ORMModel


class ImportJobRead(ORMModel):
    id: UUID
    entity_type: str
    original_filename: str
    status: str
    total_rows: int
    valid_rows: int
    warning_rows: int
    error_rows: int
    duplicate_rows: int
    created_at: datetime
    applied_at: datetime | None = None


class ImportRowPreview(BaseModel):
    row_number: int
    status: str
    label: str
    errors: list[str] = []


class ImportPreviewResponse(BaseModel):
    job: ImportJobRead
    rows: list[ImportRowPreview]
    can_apply: bool
    message: str
    detected_format: str = "standard"


class ImportApplyResponse(BaseModel):
    job: ImportJobRead
    created: int
    skipped: int
    errors: int
    message: str
