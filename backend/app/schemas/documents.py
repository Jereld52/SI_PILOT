from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import ORMModel
from app.schemas.tickets import TicketUserRef


class DocumentCategoryRead(ORMModel):
    id: UUID
    code: str
    name: str
    is_active: bool


class DocumentCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    doc_type: str | None = Field(default=None, max_length=60)
    category_id: UUID | None = None
    description: str | None = None
    asset_id: UUID | None = None
    project_id: UUID | None = None
    visibility: Literal["all", "module", "restricted"] = "all"
    status: Literal["draft", "published", "archived"] = "published"
    tags: list[str] = Field(default_factory=list)


class DocumentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    doc_type: str | None = Field(default=None, max_length=60)
    category_id: UUID | None = None
    description: str | None = None
    asset_id: UUID | None = None
    project_id: UUID | None = None
    visibility: Literal["all", "module", "restricted"] | None = None
    status: Literal["draft", "published", "archived"] | None = None
    tags: list[str] | None = None


class DocumentVersionRead(ORMModel):
    id: UUID
    document_id: UUID
    version_number: int
    filename: str
    mime_type: str
    size_bytes: int
    sha256: str
    changelog: str | None = None
    author_user_id: UUID | None = None
    created_at: datetime
    is_current: bool


class DocumentRead(ORMModel):
    id: UUID
    title: str
    doc_type: str | None = None
    category_id: UUID | None = None
    category: DocumentCategoryRead | None = None
    description: str | None = None
    asset_id: UUID | None = None
    project_id: UUID | None = None
    author_user_id: UUID | None = None
    author: TicketUserRef | None = None
    visibility: str
    status: str
    tags: list[str] = Field(default_factory=list)
    current_version: DocumentVersionRead | None = None
    version_count: int = 0
    archived_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    @field_validator("tags", mode="before")
    @classmethod
    def tags_to_names(cls, value: list[object] | None) -> list[str]:
        if not value:
            return []
        return [item if isinstance(item, str) else str(getattr(item, "name", item)) for item in value]


class DocumentDetailRead(DocumentRead):
    versions: list[DocumentVersionRead] = Field(default_factory=list)
