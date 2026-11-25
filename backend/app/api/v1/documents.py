from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.core.errors import PermissionDeniedError
from app.core.permissions import has_permission
from app.db.session import get_db
from app.models.auth import User
from app.schemas.document_ai import (
    DocumentAnalysisRead,
    DocumentIntegrationRead,
    DocumentIntegrationRequest,
)
from app.schemas.documents import (
    DocumentCategoryRead,
    DocumentCreate,
    DocumentDetailRead,
    DocumentRead,
    DocumentUpdate,
    DocumentVersionRead,
)
from app.services import document_ai_service, documents_service

router = APIRouter(prefix="/documents", tags=["Documentation"])


@router.get("/meta", response_model=list[DocumentCategoryRead])
def document_categories(
    _: User = Depends(require_permission("documents.read")),
    db: Session = Depends(get_db),
):
    return documents_service.list_categories(db)


@router.post("/analyze", response_model=DocumentAnalysisRead)
async def analyze_document(
    file: UploadFile = File(...),
    actor: User = Depends(require_permission("documents.create")),
    db: Session = Depends(get_db),
) -> DocumentAnalysisRead:
    if not has_permission(actor, "ai.use"):
        raise PermissionDeniedError("Vous ne pouvez pas utiliser l'assistant IA.")
    content = await file.read()
    return document_ai_service.analyze(
        db,
        content=content,
        filename=file.filename or "document",
        mime_type=file.content_type or "application/octet-stream",
        actor=actor,
    )


@router.post("/intake/{token}/integrate", response_model=DocumentIntegrationRead)
def integrate_document(
    token: str,
    payload: DocumentIntegrationRequest,
    request: Request,
    actor: User = Depends(require_permission("documents.create")),
    db: Session = Depends(get_db),
) -> DocumentIntegrationRead:
    return document_ai_service.integrate(
        db, token, payload, actor=actor, request=request
    )


@router.get("", response_model=list[DocumentRead])
def list_documents(
    q: str | None = Query(None, max_length=120),
    category_id: UUID | None = None,
    status: str | None = Query(None, max_length=20),
    _: User = Depends(require_permission("documents.read")),
    db: Session = Depends(get_db),
):
    return documents_service.list_documents(
        db, q=q, category_id=category_id, status=status
    )


@router.post("", response_model=DocumentDetailRead, status_code=201)
def create_document(
    payload: DocumentCreate,
    request: Request,
    actor: User = Depends(require_permission("documents.create")),
    db: Session = Depends(get_db),
):
    return documents_service.create_document(db, payload, actor=actor, request=request)


@router.get("/versions/{version_id}/download")
def download_version(
    version_id: UUID,
    _: User = Depends(require_permission("documents.download")),
    db: Session = Depends(get_db),
):
    version = documents_service.get_version(db, version_id)
    path = documents_service.resolve_version_path(version)
    return FileResponse(
        path,
        media_type=version.mime_type,
        filename=version.filename,
        headers={"Cache-Control": "no-store"},
    )


@router.get("/{document_id}", response_model=DocumentDetailRead)
def get_document(
    document_id: UUID,
    _: User = Depends(require_permission("documents.read")),
    db: Session = Depends(get_db),
):
    return documents_service.get_document_detail(db, document_id)


@router.patch("/{document_id}", response_model=DocumentDetailRead)
def update_document(
    document_id: UUID,
    payload: DocumentUpdate,
    request: Request,
    actor: User = Depends(require_permission("documents.update")),
    db: Session = Depends(get_db),
):
    document = documents_service.get_document(db, document_id)
    return documents_service.update_document(
        db, document, payload, actor=actor, request=request
    )


@router.delete("/{document_id}", response_model=DocumentDetailRead)
def archive_document(
    document_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("documents.delete")),
    db: Session = Depends(get_db),
):
    document = documents_service.get_document(db, document_id)
    return documents_service.archive_document(
        db, document, actor=actor, request=request
    )


@router.get("/{document_id}/versions", response_model=list[DocumentVersionRead])
def list_versions(
    document_id: UUID,
    _: User = Depends(require_permission("documents.read")),
    db: Session = Depends(get_db),
):
    document = documents_service.get_document(db, document_id)
    return [
        DocumentVersionRead.model_validate(version)
        for version in sorted(document.versions, key=lambda item: item.version_number, reverse=True)
    ]


@router.post(
    "/{document_id}/versions",
    response_model=DocumentDetailRead,
    status_code=201,
)
def upload_version(
    document_id: UUID,
    request: Request,
    file: UploadFile = File(...),
    changelog: str | None = Form(None),
    actor: User = Depends(require_permission("documents.create")),
    db: Session = Depends(get_db),
):
    document = documents_service.get_document(db, document_id)
    return documents_service.save_version(
        db, document, file, changelog=changelog, actor=actor, request=request
    )
