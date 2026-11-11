from __future__ import annotations

from datetime import date
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin


class Service(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "services"

    code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    parent_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("services.id", ondelete="SET NULL"), index=True
    )
    manager_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Location(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "locations"

    code: Mapped[str | None] = mapped_column(String(50), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    address: Mapped[str | None] = mapped_column(String(255))
    postal_code: Mapped[str | None] = mapped_column(String(20))
    city: Mapped[str | None] = mapped_column(String(120))
    building: Mapped[str | None] = mapped_column(String(120))
    floor: Mapped[str | None] = mapped_column(String(50))
    room: Mapped[str | None] = mapped_column(String(50))
    notes: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Agent(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "agents"

    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    email_pro: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    phone_pro: Mapped[str | None] = mapped_column(String(50))
    service_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("services.id", ondelete="SET NULL"), index=True
    )
    function_label: Mapped[str | None] = mapped_column(String(150))
    location_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("locations.id", ondelete="SET NULL"), index=True
    )
    manager_agent_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("agents.id", ondelete="SET NULL")
    )
    login: Mapped[str | None] = mapped_column(String(120), unique=True)
    arrival_date: Mapped[date | None] = mapped_column(Date)
    departure_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False, index=True)
    notes: Mapped[str | None] = mapped_column(Text)
    user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), unique=True
    )

    service: Mapped[Service | None] = relationship(lazy="joined")
    location: Mapped[Location | None] = relationship(lazy="joined")

    __table_args__ = (
        CheckConstraint(
            "status IN ('active','arriving','departed','suspended')",
            name="agent_status",
        ),
    )


class AgentAccount(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "agent_accounts"

    agent_id: Mapped[UUID] = mapped_column(
        ForeignKey("agents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    system_label: Mapped[str] = mapped_column(String(120), nullable=False)
    login: Mapped[str] = mapped_column(String(120), nullable=False)
    account_type: Mapped[str | None] = mapped_column(String(60))
    is_privileged: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    last_review_at: Mapped[date | None] = mapped_column(Date)

    __table_args__ = (UniqueConstraint("agent_id", "system_label", "login", name="uq_agent_account"),)


class ChecklistTemplate(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "checklist_templates"

    code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    type: Mapped[str] = mapped_column(String(20), default="custom", nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    items: Mapped[list[ChecklistTemplateItem]] = relationship(
        cascade="all, delete-orphan", order_by="ChecklistTemplateItem.position"
    )

    __table_args__ = (
        CheckConstraint("type IN ('onboarding','offboarding','custom')", name="checklist_type"),
    )


class ChecklistTemplateItem(Base, UUIDMixin):
    __tablename__ = "checklist_template_items"

    template_id: Mapped[UUID] = mapped_column(
        ForeignKey("checklist_templates.id", ondelete="CASCADE"), nullable=False, index=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    responsible_role: Mapped[str | None] = mapped_column(String(60))
    is_required: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class ChecklistRun(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "checklist_runs"

    template_id: Mapped[UUID] = mapped_column(
        ForeignKey("checklist_templates.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    agent_id: Mapped[UUID] = mapped_column(
        ForeignKey("agents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="in_progress", nullable=False)
    started_at: Mapped[date | None] = mapped_column(Date)
    due_date: Mapped[date | None] = mapped_column(Date, index=True)
    completed_at: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    template: Mapped[ChecklistTemplate] = relationship(lazy="joined")
    agent: Mapped[Agent] = relationship(lazy="joined")
    items: Mapped[list[ChecklistRunItem]] = relationship(cascade="all, delete-orphan")


class ChecklistRunItem(Base, UUIDMixin):
    __tablename__ = "checklist_run_items"

    run_id: Mapped[UUID] = mapped_column(
        ForeignKey("checklist_runs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    template_item_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("checklist_template_items.id", ondelete="SET NULL")
    )
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    is_required: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_done: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    done_at: Mapped[date | None] = mapped_column(Date)
    done_by_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    notes: Mapped[str | None] = mapped_column(Text)
