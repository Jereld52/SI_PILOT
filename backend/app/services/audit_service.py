import hashlib
import json
from typing import Any

from app.models.audit import AuditLog
from app.models.auth import User
from fastapi import Request
from sqlalchemy import select
from sqlalchemy.orm import Session


def _json(value: Any) -> str | None:
    if value is None:
        return None
    return json.dumps(value, ensure_ascii=False, default=str, sort_keys=True)


def _last_hash(db: Session) -> str | None:
    return db.scalar(select(AuditLog.hash).order_by(AuditLog.id.desc()).limit(1))


def write_audit(
    db: Session,
    *,
    module: str,
    action: str,
    actor: User | None = None,
    actor_label: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    entity_label: str | None = None,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
    request: Request | None = None,
    source: str = "api",
    status: str = "success",
) -> AuditLog:
    """Écrit un événement d'audit dans la transaction courante.

    Le hash chaîne chaque entrée à la précédente. Une modification ou suppression
    directe en base casse la chaîne et devient détectable.
    """
    actor_name = actor_label or (actor.email if actor else "system")
    request_id = getattr(request.state, "request_id", None) if request else None
    ip = request.client.host if request and request.client else None
    user_agent = request.headers.get("user-agent") if request else None

    before_json = _json(before)
    after_json = _json(after)
    diff_json = _json(
        {
            "before": before,
            "after": after,
        }
        if before is not None or after is not None
        else None
    )

    previous_hash = _last_hash(db)
    payload = json.dumps(
        {
            "actor": actor_name,
            "module": module,
            "action": action,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "before": before_json,
            "after": after_json,
            "request_id": request_id,
            "prev": previous_hash,
        },
        ensure_ascii=False,
        sort_keys=True,
        default=str,
    )
    current_hash = hashlib.sha256(payload.encode("utf-8")).hexdigest()

    entry = AuditLog(
        actor_user_id=actor.id if actor else None,
        actor_label=actor_name,
        module=module,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        entity_label=entity_label,
        before_json=before_json,
        after_json=after_json,
        diff_json=diff_json,
        ip=ip,
        user_agent=user_agent[:512] if user_agent else None,
        request_id=request_id,
        source=source,
        status=status,
        hash_prev=previous_hash,
        hash=current_hash,
    )
    db.add(entry)
    db.flush()
    return entry
