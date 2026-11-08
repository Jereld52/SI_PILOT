from __future__ import annotations

from uuid import UUID

from app.core.errors import ConflictError, NotFoundError, ValidationAppError
from app.db.base import utcnow
from app.models.assets import Asset
from app.models.auth import User
from app.models.infrastructure import (
    InfraDependency,
    InfraEquipment,
    MonitoringCheck,
    MonitoringResult,
)
from app.models.organization import Location
from app.schemas.infrastructure import (
    InfraDependencyCreate,
    InfraDependencyRead,
    InfraEquipmentCreate,
    InfraEquipmentRead,
    InfraEquipmentUpdate,
    MonitoringCheckCreate,
    MonitoringCheckRead,
    MonitoringCheckUpdate,
    MonitoringResultCreate,
    MonitoringResultRead,
)
from app.services.audit_service import write_audit
from fastapi import Request
from sqlalchemy import or_, select
from sqlalchemy.orm import Session


def list_equipments(
    db: Session,
    *,
    q: str | None = None,
    type: str | None = None,
    status: str | None = None,
    criticality: str | None = None,
) -> list[InfraEquipmentRead]:
    statement = select(InfraEquipment)
    if type:
        statement = statement.where(InfraEquipment.type == type)
    if status:
        statement = statement.where(InfraEquipment.status == status)
    if criticality:
        statement = statement.where(InfraEquipment.criticality == criticality)
    if q:
        pattern = f"%{q.strip()}%"
        statement = statement.where(
            or_(
                InfraEquipment.name.ilike(pattern),
                InfraEquipment.role.ilike(pattern),
                InfraEquipment.ip_address.ilike(pattern),
                InfraEquipment.os_name.ilike(pattern),
            )
        )
    rows = db.scalars(statement.order_by(InfraEquipment.name)).all()
    return [InfraEquipmentRead.model_validate(row) for row in rows]


def get_equipment(db: Session, equipment_id: UUID) -> InfraEquipment:
    equipment = db.get(InfraEquipment, equipment_id)
    if equipment is None:
        raise NotFoundError("Équipement d'infrastructure introuvable.")
    return equipment


def _validate_links(
    db: Session,
    *,
    asset_id: UUID | None,
    location_id: UUID | None,
    responsible_user_id: UUID | None,
    parent_id: UUID | None,
    exclude_id: UUID | None = None,
) -> None:
    if asset_id and db.get(Asset, asset_id) is None:
        raise NotFoundError("Équipement du parc introuvable.")
    if location_id and db.get(Location, location_id) is None:
        raise NotFoundError("Site introuvable.")
    if responsible_user_id and db.get(User, responsible_user_id) is None:
        raise NotFoundError("Responsable introuvable.")
    if parent_id:
        if exclude_id and parent_id == exclude_id:
            raise ValidationAppError("Un équipement ne peut pas être son propre parent.")
        if db.get(InfraEquipment, parent_id) is None:
            raise NotFoundError("Équipement parent introuvable.")


def _check_unique(
    db: Session,
    *,
    ip_address: str | None,
    mac_address: str | None,
    exclude_id: UUID | None = None,
) -> None:
    for column, value, label in (
        (InfraEquipment.ip_address, ip_address, "adresse IP"),
        (InfraEquipment.mac_address, mac_address, "adresse MAC"),
    ):
        if not value:
            continue
        statement = select(InfraEquipment).where(column == value.strip())
        if exclude_id:
            statement = statement.where(InfraEquipment.id != exclude_id)
        if db.scalar(statement):
            raise ConflictError(f"Un équipement d'infrastructure utilise déjà cette {label}.")


def create_equipment(
    db: Session,
    payload: InfraEquipmentCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> InfraEquipmentRead:
    _validate_links(
        db,
        asset_id=payload.asset_id,
        location_id=payload.location_id,
        responsible_user_id=payload.responsible_user_id,
        parent_id=payload.parent_id,
    )
    _check_unique(
        db,
        ip_address=payload.ip_address,
        mac_address=payload.mac_address,
    )
    equipment = InfraEquipment(**payload.model_dump())
    db.add(equipment)
    db.flush()
    write_audit(
        db,
        module="infrastructure",
        action="infra_equipment_created",
        actor=actor,
        entity_type="infra_equipment",
        entity_id=str(equipment.id),
        entity_label=equipment.name,
        after={"type": equipment.type, "criticality": equipment.criticality},
        request=request,
    )
    db.commit()
    db.refresh(equipment)
    return InfraEquipmentRead.model_validate(equipment)


def update_equipment(
    db: Session,
    equipment: InfraEquipment,
    payload: InfraEquipmentUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> InfraEquipmentRead:
    data = payload.model_dump(exclude_unset=True)
    _validate_links(
        db,
        asset_id=data.get("asset_id"),
        location_id=data.get("location_id"),
        responsible_user_id=data.get("responsible_user_id"),
        parent_id=data.get("parent_id"),
        exclude_id=equipment.id,
    )
    _check_unique(
        db,
        ip_address=data.get("ip_address"),
        mac_address=data.get("mac_address"),
        exclude_id=equipment.id,
    )
    before = {"name": equipment.name, "status": equipment.status}
    for field, value in data.items():
        setattr(equipment, field, value)
    write_audit(
        db,
        module="infrastructure",
        action="infra_equipment_updated",
        actor=actor,
        entity_type="infra_equipment",
        entity_id=str(equipment.id),
        entity_label=equipment.name,
        before=before,
        after={"name": equipment.name, "status": equipment.status},
        request=request,
    )
    db.commit()
    db.refresh(equipment)
    return InfraEquipmentRead.model_validate(equipment)


def archive_equipment(
    db: Session, equipment: InfraEquipment, *, actor: User, request: Request | None = None
) -> InfraEquipmentRead:
    previous = equipment.status
    equipment.status = "retired"
    write_audit(
        db,
        module="infrastructure",
        action="infra_equipment_archived",
        actor=actor,
        entity_type="infra_equipment",
        entity_id=str(equipment.id),
        entity_label=equipment.name,
        before={"status": previous},
        after={"status": "retired"},
        request=request,
    )
    db.commit()
    db.refresh(equipment)
    return InfraEquipmentRead.model_validate(equipment)


def list_dependencies(db: Session) -> list[InfraDependencyRead]:
    rows = db.scalars(
        select(InfraDependency).order_by(InfraDependency.dependency_type)
    ).all()
    return [InfraDependencyRead.model_validate(row) for row in rows]


def create_dependency(
    db: Session,
    payload: InfraDependencyCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> InfraDependencyRead:
    if payload.source_id == payload.target_id:
        raise ValidationAppError("Une dépendance doit relier deux équipements différents.")
    source = get_equipment(db, payload.source_id)
    target = get_equipment(db, payload.target_id)
    existing = db.scalar(
        select(InfraDependency).where(
            InfraDependency.source_id == payload.source_id,
            InfraDependency.target_id == payload.target_id,
            InfraDependency.dependency_type == payload.dependency_type,
        )
    )
    if existing:
        raise ConflictError("Cette dépendance existe déjà.")
    dependency = InfraDependency(**payload.model_dump())
    db.add(dependency)
    db.flush()
    write_audit(
        db,
        module="infrastructure",
        action="infra_dependency_created",
        actor=actor,
        entity_type="infra_dependency",
        entity_id=str(dependency.id),
        entity_label=f"{source.name} → {target.name}",
        after={"type": dependency.dependency_type},
        request=request,
    )
    db.commit()
    db.refresh(dependency)
    return InfraDependencyRead.model_validate(dependency)


def delete_dependency(
    db: Session,
    dependency: InfraDependency,
    *,
    actor: User,
    request: Request | None = None,
) -> None:
    write_audit(
        db,
        module="infrastructure",
        action="infra_dependency_deleted",
        actor=actor,
        entity_type="infra_dependency",
        entity_id=str(dependency.id),
        entity_label=f"{dependency.source_name} → {dependency.target_name}",
        request=request,
    )
    db.delete(dependency)
    db.commit()


def get_dependency(db: Session, dependency_id: UUID) -> InfraDependency:
    dependency = db.get(InfraDependency, dependency_id)
    if dependency is None:
        raise NotFoundError("Dépendance introuvable.")
    return dependency


def list_checks(db: Session, *, infra_id: UUID | None = None) -> list[MonitoringCheckRead]:
    statement = select(MonitoringCheck)
    if infra_id:
        statement = statement.where(MonitoringCheck.infra_id == infra_id)
    rows = db.scalars(
        statement.order_by(MonitoringCheck.created_at.desc())
    ).all()
    return [MonitoringCheckRead.model_validate(row) for row in rows]


def get_check(db: Session, check_id: UUID) -> MonitoringCheck:
    check = db.get(MonitoringCheck, check_id)
    if check is None:
        raise NotFoundError("Contrôle de supervision introuvable.")
    return check


def _ensure_enable_allowed(check: MonitoringCheck, enabled: bool) -> None:
    if (
        enabled
        and check.requires_authorization
        and check.authorized_at is None
        and not check.is_enabled
    ):
        raise ValidationAppError(
            "Ce contrôle doit être autorisé avant d'être activé.",
            fields=[{"field": "is_enabled", "message": "Autorisation requise."}],
        )


def create_check(
    db: Session,
    payload: MonitoringCheckCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> MonitoringCheckRead:
    get_equipment(db, payload.infra_id)
    check = MonitoringCheck(
        **payload.model_dump(),
        requires_authorization=True,
    )
    if check.is_enabled:
        raise ValidationAppError(
            "Un nouveau contrôle doit être autorisé avant activation.",
            fields=[{"field": "is_enabled", "message": "Autorisation requise."}],
        )
    db.add(check)
    db.flush()
    write_audit(
        db,
        module="infrastructure",
        action="monitoring_check_created",
        actor=actor,
        entity_type="monitoring_check",
        entity_id=str(check.id),
        entity_label=f"{check.check_type} — {check.infra.name}",
        after={"is_enabled": check.is_enabled},
        request=request,
    )
    db.commit()
    db.refresh(check)
    return MonitoringCheckRead.model_validate(check)


def update_check(
    db: Session,
    check: MonitoringCheck,
    payload: MonitoringCheckUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> MonitoringCheckRead:
    data = payload.model_dump(exclude_unset=True)
    if "is_enabled" in data:
        _ensure_enable_allowed(check, bool(data["is_enabled"]))
    for field, value in data.items():
        setattr(check, field, value)
    write_audit(
        db,
        module="infrastructure",
        action="monitoring_check_updated",
        actor=actor,
        entity_type="monitoring_check",
        entity_id=str(check.id),
        entity_label=f"{check.check_type} — {check.infra.name}",
        after={"is_enabled": check.is_enabled, "interval_seconds": check.interval_seconds},
        request=request,
    )
    db.commit()
    db.refresh(check)
    return MonitoringCheckRead.model_validate(check)


def authorize_check(
    db: Session, check: MonitoringCheck, *, actor: User, request: Request | None = None
) -> MonitoringCheckRead:
    if check.authorized_at is not None:
        raise ValidationAppError("Ce contrôle est déjà autorisé.")
    check.authorized_by_id = actor.id
    check.authorized_at = utcnow()
    write_audit(
        db,
        module="infrastructure",
        action="monitoring_check_authorized",
        actor=actor,
        entity_type="monitoring_check",
        entity_id=str(check.id),
        entity_label=f"{check.check_type} — {check.infra.name}",
        after={"authorized_by_id": str(actor.id)},
        request=request,
    )
    db.commit()
    db.refresh(check)
    return MonitoringCheckRead.model_validate(check)


def delete_check(
    db: Session, check: MonitoringCheck, *, actor: User, request: Request | None = None
) -> None:
    write_audit(
        db,
        module="infrastructure",
        action="monitoring_check_deleted",
        actor=actor,
        entity_type="monitoring_check",
        entity_id=str(check.id),
        entity_label=f"{check.check_type} — {check.infra.name}",
        request=request,
    )
    db.delete(check)
    db.commit()


def list_results(db: Session, check_id: UUID, limit: int = 50) -> list[MonitoringResultRead]:
    rows = db.scalars(
        select(MonitoringResult)
        .where(MonitoringResult.check_id == check_id)
        .order_by(MonitoringResult.checked_at.desc())
        .limit(limit)
    ).all()
    return [MonitoringResultRead.model_validate(row) for row in rows]


def add_result(
    db: Session,
    check: MonitoringCheck,
    payload: MonitoringResultCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> MonitoringResultRead:
    result = MonitoringResult(check_id=check.id, checked_at=utcnow(), **payload.model_dump())
    db.add(result)
    check.infra.last_check_at = result.checked_at
    write_audit(
        db,
        module="infrastructure",
        action="monitoring_result_recorded",
        actor=actor,
        entity_type="monitoring_result",
        entity_id=str(result.id),
        entity_label=f"{check.check_type} — {check.infra.name}",
        after={"status": result.status, "latency_ms": result.latency_ms},
        request=request,
    )
    db.commit()
    db.refresh(result)
    return MonitoringResultRead.model_validate(result)
