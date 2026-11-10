from __future__ import annotations

import json
import secrets
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
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
from app.models.auth import User
from app.models.organization import Agent, Location, Service

if TYPE_CHECKING:
    from app.models.stock import StockItem


class AssetCategory(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "asset_categories"

    code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    icon: Mapped[str | None] = mapped_column(String(50))
    is_infrastructure: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_workstation: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    requires_network_fields: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    default_life_months: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    tag_prefix: Mapped[str | None] = mapped_column(String(20))
    tag_template: Mapped[str] = mapped_column(
        String(120),
        default="PNFOR-{PREFIX}-{YEAR}-{SEQ:4}",
        server_default="PNFOR-{PREFIX}-{YEAR}-{SEQ:4}",
        nullable=False,
    )
    tag_sequence_mode: Mapped[str] = mapped_column(
        String(10), default="year", server_default="year", nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    __table_args__ = (
        CheckConstraint(
            "tag_sequence_mode IN ('year','global')",
            name="asset_category_tag_sequence_mode",
        ),
    )


class Supplier(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "suppliers"

    name: Mapped[str] = mapped_column(String(150), unique=True, index=True, nullable=False)
    type: Mapped[str | None] = mapped_column(String(80))
    siret: Mapped[str | None] = mapped_column(String(20))
    contact_name: Mapped[str | None] = mapped_column(String(150))
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(50))
    address: Mapped[str | None] = mapped_column(String(255))
    website: Mapped[str | None] = mapped_column(String(255))
    notes: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    contacts: Mapped[list[SupplierContact]] = relationship(
        lazy="selectin", cascade="all, delete-orphan"
    )


class SupplierContact(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "supplier_contacts"

    supplier_id: Mapped[UUID] = mapped_column(
        ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    role: Mapped[str | None] = mapped_column(String(120))
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(50))
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class Asset(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "assets"

    asset_tag: Mapped[str] = mapped_column(String(60), unique=True, index=True, nullable=False)
    external_id: Mapped[str | None] = mapped_column(String(120), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(180), nullable=False, index=True)
    category_id: Mapped[UUID] = mapped_column(
        ForeignKey("asset_categories.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    brand: Mapped[str | None] = mapped_column(String(100))
    model: Mapped[str | None] = mapped_column(String(150))
    serial_number: Mapped[str | None] = mapped_column(String(150), unique=True, index=True)
    mac_address: Mapped[str | None] = mapped_column(String(50), unique=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), unique=True)
    hostname: Mapped[str | None] = mapped_column(String(120), unique=True)
    os_name: Mapped[str | None] = mapped_column(String(80))
    os_version: Mapped[str | None] = mapped_column(String(80))

    purchase_date: Mapped[date | None] = mapped_column(Date)
    commissioning_date: Mapped[date | None] = mapped_column(Date)
    warranty_end: Mapped[date | None] = mapped_column(Date, index=True)
    supplier_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("suppliers.id", ondelete="SET NULL"), index=True
    )
    purchase_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))

    status: Mapped[str] = mapped_column(String(30), default="in_stock", nullable=False, index=True)
    condition: Mapped[str] = mapped_column(String(30), default="good", nullable=False)
    assigned_agent_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("agents.id", ondelete="SET NULL"), index=True
    )
    service_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("services.id", ondelete="SET NULL"), index=True
    )
    location_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("locations.id", ondelete="SET NULL"), index=True
    )
    comments: Mapped[str | None] = mapped_column(Text)
    external_data_json: Mapped[str | None] = mapped_column(Text)
    qr_token: Mapped[str] = mapped_column(
        String(64),
        unique=True,
        index=True,
        nullable=False,
        default=lambda: secrets.token_urlsafe(24),
    )
    is_critical: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    category: Mapped[AssetCategory] = relationship(lazy="joined")
    supplier: Mapped[Supplier | None] = relationship(lazy="joined")
    assigned_agent: Mapped[Agent | None] = relationship(lazy="joined")
    service: Mapped[Service | None] = relationship(lazy="joined")
    location: Mapped[Location | None] = relationship(lazy="joined")
    softwares: Mapped[list[AssetSoftware]] = relationship(
        back_populates="asset", cascade="all, delete-orphan", lazy="selectin"
    )

    @property
    def external_data(self) -> dict[str, Any] | None:
        if not self.external_data_json:
            return None
        try:
            value = json.loads(self.external_data_json)
            return value if isinstance(value, dict) else None
        except (json.JSONDecodeError, TypeError):
            return None

    @property
    def wapt_status(self) -> str | None:
        data = self.external_data or {}
        return data.get("statut")

    @property
    def wapt_reachable(self) -> str | None:
        data = self.external_data or {}
        return data.get("joignable")

    @property
    def wapt_last_seen(self) -> str | None:
        data = self.external_data or {}
        return data.get("derniere_connexion")

    @property
    def wapt_last_user(self) -> str | None:
        data = self.external_data or {}
        last_user = data.get("dernier_utilisateur_logue")
        if last_user:
            return str(last_user)
        connected = data.get("connected_users")
        if isinstance(connected, list):
            return ", ".join(str(item) for item in connected if item) or None
        return str(connected) if connected else None

    @property
    def wapt_groups(self) -> str | None:
        data = self.external_data or {}
        return data.get("groupes")

    @property
    def wapt_domain(self) -> str | None:
        data = self.external_data or {}
        return data.get("domaine")

    __table_args__ = (
        CheckConstraint(
            "status IN ('in_service','in_stock','maintenance','broken','to_renew','retired')",
            name="asset_status",
        ),
        CheckConstraint(
            "condition IN ('new','good','fair','poor','out_of_service')",
            name="asset_condition",
        ),
    )


class AssetSoftware(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "asset_softwares"

    asset_id: Mapped[UUID] = mapped_column(
        ForeignKey("assets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    package_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    package_version: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    install_status: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    update_available: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, index=True
    )
    available_version: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    source: Mapped[str] = mapped_column(String(30), default="wapt", nullable=False)
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    asset: Mapped[Asset] = relationship(back_populates="softwares")

    __table_args__ = (
        UniqueConstraint("asset_id", "package_name", name="asset_software_unique"),
    )


class AssetAssignment(Base, UUIDMixin):
    __tablename__ = "asset_assignments"

    asset_id: Mapped[UUID] = mapped_column(
        ForeignKey("assets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    agent_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("agents.id", ondelete="SET NULL"), index=True
    )
    service_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("services.id", ondelete="SET NULL")
    )
    location_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("locations.id", ondelete="SET NULL")
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reason: Mapped[str | None] = mapped_column(String(255))
    created_by_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    asset: Mapped[Asset | None] = relationship(lazy="joined")


class StockMovement(Base, UUIDMixin):
    __tablename__ = "stock_movements"

    asset_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("assets.id", ondelete="SET NULL"), index=True
    )
    stock_item_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("stock_items.id", ondelete="SET NULL"), index=True
    )
    category_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("asset_categories.id", ondelete="SET NULL")
    )
    direction: Mapped[str] = mapped_column(String(20), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    quantity_after: Mapped[int | None] = mapped_column(Integer)
    recipient_agent_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("agents.id", ondelete="SET NULL"), index=True
    )
    reason: Mapped[str | None] = mapped_column(String(255))
    reference: Mapped[str | None] = mapped_column(String(120))
    moved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    asset: Mapped[Asset | None] = relationship(lazy="joined")
    stock_item: Mapped[StockItem | None] = relationship(lazy="joined")
    category: Mapped[AssetCategory | None] = relationship(lazy="joined")
    recipient_agent: Mapped[Agent | None] = relationship(lazy="joined")
    created_by: Mapped[User | None] = relationship(lazy="joined")

    @property
    def created_by_label(self) -> str | None:
        if self.created_by is None:
            return None
        return f"{self.created_by.first_name} {self.created_by.last_name}".strip()


class License(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "licenses"

    name: Mapped[str] = mapped_column(String(180), nullable=False)
    vendor: Mapped[str | None] = mapped_column(String(150))
    license_type: Mapped[str | None] = mapped_column(String(80))
    seats: Mapped[int | None] = mapped_column(Integer)
    seats_used: Mapped[int | None] = mapped_column(Integer)
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date, index=True)
    contract_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("contracts.id", ondelete="SET NULL"), index=True
    )
    annual_cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    notes: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class RenewalPlan(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "renewal_plans"

    asset_id: Mapped[UUID] = mapped_column(
        ForeignKey("assets.id", ondelete="CASCADE"), unique=True, nullable=False, index=True
    )
    target_year: Mapped[int | None] = mapped_column(Integer, index=True)
    estimated_cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    decision: Mapped[str] = mapped_column(String(20), default="replace", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="planned", nullable=False)
    justification: Mapped[str | None] = mapped_column(Text)
    decided_by_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    decided_at: Mapped[date | None] = mapped_column(Date)

    __table_args__ = (
        CheckConstraint(
            "decision IN ('renew','replace','retire','defer')",
            name="renewal_decision",
        ),
    )
