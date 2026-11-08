from __future__ import annotations

from decimal import Decimal, InvalidOperation
from uuid import UUID

from app.core.errors import ConflictError, NotFoundError, ValidationAppError
from app.db.base import utcnow
from app.models.assets import StockMovement, Supplier
from app.models.auth import User
from app.models.organization import Agent, Location
from app.models.stock import StockItem
from app.schemas.stock import (
    StockCategorySummary,
    StockItemCreate,
    StockItemDetailRead,
    StockItemMovementCreate,
    StockItemMovementRead,
    StockItemRead,
    StockItemUpdate,
    StockOverview,
)
from app.services.audit_service import write_audit
from app.services.reference_service import next_reference
from fastapi import Request
from sqlalchemy import or_, select
from sqlalchemy.orm import Session


def _decimal(value: float | None) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError) as exc:
        raise ValidationAppError("Prix unitaire invalide.") from exc


def _read(item: StockItem) -> StockItemRead:
    data = StockItemRead.model_validate(item)
    data.unit_price = float(item.unit_price) if item.unit_price is not None else None
    data.stock_value = item.stock_value
    data.is_low = item.is_low
    data.is_out = item.is_out
    return data


def _movement_read(movement: StockMovement) -> StockItemMovementRead:
    data = StockItemMovementRead.model_validate(movement)
    data.created_by_label = movement.created_by_label
    return data


def _detail(item: StockItem, movements: list[StockMovement]) -> StockItemDetailRead:
    detail = StockItemDetailRead.model_validate(item)
    detail.unit_price = float(item.unit_price) if item.unit_price is not None else None
    detail.stock_value = item.stock_value
    detail.is_low = item.is_low
    detail.is_out = item.is_out
    detail.movements = [_movement_read(movement) for movement in movements]
    return detail


def _validate_links(
    db: Session, *, supplier_id: UUID | None, location_id: UUID | None
) -> None:
    if supplier_id and db.get(Supplier, supplier_id) is None:
        raise NotFoundError("Fournisseur introuvable.")
    if location_id and db.get(Location, location_id) is None:
        raise NotFoundError("Emplacement introuvable.")


def _check_reference(db: Session, reference: str, *, exclude_id: UUID | None = None) -> None:
    statement = select(StockItem).where(StockItem.reference == reference)
    if exclude_id:
        statement = statement.where(StockItem.id != exclude_id)
    if db.scalar(statement):
        raise ConflictError("Une référence de stock existe déjà.")


def list_items(
    db: Session,
    *,
    q: str | None = None,
    category: str | None = None,
    low_only: bool = False,
    include_archived: bool = False,
) -> list[StockItemRead]:
    statement = select(StockItem)
    if not include_archived:
        statement = statement.where(StockItem.status == "active")
    if category:
        statement = statement.where(StockItem.category == category)
    if low_only:
        statement = statement.where(
            StockItem.min_quantity > 0, StockItem.quantity <= StockItem.min_quantity
        )
    if q:
        pattern = f"%{q.strip()}%"
        statement = statement.where(
            or_(
                StockItem.name.ilike(pattern),
                StockItem.reference.ilike(pattern),
                StockItem.brand.ilike(pattern),
                StockItem.model.ilike(pattern),
            )
        )
    rows = db.scalars(
        statement.order_by(StockItem.category, StockItem.name)
    ).all()
    return [_read(row) for row in rows]


def get_item(db: Session, item_id: UUID) -> StockItem:
    item = db.get(StockItem, item_id)
    if item is None:
        raise NotFoundError("Article de stock introuvable.")
    return item


def get_item_detail(db: Session, item_id: UUID) -> StockItemDetailRead:
    item = get_item(db, item_id)
    movements = list(
        db.scalars(
            select(StockMovement)
            .where(StockMovement.stock_item_id == item.id)
            .order_by(StockMovement.moved_at.desc())
        ).all()
    )
    return _detail(item, movements)


def create_item(
    db: Session,
    payload: StockItemCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> StockItemDetailRead:
    _validate_links(db, supplier_id=payload.supplier_id, location_id=payload.location_id)
    reference = (payload.reference or "").strip()
    if reference:
        _check_reference(db, reference)
    else:
        reference = next_reference(db, key="stock_item", prefix="STK")
    data = payload.model_dump(
        exclude={"reference", "initial_quantity", "unit_price"}
    )
    item = StockItem(
        **data,
        reference=reference,
        quantity=payload.initial_quantity,
        unit_price=_decimal(payload.unit_price),
    )
    db.add(item)
    db.flush()
    if payload.initial_quantity > 0:
        db.add(
            StockMovement(
                stock_item_id=item.id,
                direction="in",
                quantity=payload.initial_quantity,
                quantity_after=payload.initial_quantity,
                reason="Stock initial",
                moved_at=utcnow(),
                created_by_id=actor.id,
            )
        )
    write_audit(
        db,
        module="stock",
        action="stock_item_created",
        actor=actor,
        entity_type="stock_item",
        entity_id=str(item.id),
        entity_label=f"{item.reference} — {item.name}",
        after={
            "category": item.category,
            "quantity": item.quantity,
            "min_quantity": item.min_quantity,
        },
        request=request,
    )
    db.commit()
    db.refresh(item)
    return get_item_detail(db, item.id)


def update_item(
    db: Session,
    item: StockItem,
    payload: StockItemUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> StockItemDetailRead:
    data = payload.model_dump(exclude_unset=True)
    _validate_links(
        db,
        supplier_id=data.get("supplier_id"),
        location_id=data.get("location_id"),
    )
    if "unit_price" in data:
        data["unit_price"] = _decimal(data["unit_price"])
    before = {
        "name": item.name,
        "category": item.category,
        "min_quantity": item.min_quantity,
        "status": item.status,
    }
    for field, value in data.items():
        setattr(item, field, value)
    write_audit(
        db,
        module="stock",
        action="stock_item_updated",
        actor=actor,
        entity_type="stock_item",
        entity_id=str(item.id),
        entity_label=f"{item.reference} — {item.name}",
        before=before,
        after={
            "name": item.name,
            "category": item.category,
            "min_quantity": item.min_quantity,
            "status": item.status,
        },
        request=request,
    )
    db.commit()
    db.refresh(item)
    return get_item_detail(db, item.id)


def archive_item(
    db: Session, item: StockItem, *, actor: User, request: Request | None = None
) -> StockItemRead:
    previous = item.status
    item.status = "archived"
    write_audit(
        db,
        module="stock",
        action="stock_item_archived",
        actor=actor,
        entity_type="stock_item",
        entity_id=str(item.id),
        entity_label=f"{item.reference} — {item.name}",
        before={"status": previous},
        after={"status": "archived"},
        request=request,
    )
    db.commit()
    db.refresh(item)
    return _read(item)


def create_movement(
    db: Session,
    item_id: UUID,
    payload: StockItemMovementCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> StockItemDetailRead:
    item = db.scalar(
        select(StockItem).where(StockItem.id == item_id).with_for_update()
    )
    if item is None:
        raise NotFoundError("Article de stock introuvable.")
    if item.status != "active":
        raise ValidationAppError("Un article archivé ne peut plus recevoir de mouvement.")
    recipient: Agent | None = None
    if payload.recipient_agent_id:
        recipient = db.get(Agent, payload.recipient_agent_id)
        if recipient is None:
            raise NotFoundError("Agent bénéficiaire introuvable.")
        if payload.direction != "out":
            raise ValidationAppError(
                "Un bénéficiaire ne peut être associé qu'à une sortie de stock."
            )
    before_quantity = item.quantity
    if payload.direction == "in":
        new_quantity = before_quantity + payload.quantity
    elif payload.direction == "out":
        new_quantity = before_quantity - payload.quantity
        if new_quantity < 0:
            raise ValidationAppError(
                f"Stock insuffisant : {before_quantity} {item.unit}(s) disponible(s)."
            )
    else:
        new_quantity = payload.quantity
    item.quantity = new_quantity
    movement = StockMovement(
        stock_item_id=item.id,
        direction=payload.direction,
        quantity=payload.quantity,
        quantity_after=new_quantity,
        recipient_agent_id=payload.recipient_agent_id,
        reason=payload.reason,
        reference=payload.reference,
        moved_at=payload.moved_at or utcnow(),
        created_by_id=actor.id,
    )
    db.add(movement)
    write_audit(
        db,
        module="stock",
        action="stock_item_movement",
        actor=actor,
        entity_type="stock_item",
        entity_id=str(item.id),
        entity_label=f"{item.reference} — {item.name}",
        before={"quantity": before_quantity},
        after={
            "direction": payload.direction,
            "quantity": payload.quantity,
            "quantity_after": new_quantity,
            "recipient_agent_id": str(payload.recipient_agent_id)
            if payload.recipient_agent_id
            else None,
        },
        request=request,
    )
    db.commit()
    db.refresh(item)
    return get_item_detail(db, item.id)


def overview(db: Session) -> StockOverview:
    items = list(
        db.scalars(select(StockItem).where(StockItem.status == "active")).all()
    )
    categories: dict[str, StockCategorySummary] = {}
    for item in items:
        summary = categories.setdefault(
            item.category, StockCategorySummary(category=item.category, items=0, units=0, value=0)
        )
        summary.items += 1
        summary.units += item.quantity
        summary.value += item.stock_value
    low_stock = [item for item in items if item.is_low]
    return StockOverview(
        total_items=len(items),
        total_units=sum(item.quantity for item in items),
        total_value=round(sum(item.stock_value for item in items), 2),
        low_stock_count=len(low_stock),
        out_of_stock_count=sum(1 for item in items if item.is_out),
        categories=sorted(categories.values(), key=lambda value: value.category),
        low_stock_items=[
            _read(item) for item in sorted(low_stock, key=lambda item: item.quantity)[:20]
        ],
    )
