from datetime import date
from decimal import Decimal

from sqlalchemy import Boolean, Date, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin


class MobileLine(Base, UUIDMixin, TimestampMixin):
    """Inventaire des lignes mobiles.

    Les secrets de type PIN, PUK, EID, CSIM et QR code de carte SIM ne sont volontairement
    pas stockés dans l'application.
    """

    __tablename__ = "mobile_lines"

    line_number: Mapped[str] = mapped_column(String(30), unique=True, index=True, nullable=False)
    civility: Mapped[str | None] = mapped_column(String(20))
    holder_name: Mapped[str | None] = mapped_column(String(180), index=True)
    role_label: Mapped[str | None] = mapped_column(String(180))
    email: Mapped[str | None] = mapped_column(String(255))
    siren: Mapped[str | None] = mapped_column(String(20))
    company_name: Mapped[str | None] = mapped_column(String(180))
    contract_number: Mapped[str | None] = mapped_column(String(60), index=True)
    titulaire_number: Mapped[str | None] = mapped_column(String(60))
    cf_number: Mapped[str | None] = mapped_column(String(60))
    cf_name: Mapped[str | None] = mapped_column(String(180))
    status: Mapped[str] = mapped_column(String(30), default="Actif", nullable=False, index=True)
    activation_date: Mapped[date | None] = mapped_column(Date)
    commitment_end_date: Mapped[date | None] = mapped_column(Date, index=True)
    billing_date: Mapped[date | None] = mapped_column(Date)
    portability_date: Mapped[date | None] = mapped_column(Date)
    list_name: Mapped[str | None] = mapped_column(String(120))
    plan_name: Mapped[str | None] = mapped_column(String(180), index=True)
    terminal_communicating: Mapped[str | None] = mapped_column(String(180))
    terminal_purchased: Mapped[str | None] = mapped_column(String(180))
    imei_communicating: Mapped[str | None] = mapped_column(String(40))
    imei_purchased: Mapped[str | None] = mapped_column(String(40))
    out_of_bundle: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    sim_format: Mapped[str | None] = mapped_column(String(30))
    vpn_identifier: Mapped[str | None] = mapped_column(String(120))
    private_number: Mapped[str | None] = mapped_column(String(30))
    terminal_change_date: Mapped[date | None] = mapped_column(Date)
    plan_change_date: Mapped[date | None] = mapped_column(Date)
    is_secondary_line: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    main_line_number: Mapped[str | None] = mapped_column(String(30))
    master_access_id: Mapped[str | None] = mapped_column(String(60))
    offer_type: Mapped[str | None] = mapped_column(String(30))
    company_id: Mapped[str | None] = mapped_column(String(60))
    notes: Mapped[str | None] = mapped_column(Text)
