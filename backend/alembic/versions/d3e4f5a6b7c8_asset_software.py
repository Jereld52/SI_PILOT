"""add asset software inventory

Revision ID: d3e4f5a6b7c8
Revises: c2d3e4f5a6b7
Create Date: 2026-11-10
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d3e4f5a6b7c8"
down_revision: str | Sequence[str] | None = "c2d3e4f5a6b7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "asset_softwares",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "asset_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("assets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("package_name", sa.String(length=255), nullable=False),
        sa.Column("package_version", sa.String(length=120), nullable=False),
        sa.Column("install_status", sa.String(length=40), nullable=False),
        sa.Column(
            "update_available", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column("available_version", sa.String(length=120), nullable=False),
        sa.Column("source", sa.String(length=30), nullable=False),
        sa.Column("synced_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("asset_id", "package_name", name="asset_software_unique"),
    )
    op.create_index("ix_asset_softwares_asset_id", "asset_softwares", ["asset_id"])
    op.create_index(
        "ix_asset_softwares_package_name", "asset_softwares", ["package_name"]
    )
    op.create_index(
        "ix_asset_softwares_update_available",
        "asset_softwares",
        ["update_available"],
    )


def downgrade() -> None:
    op.drop_index("ix_asset_softwares_update_available", table_name="asset_softwares")
    op.drop_index("ix_asset_softwares_package_name", table_name="asset_softwares")
    op.drop_index("ix_asset_softwares_asset_id", table_name="asset_softwares")
    op.drop_table("asset_softwares")
