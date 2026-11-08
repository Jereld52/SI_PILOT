from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin, utcnow
from app.models.assets import Asset
from app.models.auth import User
from app.models.organization import Location


class InfraEquipment(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "infra_equipments"

    asset_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("assets.id", ondelete="SET NULL"), unique=True
    )
    name: Mapped[str] = mapped_column(String(180), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), unique=True)
    mac_address: Mapped[str | None] = mapped_column(String(50), unique=True)
    role: Mapped[str | None] = mapped_column(String(150))
    location_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("locations.id", ondelete="SET NULL"), index=True
    )
    os_name: Mapped[str | None] = mapped_column(String(80))
    os_version: Mapped[str | None] = mapped_column(String(80))
    config_notes: Mapped[str | None] = mapped_column(Text)
    criticality: Mapped[str] = mapped_column(String(20), default="medium", nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="active", nullable=False, index=True)
    responsible_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    parent_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("infra_equipments.id", ondelete="SET NULL")
    )
    map_x: Mapped[float | None] = mapped_column(Float)
    map_y: Mapped[float | None] = mapped_column(Float)
    last_check_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    asset: Mapped[Asset | None] = relationship(lazy="joined")
    location: Mapped[Location | None] = relationship(lazy="joined")
    responsible: Mapped[User | None] = relationship(lazy="joined")


class InfraDependency(Base, UUIDMixin):
    __tablename__ = "infra_dependencies"

    source_id: Mapped[UUID] = mapped_column(
        ForeignKey("infra_equipments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    target_id: Mapped[UUID] = mapped_column(
        ForeignKey("infra_equipments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    dependency_type: Mapped[str] = mapped_column(String(50), default="network", nullable=False)
    description: Mapped[str | None] = mapped_column(String(255))

    source: Mapped[InfraEquipment] = relationship(foreign_keys=[source_id], lazy="joined")
    target: Mapped[InfraEquipment] = relationship(foreign_keys=[target_id], lazy="joined")

    @property
    def source_name(self) -> str:
        return self.source.name if self.source else ""

    @property
    def target_name(self) -> str:
        return self.target.name if self.target else ""

    __table_args__ = (
        UniqueConstraint("source_id", "target_id", "dependency_type", name="uq_infra_dependency"),
    )


class MonitoringCheck(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "monitoring_checks"

    infra_id: Mapped[UUID] = mapped_column(
        ForeignKey("infra_equipments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    check_type: Mapped[str] = mapped_column(String(20), nullable=False)
    config_json: Mapped[str | None] = mapped_column(Text)
    interval_seconds: Mapped[int] = mapped_column(Integer, default=300, nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    requires_authorization: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    authorized_by_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    authorized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    infra: Mapped[InfraEquipment] = relationship(lazy="joined")
    authorized_by: Mapped[User | None] = relationship(lazy="joined")

    @property
    def infra_name(self) -> str:
        return self.infra.name if self.infra else ""


class MonitoringResult(Base, UUIDMixin):
    __tablename__ = "monitoring_results"

    check_id: Mapped[UUID] = mapped_column(
        ForeignKey("monitoring_checks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    checked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    message: Mapped[str | None] = mapped_column(Text)

    check: Mapped[MonitoringCheck] = relationship(lazy="joined")
