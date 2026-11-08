"""stock items and item movements

Revision ID: 9f3c1a7b2d4e
Revises: 878501b17c7c
Create Date: 2026-11-08
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "9f3c1a7b2d4e"
down_revision: str | Sequence[str] | None = "878501b17c7c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "stock_items",
        sa.Column("reference", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=180), nullable=False),
        sa.Column("category", sa.String(length=40), nullable=False),
        sa.Column("brand", sa.String(length=100), nullable=True),
        sa.Column("model", sa.String(length=150), nullable=True),
        sa.Column("supplier_id", sa.Uuid(), nullable=True),
        sa.Column("location_id", sa.Uuid(), nullable=True),
        sa.Column("unit", sa.String(length=30), server_default="pièce", nullable=False),
        sa.Column("quantity", sa.Integer(), server_default="0", nullable=False),
        sa.Column("min_quantity", sa.Integer(), server_default="0", nullable=False),
        sa.Column("unit_price", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("status", sa.String(length=20), server_default="active", nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["location_id"],
            ["locations.id"],
            name=op.f("fk_stock_items_location_id_locations"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["supplier_id"],
            ["suppliers.id"],
            name=op.f("fk_stock_items_supplier_id_suppliers"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_stock_items")),
    )
    op.create_index(op.f("ix_stock_items_reference"), "stock_items", ["reference"], unique=True)
    op.create_index(op.f("ix_stock_items_name"), "stock_items", ["name"], unique=False)
    op.create_index(op.f("ix_stock_items_category"), "stock_items", ["category"], unique=False)
    op.create_index(op.f("ix_stock_items_supplier_id"), "stock_items", ["supplier_id"], unique=False)
    op.create_index(op.f("ix_stock_items_location_id"), "stock_items", ["location_id"], unique=False)
    op.create_index(op.f("ix_stock_items_status"), "stock_items", ["status"], unique=False)

    with op.batch_alter_table("stock_movements") as batch:
        batch.add_column(sa.Column("stock_item_id", sa.Uuid(), nullable=True))
        batch.add_column(sa.Column("quantity_after", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("recipient_agent_id", sa.Uuid(), nullable=True))
        batch.create_foreign_key(
            op.f("fk_stock_movements_stock_item_id_stock_items"),
            "stock_items",
            ["stock_item_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch.create_foreign_key(
            op.f("fk_stock_movements_recipient_agent_id_agents"),
            "agents",
            ["recipient_agent_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch.create_index(op.f("ix_stock_movements_stock_item_id"), ["stock_item_id"])
        batch.create_index(op.f("ix_stock_movements_recipient_agent_id"), ["recipient_agent_id"])


def downgrade() -> None:
    with op.batch_alter_table("stock_movements") as batch:
        batch.drop_index(op.f("ix_stock_movements_recipient_agent_id"))
        batch.drop_index(op.f("ix_stock_movements_stock_item_id"))
        batch.drop_constraint(op.f("fk_stock_movements_recipient_agent_id_agents"), type_="foreignkey")
        batch.drop_constraint(op.f("fk_stock_movements_stock_item_id_stock_items"), type_="foreignkey")
        batch.drop_column("recipient_agent_id")
        batch.drop_column("quantity_after")
        batch.drop_column("stock_item_id")

    op.drop_index(op.f("ix_stock_items_status"), table_name="stock_items")
    op.drop_index(op.f("ix_stock_items_location_id"), table_name="stock_items")
    op.drop_index(op.f("ix_stock_items_supplier_id"), table_name="stock_items")
    op.drop_index(op.f("ix_stock_items_category"), table_name="stock_items")
    op.drop_index(op.f("ix_stock_items_name"), table_name="stock_items")
    op.drop_index(op.f("ix_stock_items_reference"), table_name="stock_items")
    op.drop_table("stock_items")
