from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from typing import Any

from app.models.auth import User
from app.schemas.document_numbering import (
    DocumentNumberingRead,
    DocumentNumberingScheme,
    DocumentNumberingUpdate,
)
from app.services import settings_service
from app.services.audit_service import write_audit
from fastapi import Request
from sqlalchemy.orm import Session

SCHEME_TEMPLATES: dict[str, str] = {
    "short_year": "{PREFIX}-{YY}-{SEQ}",
    "full_year": "{PREFIX}-{YYYY}-{SEQ}",
    "simple": "{PREFIX}-{SEQ}",
}

DEFAULT_SCHEME: DocumentNumberingScheme = "short_year"
DEFAULT_SEQUENCE_LENGTH = 4
PREVIEW_PREFIX = "DEM"


@dataclass(frozen=True)
class DocumentNumberingConfig:
    scheme: DocumentNumberingScheme
    sequence_length: int

    @property
    def template(self) -> str:
        base = SCHEME_TEMPLATES.get(self.scheme, SCHEME_TEMPLATES[DEFAULT_SCHEME])
        return base.replace("{SEQ}", f"{{SEQ:{self.sequence_length}}}")

    @property
    def uses_year(self) -> bool:
        return "{YY" in self.template


def _value(db: Session, key: str, default: Any) -> Any:
    value = settings_service.get_value(db, key, default)
    return default if value is None else value


def _normalize_scheme(value: Any) -> DocumentNumberingScheme:
    scheme = str(value or DEFAULT_SCHEME)
    if scheme not in SCHEME_TEMPLATES:
        return DEFAULT_SCHEME
    return scheme  # type: ignore[return-value]


def get_config(db: Session) -> DocumentNumberingConfig:
    return DocumentNumberingConfig(
        scheme=_normalize_scheme(
            _value(db, "documents.numbering_scheme", DEFAULT_SCHEME)
        ),
        sequence_length=max(
            2,
            min(
                8,
                int(
                    _value(
                        db,
                        "documents.numbering_sequence_length",
                        DEFAULT_SEQUENCE_LENGTH,
                    )
                ),
            ),
        ),
    )


def render_reference(
    config: DocumentNumberingConfig,
    *,
    prefix: str,
    year: int,
    sequence: int,
) -> str:
    template = config.template
    if "{SEQ" not in template:
        template = "{PREFIX}-{SEQ:4}"

    def replace_sequence(match: re.Match[str]) -> str:
        width = int(match.group(1) or config.sequence_length)
        return str(sequence).zfill(width)

    result = (
        template.replace("{PREFIX}", prefix.upper())
        .replace("{YYYY}", str(year))
        .replace("{YY}", f"{year % 100:02d}")
    )
    result = re.sub(r"\{SEQ(?::(\d+))?\}", replace_sequence, result)
    return result.strip()


def sequence_year(config: DocumentNumberingConfig, *, year: int) -> int:
    """Année de portée du compteur : 0 pour une numérotation continue."""
    return year if config.uses_year else 0


def read_settings(db: Session) -> DocumentNumberingRead:
    config = get_config(db)
    year = date.today().year
    return DocumentNumberingRead(
        scheme=config.scheme,
        sequence_length=config.sequence_length,
        preview=render_reference(
            config,
            prefix=PREVIEW_PREFIX,
            year=year,
            sequence=1,
        ),
        sample_year=year,
    )


def update_settings(
    db: Session,
    payload: DocumentNumberingUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> DocumentNumberingRead:
    before = read_settings(db)
    values = {
        "documents.numbering_scheme": payload.scheme,
        "documents.numbering_sequence_length": payload.sequence_length,
    }
    descriptions = {
        "documents.numbering_scheme": "Format des références de tickets, devis et autres documents",
        "documents.numbering_sequence_length": "Nombre de chiffres du compteur documentaire",
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
        action="document_numbering_updated",
        actor=actor,
        entity_type="setting",
        entity_id="documents.numbering",
        entity_label="Numérotation des documents",
        before=before.model_dump(mode="json"),
        after=after.model_dump(mode="json"),
        request=request,
    )
    db.commit()
    return after
