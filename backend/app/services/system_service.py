from __future__ import annotations

import platform
import shutil
import sys
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from alembic.config import Config
from alembic.script import ScriptDirectory
from app.core.config import settings
from app.db.session import check_database
from app.models.assets import Asset
from app.models.audit import AuditLog
from app.models.auth import User
from app.models.automation import EmailOutbox
from app.models.infrastructure import InfraEquipment
from app.models.organization import Agent
from app.models.reservations import EquipmentReservation
from app.models.tickets import Ticket, TicketStatus
from app.services import (
    branding_service,
    email_service,
    ldap_service,
    wapt_service,
)
from sqlalchemy import func, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

APP_STARTED_AT = datetime.now(UTC)
BACKEND_ROOT = Path(__file__).resolve().parents[2]
PROJECT_ROOT = BACKEND_ROOT.parent


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return (value if value.tzinfo else value.replace(tzinfo=UTC)).isoformat()


def _count(db: Session, model: Any) -> int:
    return int(db.scalar(select(func.count()).select_from(model)) or 0)


def _database_size(db: Session) -> int | None:
    try:
        dialect = db.get_bind().dialect.name
        if dialect == "postgresql":
            return int(db.scalar(text("SELECT pg_database_size(current_database())")) or 0)
        if dialect == "sqlite":
            pages = int(db.scalar(text("PRAGMA page_count")) or 0)
            size = int(db.scalar(text("PRAGMA page_size")) or 0)
            return pages * size
    except Exception:  # noqa: BLE001 - diagnostic non bloquant
        return None
    return None


def _alembic_state(db: Session) -> tuple[str | None, str | None]:
    current: str | None = None
    head: str | None = None
    try:
        current = db.scalar(text("SELECT version_num FROM alembic_version"))
    except Exception:  # noqa: BLE001 - diagnostic non bloquant
        current = None
    try:
        config = Config(str(BACKEND_ROOT / "alembic.ini"))
        config.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
        head = ScriptDirectory.from_config(config).get_current_head()
    except Exception:  # noqa: BLE001 - diagnostic non bloquant
        head = None
    return current, head


def _directory_state(path: Path) -> dict[str, Any]:
    exists = path.is_dir()
    writable = False
    total_bytes: int | None = None
    free_bytes: int | None = None
    used_bytes: int | None = None
    if exists:
        try:
            with tempfile.NamedTemporaryFile(dir=path, delete=True):
                writable = True
        except OSError:
            writable = False
        try:
            usage = shutil.disk_usage(path)
            total_bytes = usage.total
            free_bytes = usage.free
            used_bytes = usage.used
        except OSError:
            pass
    return {
        "path": str(path),
        "exists": exists,
        "writable": writable,
        "total_bytes": total_bytes,
        "free_bytes": free_bytes,
        "used_bytes": used_bytes,
    }


def _tree_size(path: Path) -> int | None:
    if not path.is_dir():
        return None
    total = 0
    try:
        for item in path.rglob("*"):
            if item.is_file():
                total += item.stat().st_size
    except OSError:
        return None
    return total


def _last_audit(db: Session, action: str) -> str | None:
    row = db.scalar(
        select(AuditLog)
        .where(AuditLog.action == action)
        .order_by(AuditLog.occurred_at.desc())
        .limit(1)
    )
    return _iso(row.occurred_at) if row else None


def _backup_state() -> dict[str, Any]:
    directory = PROJECT_ROOT / ".runtime" / "backups"
    files = sorted(
        directory.glob("*.dump"),
        key=lambda item: item.stat().st_mtime,
        reverse=True,
    ) if directory.is_dir() else []
    latest = files[0] if files else None
    latest_at = (
        datetime.fromtimestamp(latest.stat().st_mtime, tz=UTC).isoformat()
        if latest
        else None
    )
    return {
        "directory": str(directory),
        "count": len(files),
        "last_backup_at": latest_at,
        "last_backup_name": latest.name if latest else None,
        "last_backup_size": latest.stat().st_size if latest else None,
    }


def get_diagnostics(db: Session) -> dict[str, Any]:
    branding = branding_service.get_branding(db)
    current, head = _alembic_state(db)
    database_ok = check_database()
    upload_dir = Path(settings.upload_dir).resolve()
    storage = _directory_state(upload_dir)
    storage["uploads_bytes"] = _tree_size(upload_dir)

    smtp = email_service.get_settings(db)
    last_email = db.scalar(
        select(EmailOutbox).order_by(EmailOutbox.scheduled_at.desc()).limit(1)
    )
    wapt = wapt_service.get_settings(db)
    ldap = ldap_service.get_config(db)
    backup = _backup_state()

    checks: list[dict[str, str]] = []
    checks.append(
        {
            "key": "database",
            "label": "Base de données",
            "status": "ok" if database_ok else "error",
            "detail": "Connexion disponible." if database_ok else "Connexion impossible.",
        }
    )
    checks.append(
        {
            "key": "migrations",
            "label": "Migrations",
            "status": "ok" if current and head and current == head else "warning",
            "detail": (
                f"Schéma à jour ({current})."
                if current and head and current == head
                else f"Version {current or 'inconnue'} / attendue {head or 'inconnue'}."
            ),
        }
    )
    checks.append(
        {
            "key": "storage",
            "label": "Stockage",
            "status": "ok" if storage["exists"] and storage["writable"] else "error",
            "detail": (
                "Répertoire accessible en écriture."
                if storage["exists"] and storage["writable"]
                else "Répertoire absent ou non accessible en écriture."
            ),
        }
    )
    checks.append(
        {
            "key": "environment",
            "label": "Environnement",
            "status": "ok" if settings.app_env == "production" else "info",
            "detail": f"Mode {settings.app_env}.",
        }
    )
    checks.append(
        {
            "key": "debug",
            "label": "Mode debug",
            "status": "ok" if not settings.debug else "warning",
            "detail": "Désactivé." if not settings.debug else "Le mode debug est actif.",
        }
    )
    checks.append(
        {
            "key": "secure_cookies",
            "label": "Cookies sécurisés",
            "status": "ok" if settings.secure_cookies else "warning",
            "detail": (
                "Cookies marqués Secure."
                if settings.secure_cookies
                else "Cookies non marqués Secure : à activer derrière HTTPS."
            ),
        }
    )
    checks.append(
        {
            "key": "backup",
            "label": "Sauvegarde",
            "status": "ok" if backup["last_backup_at"] else "warning",
            "detail": (
                f"Dernière sauvegarde : {backup['last_backup_at']}."
                if backup["last_backup_at"]
                else "Aucune sauvegarde détectée dans .runtime/backups."
            ),
        }
    )
    checks.append(
        {
            "key": "mfa",
            "label": "Authentification multifacteur",
            "status": "warning",
            "detail": "MFA TOTP non encore disponible pour les comptes administrateurs.",
        }
    )

    warnings = [
        f"{check['label']} : {check['detail']}"
        for check in checks
        if check["status"] in {"warning", "error"}
    ]

    return {
        "generated_at": datetime.now(UTC).isoformat(),
        "application": {
            "name": branding.app_name,
            "organization_name": branding.organization_name,
            "version": settings.app_version,
            "environment": settings.app_env,
            "python": sys.version.split()[0],
            "platform": platform.platform(),
            "started_at": APP_STARTED_AT.isoformat(),
            "frontend_served": settings.serve_frontend,
            "frontend_dist": str(Path(settings.frontend_dist).resolve()),
        },
        "database": {
            "status": "ok" if database_ok else "error",
            "dialect": db.get_bind().dialect.name,
            "size_bytes": _database_size(db),
            "migration_current": current,
            "migration_head": head,
            "migration_up_to_date": bool(current and head and current == head),
        },
        "storage": storage,
        "smtp": {
            "configured": smtp.configured,
            "enabled": smtp.email_enabled,
            "from_email": smtp.from_email,
            "last_status": last_email.status if last_email else None,
            "last_sent_at": _iso(last_email.sent_at) if last_email else None,
            "last_error": last_email.error if last_email else None,
        },
        "wapt": {
            "configured": bool(wapt.base_url),
            "enabled": wapt.enabled,
            "base_url": wapt.base_url,
            "last_sync_at": _last_audit(db, "wapt_inventory_synced"),
        },
        "ldap": {
            "configured": bool(ldap.url and ldap.base_dn),
            "enabled": ldap.enabled,
            "url": ldap.url,
            "last_sync_at": _last_audit(db, "ldap_sync_applied"),
        },
        "backup": backup,
        "security": {"checks": checks},
        "counts": {
            "users": _count(db, User),
            "agents": _count(db, Agent),
            "assets": _count(db, Asset),
            "infrastructure": _count(db, InfraEquipment),
            "tickets": _count(db, Ticket),
            "open_tickets": int(
                db.scalar(
                    select(func.count())
                    .select_from(Ticket)
                    .join(TicketStatus, Ticket.status_id == TicketStatus.id)
                    .where(TicketStatus.is_closed.is_(False))
                )
                or 0
            ),
            "upcoming_reservations": int(
                db.scalar(
                    select(func.count())
                    .select_from(EquipmentReservation)
                    .where(
                        EquipmentReservation.start_at >= datetime.now(UTC),
                        EquipmentReservation.status != "cancelled",
                    )
                )
                or 0
            ),
        },
        "warnings": warnings,
    }


def get_about(db: Session) -> dict[str, Any]:
    current, head = _alembic_state(db)
    branding = branding_service.get_branding(db)
    try:
        database_url = make_url(settings.database_url).render_as_string(hide_password=True)
    except Exception:  # noqa: BLE001 - diagnostic non bloquant
        database_url = "indisponible"
    return {
        "name": branding.app_name,
        "organization_name": branding.organization_name,
        "version": settings.app_version,
        "environment": settings.app_env,
        "python": sys.version.split()[0],
        "platform": platform.platform(),
        "started_at": APP_STARTED_AT.isoformat(),
        "database_url": database_url,
        "upload_dir": str(Path(settings.upload_dir).resolve()),
        "migration_current": current,
        "migration_head": head,
        "update_steps": [
            "Sauvegarder la base de données et le répertoire des fichiers.",
            "Arrêter l'application et récupérer la nouvelle version.",
            "Mettre à jour les dépendances Python et frontend.",
            "Exécuter alembic upgrade head.",
            "Reconstruire le frontend puis redémarrer l'application.",
            "Vérifier la page Diagnostic et les parcours principaux.",
        ],
        "documentation": [
            {"label": "Installation Windows", "path": "docs/INSTALL_WINDOWS.md"},
            {"label": "Sauvegarde et restauration", "path": "docs/BACKUP_RESTORE.md"},
            {"label": "Sécurité", "path": "docs/SECURITY.md"},
            {"label": "Architecture", "path": "docs/ARCHITECTURE.md"},
            {"label": "Charte et personnalisation", "path": "docs/BRANDING.md"},
        ],
    }
