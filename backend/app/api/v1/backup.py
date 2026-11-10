import json
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.core.errors import ValidationAppError
from app.db.session import get_db
from app.models.auth import User
from app.schemas.backup import (
    BackupStatusRead,
    ConfigImportResult,
    RestoreResult,
)
from app.services import backup_service

router = APIRouter(prefix="/admin/backup", tags=["Sauvegarde"])


@router.get("/status", response_model=BackupStatusRead)
def get_status(
    _: User = Depends(require_permission("admin.backup.manage")),
    db: Session = Depends(get_db),
) -> BackupStatusRead:
    return backup_service.status(db)


@router.get("/config")
def export_config(
    _: User = Depends(require_permission("admin.backup.manage")),
    db: Session = Depends(get_db),
) -> Response:
    payload = backup_service.create_config_export(db)
    filename = f"si-pilot-config-{datetime.now(UTC):%Y%m%d-%H%M%S}.json"
    return Response(
        content=json.dumps(payload, ensure_ascii=False, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/config", response_model=ConfigImportResult)
def import_config(
    request: Request,
    file: UploadFile = File(...),
    actor: User = Depends(require_permission("admin.backup.manage")),
    db: Session = Depends(get_db),
) -> ConfigImportResult:
    try:
        payload = json.loads(file.file.read().decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValidationAppError("Le fichier de configuration est illisible.") from exc
    return backup_service.import_config(db, payload, actor=actor, request=request)


@router.get("/database")
def download_database(
    _: User = Depends(require_permission("admin.backup.manage")),
) -> FileResponse:
    path = backup_service.create_database_dump()
    return FileResponse(
        path,
        filename=path.name,
        media_type="application/octet-stream",
    )


@router.get("/full")
def download_full(
    include_uploads: bool = True,
    _: User = Depends(require_permission("admin.backup.manage")),
    db: Session = Depends(get_db),
) -> FileResponse:
    path = backup_service.create_full_archive(db, include_uploads=include_uploads)
    return FileResponse(
        path,
        filename=path.name,
        media_type="application/zip",
    )


@router.post("/restore", response_model=RestoreResult)
async def restore_database(
    request: Request,
    file: UploadFile = File(...),
    confirmation: str = Form(...),
    actor: User = Depends(require_permission("admin.backup.manage")),
    db: Session = Depends(get_db),
) -> RestoreResult:
    if confirmation.strip().upper() != "RESTAURER":
        raise ValidationAppError(
            "Saisissez RESTAURER pour confirmer la restauration de la base."
        )
    if file.size and file.size > 512 * 1024 * 1024:
        raise ValidationAppError("Le fichier de restauration dépasse 512 Mo.")
    content = await file.read()
    return backup_service.restore_database(
        db,
        content=content,
        filename=file.filename or "backup.dump",
        actor=actor,
        request=request,
    )
