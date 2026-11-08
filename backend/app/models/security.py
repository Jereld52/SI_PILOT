from datetime import date, datetime
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin
from app.models.assets import Asset
from app.models.auth import User


class SecurityIncident(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "security_incidents"

    reference: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(30), default="open", nullable=False, index=True)
    owner_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    actions_taken: Mapped[str | None] = mapped_column(Text)
    corrective_measures: Mapped[str | None] = mapped_column(Text)
    lessons_learned: Mapped[str | None] = mapped_column(Text)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    owner: Mapped[User | None] = relationship(
        foreign_keys=[owner_user_id], lazy="joined"
    )

    __table_args__ = (
        CheckConstraint(
            "severity IN ('low','medium','high','critical')",
            name="security_severity",
        ),
        CheckConstraint(
            "status IN ('open','investigating','contained','closed')",
            name="security_status",
        ),
    )


class SecurityIncidentAsset(Base):
    __tablename__ = "security_incident_assets"

    incident_id: Mapped[UUID] = mapped_column(
        ForeignKey("security_incidents.id", ondelete="CASCADE"), primary_key=True
    )
    asset_id: Mapped[UUID] = mapped_column(
        ForeignKey("assets.id", ondelete="CASCADE"), primary_key=True
    )


class SecurityIncidentAgent(Base):
    __tablename__ = "security_incident_agents"

    incident_id: Mapped[UUID] = mapped_column(
        ForeignKey("security_incidents.id", ondelete="CASCADE"), primary_key=True
    )
    agent_id: Mapped[UUID] = mapped_column(
        ForeignKey("agents.id", ondelete="CASCADE"), primary_key=True
    )


class SecurityAction(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "security_actions"

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str | None] = mapped_column(String(60), index=True)
    priority: Mapped[str] = mapped_column(String(20), default="medium", nullable=False)
    due_date: Mapped[date | None] = mapped_column(Date, index=True)
    owner_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    status: Mapped[str] = mapped_column(String(20), default="todo", nullable=False, index=True)
    evidence: Mapped[str | None] = mapped_column(Text)
    incident_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("security_incidents.id", ondelete="SET NULL"), index=True
    )
    asset_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("assets.id", ondelete="SET NULL"), index=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    owner: Mapped[User | None] = relationship(lazy="joined")
    incident: Mapped[SecurityIncident | None] = relationship(lazy="joined")
    asset: Mapped[Asset | None] = relationship(lazy="joined")

    @property
    def incident_reference(self) -> str | None:
        return self.incident.reference if self.incident else None

    @property
    def asset_label(self) -> str | None:
        if self.asset is None:
            return None
        return f"{self.asset.name} ({self.asset.asset_tag})"


class Vulnerability(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "vulnerabilities"

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    cve_id: Mapped[str | None] = mapped_column(String(30), index=True)
    cvss_score: Mapped[float | None] = mapped_column(Numeric(3, 1))
    severity: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    asset_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("assets.id", ondelete="SET NULL"), index=True
    )
    detected_at: Mapped[date | None] = mapped_column(Date)
    source: Mapped[str | None] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(20), default="open", nullable=False, index=True)
    remediation: Mapped[str | None] = mapped_column(Text)
    due_date: Mapped[date | None] = mapped_column(Date, index=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    asset: Mapped[Asset | None] = relationship(lazy="joined")

    @property
    def asset_label(self) -> str | None:
        if self.asset is None:
            return None
        return f"{self.asset.name} ({self.asset.asset_tag})"


class BackupCheck(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "backup_checks"

    scope: Mapped[str] = mapped_column(String(120), nullable=False)
    backup_type: Mapped[str | None] = mapped_column(String(60))
    run_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    size_bytes: Mapped[int | None] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite")
    )
    duration_minutes: Mapped[int | None] = mapped_column(Integer)
    restore_tested_at: Mapped[date | None] = mapped_column(Date)
    restore_status: Mapped[str | None] = mapped_column(String(20))
    notes: Mapped[str | None] = mapped_column(Text)


class Certificate(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "certificates"

    common_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    issuer: Mapped[str | None] = mapped_column(String(255))
    valid_from: Mapped[date | None] = mapped_column(Date)
    valid_to: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    owner_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)
    auto_renew: Mapped[bool] = mapped_column(default=False, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)

    owner: Mapped[User | None] = relationship(lazy="joined")


class SecurityAudit(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "security_audits"

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    auditor: Mapped[str | None] = mapped_column(String(255))
    type: Mapped[str | None] = mapped_column(String(60))
    planned_at: Mapped[date | None] = mapped_column(Date, index=True)
    completed_at: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="planned", nullable=False)
    findings: Mapped[str | None] = mapped_column(Text)
    report_attachment_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("attachments.id", ondelete="SET NULL")
    )
