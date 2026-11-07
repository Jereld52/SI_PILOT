from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.db.session import get_db
from app.models.auth import User
from app.schemas.imports import ImportApplyResponse, ImportJobRead, ImportPreviewResponse
from app.services import import_service

router = APIRouter(prefix="/imports", tags=["Imports"])


@router.get("/templates/{entity_type}")
def download_template(
    entity_type: str,
    _: User = Depends(require_permission("imports.preview")),
):
    content = import_service.template_csv(entity_type)
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="modele-{entity_type}.csv"',
            "Cache-Control": "no-store",
        },
    )


@router.post("/preview", response_model=ImportPreviewResponse)
async def preview_import(
    request: Request,
    entity_type: str = Form(...),
    file: UploadFile = File(...),
    actor: User = Depends(require_permission("imports.preview")),
    db: Session = Depends(get_db),
):
    content = await file.read()
    return import_service.preview_import(
        db,
        entity_type=entity_type,
        filename=file.filename or "import.csv",
        content=content,
        actor=actor,
        request=request,
    )


@router.get("", response_model=list[ImportJobRead])
def list_imports(
    _: User = Depends(require_permission("imports.preview")),
    db: Session = Depends(get_db),
):
    return import_service.list_import_jobs(db)


@router.get("/{job_id}", response_model=ImportJobRead)
def get_import(
    job_id: UUID,
    _: User = Depends(require_permission("imports.preview")),
    db: Session = Depends(get_db),
):
    return import_service.get_import_job(db, job_id)


@router.post("/{job_id}/apply", response_model=ImportApplyResponse)
def apply_import(
    job_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("imports.apply")),
    db: Session = Depends(get_db),
):
    return import_service.apply_import(db, job_id=job_id, actor=actor, request=request)
