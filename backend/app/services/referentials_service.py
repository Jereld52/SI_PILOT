from __future__ import annotations

from uuid import UUID

from app.core.errors import ConflictError, NotFoundError, ValidationAppError
from app.models.assets import AssetCategory
from app.models.auth import User
from app.models.organization import Location, Service
from app.schemas.referentials import (
    AssetCategoryCreate,
    AssetCategoryUpdate,
    LocationCreate,
    LocationUpdate,
    ServiceCreate,
    ServiceUpdate,
)
from app.services.audit_service import write_audit
from fastapi import Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session


def list_services(db: Session, *, q: str | None = None, include_inactive: bool = False) -> list[Service]:
    statement = select(Service)
    if q:
        pattern = f"%{q.strip()}%"
        statement = statement.where(or_(Service.code.ilike(pattern), Service.name.ilike(pattern)))
    if not include_inactive:
        statement = statement.where(Service.is_active.is_(True))
    return list(db.scalars(statement.order_by(Service.name)).all())


def create_service(
    db: Session, payload: ServiceCreate, *, actor: User, request: Request | None = None
) -> Service:
    code = payload.code.strip()
    if db.scalar(select(Service).where(func.lower(Service.code) == code.lower())):
        raise ConflictError("Ce code de service existe déjà.")
    if payload.parent_id and db.get(Service, payload.parent_id) is None:
        raise NotFoundError("Service parent introuvable.")
    service = Service(
        code=code,
        name=payload.name.strip(),
        parent_id=payload.parent_id,
        manager_user_id=payload.manager_user_id,
        is_active=payload.is_active,
    )
    db.add(service)
    db.flush()
    write_audit(
        db,
        module="referentials",
        action="service_created",
        actor=actor,
        entity_type="service",
        entity_id=str(service.id),
        entity_label=service.name,
        after={"code": service.code, "name": service.name},
        request=request,
    )
    db.commit()
    db.refresh(service)
    return service


def update_service(
    db: Session,
    service: Service,
    payload: ServiceUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> Service:
    data = payload.model_dump(exclude_unset=True)
    before = {"name": service.name, "parent_id": str(service.parent_id) if service.parent_id else None, "is_active": service.is_active}
    if data.get("parent_id") == service.id:
        raise ValidationAppError("Un service ne peut pas être son propre parent.")
    if "parent_id" in data and data["parent_id"] and db.get(Service, data["parent_id"]) is None:
        raise NotFoundError("Service parent introuvable.")
    for field, value in data.items():
        setattr(service, field, value)
    write_audit(
        db,
        module="referentials",
        action="service_updated",
        actor=actor,
        entity_type="service",
        entity_id=str(service.id),
        entity_label=service.name,
        before=before,
        after={"name": service.name, "parent_id": str(service.parent_id) if service.parent_id else None, "is_active": service.is_active},
        request=request,
    )
    db.commit()
    db.refresh(service)
    return service


def list_locations(
    db: Session, *, q: str | None = None, include_inactive: bool = False
) -> list[Location]:
    statement = select(Location)
    if q:
        pattern = f"%{q.strip()}%"
        statement = statement.where(
            or_(Location.code.ilike(pattern), Location.name.ilike(pattern), Location.city.ilike(pattern))
        )
    if not include_inactive:
        statement = statement.where(Location.is_active.is_(True))
    return list(db.scalars(statement.order_by(Location.name)).all())


def create_location(
    db: Session, payload: LocationCreate, *, actor: User, request: Request | None = None
) -> Location:
    if payload.code:
        code = payload.code.strip()
        if db.scalar(select(Location).where(func.lower(Location.code) == code.lower())):
            raise ConflictError("Ce code de site existe déjà.")
    location = Location(**payload.model_dump())
    db.add(location)
    db.flush()
    write_audit(
        db,
        module="referentials",
        action="location_created",
        actor=actor,
        entity_type="location",
        entity_id=str(location.id),
        entity_label=location.name,
        after={"code": location.code, "name": location.name},
        request=request,
    )
    db.commit()
    db.refresh(location)
    return location


def update_location(
    db: Session,
    location: Location,
    payload: LocationUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> Location:
    data = payload.model_dump(exclude_unset=True)
    before = {"code": location.code, "name": location.name, "is_active": location.is_active}
    if data.get("code"):
        code = str(data["code"]).strip()
        existing = db.scalar(
            select(Location).where(
                func.lower(Location.code) == code.lower(), Location.id != location.id
            )
        )
        if existing:
            raise ConflictError("Ce code de site existe déjà.")
    for field, value in data.items():
        setattr(location, field, value)
    write_audit(
        db,
        module="referentials",
        action="location_updated",
        actor=actor,
        entity_type="location",
        entity_id=str(location.id),
        entity_label=location.name,
        before=before,
        after={"code": location.code, "name": location.name, "is_active": location.is_active},
        request=request,
    )
    db.commit()
    db.refresh(location)
    return location


def list_asset_categories(
    db: Session, *, include_inactive: bool = False
) -> list[AssetCategory]:
    statement = select(AssetCategory)
    if not include_inactive:
        statement = statement.where(AssetCategory.is_active.is_(True))
    return list(db.scalars(statement.order_by(AssetCategory.sort_order, AssetCategory.name)).all())


def create_asset_category(
    db: Session,
    payload: AssetCategoryCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> AssetCategory:
    code = payload.code.strip().lower()
    if db.scalar(select(AssetCategory).where(func.lower(AssetCategory.code) == code)):
        raise ConflictError("Ce code de catégorie existe déjà.")
    data = payload.model_dump()
    data["code"] = code
    data["name"] = payload.name.strip()
    if "{PREFIX}" in data["tag_template"] and not data.get("tag_prefix"):
        data["tag_prefix"] = code.upper()
    category = AssetCategory(**data)
    db.add(category)
    db.flush()
    write_audit(
        db,
        module="referentials",
        action="asset_category_created",
        actor=actor,
        entity_type="asset_category",
        entity_id=str(category.id),
        entity_label=category.name,
        after={
            "code": category.code,
            "name": category.name,
            "tag_prefix": category.tag_prefix,
            "tag_template": category.tag_template,
            "tag_sequence_mode": category.tag_sequence_mode,
        },
        request=request,
    )
    db.commit()
    db.refresh(category)
    return category


def update_asset_category(
    db: Session,
    category: AssetCategory,
    payload: AssetCategoryUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> AssetCategory:
    data = payload.model_dump(exclude_unset=True)
    template = data.get("tag_template", category.tag_template)
    prefix = data.get("tag_prefix", category.tag_prefix)
    if "{PREFIX}" in template and not prefix:
        data["tag_prefix"] = category.code.upper()
    before = {
        "name": category.name,
        "tag_prefix": category.tag_prefix,
        "tag_template": category.tag_template,
        "tag_sequence_mode": category.tag_sequence_mode,
        "is_active": category.is_active,
    }
    for field, value in data.items():
        setattr(category, field, value)
    write_audit(
        db,
        module="referentials",
        action="asset_category_updated",
        actor=actor,
        entity_type="asset_category",
        entity_id=str(category.id),
        entity_label=category.name,
        before=before,
        after={
            "name": category.name,
            "tag_prefix": category.tag_prefix,
            "tag_template": category.tag_template,
            "tag_sequence_mode": category.tag_sequence_mode,
            "is_active": category.is_active,
        },
        request=request,
    )
    db.commit()
    db.refresh(category)
    return category


def get_service(db: Session, service_id: UUID) -> Service:
    service = db.get(Service, service_id)
    if service is None:
        raise NotFoundError("Service introuvable.")
    return service


def get_location(db: Session, location_id: UUID) -> Location:
    location = db.get(Location, location_id)
    if location is None:
        raise NotFoundError("Site introuvable.")
    return location


def get_asset_category(db: Session, category_id: UUID) -> AssetCategory:
    category = db.get(AssetCategory, category_id)
    if category is None:
        raise NotFoundError("Catégorie d'équipement introuvable.")
    return category
