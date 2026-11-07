from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from uuid import UUID

from app.core.errors import ConflictError, NotFoundError, ValidationAppError
from app.models.assets import Supplier
from app.models.auth import User
from app.models.contracts import Contract, ContractCategory
from app.schemas.contracts import ContractCreate, ContractRead, ContractUpdate
from app.services.audit_service import write_audit
from fastapi import Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session


def _decimal(value: float | None) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError) as exc:
        raise ValidationAppError("Montant invalide.") from exc


def _read(contract: Contract) -> ContractRead:
    data = ContractRead.model_validate(contract)
    data.amount_ht = float(contract.amount_ht) if contract.amount_ht is not None else None
    data.amount_ttc = float(contract.amount_ttc) if contract.amount_ttc is not None else None
    data.vat_rate = float(contract.vat_rate) if contract.vat_rate is not None else None
    data.annual_cost = (
        float(contract.annual_cost) if contract.annual_cost is not None else None
    )
    data.monthly_cost = (
        float(contract.monthly_cost) if contract.monthly_cost is not None else None
    )
    if contract.end_date:
        data.days_to_end = (contract.end_date - date.today()).days
        data.renewal_deadline = contract.end_date - timedelta(days=contract.notice_days or 0)
        if contract.status in ("active", "expiring"):
            days = data.days_to_end
            if days < 0:
                data.alert_level = "expired"
            elif days <= 30:
                data.alert_level = "critical"
            elif days <= 90:
                data.alert_level = "warning"
            elif days <= 180:
                data.alert_level = "notice"
    return data


def list_contracts(
    db: Session,
    *,
    q: str | None = None,
    status: str | None = None,
    category_id: UUID | None = None,
    supplier_id: UUID | None = None,
    expiring_days: int | None = None,
) -> list[ContractRead]:
    statement = select(Contract)
    if status:
        statement = statement.where(Contract.status == status)
    if category_id:
        statement = statement.where(Contract.category_id == category_id)
    if supplier_id:
        statement = statement.where(Contract.supplier_id == supplier_id)
    if expiring_days is not None:
        today = date.today()
        statement = statement.where(
            Contract.status.in_(("active", "expiring")),
            Contract.end_date.is_not(None),
            Contract.end_date >= today,
            Contract.end_date <= today + timedelta(days=expiring_days),
        )
    if q:
        pattern = f"%{q.strip()}%"
        statement = statement.where(
            or_(
                Contract.reference.ilike(pattern),
                Contract.object.ilike(pattern),
                Contract.contact_name.ilike(pattern),
            )
        )
    rows = db.scalars(
        statement.order_by(Contract.end_date.asc().nullslast(), Contract.reference)
    ).all()
    return [_read(row) for row in rows]


def get_contract(db: Session, contract_id: UUID) -> Contract:
    contract = db.get(Contract, contract_id)
    if contract is None:
        raise NotFoundError("Contrat introuvable.")
    return contract


def get_contract_read(db: Session, contract_id: UUID) -> ContractRead:
    return _read(get_contract(db, contract_id))


def list_categories(db: Session) -> list[ContractCategory]:
    return list(
        db.scalars(
            select(ContractCategory)
            .where(ContractCategory.is_active.is_(True))
            .order_by(ContractCategory.name)
        ).all()
    )


def _validate_links(
    db: Session,
    *,
    supplier_id: UUID,
    category_id: UUID | None,
    responsible_user_id: UUID | None,
) -> None:
    if db.get(Supplier, supplier_id) is None:
        raise NotFoundError("Fournisseur introuvable.")
    if category_id and db.get(ContractCategory, category_id) is None:
        raise NotFoundError("Catégorie de contrat introuvable.")
    if responsible_user_id and db.get(User, responsible_user_id) is None:
        raise NotFoundError("Responsable introuvable.")


def _check_reference(db: Session, reference: str, *, exclude_id: UUID | None = None) -> None:
    statement = select(Contract).where(func.lower(Contract.reference) == reference.lower())
    if exclude_id:
        statement = statement.where(Contract.id != exclude_id)
    if db.scalar(statement):
        raise ConflictError("Un contrat utilise déjà cette référence.")


def create_contract(
    db: Session,
    payload: ContractCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> ContractRead:
    _validate_links(
        db,
        supplier_id=payload.supplier_id,
        category_id=payload.category_id,
        responsible_user_id=payload.responsible_user_id,
    )
    reference = payload.reference.strip()
    _check_reference(db, reference)
    data = payload.model_dump(
        exclude={
            "reference",
            "amount_ht",
            "amount_ttc",
            "vat_rate",
            "annual_cost",
            "monthly_cost",
            "contact_email",
        }
    )
    contract = Contract(
        **data,
        reference=reference,
        amount_ht=_decimal(payload.amount_ht),
        amount_ttc=_decimal(payload.amount_ttc),
        vat_rate=_decimal(payload.vat_rate),
        annual_cost=_decimal(payload.annual_cost),
        monthly_cost=_decimal(payload.monthly_cost),
        contact_email=str(payload.contact_email) if payload.contact_email else None,
        created_by_id=actor.id,
        updated_by_id=actor.id,
    )
    db.add(contract)
    db.flush()
    write_audit(
        db,
        module="contracts",
        action="contract_created",
        actor=actor,
        entity_type="contract",
        entity_id=str(contract.id),
        entity_label=f"{contract.reference} — {contract.object}",
        after={"status": contract.status, "supplier_id": str(contract.supplier_id)},
        request=request,
    )
    db.commit()
    db.refresh(contract)
    return _read(contract)


def update_contract(
    db: Session,
    contract: Contract,
    payload: ContractUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> ContractRead:
    data = payload.model_dump(exclude_unset=True)
    supplier_id = data.get("supplier_id") or contract.supplier_id
    _validate_links(
        db,
        supplier_id=supplier_id,
        category_id=data.get("category_id"),
        responsible_user_id=data.get("responsible_user_id"),
    )
    if "reference" in data and data["reference"]:
        reference = str(data["reference"]).strip()
        _check_reference(db, reference, exclude_id=contract.id)
        data["reference"] = reference
    for field in ("amount_ht", "amount_ttc", "vat_rate", "annual_cost", "monthly_cost"):
        if field in data:
            data[field] = _decimal(data[field])
    if "contact_email" in data:
        data["contact_email"] = str(data["contact_email"]) if data["contact_email"] else None
    before = {"status": contract.status, "reference": contract.reference}
    for field, value in data.items():
        setattr(contract, field, value)
    contract.updated_by_id = actor.id
    write_audit(
        db,
        module="contracts",
        action="contract_updated",
        actor=actor,
        entity_type="contract",
        entity_id=str(contract.id),
        entity_label=f"{contract.reference} — {contract.object}",
        before=before,
        after={"status": contract.status, "reference": contract.reference},
        request=request,
    )
    db.commit()
    db.refresh(contract)
    return _read(contract)


def terminate_contract(
    db: Session, contract: Contract, *, actor: User, request: Request | None = None
) -> ContractRead:
    previous = contract.status
    contract.status = "terminated"
    contract.updated_by_id = actor.id
    write_audit(
        db,
        module="contracts",
        action="contract_terminated",
        actor=actor,
        entity_type="contract",
        entity_id=str(contract.id),
        entity_label=f"{contract.reference} — {contract.object}",
        before={"status": previous},
        after={"status": "terminated"},
        request=request,
    )
    db.commit()
    db.refresh(contract)
    return _read(contract)
