from __future__ import annotations

import re
from datetime import date
from decimal import Decimal, InvalidOperation
from uuid import UUID

from app.core.errors import ConflictError, NotFoundError, ValidationAppError
from app.db.base import utcnow
from app.models.assets import Asset, AssetAssignment, AssetCategory
from app.models.auth import User
from app.models.common import DocumentSequence
from app.models.organization import Agent, Location, Service
from app.schemas.assets import (
    AssetAssignmentRead,
    AssetAssignRequest,
    AssetCreate,
    AssetReturnRequest,
    AssetStatusRequest,
    AssetTagPreview,
    AssetUpdate,
)
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


def render_asset_tag(
    template: str,
    *,
    prefix: str | None,
    category_code: str,
    year: int,
    sequence: int,
) -> str:
    if "{SEQ" not in template:
        raise ValidationAppError(
            "Le modèle de nommage doit contenir {SEQ} ou {SEQ:4}.",
            code="INVALID_TAG_TEMPLATE",
        )

    def replace_sequence(match: re.Match[str]) -> str:
        width = int(match.group(1) or 4)
        return str(sequence).zfill(width)

    result = (
        template.replace("{PREFIX}", (prefix or category_code).upper())
        .replace("{CATEGORY}", category_code.upper())
        .replace("{YEAR}", str(year))
    )
    result = re.sub(r"\{SEQ(?::(\d+))?\}", replace_sequence, result)
    return result.strip()


def _sequence_scope(category: AssetCategory) -> tuple[str, int]:
    year = date.today().year if category.tag_sequence_mode != "global" else 0
    return f"asset:{category.code}", year


def peek_asset_tag(db: Session, category: AssetCategory) -> AssetTagPreview:
    key, year = _sequence_scope(category)
    sequence = db.scalar(
        select(DocumentSequence).where(
            DocumentSequence.key == key, DocumentSequence.year == year
        )
    )
    next_sequence = (sequence.last_value if sequence else 0) + 1
    return AssetTagPreview(
        tag=render_asset_tag(
            category.tag_template,
            prefix=category.tag_prefix,
            category_code=category.code,
            year=date.today().year,
            sequence=next_sequence,
        ),
        prefix=category.tag_prefix,
        template=category.tag_template,
        next_sequence=next_sequence,
        year=date.today().year,
    )


def generate_asset_tag(db: Session, category: AssetCategory) -> str:
    key, year = _sequence_scope(category)
    sequence = db.scalar(
        select(DocumentSequence)
        .where(DocumentSequence.key == key, DocumentSequence.year == year)
        .with_for_update()
    )
    if sequence is None:
        sequence = DocumentSequence(key=key, year=year, last_value=1, updated_at=utcnow())
        db.add(sequence)
        db.flush()
        value = 1
    else:
        sequence.last_value += 1
        sequence.updated_at = utcnow()
        db.flush()
        value = sequence.last_value
    return render_asset_tag(
        category.tag_template,
        prefix=category.tag_prefix,
        category_code=category.code,
        year=date.today().year,
        sequence=value,
    )


def _get_category(db: Session, category_id: UUID) -> AssetCategory:
    category = db.get(AssetCategory, category_id)
    if category is None:
        raise NotFoundError("Catégorie d'équipement introuvable.")
    return category


def _validate_links(
    db: Session, *, service_id: UUID | None, location_id: UUID | None, agent_id: UUID | None
) -> Agent | None:
    if service_id and db.get(Service, service_id) is None:
        raise NotFoundError("Service introuvable.")
    if location_id and db.get(Location, location_id) is None:
        raise NotFoundError("Site introuvable.")
    if agent_id:
        agent = db.get(Agent, agent_id)
        if agent is None:
            raise NotFoundError("Agent introuvable.")
        return agent
    return None


def _check_unique(
    db: Session,
    *,
    asset_tag: str | None = None,
    external_id: str | None = None,
    serial_number: str | None = None,
    mac_address: str | None = None,
    ip_address: str | None = None,
    hostname: str | None = None,
    exclude_id: UUID | None = None,
) -> None:
    checks = (
        (Asset.asset_tag, asset_tag, "numéro d'inventaire"),
        (Asset.external_id, external_id, "identifiant externe"),
        (Asset.serial_number, serial_number, "numéro de série"),
        (Asset.mac_address, mac_address, "adresse MAC"),
        (Asset.ip_address, ip_address, "adresse IP"),
        (Asset.hostname, hostname, "nom machine"),
    )
    for column, value, label in checks:
        if not value:
            continue
        statement = select(Asset).where(column == value.strip())
        if exclude_id:
            statement = statement.where(Asset.id != exclude_id)
        if db.scalar(statement):
            raise ConflictError(f"Un équipement utilise déjà ce {label}.")


def _open_assignment(db: Session, asset_id: UUID) -> AssetAssignment | None:
    return db.scalar(
        select(AssetAssignment)
        .where(AssetAssignment.asset_id == asset_id, AssetAssignment.ended_at.is_(None))
        .order_by(AssetAssignment.started_at.desc())
    )


def _close_assignment(db: Session, asset_id: UUID) -> None:
    assignment = _open_assignment(db, asset_id)
    if assignment is not None:
        assignment.ended_at = utcnow()


def list_assets(
    db: Session,
    *,
    q: str | None = None,
    category_id: UUID | None = None,
    status: str | None = None,
    agent_id: UUID | None = None,
    service_id: UUID | None = None,
    include_archived: bool = False,
) -> list[Asset]:
    statement = select(Asset)
    if not include_archived:
        statement = statement.where(Asset.archived_at.is_(None))
    if q:
        pattern = f"%{q.strip()}%"
        statement = statement.where(
            or_(
                Asset.name.ilike(pattern),
                Asset.asset_tag.ilike(pattern),
                Asset.serial_number.ilike(pattern),
                Asset.hostname.ilike(pattern),
                Asset.brand.ilike(pattern),
                Asset.model.ilike(pattern),
            )
        )
    if category_id:
        statement = statement.where(Asset.category_id == category_id)
    if status:
        statement = statement.where(Asset.status == status)
    if agent_id:
        statement = statement.where(Asset.assigned_agent_id == agent_id)
    if service_id:
        statement = statement.where(Asset.service_id == service_id)
    return list(db.scalars(statement.order_by(Asset.name)).all())


def get_asset(db: Session, asset_id: UUID) -> Asset:
    asset = db.get(Asset, asset_id)
    if asset is None:
        raise NotFoundError("Équipement introuvable.")
    return asset


def create_asset(
    db: Session,
    payload: AssetCreate,
    *,
    actor: User,
    request: Request | None = None,
    source: str = "api",
    commit: bool = True,
) -> Asset:
    category = _get_category(db, payload.category_id)
    agent = _validate_links(
        db,
        service_id=payload.service_id,
        location_id=payload.location_id,
        agent_id=payload.assigned_agent_id,
    )

    if payload.asset_tag:
        tag = payload.asset_tag.strip()
    else:
        tag = ""
        for _ in range(20):
            candidate = generate_asset_tag(db, category)
            if not db.scalar(select(Asset).where(Asset.asset_tag == candidate)):
                tag = candidate
                break
        if not tag:
            raise ConflictError("Impossible de générer un numéro d'inventaire unique.")

    _check_unique(
        db,
        asset_tag=tag,
        external_id=payload.external_id,
        serial_number=payload.serial_number,
        mac_address=payload.mac_address,
        ip_address=payload.ip_address,
        hostname=payload.hostname,
    )

    data = payload.model_dump(exclude={"asset_tag", "purchase_price"})
    if agent is not None:
        data["service_id"] = payload.service_id or agent.service_id
        data["location_id"] = payload.location_id or agent.location_id
    data["purchase_price"] = _decimal(payload.purchase_price)
    asset = Asset(**data, asset_tag=tag)
    db.add(asset)
    db.flush()

    if payload.assigned_agent_id:
        db.add(
            AssetAssignment(
                asset_id=asset.id,
                agent_id=payload.assigned_agent_id,
                service_id=payload.service_id or asset.service_id,
                location_id=payload.location_id or asset.location_id,
                started_at=utcnow(),
                reason="Affectation initiale",
                created_by_id=actor.id,
            )
        )

    write_audit(
        db,
        module="assets",
        action="asset_created",
        actor=actor,
        entity_type="asset",
        entity_id=str(asset.id),
        entity_label=f"{asset.name} ({asset.asset_tag})",
        after={
            "asset_tag": asset.asset_tag,
            "name": asset.name,
            "category_id": str(asset.category_id),
            "status": asset.status,
        },
        request=request,
        source=source,
    )
    if commit:
        db.commit()
        db.refresh(asset)
    else:
        db.flush()
    return asset


def update_asset(
    db: Session,
    asset: Asset,
    payload: AssetUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> Asset:
    data = payload.model_dump(exclude_unset=True)
    if "category_id" in data and data["category_id"]:
        _get_category(db, data["category_id"])
    _validate_links(
        db,
        service_id=data.get("service_id"),
        location_id=data.get("location_id"),
        agent_id=data.get("assigned_agent_id"),
    )

    new_tag = data.get("asset_tag")
    if new_tag is not None:
        new_tag = new_tag.strip()
        if not new_tag:
            data.pop("asset_tag", None)
        else:
            _check_unique(db, asset_tag=new_tag, exclude_id=asset.id)

    _check_unique(
        db,
        external_id=data.get("external_id"),
        serial_number=data.get("serial_number"),
        mac_address=data.get("mac_address"),
        ip_address=data.get("ip_address"),
        hostname=data.get("hostname"),
        exclude_id=asset.id,
    )

    if "purchase_price" in data:
        data["purchase_price"] = _decimal(data["purchase_price"])

    before = {
        "asset_tag": asset.asset_tag,
        "name": asset.name,
        "category_id": str(asset.category_id),
        "status": asset.status,
        "condition": asset.condition,
        "assigned_agent_id": str(asset.assigned_agent_id) if asset.assigned_agent_id else None,
        "service_id": str(asset.service_id) if asset.service_id else None,
        "location_id": str(asset.location_id) if asset.location_id else None,
    }

    agent_changed = "assigned_agent_id" in data and data["assigned_agent_id"] != asset.assigned_agent_id
    for field, value in data.items():
        setattr(asset, field, value)

    if agent_changed:
        _close_assignment(db, asset.id)
        if asset.assigned_agent_id:
            new_agent = db.get(Agent, asset.assigned_agent_id)
            if new_agent is not None:
                asset.service_id = asset.service_id or new_agent.service_id
                asset.location_id = asset.location_id or new_agent.location_id
            db.add(
                AssetAssignment(
                    asset_id=asset.id,
                    agent_id=asset.assigned_agent_id,
                    service_id=asset.service_id,
                    location_id=asset.location_id,
                    started_at=utcnow(),
                    reason="Modification de l'affectation",
                    created_by_id=actor.id,
                )
            )

    write_audit(
        db,
        module="assets",
        action="asset_updated",
        actor=actor,
        entity_type="asset",
        entity_id=str(asset.id),
        entity_label=f"{asset.name} ({asset.asset_tag})",
        before=before,
        after={
            "asset_tag": asset.asset_tag,
            "name": asset.name,
            "category_id": str(asset.category_id),
            "status": asset.status,
            "condition": asset.condition,
            "assigned_agent_id": str(asset.assigned_agent_id) if asset.assigned_agent_id else None,
            "service_id": str(asset.service_id) if asset.service_id else None,
            "location_id": str(asset.location_id) if asset.location_id else None,
        },
        request=request,
    )
    db.commit()
    db.refresh(asset)
    return asset


def archive_asset(
    db: Session, asset: Asset, *, actor: User, request: Request | None = None
) -> Asset:
    before = {"status": asset.status, "archived_at": str(asset.archived_at) if asset.archived_at else None}
    _close_assignment(db, asset.id)
    asset.archived_at = utcnow()
    asset.status = "retired"
    write_audit(
        db,
        module="assets",
        action="asset_archived",
        actor=actor,
        entity_type="asset",
        entity_id=str(asset.id),
        entity_label=f"{asset.name} ({asset.asset_tag})",
        before=before,
        after={"status": asset.status, "archived_at": str(asset.archived_at)},
        request=request,
    )
    db.commit()
    db.refresh(asset)
    return asset


def assign_asset(
    db: Session,
    asset: Asset,
    payload: AssetAssignRequest,
    *,
    actor: User,
    request: Request | None = None,
) -> Asset:
    agent = _validate_links(
        db,
        service_id=payload.service_id,
        location_id=payload.location_id,
        agent_id=payload.agent_id,
    )
    assert agent is not None
    _close_assignment(db, asset.id)
    asset.assigned_agent_id = payload.agent_id
    asset.service_id = payload.service_id or agent.service_id
    asset.location_id = payload.location_id or agent.location_id
    asset.status = "in_service"
    db.add(
        AssetAssignment(
            asset_id=asset.id,
            agent_id=payload.agent_id,
            service_id=asset.service_id,
            location_id=asset.location_id,
            started_at=utcnow(),
            reason=payload.reason or "Affectation",
            created_by_id=actor.id,
        )
    )
    write_audit(
        db,
        module="assets",
        action="asset_assigned",
        actor=actor,
        entity_type="asset",
        entity_id=str(asset.id),
        entity_label=f"{asset.name} ({asset.asset_tag})",
        after={
            "agent_id": str(payload.agent_id),
            "service_id": str(asset.service_id) if asset.service_id else None,
            "location_id": str(asset.location_id) if asset.location_id else None,
        },
        request=request,
    )
    db.commit()
    db.refresh(asset)
    return asset


def return_asset(
    db: Session,
    asset: Asset,
    payload: AssetReturnRequest,
    *,
    actor: User,
    request: Request | None = None,
) -> Asset:
    _close_assignment(db, asset.id)
    previous_agent = asset.assigned_agent_id
    asset.assigned_agent_id = None
    asset.status = "in_stock"
    write_audit(
        db,
        module="assets",
        action="asset_returned",
        actor=actor,
        entity_type="asset",
        entity_id=str(asset.id),
        entity_label=f"{asset.name} ({asset.asset_tag})",
        before={"assigned_agent_id": str(previous_agent) if previous_agent else None},
        after={"assigned_agent_id": None, "status": asset.status, "reason": payload.reason},
        request=request,
    )
    db.commit()
    db.refresh(asset)
    return asset


def set_asset_status(
    db: Session,
    asset: Asset,
    payload: AssetStatusRequest,
    *,
    actor: User,
    request: Request | None = None,
) -> Asset:
    previous = asset.status
    asset.status = payload.status
    write_audit(
        db,
        module="assets",
        action="asset_status_changed",
        actor=actor,
        entity_type="asset",
        entity_id=str(asset.id),
        entity_label=f"{asset.name} ({asset.asset_tag})",
        before={"status": previous},
        after={"status": asset.status, "reason": payload.reason},
        request=request,
    )
    db.commit()
    db.refresh(asset)
    return asset


def get_asset_history(db: Session, asset_id: UUID) -> list[AssetAssignmentRead]:
    rows = db.execute(
        select(AssetAssignment, Agent, Service, Location)
        .outerjoin(Agent, AssetAssignment.agent_id == Agent.id)
        .outerjoin(Service, AssetAssignment.service_id == Service.id)
        .outerjoin(Location, AssetAssignment.location_id == Location.id)
        .where(AssetAssignment.asset_id == asset_id)
        .order_by(AssetAssignment.started_at.desc())
    ).all()
    return [
        AssetAssignmentRead(
            id=assignment.id,
            agent_id=assignment.agent_id,
            agent_name=f"{agent.first_name} {agent.last_name}" if agent else None,
            service_name=service.name if service else None,
            location_name=location.name if location else None,
            started_at=assignment.started_at,
            ended_at=assignment.ended_at,
            reason=assignment.reason,
        )
        for assignment, agent, service, location in rows
    ]
