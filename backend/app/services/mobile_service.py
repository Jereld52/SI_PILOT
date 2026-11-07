from __future__ import annotations

import re
from decimal import Decimal
from uuid import UUID

from app.core.errors import ConflictError, NotFoundError
from app.models.auth import User
from app.models.mobile import MobileLine
from app.schemas.mobile import MobileLineCreate, MobileLineUpdate
from app.services.audit_service import write_audit
from fastapi import Request
from sqlalchemy import or_, select
from sqlalchemy.orm import Session


def normalize_phone(value: str | None) -> str:
    digits = re.sub(r"\D", "", value or "")
    if digits.startswith("33") and len(digits) == 11:
        digits = "0" + digits[2:]
    elif len(digits) == 9:
        digits = "0" + digits
    return digits


def _decimal(value: float | None) -> Decimal | None:
    if value is None:
        return None
    return Decimal(str(value)).quantize(Decimal("0.01"))


def list_mobile_lines(
    db: Session,
    *,
    q: str | None = None,
    status: str | None = None,
    plan: str | None = None,
    secondary: bool | None = None,
) -> list[MobileLine]:
    statement = select(MobileLine)
    if q:
        pattern = f"%{q.strip()}%"
        statement = statement.where(
            or_(
                MobileLine.line_number.ilike(pattern),
                MobileLine.holder_name.ilike(pattern),
                MobileLine.role_label.ilike(pattern),
                MobileLine.email.ilike(pattern),
                MobileLine.plan_name.ilike(pattern),
                MobileLine.terminal_communicating.ilike(pattern),
                MobileLine.imei_communicating.ilike(pattern),
            )
        )
    if status:
        statement = statement.where(MobileLine.status == status)
    if plan:
        statement = statement.where(MobileLine.plan_name == plan)
    if secondary is not None:
        statement = statement.where(MobileLine.is_secondary_line.is_(secondary))
    return list(db.scalars(statement.order_by(MobileLine.holder_name, MobileLine.line_number)).all())


def get_mobile_line(db: Session, line_id: UUID) -> MobileLine:
    line = db.get(MobileLine, line_id)
    if line is None:
        raise NotFoundError("Ligne mobile introuvable.")
    return line


def create_mobile_line(
    db: Session,
    payload: MobileLineCreate,
    *,
    actor: User,
    request: Request | None = None,
    commit: bool = True,
    source: str = "api",
) -> MobileLine:
    line_number = normalize_phone(payload.line_number)
    if not line_number:
        raise ConflictError("Numéro de ligne invalide.")
    if db.scalar(select(MobileLine).where(MobileLine.line_number == line_number)):
        raise ConflictError("Cette ligne mobile existe déjà.")
    data = payload.model_dump(exclude={"line_number", "out_of_bundle"})
    line = MobileLine(
        **data,
        line_number=line_number,
        out_of_bundle=_decimal(payload.out_of_bundle),
    )
    db.add(line)
    db.flush()
    write_audit(
        db,
        module="mobile_lines",
        action="mobile_line_created",
        actor=actor,
        entity_type="mobile_line",
        entity_id=str(line.id),
        entity_label=line.line_number,
        after={
            "line_number": line.line_number,
            "holder_name": line.holder_name,
            "status": line.status,
        },
        request=request,
        source=source,
    )
    if commit:
        db.commit()
        db.refresh(line)
    else:
        db.flush()
    return line


def update_mobile_line(
    db: Session,
    line: MobileLine,
    payload: MobileLineUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> MobileLine:
    data = payload.model_dump(exclude_unset=True)
    if "out_of_bundle" in data:
        data["out_of_bundle"] = _decimal(data["out_of_bundle"])
    before = {
        "holder_name": line.holder_name,
        "role_label": line.role_label,
        "status": line.status,
        "plan_name": line.plan_name,
        "terminal_communicating": line.terminal_communicating,
    }
    for field, value in data.items():
        setattr(line, field, value)
    write_audit(
        db,
        module="mobile_lines",
        action="mobile_line_updated",
        actor=actor,
        entity_type="mobile_line",
        entity_id=str(line.id),
        entity_label=line.line_number,
        before=before,
        after={
            "holder_name": line.holder_name,
            "role_label": line.role_label,
            "status": line.status,
            "plan_name": line.plan_name,
            "terminal_communicating": line.terminal_communicating,
        },
        request=request,
    )
    db.commit()
    db.refresh(line)
    return line
