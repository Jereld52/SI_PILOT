"""reservable equipment and reservations

Revision ID: b7d4e2f1a9c3
Revises: 9f3c1a7b2d4e
Create Date: 2026-11-08
"""

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b7d4e2f1a9c3"
down_revision: str | Sequence[str] | None = "9f3c1a7b2d4e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DEFAULT_EQUIPMENTS = (
    ("Vidéoprojecteur 1", "video", 10),
    ("Vidéoprojecteur 2", "video", 20),
    ("Sonorisation 1", "audio", 30),
    ("Sonorisation 2", "audio", 40),
    ("Écran de projection 1", "screen", 50),
    ("Écran de projection 2", "screen", 60),
    ("Écran de projection 3", "screen", 70),
    ("Mallette 8 micros", "audio", 80),
    ("Enregistreur 1", "audio", 90),
    ("Enregistreur 2", "audio", 100),
)


def upgrade() -> None:
    op.create_table(
        "reservable_equipments",
        sa.Column("name", sa.String(length=180), nullable=False),
        sa.Column("category", sa.String(length=40), server_default="other", nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("location_id", sa.Uuid(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["location_id"],
            ["locations.id"],
            name=op.f("fk_reservable_equipments_location_id_locations"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_reservable_equipments")),
    )
    op.create_index(
        op.f("ix_reservable_equipments_name"),
        "reservable_equipments",
        ["name"],
        unique=True,
    )
    op.create_index(
        op.f("ix_reservable_equipments_category"),
        "reservable_equipments",
        ["category"],
        unique=False,
    )
    op.create_index(
        op.f("ix_reservable_equipments_location_id"),
        "reservable_equipments",
        ["location_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_reservable_equipments_is_active"),
        "reservable_equipments",
        ["is_active"],
        unique=False,
    )

    op.create_table(
        "equipment_reservations",
        sa.Column("equipment_id", sa.Uuid(), nullable=False),
        sa.Column("requester_agent_id", sa.Uuid(), nullable=True),
        sa.Column("requester_name", sa.String(length=180), nullable=True),
        sa.Column("requester_email", sa.String(length=255), nullable=True),
        sa.Column("purpose", sa.String(length=255), nullable=False),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="confirmed", nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by_id", sa.Uuid(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("end_at > start_at", name=op.f("ck_equipment_reservations_reservation_period")),
        sa.CheckConstraint(
            "status IN ('confirmed','cancelled')",
            name=op.f("ck_equipment_reservations_reservation_status"),
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"],
            ["users.id"],
            name=op.f("fk_equipment_reservations_created_by_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["equipment_id"],
            ["reservable_equipments.id"],
            name=op.f("fk_equipment_reservations_equipment_id_reservable_equipments"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["requester_agent_id"],
            ["agents.id"],
            name=op.f("fk_equipment_reservations_requester_agent_id_agents"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_equipment_reservations")),
    )
    op.create_index(
        op.f("ix_equipment_reservations_equipment_id"),
        "equipment_reservations",
        ["equipment_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_equipment_reservations_requester_agent_id"),
        "equipment_reservations",
        ["requester_agent_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_equipment_reservations_start_at"),
        "equipment_reservations",
        ["start_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_equipment_reservations_status"),
        "equipment_reservations",
        ["status"],
        unique=False,
    )

    equipment_table = sa.table(
        "reservable_equipments",
        sa.column("id", sa.Uuid()),
        sa.column("name", sa.String()),
        sa.column("category", sa.String()),
        sa.column("sort_order", sa.Integer()),
        sa.column("is_active", sa.Boolean()),
    )
    op.bulk_insert(
        equipment_table,
        [
            {
                "id": uuid.uuid4(),
                "name": name,
                "category": category,
                "sort_order": sort_order,
                "is_active": True,
            }
            for name, category, sort_order in DEFAULT_EQUIPMENTS
        ],
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_equipment_reservations_status"),
        table_name="equipment_reservations",
    )
    op.drop_index(
        op.f("ix_equipment_reservations_start_at"),
        table_name="equipment_reservations",
    )
    op.drop_index(
        op.f("ix_equipment_reservations_requester_agent_id"),
        table_name="equipment_reservations",
    )
    op.drop_index(
        op.f("ix_equipment_reservations_equipment_id"),
        table_name="equipment_reservations",
    )
    op.drop_table("equipment_reservations")
    op.drop_index(
        op.f("ix_reservable_equipments_is_active"),
        table_name="reservable_equipments",
    )
    op.drop_index(
        op.f("ix_reservable_equipments_location_id"),
        table_name="reservable_equipments",
    )
    op.drop_index(
        op.f("ix_reservable_equipments_category"),
        table_name="reservable_equipments",
    )
    op.drop_index(
        op.f("ix_reservable_equipments_name"),
        table_name="reservable_equipments",
    )
    op.drop_table("reservable_equipments")
