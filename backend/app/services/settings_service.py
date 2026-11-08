from __future__ import annotations

import json
from typing import Any

from app.db.base import utcnow
from app.models.setting import Setting
from sqlalchemy.orm import Session


def get_value(db: Session, key: str, default: Any = None) -> Any:
    """Lit une valeur de paramètre stockée en JSON."""
    setting = db.get(Setting, key)
    if setting is None or setting.value_json is None:
        return default
    try:
        return json.loads(setting.value_json)
    except json.JSONDecodeError:
        return setting.value_json


def set_value(
    db: Session,
    key: str,
    value: Any,
    *,
    category: str = "general",
    is_secret: bool = False,
    description: str | None = None,
) -> Setting:
    """Écrit une valeur de paramètre sans valider ni committer la transaction."""
    setting = db.get(Setting, key)
    if setting is None:
        setting = Setting(
            key=key,
            category=category,
            is_secret=is_secret,
            description=description,
        )
        db.add(setting)
    setting.value_json = json.dumps(value, ensure_ascii=False)
    setting.is_secret = is_secret
    if description is not None:
        setting.description = description
    setting.updated_at = utcnow()
    return setting
