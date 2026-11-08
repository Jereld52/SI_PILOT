from __future__ import annotations

import io
import re
from pathlib import Path
from typing import TYPE_CHECKING
from urllib.parse import quote

from app.core.config import settings
from app.core.errors import ValidationAppError
from app.db.base import utcnow
from app.models.auth import User
from app.schemas.branding import BrandingRead, BrandingUpdate
from app.services import settings_service
from app.services.audit_service import write_audit
from fastapi import Request
from PIL import Image, UnidentifiedImageError
from sqlalchemy.orm import Session

if TYPE_CHECKING:
    from app.exports.pdf_utils import PdfBranding

DEFAULT_APP_NAME = "SI PILOT"
DEFAULT_ORGANIZATION = "Votre structure"
DEFAULT_TAGLINE = "Cockpit du système d'information"
DEFAULT_DESCRIPTION = (
    "Centralisez votre parc, vos demandes, vos contrats, votre budget, vos projets "
    "et votre sécurité dans un outil unique."
)
DEFAULT_PRIMARY_COLOR = "#772B2F"
LOGO_MAX_BYTES = 4 * 1024 * 1024
LOGO_MAX_PIXELS = 20_000_000
HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


def packaged_logo_path() -> Path:
    return Path(__file__).resolve().parents[1] / "exports" / "assets" / "si-pilot-logo.png"


def custom_logo_path(db: Session) -> Path | None:
    filename = settings_service.get_value(db, "app.logo_filename")
    if not filename:
        return None
    base = Path(settings.upload_dir).resolve()
    candidate = (base / str(filename)).resolve()
    if base not in candidate.parents or not candidate.is_file():
        return None
    return candidate


def logo_path(db: Session) -> Path | None:
    custom = custom_logo_path(db)
    if custom is not None:
        return custom
    fallback = packaged_logo_path()
    return fallback if fallback.is_file() else None


def _text(db: Session, key: str, default: str, *, allow_empty: bool = False) -> str:
    value = settings_service.get_value(db, key, default)
    if value is None:
        return default
    text = str(value).strip()
    return text if text or allow_empty else default


def get_branding(db: Session) -> BrandingRead:
    custom = custom_logo_path(db)
    version = settings_service.get_value(db, "app.logo_version")
    version_text = str(version) if version else None
    color = _text(db, "app.primary_color", DEFAULT_PRIMARY_COLOR)
    if not HEX_COLOR.fullmatch(color):
        color = DEFAULT_PRIMARY_COLOR
    support_email = settings_service.get_value(db, "app.support_email")
    logo_url = "/si-pilot-logo.png"
    if custom is not None:
        suffix = f"?v={quote(version_text)}" if version_text else ""
        logo_url = f"{settings.api_prefix}/branding/logo{suffix}"
    return BrandingRead(
        app_name=_text(db, "app.name", DEFAULT_APP_NAME),
        organization_name=_text(db, "app.organization", DEFAULT_ORGANIZATION),
        tagline=_text(db, "app.tagline", DEFAULT_TAGLINE, allow_empty=True),
        description=_text(db, "app.description", DEFAULT_DESCRIPTION, allow_empty=True),
        support_email=(str(support_email).strip() or None) if support_email else None,
        primary_color=color.lower(),
        logo_url=logo_url,
        logo_custom=custom is not None,
        logo_updated_at=version_text,
        version=settings.app_version,
    )


def update_branding(
    db: Session,
    payload: BrandingUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> BrandingRead:
    before = get_branding(db).model_dump()
    previous_from_name = str(settings_service.get_value(db, "smtp.from_name", "") or "")
    values = {
        "app.name": payload.app_name,
        "app.organization": payload.organization_name,
        "app.tagline": payload.tagline,
        "app.description": payload.description,
        "app.support_email": str(payload.support_email) if payload.support_email else None,
        "app.primary_color": payload.primary_color,
    }
    descriptions = {
        "app.name": "Nom affiché de l'application",
        "app.organization": "Nom de la structure ou de l'organisation",
        "app.tagline": "Accroche affichée sur l'écran de connexion",
        "app.description": "Description courte de l'application",
        "app.support_email": "Adresse de contact affichée aux utilisateurs",
        "app.primary_color": "Couleur principale de l'interface et des exports",
    }
    for key, value in values.items():
        settings_service.set_value(
            db,
            key,
            value,
            category="general",
            description=descriptions[key],
        )
    if not previous_from_name or previous_from_name == before["app_name"]:
        settings_service.set_value(
            db,
            "smtp.from_name",
            payload.app_name,
            category="notifications",
            description="Nom de l'expéditeur",
        )
    write_audit(
        db,
        module="admin",
        action="branding_updated",
        actor=actor,
        entity_type="setting",
        entity_id="branding",
        entity_label="Identité de l'application",
        before=before,
        after={**values, "smtp.from_name": settings_service.get_value(db, "smtp.from_name")},
        request=request,
    )
    db.commit()
    return get_branding(db)


def prepare_logo(content: bytes) -> Image.Image:
    if not content:
        raise ValidationAppError("Le fichier du logo est vide.")
    if len(content) > LOGO_MAX_BYTES:
        raise ValidationAppError("Le logo ne doit pas dépasser 4 Mo.")
    try:
        image = Image.open(io.BytesIO(content))
    except (
        UnidentifiedImageError,
        Image.DecompressionBombError,
        OSError,
        ValueError,
    ) as exc:
        raise ValidationAppError("Le fichier fourni n'est pas une image valide.") from exc
    image_format = (image.format or "").upper()
    if image_format not in {"PNG", "JPEG", "WEBP"}:
        raise ValidationAppError("Formats acceptés : PNG, JPEG ou WEBP.")
    if image.width < 32 or image.height < 32:
        raise ValidationAppError("Le logo doit mesurer au moins 32 × 32 pixels.")
    if image.width * image.height > LOGO_MAX_PIXELS:
        raise ValidationAppError("Les dimensions du logo sont trop importantes.")
    try:
        image.load()
    except (OSError, ValueError) as exc:
        raise ValidationAppError("Le fichier fourni n'est pas une image valide.") from exc
    try:
        has_alpha = image.mode in {"RGBA", "LA", "PA"} or "transparency" in image.info
        return image.convert("RGBA") if has_alpha else image.convert("RGB")
    except (OSError, ValueError) as exc:
        raise ValidationAppError("Le logo ne peut pas être converti.") from exc


def store_logo(image: Image.Image) -> tuple[str, str]:
    base = Path(settings.upload_dir).resolve()
    target_dir = base / "branding"
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / "logo.png"
    temporary = target_dir / "logo.tmp.png"
    try:
        image.save(temporary, format="PNG", optimize=True)
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)
    return "branding/logo.png", utcnow().isoformat()


def save_logo(
    db: Session,
    *,
    content: bytes,
    original_name: str,
    actor: User,
    request: Request | None = None,
) -> BrandingRead:
    image = prepare_logo(content)
    filename, version = store_logo(image)
    previous = settings_service.get_value(db, "app.logo_filename")
    settings_service.set_value(
        db,
        "app.logo_filename",
        filename,
        category="general",
        description="Logo personnalisé de l'application",
    )
    settings_service.set_value(
        db,
        "app.logo_version",
        version,
        category="general",
        description="Version technique du logo personnalisé",
    )
    write_audit(
        db,
        module="admin",
        action="branding_logo_updated",
        actor=actor,
        entity_type="setting",
        entity_id="branding_logo",
        entity_label="Logo de l'application",
        before={"filename": previous},
        after={
            "filename": "branding/logo.png",
            "original_name": original_name,
            "width": image.width,
            "height": image.height,
            "size_bytes": len(content),
        },
        request=request,
    )
    db.commit()
    return get_branding(db)


def delete_logo(
    db: Session,
    *,
    actor: User,
    request: Request | None = None,
) -> BrandingRead:
    path = custom_logo_path(db)
    if path is not None:
        path.unlink(missing_ok=True)
    previous = settings_service.get_value(db, "app.logo_filename")
    settings_service.set_value(
        db,
        "app.logo_filename",
        None,
        category="general",
        description="Logo personnalisé de l'application",
    )
    settings_service.set_value(
        db,
        "app.logo_version",
        None,
        category="general",
        description="Version technique du logo personnalisé",
    )
    write_audit(
        db,
        module="admin",
        action="branding_logo_deleted",
        actor=actor,
        entity_type="setting",
        entity_id="branding_logo",
        entity_label="Logo de l'application",
        before={"filename": previous},
        after={"filename": None},
        request=request,
    )
    db.commit()
    return get_branding(db)


def get_pdf_branding(db: Session) -> PdfBranding:
    from app.exports.pdf_utils import PdfBranding

    branding = get_branding(db)
    return PdfBranding(
        app_name=branding.app_name,
        organization_name=branding.organization_name,
        logo_path=logo_path(db),
        primary_color=branding.primary_color,
    )
