from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin


class DocumentIntake(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "document_intakes"

    token: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    batch_id: Mapped[str | None] = mapped_column(String(64), index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str | None] = mapped_column(String(120))
    size_bytes: Mapped[int | None] = mapped_column()
    status: Mapped[str] = mapped_column(String(20), default="analyzed", nullable=False, index=True)
    document_type: Mapped[str] = mapped_column(String(30), default="other", nullable=False)
    title: Mapped[str | None] = mapped_column(String(255))
    supplier: Mapped[str | None] = mapped_column(String(150))
    reference: Mapped[str | None] = mapped_column(String(80))
    amount_ttc: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    target: Mapped[str | None] = mapped_column(String(30))
    link: Mapped[str | None] = mapped_column(String(255))
    document_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("documents.id", ondelete="SET NULL")
    )
    error_message: Mapped[str | None] = mapped_column(Text)
    ocr_used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    integrated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
