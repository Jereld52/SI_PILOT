from __future__ import annotations

import hashlib
import re
from pathlib import Path
from uuid import UUID, uuid4

from app.core.config import settings
from app.core.errors import NotFoundError, ValidationAppError
from app.db.base import utcnow
from app.models.assets import Asset
from app.models.auth import User
from app.models.documents import (
    Document,
    DocumentCategory,
    DocumentVersion,
    Tag,
)
from app.models.projects import Project
from app.schemas.documents import (
    DocumentCategoryRead,
    DocumentCreate,
    DocumentDetailRead,
    DocumentRead,
    DocumentUpdate,
    DocumentVersionRead,
)
from app.services.audit_service import write_audit
from fastapi import Request, UploadFile
from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session


def _document_read(document: Document) -> DocumentRead:
    data = DocumentRead.model_validate(document)
    data.tags = [tag.name for tag in document.tags]
    versions = sorted(document.versions, key=lambda item: item.version_number)
    data.version_count = len(versions)
    current = next((item for item in versions if item.is_current), None)
    data.current_version = (
        DocumentVersionRead.model_validate(current) if current else None
    )
    return data


def _document_detail(document: Document) -> DocumentDetailRead:
    detail = DocumentDetailRead.model_validate(document)
    read = _document_read(document)
    detail.tags = read.tags
    detail.version_count = read.version_count
    detail.current_version = read.current_version
    detail.versions = [
        DocumentVersionRead.model_validate(item)
        for item in sorted(document.versions, key=lambda item: item.version_number, reverse=True)
    ]
    return detail


def list_documents(
    db: Session,
    *,
    q: str | None = None,
    category_id: UUID | None = None,
    status: str | None = None,
) -> list[DocumentRead]:
    statement = select(Document)
    if category_id:
        statement = statement.where(Document.category_id == category_id)
    if status:
        statement = statement.where(Document.status == status)
    if q:
        pattern = f"%{q.strip()}%"
        statement = statement.where(
            or_(
                Document.title.ilike(pattern),
                Document.description.ilike(pattern),
                Document.doc_type.ilike(pattern),
            )
        )
    rows = db.scalars(statement.order_by(Document.updated_at.desc())).all()
    return [_document_read(row) for row in rows]


def get_document(db: Session, document_id: UUID) -> Document:
    document = db.get(Document, document_id)
    if document is None:
        raise NotFoundError("Document introuvable.")
    return document


def get_document_detail(db: Session, document_id: UUID) -> DocumentDetailRead:
    return _document_detail(get_document(db, document_id))


def list_categories(db: Session) -> list[DocumentCategoryRead]:
    rows = db.scalars(
        select(DocumentCategory)
        .where(DocumentCategory.is_active.is_(True))
        .order_by(DocumentCategory.name)
    ).all()
    return [DocumentCategoryRead.model_validate(row) for row in rows]


def _validate_links(
    db: Session,
    *,
    category_id: UUID | None,
    asset_id: UUID | None,
    project_id: UUID | None,
) -> None:
    if category_id and db.get(DocumentCategory, category_id) is None:
        raise NotFoundError("Catégorie de document introuvable.")
    if asset_id and db.get(Asset, asset_id) is None:
        raise NotFoundError("Équipement introuvable.")
    if project_id and db.get(Project, project_id) is None:
        raise NotFoundError("Projet introuvable.")


def _sync_tags(db: Session, document: Document, tags: list[str]) -> None:
    cleaned: list[str] = []
    for value in tags:
        name = value.strip()
        if name and name.lower() not in {item.lower() for item in cleaned}:
            cleaned.append(name)
    objects: list[Tag] = []
    for name in cleaned:
        tag = db.scalar(select(Tag).where(func.lower(Tag.name) == name.lower()))
        if tag is None:
            tag = Tag(name=name)
            db.add(tag)
            db.flush()
        objects.append(tag)
    document.tags = objects


def create_document(
    db: Session,
    payload: DocumentCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> DocumentDetailRead:
    _validate_links(
        db,
        category_id=payload.category_id,
        asset_id=payload.asset_id,
        project_id=payload.project_id,
    )
    data = payload.model_dump(exclude={"tags"})
    document = Document(**data, author_user_id=actor.id)
    if document.status == "archived":
        document.archived_at = utcnow()
    db.add(document)
    db.flush()
    _sync_tags(db, document, payload.tags)
    write_audit(
        db,
        module="documents",
        action="document_created",
        actor=actor,
        entity_type="document",
        entity_id=str(document.id),
        entity_label=document.title,
        after={"status": document.status, "visibility": document.visibility},
        request=request,
    )
    db.commit()
    db.refresh(document)
    return _document_detail(document)


def update_document(
    db: Session,
    document: Document,
    payload: DocumentUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> DocumentDetailRead:
    data = payload.model_dump(exclude_unset=True)
    tags = data.pop("tags", None)
    if any(key in data for key in ("category_id", "asset_id", "project_id")):
        _validate_links(
            db,
            category_id=data.get("category_id", document.category_id),
            asset_id=data.get("asset_id", document.asset_id),
            project_id=data.get("project_id", document.project_id),
        )
    before = {"status": document.status, "title": document.title}
    for field, value in data.items():
        setattr(document, field, value)
    if document.status == "archived" and document.archived_at is None:
        document.archived_at = utcnow()
    if document.status != "archived":
        document.archived_at = None
    if tags is not None:
        _sync_tags(db, document, tags)
    write_audit(
        db,
        module="documents",
        action="document_updated",
        actor=actor,
        entity_type="document",
        entity_id=str(document.id),
        entity_label=document.title,
        before=before,
        after={"status": document.status, "title": document.title},
        request=request,
    )
    db.commit()
    db.refresh(document)
    return _document_detail(document)


def archive_document(
    db: Session, document: Document, *, actor: User, request: Request | None = None
) -> DocumentDetailRead:
    previous = document.status
    document.status = "archived"
    document.archived_at = utcnow()
    write_audit(
        db,
        module="documents",
        action="document_archived",
        actor=actor,
        entity_type="document",
        entity_id=str(document.id),
        entity_label=document.title,
        before={"status": previous},
        after={"status": "archived"},
        request=request,
    )
    db.commit()
    db.refresh(document)
    return _document_detail(document)


def _safe_filename(filename: str) -> str:
    name = Path(filename).name.strip() or "document"
    name = re.sub(r"[^A-Za-z0-9._ -]", "_", name)
    return name[:180]


def save_version(
    db: Session,
    document: Document,
    upload: UploadFile,
    *,
    changelog: str | None,
    actor: User,
    request: Request | None = None,
) -> DocumentDetailRead:
    filename = _safe_filename(upload.filename or "document")
    mime_type = upload.content_type or "application/octet-stream"
    max_bytes = settings.max_upload_mb * 1024 * 1024
    relative_dir = Path("documents") / str(document.id)
    target_dir = Path(settings.upload_dir) / relative_dir
    target_dir.mkdir(parents=True, exist_ok=True)
    storage_name = f"{uuid4().hex}_{filename}"
    target_path = target_dir / storage_name
    digest = hashlib.sha256()
    size = 0
    try:
        with target_path.open("wb") as handle:
            while chunk := upload.file.read(1024 * 1024):
                size += len(chunk)
                if size > max_bytes:
                    raise ValidationAppError(
                        f"Le fichier dépasse la taille maximale de {settings.max_upload_mb} Mo."
                    )
                digest.update(chunk)
                handle.write(chunk)
    except Exception:
        target_path.unlink(missing_ok=True)
        raise
    finally:
        upload.file.close()
    if size == 0:
        target_path.unlink(missing_ok=True)
        raise ValidationAppError("Le fichier est vide.")

    db.execute(
        update(DocumentVersion)
        .where(DocumentVersion.document_id == document.id)
        .values(is_current=False)
    )
    last_version = db.scalar(
        select(func.max(DocumentVersion.version_number)).where(
            DocumentVersion.document_id == document.id
        )
    )
    version = DocumentVersion(
        document_id=document.id,
        version_number=(last_version or 0) + 1,
        filename=filename,
        storage_key=str(relative_dir / storage_name).replace("\\", "/"),
        mime_type=mime_type,
        size_bytes=size,
        sha256=digest.hexdigest(),
        changelog=changelog,
        author_user_id=actor.id,
        is_current=True,
    )
    db.add(version)
    document.updated_at = utcnow()
    write_audit(
        db,
        module="documents",
        action="document_version_added",
        actor=actor,
        entity_type="document",
        entity_id=str(document.id),
        entity_label=document.title,
        after={"version": version.version_number, "filename": filename, "size": size},
        request=request,
    )
    db.commit()
    db.refresh(document)
    return _document_detail(document)


def get_version(db: Session, version_id: UUID) -> DocumentVersion:
    version = db.get(DocumentVersion, version_id)
    if version is None:
        raise NotFoundError("Version de document introuvable.")
    return version


def resolve_version_path(version: DocumentVersion) -> Path:
    base = Path(settings.upload_dir).resolve()
    candidate = (base / version.storage_key).resolve()
    if base not in candidate.parents:
        raise ValidationAppError("Chemin de document invalide.")
    if not candidate.is_file():
        raise NotFoundError("Fichier introuvable sur le disque.")
    return candidate
