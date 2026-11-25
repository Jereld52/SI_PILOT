from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import CheckConstraint, Date, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin
from app.models.assets import Supplier
from app.models.budget import BudgetLine
from app.models.contracts import Contract


class CommercialDocument(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "commercial_documents"

    kind: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    reference: Mapped[str] = mapped_column(
        String(80), unique=True, index=True, nullable=False
    )
    engagement_number: Mapped[str | None] = mapped_column(
        String(80), unique=True, index=True
    )
    object: Mapped[str] = mapped_column(String(255), nullable=False)
    supplier_id: Mapped[UUID] = mapped_column(
        ForeignKey("suppliers.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(
        String(30), default="draft", nullable=False, index=True
    )
    issue_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    valid_until: Mapped[date | None] = mapped_column(Date, index=True)
    expected_date: Mapped[date | None] = mapped_column(Date, index=True)
    amount_ht: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    amount_ttc: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    vat_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    budget_line_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("budget_lines.id", ondelete="SET NULL"), index=True
    )
    contract_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("contracts.id", ondelete="SET NULL"), index=True
    )
    document_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("documents.id", ondelete="SET NULL")
    )
    source_document_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("commercial_documents.id", ondelete="SET NULL")
    )
    notes: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    updated_by_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )

    supplier: Mapped[Supplier] = relationship(lazy="joined")
    budget_line: Mapped[BudgetLine | None] = relationship(lazy="joined")
    contract: Mapped[Contract | None] = relationship(lazy="joined")

    __table_args__ = (
        CheckConstraint(
            "kind IN ('quote','purchase_order')",
            name="commercial_document_kind",
        ),
    )
