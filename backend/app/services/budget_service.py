from __future__ import annotations

from decimal import Decimal, InvalidOperation
from uuid import UUID

from app.core.errors import ConflictError, NotFoundError, ValidationAppError
from app.db.base import utcnow
from app.models.assets import Supplier
from app.models.auth import User
from app.models.budget import (
    Budget,
    BudgetCategory,
    BudgetCommitment,
    BudgetInvoice,
    BudgetLine,
)
from app.models.contracts import Contract
from app.schemas.budget import (
    BudgetCommitmentCreate,
    BudgetCommitmentRead,
    BudgetCommitmentUpdate,
    BudgetCreate,
    BudgetDetailRead,
    BudgetInvoiceCreate,
    BudgetInvoiceRead,
    BudgetInvoiceUpdate,
    BudgetLineCreate,
    BudgetLineRead,
    BudgetLineUpdate,
    BudgetRead,
    BudgetUpdate,
)
from app.services.audit_service import write_audit
from fastapi import Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

ENGAGED_STATUSES = ("quoted", "ordered", "delivered", "invoiced")
INVOICED_STATUSES = ("received", "validated", "paid")


def _decimal(value: float | None) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError) as exc:
        raise ValidationAppError("Montant invalide.") from exc


def _amount(value: Decimal | None) -> float:
    return float(value) if value is not None else 0.0


def _sum_amount(amount_ht: Decimal | None, amount_ttc: Decimal | None) -> float:
    if amount_ht is not None:
        return float(amount_ht)
    if amount_ttc is not None:
        return float(amount_ttc)
    return 0.0


def _totals(db: Session, budget_id: UUID) -> dict[str, float]:
    planned = db.scalar(
        select(func.coalesce(func.sum(BudgetLine.planned_amount), 0)).where(
            BudgetLine.budget_id == budget_id
        )
    )
    voted = db.scalar(
        select(func.coalesce(func.sum(BudgetLine.voted_amount), 0)).where(
            BudgetLine.budget_id == budget_id
        )
    )
    commitments = db.scalars(
        select(BudgetCommitment)
        .join(BudgetLine, BudgetCommitment.budget_line_id == BudgetLine.id)
        .where(BudgetLine.budget_id == budget_id)
    ).all()
    invoices = db.scalars(
        select(BudgetInvoice)
        .join(BudgetLine, BudgetInvoice.budget_line_id == BudgetLine.id)
        .where(BudgetLine.budget_id == budget_id)
    ).all()
    committed = sum(
        _sum_amount(commitment.amount_ht, commitment.amount_ttc)
        for commitment in commitments
        if commitment.status in ENGAGED_STATUSES
    )
    invoiced = sum(
        _sum_amount(invoice.amount_ht, invoice.amount_ttc)
        for invoice in invoices
        if invoice.status in INVOICED_STATUSES
    )
    paid = sum(
        _sum_amount(invoice.amount_ht, invoice.amount_ttc)
        for invoice in invoices
        if invoice.status == "paid"
    )
    voted_value = _amount(voted)
    return {
        "planned": _amount(planned),
        "voted": voted_value,
        "committed": committed,
        "invoiced": invoiced,
        "paid": paid,
        "available": voted_value - committed,
    }


def _apply_totals(db: Session, budget: Budget, data: BudgetRead) -> BudgetRead:
    totals = _totals(db, budget.id)
    data.planned_total = totals["planned"]
    data.voted_total = totals["voted"]
    data.committed_total = totals["committed"]
    data.invoiced_total = totals["invoiced"]
    data.paid_total = totals["paid"]
    data.available_total = totals["available"]
    return data


def _budget_read(db: Session, budget: Budget) -> BudgetRead:
    return _apply_totals(db, budget, BudgetRead.model_validate(budget))


def list_budgets(db: Session) -> list[BudgetRead]:
    budgets = db.scalars(select(Budget).order_by(Budget.year.desc())).all()
    return [_budget_read(db, budget) for budget in budgets]


def get_budget(db: Session, budget_id: UUID) -> Budget:
    budget = db.get(Budget, budget_id)
    if budget is None:
        raise NotFoundError("Budget introuvable.")
    return budget


def _line_reads(db: Session, budget_id: UUID) -> list[BudgetLineRead]:
    lines = db.scalars(
        select(BudgetLine)
        .where(BudgetLine.budget_id == budget_id)
        .order_by(BudgetLine.label)
    ).all()
    commitments = db.scalars(
        select(BudgetCommitment)
        .join(BudgetLine, BudgetCommitment.budget_line_id == BudgetLine.id)
        .where(BudgetLine.budget_id == budget_id)
    ).all()
    invoices = db.scalars(
        select(BudgetInvoice)
        .join(BudgetLine, BudgetInvoice.budget_line_id == BudgetLine.id)
        .where(BudgetLine.budget_id == budget_id)
    ).all()
    committed_by_line: dict[UUID, float] = {}
    for commitment in commitments:
        if commitment.status in ENGAGED_STATUSES:
            committed_by_line[commitment.budget_line_id] = committed_by_line.get(
                commitment.budget_line_id, 0.0
            ) + _sum_amount(commitment.amount_ht, commitment.amount_ttc)
    invoiced_by_line: dict[UUID, float] = {}
    for invoice in invoices:
        if invoice.status in INVOICED_STATUSES:
            invoiced_by_line[invoice.budget_line_id] = invoiced_by_line.get(
                invoice.budget_line_id, 0.0
            ) + _sum_amount(invoice.amount_ht, invoice.amount_ttc)
    result = []
    for line in lines:
        data = BudgetLineRead.model_validate(line)
        committed = committed_by_line.get(line.id, 0.0)
        data.committed_amount = committed
        data.invoiced_amount = invoiced_by_line.get(line.id, 0.0)
        data.available_amount = _amount(line.voted_amount) - committed
        result.append(data)
    return result


def _commitment_reads(db: Session, budget_id: UUID) -> list[BudgetCommitmentRead]:
    rows = db.scalars(
        select(BudgetCommitment)
        .join(BudgetLine, BudgetCommitment.budget_line_id == BudgetLine.id)
        .where(BudgetLine.budget_id == budget_id)
        .order_by(BudgetCommitment.created_at.desc())
    ).all()
    return [BudgetCommitmentRead.model_validate(row) for row in rows]


def _invoice_reads(db: Session, budget_id: UUID) -> list[BudgetInvoiceRead]:
    rows = db.scalars(
        select(BudgetInvoice)
        .join(BudgetLine, BudgetInvoice.budget_line_id == BudgetLine.id)
        .where(BudgetLine.budget_id == budget_id)
        .order_by(BudgetInvoice.invoice_date.desc().nullslast())
    ).all()
    return [BudgetInvoiceRead.model_validate(row) for row in rows]


def get_budget_detail(db: Session, budget_id: UUID) -> BudgetDetailRead:
    budget = get_budget(db, budget_id)
    detail = BudgetDetailRead.model_validate(budget)
    _apply_totals(db, budget, detail)
    detail.lines = _line_reads(db, budget.id)
    detail.commitments = _commitment_reads(db, budget.id)
    detail.invoices = _invoice_reads(db, budget.id)
    return detail


def list_categories(db: Session) -> list[BudgetCategory]:
    return list(
        db.scalars(
            select(BudgetCategory)
            .where(BudgetCategory.is_active.is_(True))
            .order_by(BudgetCategory.sort_order, BudgetCategory.name)
        ).all()
    )


def _ensure_editable(budget: Budget) -> None:
    if budget.status == "closed":
        raise ValidationAppError("Un budget clôturé ne peut plus être modifié.")


def _get_line(db: Session, line_id: UUID) -> BudgetLine:
    line = db.get(BudgetLine, line_id)
    if line is None:
        raise NotFoundError("Ligne budgétaire introuvable.")
    return line


def get_line(db: Session, line_id: UUID) -> BudgetLine:
    return _get_line(db, line_id)


def _validate_category(db: Session, category_id: UUID) -> None:
    if db.get(BudgetCategory, category_id) is None:
        raise NotFoundError("Catégorie budgétaire introuvable.")


def _validate_supplier_contract(
    db: Session, supplier_id: UUID | None, contract_id: UUID | None
) -> None:
    if supplier_id and db.get(Supplier, supplier_id) is None:
        raise NotFoundError("Fournisseur introuvable.")
    if contract_id and db.get(Contract, contract_id) is None:
        raise NotFoundError("Contrat introuvable.")


def create_budget(
    db: Session,
    payload: BudgetCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> BudgetRead:
    if db.scalar(select(Budget).where(Budget.year == payload.year)):
        raise ConflictError("Un budget existe déjà pour cette année.")
    budget = Budget(**payload.model_dump())
    db.add(budget)
    db.flush()
    write_audit(
        db,
        module="budget",
        action="budget_created",
        actor=actor,
        entity_type="budget",
        entity_id=str(budget.id),
        entity_label=f"{budget.year} — {budget.name}",
        after={"status": budget.status},
        request=request,
    )
    db.commit()
    db.refresh(budget)
    return _budget_read(db, budget)


def update_budget(
    db: Session,
    budget: Budget,
    payload: BudgetUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> BudgetRead:
    data = payload.model_dump(exclude_unset=True)
    if budget.status == "closed" and data.get("status") != "closed":
        raise ValidationAppError("Un budget clôturé ne peut plus être rouvert.")
    before = {"status": budget.status, "name": budget.name}
    for field, value in data.items():
        setattr(budget, field, value)
    write_audit(
        db,
        module="budget",
        action="budget_updated",
        actor=actor,
        entity_type="budget",
        entity_id=str(budget.id),
        entity_label=f"{budget.year} — {budget.name}",
        before=before,
        after={"status": budget.status, "name": budget.name},
        request=request,
    )
    db.commit()
    db.refresh(budget)
    return _budget_read(db, budget)


def validate_budget(
    db: Session, budget: Budget, *, actor: User, request: Request | None = None
) -> BudgetRead:
    if budget.status != "draft":
        raise ValidationAppError("Seul un budget en brouillon peut être validé.")
    totals = _totals(db, budget.id)
    budget.status = "voted"
    budget.planned_total = Decimal(str(totals["planned"]))
    budget.voted_total = Decimal(str(totals["voted"]))
    budget.validated_by_id = actor.id
    budget.validated_at = utcnow()
    write_audit(
        db,
        module="budget",
        action="budget_validated",
        actor=actor,
        entity_type="budget",
        entity_id=str(budget.id),
        entity_label=f"{budget.year} — {budget.name}",
        before={"status": "draft"},
        after={"status": "voted", "voted_total": totals["voted"]},
        request=request,
    )
    db.commit()
    db.refresh(budget)
    return _budget_read(db, budget)


def create_line(
    db: Session,
    budget: Budget,
    payload: BudgetLineCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> BudgetDetailRead:
    _ensure_editable(budget)
    _validate_category(db, payload.category_id)
    _validate_supplier_contract(db, None, payload.contract_id)
    data = payload.model_dump(exclude={"planned_amount", "voted_amount"})
    line = BudgetLine(
        **data,
        budget_id=budget.id,
        planned_amount=_decimal(payload.planned_amount),
        voted_amount=_decimal(payload.voted_amount),
    )
    db.add(line)
    db.flush()
    write_audit(
        db,
        module="budget",
        action="budget_line_created",
        actor=actor,
        entity_type="budget_line",
        entity_id=str(line.id),
        entity_label=line.label,
        after={"planned_amount": _amount(line.planned_amount)},
        request=request,
    )
    db.commit()
    return get_budget_detail(db, budget.id)


def update_line(
    db: Session,
    line: BudgetLine,
    payload: BudgetLineUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> BudgetDetailRead:
    budget = line.budget
    _ensure_editable(budget)
    data = payload.model_dump(exclude_unset=True)
    if "category_id" in data and data["category_id"]:
        _validate_category(db, data["category_id"])
    if "contract_id" in data:
        _validate_supplier_contract(db, None, data["contract_id"])
    for field in ("planned_amount", "voted_amount"):
        if field in data:
            data[field] = _decimal(data[field])
    for field, value in data.items():
        setattr(line, field, value)
    write_audit(
        db,
        module="budget",
        action="budget_line_updated",
        actor=actor,
        entity_type="budget_line",
        entity_id=str(line.id),
        entity_label=line.label,
        request=request,
    )
    db.commit()
    return get_budget_detail(db, budget.id)


def delete_line(
    db: Session,
    line: BudgetLine,
    *,
    actor: User,
    request: Request | None = None,
) -> BudgetDetailRead:
    budget = line.budget
    _ensure_editable(budget)
    commitments = db.scalar(
        select(func.count())
        .select_from(BudgetCommitment)
        .where(BudgetCommitment.budget_line_id == line.id)
    )
    invoices = db.scalar(
        select(func.count())
        .select_from(BudgetInvoice)
        .where(BudgetInvoice.budget_line_id == line.id)
    )
    if commitments or invoices:
        raise ConflictError(
            "Cette ligne contient des engagements ou factures : elle ne peut pas être supprimée."
        )
    db.delete(line)
    write_audit(
        db,
        module="budget",
        action="budget_line_deleted",
        actor=actor,
        entity_type="budget_line",
        entity_id=str(line.id),
        entity_label=line.label,
        request=request,
    )
    db.commit()
    return get_budget_detail(db, budget.id)


def _get_line_in_budget(db: Session, line_id: UUID, budget_id: UUID) -> BudgetLine:
    line = _get_line(db, line_id)
    if line.budget_id != budget_id:
        raise ValidationAppError("La ligne n'appartient pas à ce budget.")
    return line


def create_commitment(
    db: Session,
    budget: Budget,
    payload: BudgetCommitmentCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> BudgetDetailRead:
    _ensure_editable(budget)
    line = _get_line_in_budget(db, payload.budget_line_id, budget.id)
    _validate_supplier_contract(db, payload.supplier_id, payload.contract_id)
    data = payload.model_dump(exclude={"amount_ht", "amount_ttc"})
    commitment = BudgetCommitment(
        **data,
        amount_ht=_decimal(payload.amount_ht),
        amount_ttc=_decimal(payload.amount_ttc),
        created_by_id=actor.id,
    )
    db.add(commitment)
    db.flush()
    write_audit(
        db,
        module="budget",
        action="commitment_created",
        actor=actor,
        entity_type="budget_commitment",
        entity_id=str(commitment.id),
        entity_label=commitment.object,
        after={"line": line.label, "status": commitment.status},
        request=request,
    )
    db.commit()
    return get_budget_detail(db, budget.id)


def update_commitment(
    db: Session,
    commitment: BudgetCommitment,
    payload: BudgetCommitmentUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> BudgetDetailRead:
    budget = commitment.budget_line.budget
    _ensure_editable(budget)
    data = payload.model_dump(exclude_unset=True)
    if data.get("budget_line_id"):
        _get_line_in_budget(db, data["budget_line_id"], budget.id)
    if "supplier_id" in data or "contract_id" in data:
        _validate_supplier_contract(db, data.get("supplier_id"), data.get("contract_id"))
    for field in ("amount_ht", "amount_ttc"):
        if field in data:
            data[field] = _decimal(data[field])
    for field, value in data.items():
        setattr(commitment, field, value)
    write_audit(
        db,
        module="budget",
        action="commitment_updated",
        actor=actor,
        entity_type="budget_commitment",
        entity_id=str(commitment.id),
        entity_label=commitment.object,
        request=request,
    )
    db.commit()
    return get_budget_detail(db, budget.id)


def delete_commitment(
    db: Session,
    commitment: BudgetCommitment,
    *,
    actor: User,
    request: Request | None = None,
) -> BudgetDetailRead:
    budget = commitment.budget_line.budget
    _ensure_editable(budget)
    invoices = db.scalar(
        select(func.count())
        .select_from(BudgetInvoice)
        .where(BudgetInvoice.commitment_id == commitment.id)
    )
    if invoices:
        raise ConflictError("Cet engagement possède des factures : il ne peut pas être supprimé.")
    db.delete(commitment)
    write_audit(
        db,
        module="budget",
        action="commitment_deleted",
        actor=actor,
        entity_type="budget_commitment",
        entity_id=str(commitment.id),
        entity_label=commitment.object,
        request=request,
    )
    db.commit()
    return get_budget_detail(db, budget.id)


def get_commitment(db: Session, commitment_id: UUID) -> BudgetCommitment:
    commitment = db.get(BudgetCommitment, commitment_id)
    if commitment is None:
        raise NotFoundError("Engagement introuvable.")
    return commitment


def create_invoice(
    db: Session,
    budget: Budget,
    payload: BudgetInvoiceCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> BudgetDetailRead:
    _ensure_editable(budget)
    line = _get_line_in_budget(db, payload.budget_line_id, budget.id)
    commitment = None
    if payload.commitment_id:
        commitment = get_commitment(db, payload.commitment_id)
        if commitment.budget_line_id != line.id:
            raise ValidationAppError("L'engagement n'appartient pas à cette ligne budgétaire.")
    _validate_supplier_contract(db, payload.supplier_id, None)
    data = payload.model_dump(exclude={"amount_ht", "amount_ttc", "vat_rate"})
    invoice = BudgetInvoice(
        **data,
        amount_ht=_decimal(payload.amount_ht),
        amount_ttc=_decimal(payload.amount_ttc),
        vat_rate=_decimal(payload.vat_rate),
    )
    db.add(invoice)
    db.flush()
    write_audit(
        db,
        module="budget",
        action="invoice_created",
        actor=actor,
        entity_type="budget_invoice",
        entity_id=str(invoice.id),
        entity_label=invoice.invoice_number or line.label,
        after={"line": line.label, "status": invoice.status},
        request=request,
    )
    db.commit()
    return get_budget_detail(db, budget.id)


def get_invoice(db: Session, invoice_id: UUID) -> BudgetInvoice:
    invoice = db.get(BudgetInvoice, invoice_id)
    if invoice is None:
        raise NotFoundError("Facture introuvable.")
    return invoice


def update_invoice(
    db: Session,
    invoice: BudgetInvoice,
    payload: BudgetInvoiceUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> BudgetDetailRead:
    budget = invoice.budget_line.budget
    _ensure_editable(budget)
    data = payload.model_dump(exclude_unset=True)
    if data.get("budget_line_id"):
        _get_line_in_budget(db, data["budget_line_id"], budget.id)
    if data.get("commitment_id"):
        commitment = get_commitment(db, data["commitment_id"])
        line_id = data.get("budget_line_id") or invoice.budget_line_id
        if commitment.budget_line_id != line_id:
            raise ValidationAppError("L'engagement n'appartient pas à cette ligne budgétaire.")
    if "supplier_id" in data:
        _validate_supplier_contract(db, data.get("supplier_id"), None)
    for field in ("amount_ht", "amount_ttc", "vat_rate"):
        if field in data:
            data[field] = _decimal(data[field])
    for field, value in data.items():
        setattr(invoice, field, value)
    write_audit(
        db,
        module="budget",
        action="invoice_updated",
        actor=actor,
        entity_type="budget_invoice",
        entity_id=str(invoice.id),
        entity_label=invoice.invoice_number or invoice.budget_line.label,
        after={"status": invoice.status},
        request=request,
    )
    db.commit()
    return get_budget_detail(db, budget.id)


def delete_invoice(
    db: Session,
    invoice: BudgetInvoice,
    *,
    actor: User,
    request: Request | None = None,
) -> BudgetDetailRead:
    budget = invoice.budget_line.budget
    _ensure_editable(budget)
    db.delete(invoice)
    write_audit(
        db,
        module="budget",
        action="invoice_deleted",
        actor=actor,
        entity_type="budget_invoice",
        entity_id=str(invoice.id),
        entity_label=invoice.invoice_number or invoice.budget_line.label,
        request=request,
    )
    db.commit()
    return get_budget_detail(db, budget.id)
