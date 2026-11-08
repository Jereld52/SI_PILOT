from __future__ import annotations

import secrets
from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin
from app.models.auth import User
from app.models.organization import Agent, Location


class ReservableEquipment(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "reservable_equipments"

    name: Mapped[str] = mapped_column(String(180), unique=True, index=True, nullable=False)
    category: Mapped[str] = mapped_column(String(40), default="other", nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    location_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("locations.id", ondelete="SET NULL"), index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    qr_token: Mapped[str] = mapped_column(
        String(64),
        unique=True,
        index=True,
        nullable=False,
        default=lambda: secrets.token_urlsafe(24),
    )
    notes: Mapped[str | None] = mapped_column(Text)

    location: Mapped[Location | None] = relationship(lazy="joined")


class EquipmentReservation(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "equipment_reservations"

    equipment_id: Mapped[UUID] = mapped_column(
        ForeignKey("reservable_equipments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    requester_agent_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("agents.id", ondelete="SET NULL"), index=True
    )
    requester_name: Mapped[str | None] = mapped_column(String(180))
    requester_email: Mapped[str | None] = mapped_column(String(255))
    purpose: Mapped[str] = mapped_column(String(255), nullable=False)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), default="confirmed", nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(
        String(20), default="reservation", nullable=False, index=True
    )
    checked_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    returned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )

    equipment: Mapped[ReservableEquipment] = relationship(lazy="joined")
    requester_agent: Mapped[Agent | None] = relationship(lazy="joined")
    created_by: Mapped[User | None] = relationship(lazy="joined")

    @property
    def created_by_label(self) -> str | None:
        if self.created_by is None:
            return None
        return f"{self.created_by.first_name} {self.created_by.last_name}".strip()

    __table_args__ = (
        CheckConstraint("end_at > start_at", name="reservation_period"),
        CheckConstraint(
            "status IN ('confirmed','cancelled','blocked','checked_out','returned')",
            name="reservation_status",
        ),
        CheckConstraint(
            "kind IN ('reservation','unavailability')",
            name="reservation_kind",
        ),
    )
