from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import CheckConstraint, Date, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin
from app.models.assets import Supplier
from app.models.auth import User


class ContractCategory(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "contract_categories"

    code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)


class Contract(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "contracts"

    supplier_id: Mapped[UUID] = mapped_column(
        ForeignKey("suppliers.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    reference: Mapped[str] = mapped_column(String(80), unique=True, index=True, nullable=False)
    object: Mapped[str] = mapped_column(String(255), nullable=False)
    category_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("contract_categories.id", ondelete="SET NULL"), index=True
    )
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date, index=True)
    duration_months: Mapped[int | None] = mapped_column(Integer)
    amount_ht: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    amount_ttc: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    vat_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    annual_cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    monthly_cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    notice_days: Mapped[int | None] = mapped_column(Integer)
    auto_renew: Mapped[bool] = mapped_column(default=False, nullable=False)
    responsible_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    contact_name: Mapped[str | None] = mapped_column(String(150))
    contact_email: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(30), default="active", nullable=False, index=True)
    comments: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    updated_by_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    supplier: Mapped[Supplier] = relationship(lazy="joined")
    category: Mapped[ContractCategory | None] = relationship(lazy="joined")
    responsible: Mapped[User | None] = relationship(
        foreign_keys=[responsible_user_id], lazy="joined"
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('draft','active','expiring','expired','terminated')",
            name="contract_status",
        ),
    )
