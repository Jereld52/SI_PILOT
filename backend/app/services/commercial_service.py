from __future__ import annotations

from datetime import date
from decimal import Decimal, InvalidOperation
from uuid import UUID

from app.core.errors import ConflictError, NotFoundError, ValidationAppError
from app.models.assets import Supplier
from app.models.auth import User
from app.models.budget import BudgetLine
from app.models.commercial import CommercialDocument
from app.models.contracts import Contract
from app.models.documents import Document
from app.schemas.commercial import (
    CommercialDocumentCreate,
    CommercialDocumentRead,
    CommercialDocumentUpdate,
)
from app.services.audit_service import write_audit
from app.services.reference_service import next_reference
from fastapi import Request
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

QUOTE_STATUSES = {
    "draft",
    "sent",
    "accepted",
    "refused",
    "expired",
    "converted",
    "cancelled",
}
PURCHASE_ORDER_STATUSES = {"draft", "sent", "confirmed", "delivered", "cancelled"}


def _statuses(kind: str) -> set[str]:
    return QUOTE_STATUSES if kind == "quote" else PURCHASE_ORDER_STATUSES


def _validate_status(kind: str, status: str) -> None:
    if status not in _statuses(kind):
        raise ValidationAppError(
            f"Statut « {status} » invalide pour ce type de document."
        )


def _validate_links(
    db: Session,
    *,
    supplier_id: UUID | None,
    budget_line_id: UUID | None,
    contract_id: UUID | None,
    document_id: UUID | None,
) -> None:
    if supplier_id and db.get(Supplier, supplier_id) is None:
        raise NotFoundError("Fournisseur introuvable.")
    if budget_line_id and db.get(BudgetLine, budget_line_id) is None:
        raise NotFoundError("Ligne budgétaire introuvable.")
    if contract_id and db.get(Contract, contract_id) is None:
        raise NotFoundError("Contrat introuvable.")
    if document_id and db.get(Document, document_id) is None:
        raise NotFoundError("Document introuvable.")


def _decimal(value: float | None) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError) as exc:
        raise ValidationAppError("Montant invalide.") from exc


def _amounts(
    amount_ht: float | None,
    amount_ttc: float | None,
    vat_rate: float | None,
) -> tuple[Decimal | None, Decimal | None, Decimal | None]:
    ht = _decimal(amount_ht)
    ttc = _decimal(amount_ttc)
    vat = _decimal(vat_rate)
    if ht is not None and ttc is None and vat is not None:
        ttc = (ht * (1 + vat / 100)).quantize(Decimal("0.01"))
    elif ttc is not None and ht is None and vat is not None and vat != 100:
        ht = (ttc / (1 + vat / 100)).quantize(Decimal("0.01"))
    return ht, ttc, vat


def _validate_engagement(
    db: Session,
    kind: str,
    engagement_number: str | None,
    *,
    exclude_id: UUID | None = None,
) -> str | None:
    cleaned = (engagement_number or "").strip() or None
    if kind != "purchase_order":
        return None
    if not cleaned:
        raise ValidationAppError(
            "Le numéro d'engagement est obligatoire pour un bon de commande."
        )
    if cleaned is None:
        return None
    statement = select(CommercialDocument).where(
        CommercialDocument.engagement_number == cleaned
    )
    if exclude_id is not None:
        statement = statement.where(CommercialDocument.id != exclude_id)
    if db.scalar(statement) is not None:
        raise ConflictError("Ce numéro d'engagement est déjà utilisé.")
    return cleaned


def read(document: CommercialDocument) -> CommercialDocumentRead:
    data = CommercialDocumentRead.model_validate(document)
    data.amount_ht = float(document.amount_ht) if document.amount_ht is not None else None
    data.amount_ttc = (
        float(document.amount_ttc) if document.amount_ttc is not None else None
    )
    data.vat_rate = float(document.vat_rate) if document.vat_rate is not None else None
    return data


def select_documents(
    db: Session,
    *,
    kind: str | None = None,
    q: str | None = None,
    status: str | None = None,
    supplier_id: UUID | None = None,
    with_engagement: bool | None = None,
    start: date | None = None,
    end: date | None = None,
) -> list[CommercialDocument]:
    statement = select(CommercialDocument)
    if kind:
        statement = statement.where(CommercialDocument.kind == kind)
    if status:
        statement = statement.where(CommercialDocument.status == status)
    if supplier_id:
        statement = statement.where(CommercialDocument.supplier_id == supplier_id)
    if with_engagement is True:
        statement = statement.where(
            CommercialDocument.kind == "purchase_order",
            CommercialDocument.engagement_number.is_not(None),
        )
    elif with_engagement is False:
        statement = statement.where(
            CommercialDocument.kind == "purchase_order",
            CommercialDocument.engagement_number.is_(None),
        )
    if start:
        statement = statement.where(CommercialDocument.issue_date >= start)
    if end:
        statement = statement.where(CommercialDocument.issue_date <= end)
    if q:
        pattern = f"%{q.strip()}%"
        statement = statement.where(
            or_(
                CommercialDocument.reference.ilike(pattern),
                CommercialDocument.engagement_number.ilike(pattern),
                CommercialDocument.object.ilike(pattern),
                CommercialDocument.notes.ilike(pattern),
            )
        )
    return list(
        db.scalars(
            statement.order_by(
                CommercialDocument.issue_date.desc(),
                CommercialDocument.reference.desc(),
            )
        ).unique().all()
    )


def list_documents(
    db: Session,
    *,
    kind: str | None = None,
    q: str | None = None,
    status: str | None = None,
    supplier_id: UUID | None = None,
    with_engagement: bool | None = None,
    start: date | None = None,
    end: date | None = None,
) -> list[CommercialDocumentRead]:
    rows = select_documents(
        db,
        kind=kind,
        q=q,
        status=status,
        supplier_id=supplier_id,
        with_engagement=with_engagement,
        start=start,
        end=end,
    )
    return [read(row) for row in rows]


def get_document(db: Session, document_id: UUID) -> CommercialDocument:
    document = db.get(CommercialDocument, document_id)
    if document is None:
        raise NotFoundError("Devis ou bon de commande introuvable.")
    return document


def create_document(
    db: Session,
    payload: CommercialDocumentCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> CommercialDocumentRead:
    _validate_status(payload.kind, payload.status)
    _validate_links(
        db,
        supplier_id=payload.supplier_id,
        budget_line_id=payload.budget_line_id,
        contract_id=payload.contract_id,
        document_id=payload.document_id,
    )
    reference = payload.reference.strip()
    if not reference:
        reference = next_reference(
            db,
            key=f"commercial_{payload.kind}",
            prefix="DEV" if payload.kind == "quote" else "BC",
        )
    if db.scalar(
        select(CommercialDocument).where(CommercialDocument.reference == reference)
    ):
        raise ConflictError("Cette référence est déjà utilisée.")
    engagement_number = _validate_engagement(
        db, payload.kind, payload.engagement_number
    )
    ht, ttc, vat = _amounts(payload.amount_ht, payload.amount_ttc, payload.vat_rate)
    document = CommercialDocument(
        kind=payload.kind,
        reference=reference,
        engagement_number=engagement_number,
        object=payload.object.strip(),
        supplier_id=payload.supplier_id,
        status=payload.status,
        issue_date=payload.issue_date,
        valid_until=payload.valid_until,
        expected_date=payload.expected_date,
        amount_ht=ht,
        amount_ttc=ttc,
        vat_rate=vat,
        budget_line_id=payload.budget_line_id,
        contract_id=payload.contract_id,
        document_id=payload.document_id,
        notes=payload.notes,
        created_by_id=actor.id,
        updated_by_id=actor.id,
    )
    db.add(document)
    db.flush()
    write_audit(
        db,
        module="commercial",
        action="commercial_document_created",
        actor=actor,
        entity_type="commercial_document",
        entity_id=str(document.id),
        entity_label=f"{document.reference} — {document.object}",
        after={
            "kind": document.kind,
            "status": document.status,
            "engagement_number": document.engagement_number,
            "amount_ttc": float(ttc) if ttc is not None else None,
        },
        request=request,
    )
    db.commit()
    db.refresh(document)
    return read(document)


def update_document(
    db: Session,
    document: CommercialDocument,
    payload: CommercialDocumentUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> CommercialDocumentRead:
    data = payload.model_dump(exclude_unset=True)
    kind = str(data.get("kind") or document.kind)
    status = str(data.get("status") or document.status)
    _validate_status(kind, status)
    if "supplier_id" in data or "budget_line_id" in data or "contract_id" in data:
        _validate_links(
            db,
            supplier_id=data.get("supplier_id", document.supplier_id),
            budget_line_id=data.get("budget_line_id", document.budget_line_id),
            contract_id=data.get("contract_id", document.contract_id),
            document_id=None,
        )
    if "reference" in data:
        reference = str(data["reference"] or "").strip()
        if not reference:
            raise ValidationAppError("La référence ne peut pas être vide.")
        existing = db.scalar(
            select(CommercialDocument).where(
                CommercialDocument.reference == reference,
                CommercialDocument.id != document.id,
            )
        )
        if existing:
            raise ConflictError("Cette référence est déjà utilisée.")
        document.reference = reference
        data.pop("reference")
    if "engagement_number" in data or kind == "purchase_order":
        document.engagement_number = _validate_engagement(
            db,
            kind,
            data.get("engagement_number", document.engagement_number),
            exclude_id=document.id,
        )
        data.pop("engagement_number", None)
    if any(key in data for key in ("amount_ht", "amount_ttc", "vat_rate")):
        ht, ttc, vat = _amounts(
            data.get("amount_ht", float(document.amount_ht) if document.amount_ht is not None else None),
            data.get("amount_ttc", float(document.amount_ttc) if document.amount_ttc is not None else None),
            data.get("vat_rate", float(document.vat_rate) if document.vat_rate is not None else None),
        )
        document.amount_ht = ht
        document.amount_ttc = ttc
        document.vat_rate = vat
        data.pop("amount_ht", None)
        data.pop("amount_ttc", None)
        data.pop("vat_rate", None)
    for key, value in data.items():
        setattr(document, key, value)
    document.updated_by_id = actor.id
    write_audit(
        db,
        module="commercial",
        action="commercial_document_updated",
        actor=actor,
        entity_type="commercial_document",
        entity_id=str(document.id),
        entity_label=f"{document.reference} — {document.object}",
        after={
            "kind": document.kind,
            "status": document.status,
            "engagement_number": document.engagement_number,
        },
        request=request,
    )
    db.commit()
    db.refresh(document)
    return read(document)


def cancel_document(
    db: Session,
    document: CommercialDocument,
    *,
    actor: User,
    request: Request | None = None,
) -> None:
    document.status = "cancelled"
    document.updated_by_id = actor.id
    write_audit(
        db,
        module="commercial",
        action="commercial_document_cancelled",
        actor=actor,
        entity_type="commercial_document",
        entity_id=str(document.id),
        entity_label=f"{document.reference} — {document.object}",
        after={"status": "cancelled"},
        request=request,
    )
    db.commit()


def convert_quote(
    db: Session,
    document: CommercialDocument,
    *,
    engagement_number: str,
    expected_date: date | None = None,
    notes: str | None = None,
    actor: User,
    request: Request | None = None,
) -> CommercialDocumentRead:
    if document.kind != "quote":
        raise ValidationAppError("Seul un devis peut être converti en bon de commande.")
    if document.status == "converted":
        raise ConflictError("Ce devis a déjà été converti.")
    if document.status in {"refused", "expired", "cancelled"}:
        raise ValidationAppError(
            "Ce devis n'est pas dans un état permettant la conversion."
        )
    engagement = _validate_engagement(db, "purchase_order", engagement_number)
    reference = next_reference(db, key="commercial_purchase_order", prefix="BC")
    purchase_order = CommercialDocument(
        kind="purchase_order",
        reference=reference,
        engagement_number=engagement,
        object=document.object,
        supplier_id=document.supplier_id,
        status="draft",
        issue_date=date.today(),
        valid_until=None,
        expected_date=expected_date or document.valid_until,
        amount_ht=document.amount_ht,
        amount_ttc=document.amount_ttc,
        vat_rate=document.vat_rate,
        budget_line_id=document.budget_line_id,
        contract_id=document.contract_id,
        document_id=document.document_id,
        source_document_id=document.id,
        notes=notes if notes is not None else document.notes,
        created_by_id=actor.id,
        updated_by_id=actor.id,
    )
    document.status = "converted"
    document.updated_by_id = actor.id
    db.add(purchase_order)
    db.flush()
    write_audit(
        db,
        module="commercial",
        action="quote_converted_to_purchase_order",
        actor=actor,
        entity_type="commercial_document",
        entity_id=str(purchase_order.id),
        entity_label=f"{purchase_order.reference} — {purchase_order.object}",
        after={
            "quote_id": str(document.id),
            "quote_reference": document.reference,
            "purchase_order": purchase_order.reference,
            "engagement_number": purchase_order.engagement_number,
        },
        request=request,
    )
    db.commit()
    db.refresh(purchase_order)
    return read(purchase_order)
