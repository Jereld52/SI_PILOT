from __future__ import annotations

from app.core.config import settings
from app.core.errors import ConflictError, ValidationAppError
from app.core.security import hash_password, validate_password_strength
from app.db.session import check_database
from app.models.auth import Role, User
from app.schemas.branding import BrandingUpdate
from app.schemas.setup import SetupStatus
from app.seed.reference_data import seed_reference_data
from app.services import branding_service, settings_service
from app.services.audit_service import write_audit
from fastapi import Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session


def _admin_count(db: Session) -> int:
    return int(
        db.scalar(
            select(func.count())
            .select_from(User)
            .join(Role, User.role_id == Role.id)
            .where(Role.code == "admin", User.is_active.is_(True))
        )
        or 0
    )


def get_status(db: Session) -> SetupStatus:
    branding = branding_service.get_branding(db)
    count = _admin_count(db)
    return SetupStatus(
        needs_setup=count == 0,
        has_admin=count > 0,
        database="ok" if check_database() else "unavailable",
        app_name=branding.app_name,
        organization_name=branding.organization_name,
        version=settings.app_version,
    )


def initialize(
    db: Session,
    *,
    app_name: str,
    organization_name: str,
    tagline: str,
    description: str,
    primary_color: str,
    support_email: str | None,
    first_name: str,
    last_name: str,
    email: str,
    password: str,
    logo_content: bytes | None = None,
    logo_name: str | None = None,
    request: Request | None = None,
) -> User:
    if _admin_count(db) > 0:
        raise ConflictError("L'application est déjà initialisée.")

    try:
        branding = BrandingUpdate(
            app_name=app_name,
            organization_name=organization_name,
            tagline=tagline,
            description=description,
            support_email=support_email or None,
            primary_color=primary_color,
        )
    except ValueError as exc:
        raise ValidationAppError("Les informations de la structure sont invalides.") from exc

    first = first_name.strip()
    last = last_name.strip()
    normalized_email = email.strip().lower()
    if not first or not last:
        raise ValidationAppError("Le prénom et le nom de l'administrateur sont obligatoires.")
    if not normalized_email:
        raise ValidationAppError("L'adresse e-mail de l'administrateur est obligatoire.")
    password_errors = validate_password_strength(password)
    if password_errors:
        raise ValidationAppError(
            "Mot de passe trop faible.",
            code="WEAK_PASSWORD",
            fields=[{"field": "password", "message": error} for error in password_errors],
        )

    role = db.scalar(select(Role).where(Role.code == "admin"))
    if role is None:
        seed_reference_data(db)
        role = db.scalar(select(Role).where(Role.code == "admin"))
    if role is None:
        raise ValidationAppError("Le rôle administrateur est introuvable.")

    existing = db.scalar(select(User).where(func.lower(User.email) == normalized_email))
    if existing is not None:
        raise ConflictError("Un compte utilise déjà cette adresse e-mail.")

    logo_image = (
        branding_service.prepare_logo(logo_content) if logo_content is not None else None
    )
    logo_filename: str | None = None
    logo_version: str | None = None
    if logo_image is not None:
        logo_filename, logo_version = branding_service.store_logo(logo_image)

    try:
        user = User(
            email=normalized_email,
            password_hash=hash_password(password),
            first_name=first,
            last_name=last,
            role_id=role.id,
            data_scope="all",
            is_active=True,
            must_change_password=False,
        )
        db.add(user)
        db.flush()

        values = {
            "app.name": branding.app_name,
            "app.organization": branding.organization_name,
            "app.tagline": branding.tagline,
            "app.description": branding.description,
            "app.support_email": str(branding.support_email) if branding.support_email else None,
            "app.primary_color": branding.primary_color,
            "smtp.from_name": branding.app_name,
        }
        descriptions = {
            "app.name": "Nom affiché de l'application",
            "app.organization": "Nom de la structure ou de l'organisation",
            "app.tagline": "Accroche affichée sur l'écran de connexion",
            "app.description": "Description courte de l'application",
            "app.support_email": "Adresse de contact affichée aux utilisateurs",
            "app.primary_color": "Couleur principale de l'interface et des exports",
            "smtp.from_name": "Nom de l'expéditeur",
        }
        for key, value in values.items():
            settings_service.set_value(
                db,
                key,
                value,
                category="notifications" if key.startswith("smtp.") else "general",
                description=descriptions[key],
            )
        if logo_filename and logo_version:
            settings_service.set_value(
                db,
                "app.logo_filename",
                logo_filename,
                category="general",
                description="Logo personnalisé de l'application",
            )
            settings_service.set_value(
                db,
                "app.logo_version",
                logo_version,
                category="general",
                description="Version technique du logo personnalisé",
            )

        write_audit(
            db,
            module="admin",
            action="setup_completed",
            actor=user,
            entity_type="application",
            entity_id="setup",
            entity_label="Première installation",
            after={
                "app_name": branding.app_name,
                "organization_name": branding.organization_name,
                "admin_email": normalized_email,
                "logo": bool(logo_filename),
                "logo_name": logo_name if logo_filename else None,
                "support_email": values["app.support_email"],
            },
            request=request,
        )
        db.commit()
        db.refresh(user)
        return user
    except Exception:
        db.rollback()
        raise
