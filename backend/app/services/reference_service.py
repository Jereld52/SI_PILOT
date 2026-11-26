from datetime import date

from app.db.base import utcnow
from app.models.common import DocumentSequence
from app.services import document_numbering_service
from sqlalchemy import select
from sqlalchemy.orm import Session


def next_reference(db: Session, *, key: str, prefix: str) -> str:
    """Génère une référence unique selon le format configuré.

    Par défaut : PREFIX-AA-0001. Le compteur est verrouillé pendant la
    transaction pour éviter les doublons en cas de créations concurrentes.
    """
    year = date.today().year
    config = document_numbering_service.get_config(db)
    scope_year = document_numbering_service.sequence_year(config, year=year)
    sequence = db.scalar(
        select(DocumentSequence)
        .where(DocumentSequence.key == key, DocumentSequence.year == scope_year)
        .with_for_update()
    )
    if sequence is None:
        sequence = DocumentSequence(
            key=key, year=scope_year, last_value=1, updated_at=utcnow()
        )
        db.add(sequence)
        db.flush()
        value = 1
    else:
        sequence.last_value += 1
        sequence.updated_at = utcnow()
        db.flush()
        value = sequence.last_value
    return document_numbering_service.render_reference(
        config, prefix=prefix, year=year, sequence=value
    )
