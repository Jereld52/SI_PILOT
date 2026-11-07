from datetime import datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin, utcnow


class AutomationRule(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "automation_rules"

    code: Mapped[str] = mapped_column(String(60), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    trigger_type: Mapped[str] = mapped_column(String(20), default="schedule", nullable=False)
    cron_expression: Mapped[str | None] = mapped_column(String(80))
    event_type: Mapped[str | None] = mapped_column(String(80))
    condition_json: Mapped[str | None] = mapped_column(Text)
    action_type: Mapped[str] = mapped_column(String(30), nullable=False)
    config_json: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    requires_approval: Mapped[bool] = mapped_column(default=True, nullable=False)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    __table_args__ = (
        CheckConstraint("trigger_type IN ('schedule','event')", name="automation_trigger"),
        CheckConstraint(
            "action_type IN ('notify','create_action','send_report','webhook')",
            name="automation_action",
        ),
    )


class AutomationRun(Base, UUIDMixin):
    __tablename__ = "automation_runs"

    rule_id: Mapped[UUID] = mapped_column(
        ForeignKey("automation_rules.id", ondelete="CASCADE"), nullable=False, index=True
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), default="running", nullable=False, index=True)
    matched_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    actions_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    result_json: Mapped[str | None] = mapped_column(Text)
    error_message: Mapped[str | None] = mapped_column(Text)
    dry_run: Mapped[bool] = mapped_column(default=True, nullable=False)


class EmailOutbox(Base, UUIDMixin):
    __tablename__ = "email_outbox"

    to_email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False, index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    scheduled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error: Mapped[str | None] = mapped_column(Text)
