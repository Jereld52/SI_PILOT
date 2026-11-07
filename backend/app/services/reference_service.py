from datetime import date

from app.db.base import utcnow
from app.models.common import DocumentSequence
from sqlalchemy import select
from sqlalchemy.orm import Session


def next_reference(db: Session, *, key: str, prefix: str) -> str:
    """Génère une référence annuelle unique du type PREFIX-2026-0001.

    Le compteur est verrouillé pendant la transaction pour éviter les doublons
    en cas de créations concurrentes.
    """
    year = date.today().year
    sequence = db.scalar(
        select(DocumentSequence)
        .where(DocumentSequence.key == key, DocumentSequence.year == year)
        .with_for_update()
    )
    if sequence is None:
        sequence = DocumentSequence(key=key, year=year, last_value=1, updated_at=utcnow())
        db.add(sequence)
        db.flush()
        value = 1
    else:
        sequence.last_value += 1
        sequence.updated_at = utcnow()
        db.flush()
        value = sequence.last_value
    return f"{prefix}-{year}-{value:04d}"
