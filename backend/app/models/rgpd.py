from datetime import date, datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin
from app.models.auth import User


class ProcessingActivity(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "processing_activities"

    reference: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    purpose: Mapped[str | None] = mapped_column(Text)
    legal_basis: Mapped[str | None] = mapped_column(String(120))
    data_categories: Mapped[str | None] = mapped_column(Text)
    data_subjects: Mapped[str | None] = mapped_column(Text)
    recipients: Mapped[str | None] = mapped_column(Text)
    retention_period: Mapped[str | None] = mapped_column(String(120))
    security_measures: Mapped[str | None] = mapped_column(Text)
    suppliers: Mapped[str | None] = mapped_column(Text)
    owner_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    dpo_notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False, index=True)
    last_review_at: Mapped[date | None] = mapped_column(Date)
    next_review_at: Mapped[date | None] = mapped_column(Date, index=True)

    owner: Mapped[User | None] = relationship(lazy="joined")

    __table_args__ = (
        CheckConstraint("status IN ('draft','active','archived')", name="processing_status"),
    )


class DataCollection(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "data_collections"

    name: Mapped[str] = mapped_column(String(180), nullable=False)
    collection_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    purpose: Mapped[str | None] = mapped_column(Text)
    processing_activity_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("processing_activities.id", ondelete="SET NULL"), index=True
    )
    data_categories: Mapped[str | None] = mapped_column(Text)
    subjects_count: Mapped[int | None] = mapped_column(Integer)
    collected_at: Mapped[date | None] = mapped_column(Date)
    retention_end: Mapped[date | None] = mapped_column(Date, index=True)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)

    processing_activity: Mapped[ProcessingActivity | None] = relationship(lazy="joined")

    __table_args__ = (
        CheckConstraint(
            "collection_type IN ('form','survey','contact_list','registration','event','ad_hoc')",
            name="collection_type",
        ),
    )


class DpoRequest(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "dpo_requests"

    reference: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    requester_name: Mapped[str | None] = mapped_column(String(180))
    requester_type: Mapped[str | None] = mapped_column(String(40))
    description: Mapped[str | None] = mapped_column(Text)
    response: Mapped[str | None] = mapped_column(Text)
    recommendations: Mapped[str | None] = mapped_column(Text)
    due_date: Mapped[date | None] = mapped_column(Date, index=True)
    status: Mapped[str] = mapped_column(String(20), default="new", nullable=False, index=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    __table_args__ = (
        CheckConstraint(
            "status IN ('new','in_progress','answered','closed')",
            name="dpo_request_status",
        ),
    )


class RightsRequest(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "rights_requests"

    reference: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    request_type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    requester_name: Mapped[str | None] = mapped_column(String(180))
    processing_activity_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("processing_activities.id", ondelete="SET NULL"), index=True
    )
    received_at: Mapped[date | None] = mapped_column(Date, index=True)
    due_date: Mapped[date | None] = mapped_column(Date, index=True)
    status: Mapped[str] = mapped_column(String(20), default="new", nullable=False, index=True)
    response: Mapped[str | None] = mapped_column(Text)
    resolution: Mapped[str | None] = mapped_column(Text)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    processing_activity: Mapped[ProcessingActivity | None] = relationship(lazy="joined")

    __table_args__ = (
        CheckConstraint(
            "request_type IN ('access','rectification','erasure','objection','portability','limitation')",
            name="rights_request_type",
        ),
    )


class DataBreach(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "data_breaches"

    reference: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    occurred_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    discovered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    description: Mapped[str | None] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(20), default="medium", nullable=False)
    affected_count: Mapped[int | None] = mapped_column(Integer)
    containment: Mapped[str | None] = mapped_column(Text)
    cnil_notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    subjects_notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), default="open", nullable=False)
    lessons_learned: Mapped[str | None] = mapped_column(Text)
