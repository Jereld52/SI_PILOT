from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    Date,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin
from app.models.auth import User


class Project(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "projects"

    code: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(180), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    objectives: Mapped[str | None] = mapped_column(Text)
    owner_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    start_date: Mapped[date | None] = mapped_column(Date)
    due_date: Mapped[date | None] = mapped_column(Date, index=True)
    planned_budget: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    priority: Mapped[str] = mapped_column(String(20), default="medium", nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="planned", nullable=False, index=True)
    progress_percent: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_by_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    owner: Mapped[User | None] = relationship(
        foreign_keys=[owner_user_id], lazy="joined"
    )
    milestones: Mapped[list[ProjectMilestone]] = relationship(
        lazy="selectin", cascade="all, delete-orphan", order_by="ProjectMilestone.due_date"
    )
    tasks: Mapped[list[ProjectTask]] = relationship(
        lazy="selectin", cascade="all, delete-orphan", order_by="ProjectTask.position"
    )
    risks: Mapped[list[ProjectRisk]] = relationship(
        lazy="selectin", cascade="all, delete-orphan"
    )
    decisions: Mapped[list[ProjectDecision]] = relationship(
        lazy="selectin", cascade="all, delete-orphan", order_by="ProjectDecision.decision_date"
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('idea','planned','in_progress','on_hold','done','cancelled')",
            name="project_status",
        ),
        CheckConstraint("progress_percent >= 0 AND progress_percent <= 100", name="project_progress"),
    )


class ProjectMember(Base):
    __tablename__ = "project_members"

    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    role: Mapped[str | None] = mapped_column(String(80))


class ProjectMilestone(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "project_milestones"

    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    due_date: Mapped[date | None] = mapped_column(Date, index=True)
    completed_at: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="todo", nullable=False)
    weight: Mapped[int] = mapped_column(Integer, default=1, nullable=False)


class ProjectTask(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "project_tasks"

    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    milestone_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("project_milestones.id", ondelete="SET NULL"), index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="todo", nullable=False, index=True)
    priority: Mapped[str] = mapped_column(String(20), default="medium", nullable=False)
    assignee_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    due_date: Mapped[date | None] = mapped_column(Date, index=True)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    __table_args__ = (
        CheckConstraint(
            "status IN ('todo','in_progress','blocked','done')",
            name="project_task_status",
        ),
    )


class ProjectRisk(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "project_risks"

    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    probability: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    impact: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    mitigation: Mapped[str | None] = mapped_column(Text)
    owner_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    status: Mapped[str] = mapped_column(String(20), default="open", nullable=False)

    __table_args__ = (
        CheckConstraint("probability BETWEEN 1 AND 5", name="risk_probability"),
        CheckConstraint("impact BETWEEN 1 AND 5", name="risk_impact"),
    )


class ProjectDecision(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "project_decisions"

    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    decision_date: Mapped[date | None] = mapped_column(Date, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    decided_by: Mapped[str | None] = mapped_column(String(255))
    document_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("documents.id", ondelete="SET NULL")
    )
