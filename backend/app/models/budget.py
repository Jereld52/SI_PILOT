from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin
from app.models.assets import Supplier
from app.models.contracts import Contract


class Budget(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "budgets"

    year: Mapped[int] = mapped_column(Integer, unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False, index=True)
    planned_total: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    voted_total: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    notes: Mapped[str | None] = mapped_column(Text)
    validated_by_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint("status IN ('draft','voted','closed')", name="budget_status"),
    )


class BudgetCategory(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "budget_categories"

    code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class BudgetLine(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "budget_lines"

    budget_id: Mapped[UUID] = mapped_column(
        ForeignKey("budgets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    category_id: Mapped[UUID] = mapped_column(
        ForeignKey("budget_categories.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    label: Mapped[str] = mapped_column(String(180), nullable=False)
    planned_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    voted_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    project_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL"), index=True
    )
    contract_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("contracts.id", ondelete="SET NULL"), index=True
    )
    notes: Mapped[str | None] = mapped_column(Text)

    budget: Mapped[Budget] = relationship(lazy="joined")
    category: Mapped[BudgetCategory] = relationship(lazy="joined")
    contract: Mapped[Contract | None] = relationship(lazy="joined")


class BudgetCommitment(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "budget_commitments"

    budget_line_id: Mapped[UUID] = mapped_column(
        ForeignKey("budget_lines.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    reference: Mapped[str | None] = mapped_column(String(80), index=True)
    object: Mapped[str] = mapped_column(String(255), nullable=False)
    amount_ht: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    amount_ttc: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    ordered_at: Mapped[date | None] = mapped_column(Date, index=True)
    supplier_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("suppliers.id", ondelete="SET NULL"), index=True
    )
    contract_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("contracts.id", ondelete="SET NULL"), index=True
    )
    project_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL"), index=True
    )
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False, index=True)
    notes: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    budget_line: Mapped[BudgetLine] = relationship(lazy="joined")
    supplier: Mapped[Supplier | None] = relationship(lazy="joined")
    contract: Mapped[Contract | None] = relationship(lazy="joined")

    @property
    def line_label(self) -> str | None:
        return self.budget_line.label if self.budget_line else None

    @property
    def supplier_name(self) -> str | None:
        return self.supplier.name if self.supplier else None

    __table_args__ = (
        CheckConstraint(
            "status IN ('draft','quoted','ordered','delivered','invoiced','cancelled')",
            name="commitment_status",
        ),
    )


class BudgetInvoice(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "budget_invoices"

    commitment_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("budget_commitments.id", ondelete="SET NULL"), index=True
    )
    budget_line_id: Mapped[UUID] = mapped_column(
        ForeignKey("budget_lines.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    invoice_number: Mapped[str | None] = mapped_column(String(80), index=True)
    invoice_date: Mapped[date | None] = mapped_column(Date, index=True)
    amount_ht: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    amount_ttc: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    vat_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    paid_at: Mapped[date | None] = mapped_column(Date, index=True)
    status: Mapped[str] = mapped_column(String(20), default="received", nullable=False, index=True)
    supplier_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("suppliers.id", ondelete="SET NULL"), index=True
    )
    attachment_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("attachments.id", ondelete="SET NULL")
    )

    budget_line: Mapped[BudgetLine] = relationship(lazy="joined")
    commitment: Mapped[BudgetCommitment | None] = relationship(lazy="joined")
    supplier: Mapped[Supplier | None] = relationship(lazy="joined")

    @property
    def line_label(self) -> str | None:
        return self.budget_line.label if self.budget_line else None

    @property
    def supplier_name(self) -> str | None:
        return self.supplier.name if self.supplier else None

    __table_args__ = (
        CheckConstraint(
            "status IN ('received','validated','paid','disputed')",
            name="invoice_status",
        ),
    )


class BudgetCommitmentAsset(Base):
    __tablename__ = "budget_commitment_assets"

    commitment_id: Mapped[UUID] = mapped_column(
        ForeignKey("budget_commitments.id", ondelete="CASCADE"), primary_key=True
    )
    asset_id: Mapped[UUID] = mapped_column(
        ForeignKey("assets.id", ondelete="CASCADE"), primary_key=True
    )

    __table_args__ = (
        UniqueConstraint("commitment_id", "asset_id", name="uq_budget_commitment_asset"),
    )
