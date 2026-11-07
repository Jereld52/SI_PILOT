from __future__ import annotations

from datetime import date
from decimal import Decimal, InvalidOperation
from uuid import UUID

from app.core.errors import NotFoundError, ValidationAppError
from app.models.assets import License
from app.models.auth import User
from app.models.contracts import Contract
from app.schemas.licenses import LicenseCreate, LicenseRead, LicenseUpdate
from app.services.audit_service import write_audit
from fastapi import Request
from sqlalchemy import or_, select
from sqlalchemy.orm import Session


def _decimal(value: float | None) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError) as exc:
        raise ValidationAppError("Montant invalide.") from exc


def _validate_contract(db: Session, contract_id: UUID | None) -> None:
    if contract_id and db.get(Contract, contract_id) is None:
        raise NotFoundError("Contrat introuvable.")


def _read(db: Session, license_row: License) -> LicenseRead:
    data = LicenseRead.model_validate(license_row)
    data.annual_cost = (
        float(license_row.annual_cost) if license_row.annual_cost is not None else None
    )
    return data


def list_licenses(
    db: Session,
    *,
    q: str | None = None,
    active_only: bool = False,
    expiring_before: date | None = None,
) -> list[LicenseRead]:
    statement = select(License)
    if active_only:
        statement = statement.where(License.is_active.is_(True))
    if expiring_before:
        statement = statement.where(
            License.end_date.is_not(None), License.end_date <= expiring_before
        )
    if q:
        pattern = f"%{q.strip()}%"
        statement = statement.where(
            or_(
                License.name.ilike(pattern),
                License.vendor.ilike(pattern),
                License.license_type.ilike(pattern),
            )
        )
    rows = db.scalars(statement.order_by(License.end_date, License.name)).all()
    return [_read(db, row) for row in rows]


def get_license(db: Session, license_id: UUID) -> License:
    license_row = db.get(License, license_id)
    if license_row is None:
        raise NotFoundError("Licence introuvable.")
    return license_row


def get_license_read(db: Session, license_id: UUID) -> LicenseRead:
    return _read(db, get_license(db, license_id))


def create_license(
    db: Session,
    payload: LicenseCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> LicenseRead:
    _validate_contract(db, payload.contract_id)
    data = payload.model_dump(exclude={"annual_cost"})
    license_row = License(**data, annual_cost=_decimal(payload.annual_cost))
    if (
        license_row.seats is not None
        and license_row.seats_used is not None
        and license_row.seats_used > license_row.seats
    ):
        raise ValidationAppError(
            "Le nombre de licences utilisées dépasse le nombre de licences.",
            fields=[{"field": "seats_used", "message": "Supérieur au nombre de licences."}],
        )
    db.add(license_row)
    db.flush()
    write_audit(
        db,
        module="licenses",
        action="license_created",
        actor=actor,
        entity_type="license",
        entity_id=str(license_row.id),
        entity_label=license_row.name,
        after={"name": license_row.name, "seats": license_row.seats},
        request=request,
    )
    db.commit()
    db.refresh(license_row)
    return _read(db, license_row)


def update_license(
    db: Session,
    license_row: License,
    payload: LicenseUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> LicenseRead:
    data = payload.model_dump(exclude_unset=True)
    if "contract_id" in data:
        _validate_contract(db, data["contract_id"])
    if "annual_cost" in data:
        data["annual_cost"] = _decimal(data["annual_cost"])
    for field, value in data.items():
        setattr(license_row, field, value)
    if (
        license_row.seats is not None
        and license_row.seats_used is not None
        and license_row.seats_used > license_row.seats
    ):
        raise ValidationAppError(
            "Le nombre de licences utilisées dépasse le nombre de licences.",
            fields=[{"field": "seats_used", "message": "Supérieur au nombre de licences."}],
        )
    write_audit(
        db,
        module="licenses",
        action="license_updated",
        actor=actor,
        entity_type="license",
        entity_id=str(license_row.id),
        entity_label=license_row.name,
        after={"is_active": license_row.is_active},
        request=request,
    )
    db.commit()
    db.refresh(license_row)
    return _read(db, license_row)
