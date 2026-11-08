"""supervision maps and equipment placement

Revision ID: e2f3a4b5c6d7
Revises: c9e1f2a3b4d5
Create Date: 2026-11-08
"""

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e2f3a4b5c6d7"
down_revision: str | Sequence[str] | None = "c9e1f2a3b4d5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "infra_maps",
        sa.Column("name", sa.String(length=180), nullable=False),
        sa.Column("kind", sa.String(length=30), server_default="site", nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("location_id", sa.Uuid(), nullable=True),
        sa.Column("background_filename", sa.String(length=512), nullable=True),
        sa.Column("background_width", sa.Integer(), nullable=True),
        sa.Column("background_height", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
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
        sa.CheckConstraint(
            "kind IN ('site','building','floor','rack','other')",
            name=op.f("ck_infra_maps_infra_map_kind"),
        ),
        sa.ForeignKeyConstraint(
            ["location_id"],
            ["locations.id"],
            name=op.f("fk_infra_maps_location_id_locations"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_infra_maps")),
    )
    op.create_index(op.f("ix_infra_maps_name"), "infra_maps", ["name"], unique=False)
    op.create_index(op.f("ix_infra_maps_kind"), "infra_maps", ["kind"], unique=False)
    op.create_index(
        op.f("ix_infra_maps_location_id"), "infra_maps", ["location_id"], unique=False
    )
    op.create_index(
        op.f("ix_infra_maps_is_active"), "infra_maps", ["is_active"], unique=False
    )

    op.add_column("infra_equipments", sa.Column("infra_map_id", sa.Uuid(), nullable=True))
    op.create_index(
        op.f("ix_infra_equipments_infra_map_id"),
        "infra_equipments",
        ["infra_map_id"],
        unique=False,
    )
    op.create_foreign_key(
        op.f("fk_infra_equipments_infra_map_id_infra_maps"),
        "infra_equipments",
        "infra_maps",
        ["infra_map_id"],
        ["id"],
        ondelete="SET NULL",
    )

    default_map_id = uuid.uuid4()
    connection = op.get_bind()
    connection.execute(
        sa.text(
            "INSERT INTO infra_maps (id, name, kind, description, is_active, sort_order) "
            "VALUES (:id, :name, :kind, :description, true, 0)"
        ),
        {
            "id": default_map_id,
            "name": "Plan général",
            "kind": "site",
            "description": "Carte créée automatiquement pour les équipements déjà positionnés.",
        },
    )
    connection.execute(
        sa.text(
            "UPDATE infra_equipments SET infra_map_id = :map_id "
            "WHERE map_x IS NOT NULL OR map_y IS NOT NULL"
        ),
        {"map_id": default_map_id},
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("fk_infra_equipments_infra_map_id_infra_maps"),
        "infra_equipments",
        type_="foreignkey",
    )
    op.drop_index(
        op.f("ix_infra_equipments_infra_map_id"),
        table_name="infra_equipments",
    )
    op.drop_column("infra_equipments", "infra_map_id")
    op.drop_index(op.f("ix_infra_maps_is_active"), table_name="infra_maps")
    op.drop_index(op.f("ix_infra_maps_location_id"), table_name="infra_maps")
    op.drop_index(op.f("ix_infra_maps_kind"), table_name="infra_maps")
    op.drop_index(op.f("ix_infra_maps_name"), table_name="infra_maps")
    op.drop_table("infra_maps")
