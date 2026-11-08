from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin
from app.models.organization import Location


class NetworkShare(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "network_shares"

    name: Mapped[str] = mapped_column(String(180), nullable=False, index=True)
    unc_path: Mapped[str] = mapped_column(String(512), nullable=False)
    drive_letter: Mapped[str | None] = mapped_column(String(8))
    location_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("locations.id", ondelete="SET NULL"), index=True
    )
    responsible: Mapped[str | None] = mapped_column(String(180))
    description: Mapped[str | None] = mapped_column(Text)
    warning_percent: Mapped[int] = mapped_column(Integer, default=20, nullable=False)
    critical_percent: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    min_free_gb: Mapped[float | None] = mapped_column(Float)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_status: Mapped[str] = mapped_column(
        String(20), default="unknown", nullable=False, index=True
    )
    last_total_bytes: Mapped[int | None] = mapped_column(BigInteger)
    last_used_bytes: Mapped[int | None] = mapped_column(BigInteger)
    last_free_bytes: Mapped[int | None] = mapped_column(BigInteger)
    last_error: Mapped[str | None] = mapped_column(Text)

    location: Mapped[Location | None] = relationship(lazy="joined")

    __table_args__ = (
        CheckConstraint(
            "warning_percent > 0 AND warning_percent < 100",
            name="network_share_warning_percent",
        ),
        CheckConstraint(
            "critical_percent >= 0 AND critical_percent < warning_percent",
            name="network_share_critical_percent",
        ),
    )
