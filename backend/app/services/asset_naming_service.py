from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Literal

from app.core.errors import ValidationAppError
from app.models.assets import AssetCategory
from app.models.auth import User
from app.schemas.asset_naming import AssetNamingRead, AssetNamingUpdate
from app.services import settings_service
from app.services.audit_service import write_audit
from fastapi import Request
from sqlalchemy import select
from sqlalchemy.orm import Session

AssetNamingScheme = Literal[
    "prefix_seq",
    "prefix_category_seq",
    "category_seq",
    "custom",
]

SCHEME_TEMPLATES: dict[str, str] = {
    "prefix_seq": "{PREFIX}-{SEQ}",
    "prefix_category_seq": "{PREFIX}-{CATEGORY}-{SEQ}",
    "category_seq": "{CATEGORY}-{SEQ}",
    "custom": "{PREFIX}-{SEQ}",
}

DEFAULT_PREFIX = "SI"
DEFAULT_SEQUENCE_LENGTH = 4


@dataclass(frozen=True)
class AssetNamingConfig:
    enabled: bool
    scheme: AssetNamingScheme
    prefix: str
    sequence_length: int
    template: str

    @property
    def effective_template(self) -> str:
        if self.scheme == "custom":
            return strip_year_tokens(self.template)
        base = SCHEME_TEMPLATES.get(self.scheme, SCHEME_TEMPLATES["prefix_seq"])
        return base.replace("{SEQ}", f"{{SEQ:{self.sequence_length}}}")


def strip_year_tokens(template: str) -> str:
    """Retire toute référence à l'année d'un modèle de nommage d'équipement."""
    result = template.replace("{YEAR}-", "").replace("-{YEAR}", "").replace("{YEAR}", "")
    result = re.sub(r"-{2,}", "-", result).strip("- ")
    return result or "{PREFIX}-{SEQ:4}"


def _value(db: Session, key: str, default: Any) -> Any:
    value = settings_service.get_value(db, key, default)
    return default if value is None else value


def _normalize_scheme(value: Any) -> AssetNamingScheme:
    scheme = str(value or "prefix_seq")
    legacy = {
        "prefix_year_seq": "prefix_seq",
        "category_year_seq": "category_seq",
    }
    scheme = legacy.get(scheme, scheme)
    if scheme not in SCHEME_TEMPLATES:
        return "prefix_seq"
    return scheme  # type: ignore[return-value]


def get_config(db: Session) -> AssetNamingConfig:
    return AssetNamingConfig(
        enabled=bool(_value(db, "assets.naming_enabled", False)),
        scheme=_normalize_scheme(_value(db, "assets.naming_scheme", "prefix_seq")),
        prefix=str(_value(db, "assets.naming_prefix", DEFAULT_PREFIX)).strip()
        or DEFAULT_PREFIX,
        sequence_length=max(
            1,
            min(
                8,
                int(
                    _value(
                        db,
                        "assets.naming_sequence_length",
                        DEFAULT_SEQUENCE_LENGTH,
                    )
                ),
            ),
        ),
        template=strip_year_tokens(
            str(_value(db, "assets.naming_template", "{PREFIX}-{SEQ:4}")).strip()
            or "{PREFIX}-{SEQ:4}"
        ),
    )


def render_tag(
    config: AssetNamingConfig,
    category: AssetCategory | None,
    *,
    sequence: int,
) -> str:
    template = config.effective_template
    if "{SEQ" not in template:
        raise ValidationAppError(
            "Le modèle de nommage doit contenir {SEQ} ou {SEQ:4}.",
            code="INVALID_TAG_TEMPLATE",
        )
    if "{YEAR}" in template:
        raise ValidationAppError(
            "Le nommage des équipements ne doit pas contenir d'année.",
            code="INVALID_TAG_TEMPLATE",
        )
    category_prefix = (
        (category.tag_prefix or category.code).upper() if category else "CAT"
    )

    def replace_sequence(match: re.Match[str]) -> str:
        width = int(match.group(1) or config.sequence_length)
        return str(sequence).zfill(width)

    result = template.replace("{PREFIX}", config.prefix.upper()).replace(
        "{CATEGORY}", category_prefix
    )
    result = re.sub(r"\{SEQ(?::(\d+))?\}", replace_sequence, result)
    return result.strip()


def sequence_scope(
    config: AssetNamingConfig, category: AssetCategory
) -> tuple[str, int]:
    if "{CATEGORY}" in config.effective_template:
        key = f"asset:global:{category.code}"
    else:
        key = "asset:global"
    return key, 0


def _sample_category(db: Session) -> AssetCategory | None:
    return db.scalar(
        select(AssetCategory)
        .where(AssetCategory.is_active.is_(True))
        .order_by(AssetCategory.sort_order, AssetCategory.code)
    )


def read_settings(db: Session) -> AssetNamingRead:
    config = get_config(db)
    category = _sample_category(db)
    preview = render_tag(
        config,
        category,
        sequence=1,
    )
    return AssetNamingRead(
        enabled=config.enabled,
        scheme=config.scheme,
        prefix=config.prefix,
        sequence_length=config.sequence_length,
        template=config.template,
        preview=preview,
        sample_category_code=category.code if category else "CAT",
        sample_category_prefix=(
            (category.tag_prefix or category.code).upper() if category else "CAT"
        ),
    )


def update_settings(
    db: Session,
    payload: AssetNamingUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> AssetNamingRead:
    if payload.scheme == "custom" and "{SEQ" not in payload.template:
        raise ValidationAppError(
            "Le modèle personnalisé doit contenir {SEQ} ou {SEQ:4}.",
            code="INVALID_TAG_TEMPLATE",
        )
    if "{YEAR}" in payload.template:
        raise ValidationAppError(
            "Le nommage des équipements ne doit pas contenir d'année.",
            code="INVALID_TAG_TEMPLATE",
        )
    cleaned_prefix = payload.prefix.strip() or DEFAULT_PREFIX
    before = read_settings(db)
    values = {
        "assets.naming_enabled": payload.enabled,
        "assets.naming_scheme": payload.scheme,
        "assets.naming_prefix": cleaned_prefix,
        "assets.naming_sequence_length": payload.sequence_length,
        "assets.naming_template": strip_year_tokens(
            payload.template.strip() or "{PREFIX}-{SEQ:4}"
        ),
    }
    descriptions = {
        "assets.naming_enabled": "Utiliser un nommage global simplifié pour les équipements",
        "assets.naming_scheme": "Modèle de nommage global des équipements",
        "assets.naming_prefix": "Préfixe global des numéros d'inventaire",
        "assets.naming_sequence_length": "Nombre de chiffres du compteur",
        "assets.naming_template": "Modèle personnalisé du numéro d'inventaire",
    }
    for key, value in values.items():
        settings_service.set_value(
            db,
            key,
            value,
            category="general",
            description=descriptions[key],
        )
    db.flush()
    after = read_settings(db)
    write_audit(
        db,
        module="settings",
        action="asset_naming_updated",
        actor=actor,
        entity_type="setting",
        entity_id="assets.naming",
        entity_label="Nommage des équipements",
        before=before.model_dump(mode="json"),
        after=after.model_dump(mode="json"),
        request=request,
    )
    db.commit()
    return after
