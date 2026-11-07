from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin, utcnow
from app.models.auth import User
from app.models.organization import Agent, Service


class TicketCategory(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "ticket_categories"

    code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    sla_hours: Mapped[int | None] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class TicketStatus(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "ticket_statuses"

    code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    is_closed: Mapped[bool] = mapped_column(default=False, nullable=False)
    color: Mapped[str | None] = mapped_column(String(20))
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)


class TicketPriority(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "ticket_priorities"

    code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    level: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    color: Mapped[str | None] = mapped_column(String(20))
    response_hours: Mapped[int | None] = mapped_column(Integer)
    resolution_hours: Mapped[int | None] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)


class Ticket(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "tickets"

    reference: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    subject: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    requester_agent_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("agents.id", ondelete="SET NULL"), index=True
    )
    requester_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    service_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("services.id", ondelete="SET NULL"), index=True
    )
    category_id: Mapped[UUID] = mapped_column(
        ForeignKey("ticket_categories.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    priority_id: Mapped[UUID] = mapped_column(
        ForeignKey("ticket_priorities.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    status_id: Mapped[UUID] = mapped_column(
        ForeignKey("ticket_statuses.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    assignee_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    source: Mapped[str] = mapped_column(String(30), default="manual", nullable=False)
    opened_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False, index=True
    )
    first_response_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    resolution: Mapped[str | None] = mapped_column(Text)
    time_spent_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    satisfaction_score: Mapped[int | None] = mapped_column(Integer)
    created_by_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    updated_by_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    category: Mapped[TicketCategory] = relationship(lazy="joined")
    priority: Mapped[TicketPriority] = relationship(lazy="joined")
    status: Mapped[TicketStatus] = relationship(lazy="joined")
    requester_agent: Mapped[Agent | None] = relationship(lazy="joined")
    service: Mapped[Service | None] = relationship(lazy="joined")
    assignee: Mapped[User | None] = relationship(
        foreign_keys=[assignee_user_id], lazy="joined"
    )


class TicketAsset(Base):
    __tablename__ = "ticket_assets"

    ticket_id: Mapped[UUID] = mapped_column(
        ForeignKey("tickets.id", ondelete="CASCADE"), primary_key=True
    )
    asset_id: Mapped[UUID] = mapped_column(
        ForeignKey("assets.id", ondelete="CASCADE"), primary_key=True
    )
    relation: Mapped[str | None] = mapped_column(String(50))


class TicketComment(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "ticket_comments"

    ticket_id: Mapped[UUID] = mapped_column(
        ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    author_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    is_internal: Mapped[bool] = mapped_column(default=False, nullable=False)
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    author: Mapped[User | None] = relationship(lazy="joined")


class TicketHistory(Base, UUIDMixin):
    __tablename__ = "ticket_history"

    ticket_id: Mapped[UUID] = mapped_column(
        ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    actor_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    field: Mapped[str] = mapped_column(String(80), nullable=False)
    old_value: Mapped[str | None] = mapped_column(String(512))
    new_value: Mapped[str | None] = mapped_column(String(512))
    note: Mapped[str | None] = mapped_column(Text)


class TicketTimeEntry(Base, UUIDMixin):
    __tablename__ = "ticket_time_entries"

    ticket_id: Mapped[UUID] = mapped_column(
        ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    performed_on: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )

    __table_args__ = (CheckConstraint("minutes > 0", name="time_entry_positive"),)


class Intervention(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "interventions"

    reference: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    ticket_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("tickets.id", ondelete="SET NULL"), index=True
    )
    asset_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("assets.id", ondelete="SET NULL"), index=True
    )
    supplier_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("suppliers.id", ondelete="SET NULL"), index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    type: Mapped[str] = mapped_column(String(30), default="corrective", nullable=False)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    technician_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    status: Mapped[str] = mapped_column(String(30), default="planned", nullable=False, index=True)
    report: Mapped[str | None] = mapped_column(Text)
    duration_minutes: Mapped[int | None] = mapped_column(Integer)
    cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    created_by_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    __table_args__ = (
        CheckConstraint(
            "status IN ('planned','in_progress','done','cancelled')",
            name="intervention_status",
        ),
    )


class InterventionAsset(Base):
    __tablename__ = "intervention_assets"

    intervention_id: Mapped[UUID] = mapped_column(
        ForeignKey("interventions.id", ondelete="CASCADE"), primary_key=True
    )
    asset_id: Mapped[UUID] = mapped_column(
        ForeignKey("assets.id", ondelete="CASCADE"), primary_key=True
    )

    __table_args__ = (UniqueConstraint("intervention_id", "asset_id", name="uq_intervention_asset"),)
