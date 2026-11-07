from __future__ import annotations

from uuid import UUID

from app.core.errors import NotFoundError, ValidationAppError
from app.db.base import utcnow
from app.models.assets import Asset, AssetCategory, StockMovement
from app.models.auth import User
from app.schemas.stock import StockMovementCreate, StockMovementRead, StockSummaryItem
from app.services.audit_service import write_audit
from fastapi import Request
from sqlalchemy import or_, select
from sqlalchemy.orm import Session


def _read(db: Session, movement: StockMovement) -> StockMovementRead:
    data = StockMovementRead.model_validate(movement)
    data.created_by_label = movement.created_by_label
    return data


def list_movements(
    db: Session,
    *,
    q: str | None = None,
    direction: str | None = None,
    category_id: UUID | None = None,
) -> list[StockMovementRead]:
    statement = select(StockMovement).outerjoin(Asset, StockMovement.asset_id == Asset.id)
    if direction:
        statement = statement.where(StockMovement.direction == direction)
    if category_id:
        statement = statement.where(StockMovement.category_id == category_id)
    if q:
        pattern = f"%{q.strip()}%"
        statement = statement.where(
            or_(
                StockMovement.reference.ilike(pattern),
                StockMovement.reason.ilike(pattern),
                Asset.name.ilike(pattern),
                Asset.asset_tag.ilike(pattern),
            )
        )
    rows = db.scalars(statement.order_by(StockMovement.moved_at.desc())).all()
    return [_read(db, row) for row in rows]


def create_movement(
    db: Session,
    payload: StockMovementCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> StockMovementRead:
    asset: Asset | None = None
    category: AssetCategory | None = None
    if payload.asset_id:
        asset = db.get(Asset, payload.asset_id)
        if asset is None:
            raise NotFoundError("Équipement introuvable.")
        category = asset.category
    elif payload.category_id:
        category = db.get(AssetCategory, payload.category_id)
        if category is None:
            raise NotFoundError("Catégorie d'équipement introuvable.")
    if asset is None and category is None:
        raise ValidationAppError(
            "Indiquez un équipement ou une catégorie pour le mouvement de stock.",
            fields=[{"field": "asset_id", "message": "Équipement ou catégorie requis."}],
        )

    movement = StockMovement(
        asset_id=asset.id if asset else None,
        category_id=category.id if category else None,
        direction=payload.direction,
        quantity=payload.quantity,
        reason=payload.reason,
        reference=payload.reference,
        moved_at=payload.moved_at or utcnow(),
        created_by_id=actor.id,
    )
    db.add(movement)

    status_before: str | None = None
    if asset is not None:
        status_before = asset.status
        if payload.direction == "in" and asset.status != "retired":
            asset.status = "in_stock"
            asset.archived_at = None
        elif (
            payload.direction == "out"
            and asset.status == "in_stock"
            and asset.archived_at is None
        ):
            asset.status = "in_service"

    write_audit(
        db,
        module="stock",
        action="stock_movement_created",
        actor=actor,
        entity_type="stock_movement",
        entity_id=str(movement.id),
        entity_label=asset.asset_tag if asset else category.name if category else None,
        before={"asset_status": status_before},
        after={
            "direction": movement.direction,
            "quantity": movement.quantity,
            "asset_status": asset.status if asset else None,
            "reason": movement.reason,
        },
        request=request,
    )
    db.commit()
    db.refresh(movement)
    return _read(db, movement)


def stock_summary(db: Session) -> list[StockSummaryItem]:
    rows = db.execute(
        select(AssetCategory.id, AssetCategory.name, Asset.status, Asset.id)
        .join(Asset, Asset.category_id == AssetCategory.id)
        .where(Asset.archived_at.is_(None))
    ).all()
    summary: dict[UUID, dict[str, int]] = {}
    names: dict[UUID, str] = {}
    for category_id, category_name, status, _asset_id in rows:
        names[category_id] = category_name
        bucket = summary.setdefault(category_id, {})
        bucket[status] = bucket.get(status, 0) + 1
    items = []
    for category_id, bucket in summary.items():
        items.append(
            StockSummaryItem(
                category_id=category_id,
                category_name=names[category_id],
                in_stock=bucket.get("in_stock", 0),
                in_service=bucket.get("in_service", 0),
                maintenance=bucket.get("maintenance", 0),
                broken=bucket.get("broken", 0),
                total=sum(bucket.values()),
            )
        )
    return sorted(items, key=lambda item: item.category_name)
