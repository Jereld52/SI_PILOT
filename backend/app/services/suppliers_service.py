from __future__ import annotations

from uuid import UUID

from app.core.errors import ConflictError, NotFoundError
from app.models.assets import Asset, License, Supplier, SupplierContact
from app.models.auth import User
from app.schemas.suppliers import (
    SupplierContactInput,
    SupplierCreate,
    SupplierRead,
    SupplierUpdate,
)
from app.services.audit_service import write_audit
from fastapi import Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session


def _counts(db: Session, supplier: Supplier) -> tuple[int, int]:
    asset_count = (
        db.scalar(
            select(func.count()).select_from(Asset).where(Asset.supplier_id == supplier.id)
        )
        or 0
    )
    license_count = (
        db.scalar(
            select(func.count())
            .select_from(License)
            .where(func.lower(License.vendor) == supplier.name.strip().lower())
        )
        or 0
    )
    return asset_count, license_count


def _read(db: Session, supplier: Supplier) -> SupplierRead:
    data = SupplierRead.model_validate(supplier)
    asset_count, license_count = _counts(db, supplier)
    data.asset_count = asset_count
    data.license_count = license_count
    return data


def _apply_contacts(
    db: Session, supplier: Supplier, contacts: list[SupplierContactInput]
) -> None:
    supplier.contacts = [
        SupplierContact(
            name=contact.name.strip(),
            role=contact.role,
            email=str(contact.email) if contact.email else None,
            phone=contact.phone,
            is_primary=contact.is_primary,
        )
        for contact in contacts
    ]


def list_suppliers(
    db: Session, *, q: str | None = None, include_inactive: bool = False
) -> list[SupplierRead]:
    statement = select(Supplier)
    if not include_inactive:
        statement = statement.where(Supplier.is_active.is_(True))
    if q:
        pattern = f"%{q.strip()}%"
        statement = statement.where(
            or_(
                Supplier.name.ilike(pattern),
                Supplier.contact_name.ilike(pattern),
                Supplier.email.ilike(pattern),
                Supplier.siret.ilike(pattern),
            )
        )
    suppliers = list(db.scalars(statement.order_by(Supplier.name)).all())
    return [_read(db, supplier) for supplier in suppliers]


def get_supplier(db: Session, supplier_id: UUID) -> Supplier:
    supplier = db.get(Supplier, supplier_id)
    if supplier is None:
        raise NotFoundError("Fournisseur introuvable.")
    return supplier


def get_supplier_read(db: Session, supplier_id: UUID) -> SupplierRead:
    return _read(db, get_supplier(db, supplier_id))


def create_supplier(
    db: Session,
    payload: SupplierCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> SupplierRead:
    name = payload.name.strip()
    if db.scalar(select(Supplier).where(func.lower(Supplier.name) == name.lower())):
        raise ConflictError("Un fournisseur porte déjà ce nom.")
    data = payload.model_dump(exclude={"contacts", "name", "email"})
    supplier = Supplier(
        **data,
        name=name,
        email=str(payload.email) if payload.email else None,
    )
    db.add(supplier)
    db.flush()
    _apply_contacts(db, supplier, payload.contacts)
    write_audit(
        db,
        module="suppliers",
        action="supplier_created",
        actor=actor,
        entity_type="supplier",
        entity_id=str(supplier.id),
        entity_label=supplier.name,
        after={"name": supplier.name, "type": supplier.type},
        request=request,
    )
    db.commit()
    db.refresh(supplier)
    return _read(db, supplier)


def update_supplier(
    db: Session,
    supplier: Supplier,
    payload: SupplierUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> SupplierRead:
    data = payload.model_dump(exclude_unset=True)
    contacts = data.pop("contacts", None)
    if "name" in data and data["name"]:
        name = str(data["name"]).strip()
        existing = db.scalar(
            select(Supplier).where(
                func.lower(Supplier.name) == name.lower(), Supplier.id != supplier.id
            )
        )
        if existing:
            raise ConflictError("Un fournisseur porte déjà ce nom.")
        data["name"] = name
    if "email" in data:
        data["email"] = str(data["email"]) if data["email"] else None
    before = {"name": supplier.name, "is_active": supplier.is_active}
    for field, value in data.items():
        setattr(supplier, field, value)
    if contacts is not None:
        _apply_contacts(db, supplier, [SupplierContactInput(**item) for item in contacts])
    write_audit(
        db,
        module="suppliers",
        action="supplier_updated",
        actor=actor,
        entity_type="supplier",
        entity_id=str(supplier.id),
        entity_label=supplier.name,
        before=before,
        after={"name": supplier.name, "is_active": supplier.is_active},
        request=request,
    )
    db.commit()
    db.refresh(supplier)
    return _read(db, supplier)
