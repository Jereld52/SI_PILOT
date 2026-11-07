from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.core.errors import PermissionDeniedError
from app.core.permissions import has_permission
from app.db.session import get_db
from app.exports import assets as assets_export
from app.exports import mobile as mobile_export
from app.models.auth import User
from app.services import assets_service, mobile_service
from app.services.audit_service import write_audit

router = APIRouter(prefix="/exports", tags=["Exports"])


def _filename(prefix: str, extension: str) -> str:
    return f"{prefix}-{datetime.now().strftime('%Y%m%d-%H%M%S')}.{extension}"


@router.get("/assets")
def export_assets(
    request: Request,
    format: Literal["xlsx", "pdf"] = Query("xlsx"),
    actor: User = Depends(require_permission("exports.run")),
    db: Session = Depends(get_db),
):
    if not has_permission(actor, "assets.read"):
        raise PermissionDeniedError("Vous ne pouvez pas exporter le parc.")
    assets = assets_service.list_assets(db, include_archived=False)
    content = assets_export.assets_xlsx(assets) if format == "xlsx" else assets_export.assets_pdf(assets)
    media_type = (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        if format == "xlsx"
        else "application/pdf"
    )
    write_audit(
        db,
        module="exports",
        action="assets_exported",
        actor=actor,
        entity_type="export",
        entity_label=f"parc.{format}",
        after={"count": len(assets), "format": format},
        request=request,
    )
    db.commit()
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{_filename("parc-informatique", format)}"'},
    )


@router.get("/mobile-lines")
def export_mobile_lines(
    request: Request,
    format: Literal["xlsx", "pdf"] = Query("xlsx"),
    actor: User = Depends(require_permission("exports.run")),
    db: Session = Depends(get_db),
):
    if not has_permission(actor, "mobile_lines.read"):
        raise PermissionDeniedError("Vous ne pouvez pas exporter les lignes mobiles.")
    lines = mobile_service.list_mobile_lines(db)
    content = mobile_export.mobile_lines_xlsx(lines) if format == "xlsx" else mobile_export.mobile_lines_pdf(lines)
    media_type = (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        if format == "xlsx"
        else "application/pdf"
    )
    write_audit(
        db,
        module="exports",
        action="mobile_lines_exported",
        actor=actor,
        entity_type="export",
        entity_label=f"mobile-lines.{format}",
        after={"count": len(lines), "format": format},
        request=request,
    )
    db.commit()
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{_filename("lignes-mobiles", format)}"'},
    )
