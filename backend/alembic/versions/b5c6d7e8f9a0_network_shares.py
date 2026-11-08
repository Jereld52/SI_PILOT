"""network shares and volume monitoring

Revision ID: b5c6d7e8f9a0
Revises: f3a4b5c6d7e8
Create Date: 2026-11-08
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b5c6d7e8f9a0"
down_revision: str | Sequence[str] | None = "f3a4b5c6d7e8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "network_shares",
        sa.Column("name", sa.String(length=180), nullable=False),
        sa.Column("unc_path", sa.String(length=512), nullable=False),
        sa.Column("drive_letter", sa.String(length=8), nullable=True),
        sa.Column("location_id", sa.Uuid(), nullable=True),
        sa.Column("responsible", sa.String(length=180), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("warning_percent", sa.Integer(), server_default="20", nullable=False),
        sa.Column("critical_percent", sa.Integer(), server_default="10", nullable=False),
        sa.Column("min_free_gb", sa.Float(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("last_checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_status", sa.String(length=20), server_default="unknown", nullable=False),
        sa.Column("last_total_bytes", sa.BigInteger(), nullable=True),
        sa.Column("last_used_bytes", sa.BigInteger(), nullable=True),
        sa.Column("last_free_bytes", sa.BigInteger(), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
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
            "warning_percent > 0 AND warning_percent < 100",
            name=op.f("ck_network_shares_network_share_warning_percent"),
        ),
        sa.CheckConstraint(
            "critical_percent >= 0 AND critical_percent < warning_percent",
            name=op.f("ck_network_shares_network_share_critical_percent"),
        ),
        sa.ForeignKeyConstraint(
            ["location_id"],
            ["locations.id"],
            name=op.f("fk_network_shares_location_id_locations"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_network_shares")),
    )
    op.create_index(op.f("ix_network_shares_name"), "network_shares", ["name"], unique=False)
    op.create_index(
        op.f("ix_network_shares_location_id"),
        "network_shares",
        ["location_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_network_shares_is_active"),
        "network_shares",
        ["is_active"],
        unique=False,
    )
    op.create_index(
        op.f("ix_network_shares_last_status"),
        "network_shares",
        ["last_status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_network_shares_last_status"), table_name="network_shares")
    op.drop_index(op.f("ix_network_shares_is_active"), table_name="network_shares")
    op.drop_index(op.f("ix_network_shares_location_id"), table_name="network_shares")
    op.drop_index(op.f("ix_network_shares_name"), table_name="network_shares")
    op.drop_table("network_shares")
