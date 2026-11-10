from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import zipfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.core.errors import ValidationAppError
from app.models.auth import User
from app.models.setting import Setting
from app.schemas.backup import (
    BackupFileRead,
    BackupStatusRead,
    ConfigImportResult,
    RestoreResult,
)
from app.services.audit_service import write_audit
from fastapi import Request
from sqlalchemy import select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

BACKEND_ROOT = Path(__file__).resolve().parents[2]
PROJECT_ROOT = BACKEND_ROOT.parent
BACKUP_DIR = PROJECT_ROOT / ".runtime" / "backups"


def _pg_bin_dir() -> Path | None:
    candidates = [
        Path(os.environ["PG_BIN_DIR"]) if os.environ.get("PG_BIN_DIR") else None,
        PROJECT_ROOT / ".runtime" / "pgsql" / "bin",
    ]
    for candidate in candidates:
        if candidate and (candidate / "pg_dump.exe").is_file():
            return candidate
        if candidate and (candidate / "pg_dump").is_file():
            return candidate
    found = shutil.which("pg_dump")
    return Path(found).parent if found else None


def _pg_tool(name: str) -> Path | None:
    binary = _pg_bin_dir()
    if binary is None:
        return None
    suffix = ".exe" if os.name == "nt" else ""
    candidate = binary / f"{name}{suffix}"
    return candidate if candidate.is_file() else None


def _database_parts() -> dict[str, Any] | None:
    url = make_url(settings.database_url)
    if not url.drivername.startswith("postgresql"):
        return None
    return {
        "host": url.host or "127.0.0.1",
        "port": url.port or 5432,
        "username": url.username or "postgres",
        "password": url.password or "",
        "database": url.database or "postgres",
    }


def _pg_env(parts: dict[str, Any]) -> dict[str, str]:
    env = dict(os.environ)
    password = str(parts.get("password") or "")
    if not password:
        password_file = PROJECT_ROOT / ".runtime" / "pg_password.txt"
        if password_file.is_file():
            password = password_file.read_text(encoding="utf-8").strip()
    if password:
        env["PGPASSWORD"] = password
    env.setdefault("PGCLIENTENCODING", "UTF8")
    return env


def _uploads_dir() -> Path:
    configured = Path(settings.upload_dir)
    return (configured if configured.is_absolute() else BACKEND_ROOT / configured).resolve()


def _dir_size(directory: Path) -> int:
    if not directory.is_dir():
        return 0
    total = 0
    for item in directory.rglob("*"):
        if item.is_file():
            try:
                total += item.stat().st_size
            except OSError:
                continue
    return total


def _schema_revision(db: Session) -> str:
    try:
        value = db.scalar(text("SELECT version_num FROM alembic_version"))
        return str(value or "")
    except Exception:  # noqa: BLE001 - information de diagnostic
        return ""


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _stamp() -> str:
    return datetime.now(UTC).strftime("%Y%m%d-%H%M%S-%f")


def status(db: Session) -> BackupStatusRead:
    database = _database_parts()
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(
        BACKUP_DIR.glob("*"),
        key=lambda item: item.stat().st_mtime,
        reverse=True,
    )
    backups = [
        BackupFileRead(
            name=item.name,
            size=item.stat().st_size,
            created_at=datetime.fromtimestamp(item.stat().st_mtime, tz=UTC),
        )
        for item in files[:12]
        if item.is_file()
    ]
    latest = backups[0] if backups else None
    return BackupStatusRead(
        app_version=settings.app_version,
        schema_revision=_schema_revision(db),
        database_name=database["database"] if database else "",
        database_host=database["host"] if database else "",
        database_port=int(database["port"]) if database else None,
        dialect=make_url(settings.database_url).get_backend_name(),
        pg_dump_available=_pg_tool("pg_dump") is not None,
        pg_dump_path=str(_pg_tool("pg_dump") or ""),
        pg_restore_available=_pg_tool("pg_restore") is not None,
        pg_restore_path=str(_pg_tool("pg_restore") or ""),
        backup_directory=str(BACKUP_DIR),
        backup_count=len([item for item in files if item.is_file()]),
        last_backup_at=latest.created_at if latest else None,
        last_backup_name=latest.name if latest else None,
        last_backup_size=latest.size if latest else None,
        uploads_directory=str(_uploads_dir()),
        uploads_size=_dir_size(_uploads_dir()),
        backups=backups,
    )


def create_database_dump() -> Path:
    parts = _database_parts()
    if parts is None:
        raise ValidationAppError(
            "L'export de la base est disponible uniquement avec PostgreSQL."
        )
    tool = _pg_tool("pg_dump")
    if tool is None:
        raise ValidationAppError(
            "pg_dump est introuvable. Installez les outils PostgreSQL ou définissez "
            "PG_BIN_DIR vers le dossier bin de PostgreSQL."
        )
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    target = BACKUP_DIR / f"si-pilot-{_stamp()}.dump"
    command = [
        str(tool),
        "-h",
        str(parts["host"]),
        "-p",
        str(parts["port"]),
        "-U",
        str(parts["username"]),
        "-d",
        str(parts["database"]),
        "-Fc",
        "--no-owner",
        "--no-privileges",
        "-f",
        str(target),
    ]
    result = subprocess.run(
        command,
        capture_output=True,
        text=True,
        timeout=900,
        env=_pg_env(parts),
        check=False,
    )
    if result.returncode != 0 or not target.is_file():
        raise ValidationAppError(
            f"Échec de la sauvegarde PostgreSQL : {(result.stderr or result.stdout)[:500]}"
        )
    return target


def create_config_export(db: Session) -> dict[str, Any]:
    rows = db.scalars(select(Setting).order_by(Setting.key)).all()
    return {
        "format": "si-pilot-config",
        "version": 1,
        "exported_at": datetime.now(UTC).isoformat(),
        "app_version": settings.app_version,
        "schema_revision": _schema_revision(db),
        "secrets_mode": "encrypted",
        "settings": [
            {
                "key": row.key,
                "value_json": row.value_json,
                "category": row.category,
                "is_secret": row.is_secret,
                "description": row.description,
            }
            for row in rows
        ],
    }


def create_full_archive(
    db: Session, *, include_uploads: bool = True
) -> Path:
    dump_path = create_database_dump()
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    archive_path = BACKUP_DIR / f"si-pilot-full-{_stamp()}.zip"
    config = create_config_export(db)
    manifest = {
        "format": "si-pilot-backup",
        "version": 1,
        "created_at": datetime.now(UTC).isoformat(),
        "app_version": settings.app_version,
        "schema_revision": config["schema_revision"],
        "database_dump": dump_path.name,
        "database_sha256": _sha256(dump_path),
        "include_uploads": include_uploads,
    }
    try:
        with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.write(dump_path, "database.dump")
            archive.writestr(
                "config.json", json.dumps(config, ensure_ascii=False, indent=2)
            )
            archive.writestr(
                "manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2)
            )
            uploads = _uploads_dir()
            if include_uploads and uploads.is_dir():
                for item in uploads.rglob("*"):
                    if item.is_file():
                        archive.write(item, Path("uploads") / item.relative_to(uploads))
    finally:
        dump_path.unlink(missing_ok=True)
    return archive_path


def import_config(
    db: Session,
    payload: dict[str, Any],
    *,
    actor: User,
    request: Request | None = None,
) -> ConfigImportResult:
    if not isinstance(payload, dict) or not isinstance(payload.get("settings"), list):
        raise ValidationAppError("Le fichier ne contient pas de configuration SI PILOT valide.")
    imported = 0
    skipped = 0
    for item in payload["settings"]:
        if not isinstance(item, dict):
            skipped += 1
            continue
        key = item.get("key")
        if not isinstance(key, str) or not key.strip() or len(key) > 120:
            skipped += 1
            continue
        value_json = item.get("value_json")
        if value_json is not None and not isinstance(value_json, str):
            skipped += 1
            continue
        setting = db.get(Setting, key)
        if setting is None:
            setting = Setting(
                key=key,
                category=str(item.get("category") or "general")[:50],
                is_secret=bool(item.get("is_secret")),
                description=str(item.get("description") or "")[:500] or None,
            )
            db.add(setting)
        setting.value_json = value_json
        setting.is_secret = bool(item.get("is_secret"))
        setting.category = str(item.get("category") or setting.category or "general")[:50]
        if item.get("description"):
            setting.description = str(item["description"])[:500]
        imported += 1
    write_audit(
        db,
        module="admin",
        action="config_imported",
        actor=actor,
        entity_type="setting",
        entity_id="config",
        entity_label="Import de configuration",
        after={"imported": imported, "skipped": skipped},
        request=request,
    )
    db.commit()
    return ConfigImportResult(
        imported=imported,
        skipped=skipped,
        message=(
            f"{imported} paramètre(s) importé(s), {skipped} ignoré(s). "
            "Les secrets restent lisibles uniquement avec la même FIELD_ENCRYPTION_KEY."
        ),
    )


def _safe_extract(archive: zipfile.ZipFile, target: Path) -> None:
    target.mkdir(parents=True, exist_ok=True)
    for info in archive.infolist():
        member = Path(info.filename)
        if member.is_absolute() or ".." in member.parts:
            continue
        destination = (target / member).resolve()
        if target.resolve() not in destination.parents and destination != target.resolve():
            continue
        if info.is_dir():
            destination.mkdir(parents=True, exist_ok=True)
            continue
        destination.parent.mkdir(parents=True, exist_ok=True)
        with archive.open(info) as source, destination.open("wb") as output:
            shutil.copyfileobj(source, output)


def _replace_uploads(source: Path) -> None:
    target = _uploads_dir()
    target.mkdir(parents=True, exist_ok=True)
    for item in target.iterdir():
        if item.is_dir():
            shutil.rmtree(item, ignore_errors=True)
        else:
            item.unlink(missing_ok=True)
    for item in source.iterdir():
        destination = target / item.name
        if item.is_dir():
            shutil.copytree(item, destination)
        else:
            shutil.copy2(item, destination)


def restore_database(
    db: Session,
    *,
    content: bytes,
    filename: str,
    actor: User,
    request: Request | None = None,
) -> RestoreResult:
    if not content:
        raise ValidationAppError("Le fichier de sauvegarde est vide.")
    parts = _database_parts()
    if parts is None:
        raise ValidationAppError(
            "La restauration de la base est disponible uniquement avec PostgreSQL."
        )
    pg_restore = _pg_tool("pg_restore")
    psql = _pg_tool("psql")
    if pg_restore is None and psql is None:
        raise ValidationAppError(
            "pg_restore est introuvable. Installez les outils PostgreSQL ou définissez "
            "PG_BIN_DIR vers le dossier bin de PostgreSQL."
        )

    safety = create_database_dump()
    temporary = Path(tempfile.mkdtemp(prefix="si-pilot-restore-"))
    uploads_source: Path | None = None
    try:
        suffix = Path(filename).suffix.lower()
        if suffix == ".zip":
            archive_path = temporary / "backup.zip"
            archive_path.write_bytes(content)
            extract_dir = temporary / "extracted"
            with zipfile.ZipFile(archive_path) as archive:
                _safe_extract(archive, extract_dir)
            dump_candidates = [
                extract_dir / "database.dump",
                extract_dir / "database.sql",
            ]
            dump_file = next(
                (candidate for candidate in dump_candidates if candidate.is_file()),
                None,
            )
            if dump_file is None:
                raise ValidationAppError(
                    "L'archive ne contient pas de sauvegarde database.dump."
                )
            if (extract_dir / "uploads").is_dir():
                uploads_source = extract_dir / "uploads"
        else:
            extension = ".sql" if suffix == ".sql" else ".dump"
            dump_file = temporary / f"upload{extension}"
            dump_file.write_bytes(content)

        head = dump_file.read_bytes()[:5]
        if head == b"PGDMP" and pg_restore is not None:
            command = [
                str(pg_restore),
                "-h",
                str(parts["host"]),
                "-p",
                str(parts["port"]),
                "-U",
                str(parts["username"]),
                "-d",
                str(parts["database"]),
                "--clean",
                "--if-exists",
                "--no-owner",
                "--no-privileges",
                "--single-transaction",
                str(dump_file),
            ]
        elif psql is not None:
            command = [
                str(psql),
                "-h",
                str(parts["host"]),
                "-p",
                str(parts["port"]),
                "-U",
                str(parts["username"]),
                "-d",
                str(parts["database"]),
                "-v",
                "ON_ERROR_STOP=1",
                "-f",
                str(dump_file),
            ]
        else:
            raise ValidationAppError(
                "Le format de la sauvegarde n'est pas reconnu par pg_restore."
            )

        try:
            db.execute(
                text(
                    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                    "WHERE datname = current_database() AND pid <> pg_backend_pid()"
                )
            )
            db.commit()
        except Exception:  # noqa: BLE001 - la restauration peut continuer
            db.rollback()
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=1800,
            env=_pg_env(parts),
            check=False,
        )
        if result.returncode != 0:
            raise ValidationAppError(
                f"Échec de la restauration : {(result.stderr or result.stdout)[:800]}"
            )
        if uploads_source is not None:
            _replace_uploads(uploads_source)
        dispose = getattr(db.get_bind(), "dispose", None)
        if dispose is not None:
            dispose()
    finally:
        shutil.rmtree(temporary, ignore_errors=True)

    write_audit(
        db,
        module="admin",
        action="database_restored",
        actor=actor,
        entity_type="backup",
        entity_id="database",
        entity_label=filename,
        after={"safety_backup": safety.name},
        request=request,
    )
    db.commit()
    return RestoreResult(
        restored=True,
        safety_backup=safety.name,
        message=(
            "Base restaurée. Une sauvegarde de sécurité a été créée avant l'opération. "
            "Rechargez la page et reconnectez-vous si nécessaire."
        ),
        output=(result.stdout or "")[:1000] or None,
    )
