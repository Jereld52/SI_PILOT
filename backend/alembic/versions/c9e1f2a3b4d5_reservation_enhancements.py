"""reservation kind, checkout and equipment QR

Revision ID: c9e1f2a3b4d5
Revises: b7d4e2f1a9c3
Create Date: 2026-11-08
"""

import secrets
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c9e1f2a3b4d5"
down_revision: str | Sequence[str] | None = "b7d4e2f1a9c3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "reservable_equipments",
        sa.Column("qr_token", sa.String(length=64), nullable=True),
    )
    connection = op.get_bind()
    rows = connection.execute(
        sa.text("SELECT id FROM reservable_equipments")
    ).fetchall()
    for row in rows:
        connection.execute(
            sa.text(
                "UPDATE reservable_equipments SET qr_token = :token WHERE id = :id"
            ),
            {"token": secrets.token_urlsafe(24), "id": row[0]},
        )
    op.alter_column("reservable_equipments", "qr_token", nullable=False)
    op.create_index(
        op.f("ix_reservable_equipments_qr_token"),
        "reservable_equipments",
        ["qr_token"],
        unique=True,
    )

    op.add_column(
        "equipment_reservations",
        sa.Column(
            "kind",
            sa.String(length=20),
            server_default="reservation",
            nullable=False,
        ),
    )
    op.add_column(
        "equipment_reservations",
        sa.Column("checked_out_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "equipment_reservations",
        sa.Column("returned_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        op.f("ix_equipment_reservations_kind"),
        "equipment_reservations",
        ["kind"],
        unique=False,
    )
    op.drop_constraint(
        op.f("ck_equipment_reservations_reservation_status"),
        "equipment_reservations",
        type_="check",
    )
    op.create_check_constraint(
        op.f("ck_equipment_reservations_reservation_status"),
        "equipment_reservations",
        "status IN ('confirmed','cancelled','blocked','checked_out','returned')",
    )
    op.create_check_constraint(
        op.f("ck_equipment_reservations_reservation_kind"),
        "equipment_reservations",
        "kind IN ('reservation','unavailability')",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("ck_equipment_reservations_reservation_kind"),
        "equipment_reservations",
        type_="check",
    )
    op.drop_constraint(
        op.f("ck_equipment_reservations_reservation_status"),
        "equipment_reservations",
        type_="check",
    )
    op.create_check_constraint(
        op.f("ck_equipment_reservations_reservation_status"),
        "equipment_reservations",
        "status IN ('confirmed','cancelled')",
    )
    op.drop_index(
        op.f("ix_equipment_reservations_kind"),
        table_name="equipment_reservations",
    )
    op.drop_column("equipment_reservations", "returned_at")
    op.drop_column("equipment_reservations", "checked_out_at")
    op.drop_column("equipment_reservations", "kind")
    op.drop_index(
        op.f("ix_reservable_equipments_qr_token"),
        table_name="reservable_equipments",
    )
    op.drop_column("reservable_equipments", "qr_token")
