from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from sqlalchemy import ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin
from app.models.assets import Supplier
from app.models.organization import Location


class StockItem(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "stock_items"

    reference: Mapped[str] = mapped_column(String(80), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(180), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    brand: Mapped[str | None] = mapped_column(String(100))
    model: Mapped[str | None] = mapped_column(String(150))
    supplier_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("suppliers.id", ondelete="SET NULL"), index=True
    )
    location_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("locations.id", ondelete="SET NULL"), index=True
    )
    unit: Mapped[str] = mapped_column(String(30), default="pièce", nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    min_quantity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    unit_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False, index=True)
    notes: Mapped[str | None] = mapped_column(Text)

    supplier: Mapped[Supplier | None] = relationship(lazy="joined")
    location: Mapped[Location | None] = relationship(lazy="joined")

    @property
    def is_low(self) -> bool:
        return self.min_quantity > 0 and self.quantity <= self.min_quantity

    @property
    def is_out(self) -> bool:
        return self.quantity <= 0

    @property
    def stock_value(self) -> float:
        if self.unit_price is None:
            return 0.0
        return float(self.unit_price) * max(0, self.quantity)
