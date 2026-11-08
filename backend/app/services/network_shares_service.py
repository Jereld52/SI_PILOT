from __future__ import annotations

import json
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID

from app.core.errors import NotFoundError, ValidationAppError
from app.models.auth import User
from app.models.network import NetworkShare
from app.models.organization import Location
from app.schemas.network import (
    NetworkShareCreate,
    NetworkShareOverview,
    NetworkShareRead,
    NetworkShareSummary,
    NetworkShareUpdate,
)
from app.services.audit_service import write_audit
from fastapi import Request
from sqlalchemy import select
from sqlalchemy.orm import Session

CHECK_TIMEOUT_SECONDS = 12
CHECK_SCRIPT = """
import json
import shutil
import sys

try:
    usage = shutil.disk_usage(sys.argv[1])
    print(json.dumps({"total": usage.total, "used": usage.used, "free": usage.free}))
except Exception as exc:
    print(json.dumps({"error": str(exc)[:300]}))
    raise SystemExit(2)
"""


def _read(row: NetworkShare) -> NetworkShareRead:
    return NetworkShareRead.model_validate(row)


def list_shares(db: Session, *, include_inactive: bool = False) -> list[NetworkShareRead]:
    statement = select(NetworkShare)
    if not include_inactive:
        statement = statement.where(NetworkShare.is_active.is_(True))
    rows = db.scalars(
        statement.order_by(NetworkShare.sort_order, NetworkShare.name)
    ).all()
    return [_read(row) for row in rows]


def get_share(db: Session, share_id: UUID) -> NetworkShare:
    row = db.get(NetworkShare, share_id)
    if row is None:
        raise NotFoundError("Partage réseau introuvable.")
    return row


def _validate_links(db: Session, location_id: UUID | None) -> None:
    if location_id and db.get(Location, location_id) is None:
        raise NotFoundError("Site introuvable.")


def _validate_thresholds(warning: int, critical: int) -> None:
    if not 0 < warning < 100:
        raise ValidationAppError("Le seuil d'alerte doit être compris entre 1 et 99 %.")
    if not 0 <= critical < warning:
        raise ValidationAppError("Le seuil critique doit être inférieur au seuil d'alerte.")


def create_share(
    db: Session,
    payload: NetworkShareCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> NetworkShareRead:
    _validate_links(db, payload.location_id)
    _validate_thresholds(payload.warning_percent, payload.critical_percent)
    row = NetworkShare(**payload.model_dump())
    db.add(row)
    db.flush()
    write_audit(
        db,
        module="infrastructure",
        action="network_share_created",
        actor=actor,
        entity_type="network_share",
        entity_id=str(row.id),
        entity_label=row.name,
        after={
            "unc_path": row.unc_path,
            "warning_percent": row.warning_percent,
            "critical_percent": row.critical_percent,
        },
        request=request,
    )
    db.commit()
    db.refresh(row)
    return _read(row)


def update_share(
    db: Session,
    row: NetworkShare,
    payload: NetworkShareUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> NetworkShareRead:
    data = payload.model_dump(exclude_unset=True)
    if "location_id" in data:
        _validate_links(db, data["location_id"])
    warning = int(data.get("warning_percent", row.warning_percent))
    critical = int(data.get("critical_percent", row.critical_percent))
    _validate_thresholds(warning, critical)
    before = {
        "name": row.name,
        "unc_path": row.unc_path,
        "warning_percent": row.warning_percent,
        "critical_percent": row.critical_percent,
        "is_active": row.is_active,
    }
    for key, value in data.items():
        setattr(row, key, value)
    write_audit(
        db,
        module="infrastructure",
        action="network_share_updated",
        actor=actor,
        entity_type="network_share",
        entity_id=str(row.id),
        entity_label=row.name,
        before=before,
        after={
            "name": row.name,
            "unc_path": row.unc_path,
            "warning_percent": row.warning_percent,
            "critical_percent": row.critical_percent,
            "is_active": row.is_active,
        },
        request=request,
    )
    db.commit()
    db.refresh(row)
    return _read(row)


def archive_share(
    db: Session,
    row: NetworkShare,
    *,
    actor: User,
    request: Request | None = None,
) -> NetworkShareRead:
    row.is_active = False
    write_audit(
        db,
        module="infrastructure",
        action="network_share_archived",
        actor=actor,
        entity_type="network_share",
        entity_id=str(row.id),
        entity_label=row.name,
        after={"is_active": False},
        request=request,
    )
    db.commit()
    db.refresh(row)
    return _read(row)


def _check_path(path: str) -> dict[str, int]:
    if not path.strip():
        raise ValidationAppError("Le chemin du partage est vide.")
    resolved = Path(path).expanduser()
    kwargs: dict[str, Any] = {
        "capture_output": True,
        "text": True,
        "encoding": "utf-8",
        "errors": "replace",
        "timeout": CHECK_TIMEOUT_SECONDS,
        "check": False,
    }
    if sys.platform == "win32":
        kwargs["creationflags"] = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    try:
        completed = subprocess.run(
            [sys.executable, "-c", CHECK_SCRIPT, str(resolved)],
            **kwargs,
        )
    except subprocess.TimeoutExpired as exc:
        raise ValidationAppError(
            f"Délai dépassé ({CHECK_TIMEOUT_SECONDS} s) lors de l'accès au partage."
        ) from exc
    except OSError as exc:
        raise ValidationAppError(f"Impossible de lancer le contrôle : {exc}") from exc
    payload: dict[str, Any] = {}
    for line in (completed.stdout or "").splitlines():
        try:
            payload = json.loads(line)
            break
        except json.JSONDecodeError:
            continue
    if completed.returncode != 0 or "error" in payload:
        message = str(payload.get("error") or completed.stderr or "accès impossible").strip()
        raise ValidationAppError(message[:400])
    total = int(payload.get("total") or 0)
    used = int(payload.get("used") or 0)
    free = int(payload.get("free") or 0)
    if total <= 0:
        raise ValidationAppError("Le volume renvoyé est invalide.")
    return {"total": total, "used": used, "free": free}


def _status_for(row: NetworkShare, free: int, total: int) -> str:
    free_percent = free / total * 100 if total else 0
    free_gb = free / (1024**3)
    if row.min_free_gb is not None and free_gb <= row.min_free_gb:
        return "critical"
    if free_percent <= row.critical_percent:
        return "critical"
    if free_percent <= row.warning_percent:
        return "warning"
    return "ok"


def check_share(
    db: Session,
    row: NetworkShare,
    *,
    actor: User,
    request: Request | None = None,
    commit: bool = True,
) -> NetworkShareRead:
    checked_at = datetime.now(UTC)
    try:
        usage = _check_path(row.unc_path)
    except ValidationAppError as exc:
        row.last_checked_at = checked_at
        row.last_status = "error"
        row.last_total_bytes = None
        row.last_used_bytes = None
        row.last_free_bytes = None
        row.last_error = str(exc)
        write_audit(
            db,
            module="infrastructure",
            action="network_share_checked",
            actor=actor,
            entity_type="network_share",
            entity_id=str(row.id),
            entity_label=row.name,
            after={"status": "error", "error": str(exc)},
            request=request,
            status="failure",
        )
        if commit:
            db.commit()
            db.refresh(row)
        return _read(row)

    row.last_checked_at = checked_at
    row.last_total_bytes = usage["total"]
    row.last_used_bytes = usage["used"]
    row.last_free_bytes = usage["free"]
    row.last_status = _status_for(row, usage["free"], usage["total"])
    row.last_error = None
    write_audit(
        db,
        module="infrastructure",
        action="network_share_checked",
        actor=actor,
        entity_type="network_share",
        entity_id=str(row.id),
        entity_label=row.name,
        after={
            "status": row.last_status,
            "total_bytes": usage["total"],
            "free_bytes": usage["free"],
        },
        request=request,
    )
    if commit:
        db.commit()
        db.refresh(row)
    return _read(row)


def check_all(
    db: Session,
    *,
    actor: User,
    request: Request | None = None,
) -> list[NetworkShareRead]:
    rows = list(
        db.scalars(
            select(NetworkShare)
            .where(NetworkShare.is_active.is_(True))
            .order_by(NetworkShare.sort_order, NetworkShare.name)
        ).all()
    )
    results = [
        check_share(db, row, actor=actor, request=request, commit=False)
        for row in rows
    ]
    db.commit()
    return results


def overview(db: Session) -> NetworkShareOverview:
    rows = list_shares(db, include_inactive=False)
    summary = NetworkShareSummary(
        total=len(rows),
        ok=sum(1 for row in rows if row.last_status == "ok"),
        warning=sum(1 for row in rows if row.last_status == "warning"),
        critical=sum(1 for row in rows if row.last_status == "critical"),
        error=sum(1 for row in rows if row.last_status == "error"),
        unknown=sum(1 for row in rows if row.last_status == "unknown"),
        total_bytes=sum(row.last_total_bytes or 0 for row in rows),
        free_bytes=sum(row.last_free_bytes or 0 for row in rows),
    )
    alerts = [
        row for row in rows if row.last_status in {"warning", "critical", "error"}
    ]
    return NetworkShareOverview(items=rows, summary=summary, alerts=alerts)
