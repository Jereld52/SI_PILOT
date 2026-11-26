from __future__ import annotations

from decimal import Decimal, InvalidOperation

from app.models.assets import Supplier
from app.models.budget import BudgetInvoice
from app.models.commercial import CommercialDocument
from app.models.contracts import Contract
from app.models.document_intake import DocumentIntake
from app.models.documents import Document, DocumentVersion
from app.schemas.document_ai import DocumentDuplicateRead
from sqlalchemy import select
from sqlalchemy.orm import Session

_SEVERITY_RANK = {"danger": 0, "warning": 1, "info": 2}


def _amount(value: float | None) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        return None


def _commercial_link(kind: str) -> str:
    return "/devis" if kind == "quote" else "/bons-commande"


def _commercial_label(document: CommercialDocument) -> str:
    label = "Devis" if document.kind == "quote" else "Bon de commande"
    return f"{label} {document.reference} — {document.object}"


def find_duplicates(
    db: Session,
    *,
    content_hash: str,
    filename: str,
    reference: str | None = None,
    supplier: str | None = None,
    amount_ttc: float | None = None,
) -> list[DocumentDuplicateRead]:
    found: dict[tuple[str, str], DocumentDuplicateRead] = {}
    amount = _amount(amount_ttc)

    def add(item: DocumentDuplicateRead) -> None:
        found.setdefault((item.kind, str(item.id)), item)

    # Même empreinte de fichier déjà archivée.
    version_rows = db.execute(
        select(DocumentVersion, Document)
        .join(Document, DocumentVersion.document_id == Document.id)
        .where(DocumentVersion.sha256 == content_hash)
        .limit(3)
    ).all()
    for version, document in version_rows:
        add(
            DocumentDuplicateRead(
                kind="document",
                id=document.id,
                label=document.title,
                detail=f"Même fichier déjà archivé sous le nom {version.filename}.",
                reason="same_file",
                severity="danger",
                link="/documentation",
            )
        )

    # Même empreinte déjà importée.
    intake_rows = db.scalars(
        select(DocumentIntake)
        .where(
            DocumentIntake.file_hash == content_hash,
            DocumentIntake.status.in_(("integrated", "analyzed")),
        )
        .order_by(DocumentIntake.created_at.desc())
        .limit(3)
    ).all()
    for intake_row in intake_rows:
        add(
            DocumentDuplicateRead(
                kind="intake",
                id=intake_row.id,
                label=intake_row.title or intake_row.filename,
                detail=(
                    f"Import déjà {('intégré' if intake_row.status == 'integrated' else 'analysé')} "
                    f"le {intake_row.created_at:%d/%m/%Y %H:%M}."
                ),
                reason="same_file",
                severity="warning" if intake_row.status == "analyzed" else "danger",
                link=intake_row.link or "/import-documents",
            )
        )

    # Même référence métier.
    if reference:
        for commercial_row in db.scalars(
            select(CommercialDocument)
            .where(CommercialDocument.reference == reference)
            .limit(3)
        ).unique().all():
            add(
                DocumentDuplicateRead(
                    kind="commercial",
                    id=commercial_row.id,
                    label=_commercial_label(commercial_row),
                    detail=f"Référence déjà utilisée · {commercial_row.issue_date:%d/%m/%Y}.",
                    reason="same_reference",
                    severity="danger",
                    link=_commercial_link(commercial_row.kind),
                )
            )
        for contract_row in db.scalars(
            select(Contract).where(Contract.reference == reference).limit(3)
        ).unique().all():
            add(
                DocumentDuplicateRead(
                    kind="contract",
                    id=contract_row.id,
                    label=f"Contrat {contract_row.reference} — {contract_row.object}",
                    detail="Référence de contrat déjà utilisée.",
                    reason="same_reference",
                    severity="danger",
                    link="/contrats",
                )
            )
        for invoice_row in db.scalars(
            select(BudgetInvoice)
            .where(BudgetInvoice.invoice_number == reference)
            .limit(3)
        ).unique().all():
            add(
                DocumentDuplicateRead(
                    kind="invoice",
                    id=invoice_row.id,
                    label=f"Facture {invoice_row.invoice_number or reference}",
                    detail=(
                        f"Montant {float(invoice_row.amount_ttc or 0):.2f} EUR TTC · "
                        f"{invoice_row.invoice_date:%d/%m/%Y}"
                        if invoice_row.invoice_date
                        else "Référence de facture déjà utilisée."
                    ),
                    reason="same_reference",
                    severity="danger",
                    link="/budget",
                )
            )

    # Même fournisseur et même montant.
    supplier_row = (
        db.scalar(select(Supplier).where(Supplier.name.ilike(supplier.strip())))
        if supplier and supplier.strip()
        else None
    )
    if supplier_row is not None and amount is not None:
        for commercial_row in db.scalars(
            select(CommercialDocument)
            .where(
                CommercialDocument.supplier_id == supplier_row.id,
                CommercialDocument.amount_ttc == amount,
            )
            .limit(3)
        ).unique().all():
            add(
                DocumentDuplicateRead(
                    kind="commercial",
                    id=commercial_row.id,
                    label=_commercial_label(commercial_row),
                    detail=(
                        f"Même fournisseur et même montant TTC "
                        f"({float(commercial_row.amount_ttc or 0):.2f} EUR)."
                    ),
                    reason="same_supplier_amount",
                    severity="warning",
                    link=_commercial_link(commercial_row.kind),
                )
            )
        for contract_row in db.scalars(
            select(Contract)
            .where(
                Contract.supplier_id == supplier_row.id,
                Contract.amount_ttc == amount,
            )
            .limit(3)
        ).unique().all():
            add(
                DocumentDuplicateRead(
                    kind="contract",
                    id=contract_row.id,
                    label=f"Contrat {contract_row.reference} — {contract_row.object}",
                    detail=(
                        f"Même fournisseur et même montant TTC "
                        f"({float(contract_row.amount_ttc or 0):.2f} EUR)."
                    ),
                    reason="same_supplier_amount",
                    severity="warning",
                    link="/contrats",
                )
            )
        for invoice_row in db.scalars(
            select(BudgetInvoice)
            .where(
                BudgetInvoice.supplier_id == supplier_row.id,
                BudgetInvoice.amount_ttc == amount,
            )
            .limit(3)
        ).unique().all():
            add(
                DocumentDuplicateRead(
                    kind="invoice",
                    id=invoice_row.id,
                    label=f"Facture {invoice_row.invoice_number or 'sans numéro'}",
                    detail=(
                        f"Même fournisseur et même montant TTC "
                        f"({float(invoice_row.amount_ttc or 0):.2f} EUR)."
                    ),
                    reason="same_supplier_amount",
                    severity="warning",
                    link="/budget",
                )
            )

    # Même nom de fichier déjà importé.
    if filename:
        for filename_row in db.scalars(
            select(DocumentIntake)
            .where(
                DocumentIntake.filename == filename,
                DocumentIntake.status == "integrated",
            )
            .order_by(DocumentIntake.created_at.desc())
            .limit(3)
        ).all():
            add(
                DocumentDuplicateRead(
                    kind="intake",
                    id=filename_row.id,
                    label=filename_row.title or filename_row.filename,
                    detail=(
                        f"Même nom de fichier déjà importé le "
                        f"{filename_row.created_at:%d/%m/%Y %H:%M}."
                    ),
                    reason="same_filename",
                    severity="info",
                    link=filename_row.link or "/import-documents",
                )
            )

    items = sorted(
        found.values(),
        key=lambda item: (_SEVERITY_RANK.get(item.severity, 9), item.label.lower()),
    )
    return items[:8]
