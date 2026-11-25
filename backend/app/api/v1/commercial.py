from datetime import date
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.db.session import get_db
from app.models.auth import User
from app.schemas.commercial import (
    CommercialDocumentCreate,
    CommercialDocumentRead,
    CommercialDocumentUpdate,
    CommercialQuoteConvertRequest,
)
from app.services import commercial_service

router = APIRouter(prefix="/commercial-documents", tags=["Devis et bons de commande"])


@router.get("", response_model=list[CommercialDocumentRead])
def list_documents(
    kind: Literal["quote", "purchase_order"] | None = None,
    q: str | None = Query(None, max_length=120),
    status: str | None = Query(None, max_length=30),
    supplier_id: UUID | None = None,
    with_engagement: bool | None = None,
    start: date | None = None,
    end: date | None = None,
    _: User = Depends(require_permission("suppliers.read")),
    db: Session = Depends(get_db),
) -> list[CommercialDocumentRead]:
    return commercial_service.list_documents(
        db,
        kind=kind,
        q=q,
        status=status,
        supplier_id=supplier_id,
        with_engagement=with_engagement,
        start=start,
        end=end,
    )


@router.post("", response_model=CommercialDocumentRead, status_code=201)
def create_document(
    payload: CommercialDocumentCreate,
    request: Request,
    actor: User = Depends(require_permission("suppliers.manage")),
    db: Session = Depends(get_db),
) -> CommercialDocumentRead:
    return commercial_service.create_document(
        db, payload, actor=actor, request=request
    )


@router.get("/{document_id}", response_model=CommercialDocumentRead)
def get_document(
    document_id: UUID,
    _: User = Depends(require_permission("suppliers.read")),
    db: Session = Depends(get_db),
) -> CommercialDocumentRead:
    return commercial_service.read(
        commercial_service.get_document(db, document_id)
    )


@router.patch("/{document_id}", response_model=CommercialDocumentRead)
def update_document(
    document_id: UUID,
    payload: CommercialDocumentUpdate,
    request: Request,
    actor: User = Depends(require_permission("suppliers.manage")),
    db: Session = Depends(get_db),
) -> CommercialDocumentRead:
    document = commercial_service.get_document(db, document_id)
    return commercial_service.update_document(
        db, document, payload, actor=actor, request=request
    )


@router.delete("/{document_id}", status_code=204)
def cancel_document(
    document_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("suppliers.manage")),
    db: Session = Depends(get_db),
) -> None:
    document = commercial_service.get_document(db, document_id)
    commercial_service.cancel_document(db, document, actor=actor, request=request)


@router.post("/{document_id}/convert", response_model=CommercialDocumentRead)
def convert_quote(
    document_id: UUID,
    payload: CommercialQuoteConvertRequest,
    request: Request,
    actor: User = Depends(require_permission("suppliers.manage")),
    db: Session = Depends(get_db),
) -> CommercialDocumentRead:
    document = commercial_service.get_document(db, document_id)
    return commercial_service.convert_quote(
        db,
        document,
        engagement_number=payload.engagement_number,
        expected_date=payload.expected_date,
        notes=payload.notes,
        actor=actor,
        request=request,
    )
