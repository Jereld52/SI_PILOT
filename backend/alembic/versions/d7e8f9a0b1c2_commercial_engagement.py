"""add engagement number to commercial documents

Revision ID: d7e8f9a0b1c2
Revises: c6d7e8f9a0b1
Create Date: 2026-11-25
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d7e8f9a0b1c2"
down_revision: str | Sequence[str] | None = "c6d7e8f9a0b1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "commercial_documents",
        sa.Column("engagement_number", sa.String(length=80), nullable=True),
    )
    op.create_index(
        "ix_commercial_documents_engagement_number",
        "commercial_documents",
        ["engagement_number"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_commercial_documents_engagement_number",
        table_name="commercial_documents",
    )
    op.drop_column("commercial_documents", "engagement_number")
