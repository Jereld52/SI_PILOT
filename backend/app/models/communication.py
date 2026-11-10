from __future__ import annotations

import json
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import (
    Boolean,
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
from app.models.auth import Role, User
from app.models.organization import Service


def _load_ids(value: str | None) -> list[UUID]:
    if not value:
        return []
    try:
        data = json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return []
    if not isinstance(data, list):
        return []
    result: list[UUID] = []
    for item in data:
        try:
            result.append(UUID(str(item)))
        except (ValueError, TypeError):
            continue
    return result


def _dump_ids(values: list[UUID] | None) -> str | None:
    if not values:
        return None
    return json.dumps([str(value) for value in values], ensure_ascii=False)


class Communication(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "communications"

    title: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(
        String(40), default="information", nullable=False, index=True
    )
    audience: Mapped[str] = mapped_column(String(20), default="all", nullable=False)
    audience_service_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("services.id", ondelete="SET NULL"), index=True
    )
    audience_role_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("roles.id", ondelete="SET NULL"), index=True
    )
    audience_user_ids_json: Mapped[str | None] = mapped_column(Text)
    channel: Mapped[str] = mapped_column(String(20), default="in_app", nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), default="draft", nullable=False, index=True
    )
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    author_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    created_by_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    updated_by_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )

    author: Mapped[User | None] = relationship(foreign_keys=[author_user_id], lazy="joined")
    audience_service: Mapped[Service | None] = relationship(
        foreign_keys=[audience_service_id], lazy="joined"
    )
    audience_role: Mapped[Role | None] = relationship(
        foreign_keys=[audience_role_id], lazy="joined"
    )
    receipts: Mapped[list[CommunicationReceipt]] = relationship(
        back_populates="communication", cascade="all, delete-orphan", lazy="selectin"
    )

    @property
    def audience_user_ids(self) -> list[UUID]:
        return _load_ids(self.audience_user_ids_json)

    @audience_user_ids.setter
    def audience_user_ids(self, values: list[UUID] | None) -> None:
        self.audience_user_ids_json = _dump_ids(values)


class CommunicationReceipt(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "communication_receipts"

    communication_id: Mapped[UUID] = mapped_column(
        ForeignKey("communications.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    read_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    communication: Mapped[Communication] = relationship(back_populates="receipts")

    __table_args__ = (
        UniqueConstraint(
            "communication_id", "user_id", name="communication_receipt_unique"
        ),
    )


class Meeting(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "meetings"

    title: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    meeting_type: Mapped[str] = mapped_column(
        String(30), default="team", nullable=False, index=True
    )
    scheduled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    duration_minutes: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    location: Mapped[str | None] = mapped_column(String(255))
    visio_url: Mapped[str | None] = mapped_column(String(500))
    organizer_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    participant_user_ids_json: Mapped[str | None] = mapped_column(Text)
    agenda: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    decisions: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(
        String(20), default="planned", nullable=False, index=True
    )
    created_by_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    updated_by_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )

    organizer: Mapped[User | None] = relationship(
        foreign_keys=[organizer_user_id], lazy="joined"
    )
    points: Mapped[list[MeetingPoint]] = relationship(
        back_populates="meeting", cascade="all, delete-orphan", lazy="selectin"
    )

    @property
    def participant_user_ids(self) -> list[UUID]:
        return _load_ids(self.participant_user_ids_json)

    @participant_user_ids.setter
    def participant_user_ids(self, values: list[UUID] | None) -> None:
        self.participant_user_ids_json = _dump_ids(values)


class MeetingPoint(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "meeting_points"

    meeting_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("meetings.id", ondelete="SET NULL"), index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(
        String(20), default="open", nullable=False, index=True
    )
    priority: Mapped[str] = mapped_column(String(20), default="medium", nullable=False)
    due_date: Mapped[date | None] = mapped_column(Date)
    next_review_at: Mapped[date | None] = mapped_column(Date)
    last_discussed_at: Mapped[date | None] = mapped_column(Date)
    owner_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    notes: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    updated_by_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )

    meeting: Mapped[Meeting | None] = relationship(back_populates="points", lazy="joined")
    owner: Mapped[User | None] = relationship(foreign_keys=[owner_user_id], lazy="joined")


class Training(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "trainings"

    title: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    provider: Mapped[str | None] = mapped_column(String(180))
    description: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str | None] = mapped_column(String(40), index=True)
    start_date: Mapped[date | None] = mapped_column(Date, index=True)
    end_date: Mapped[date | None] = mapped_column(Date)
    duration_hours: Mapped[Decimal | None] = mapped_column(Numeric(6, 1))
    location: Mapped[str | None] = mapped_column(String(255))
    mandatory: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    status: Mapped[str] = mapped_column(
        String(20), default="planned", nullable=False, index=True
    )
    capacity: Mapped[int | None] = mapped_column(Integer)
    participant_agent_ids_json: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    updated_by_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )

    @property
    def participant_agent_ids(self) -> list[UUID]:
        return _load_ids(self.participant_agent_ids_json)

    @participant_agent_ids.setter
    def participant_agent_ids(self, values: list[UUID] | None) -> None:
        self.participant_agent_ids_json = _dump_ids(values)


def ids_payload(values: list[Any] | None) -> list[UUID]:
    if not values:
        return []
    result: list[UUID] = []
    for value in values:
        try:
            result.append(value if isinstance(value, UUID) else UUID(str(value)))
        except (ValueError, TypeError):
            continue
    return result
