"""add document intake file hash

Revision ID: a0b1c2d3e4f5
Revises: e8f9a0b1c2d3
Create Date: 2026-11-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a0b1c2d3e4f5"
down_revision: str | Sequence[str] | None = "e8f9a0b1c2d3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "document_intakes",
        sa.Column("file_hash", sa.String(length=64), nullable=True),
    )
    op.create_index(
        "ix_document_intakes_file_hash",
        "document_intakes",
        ["file_hash"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_document_intakes_file_hash", table_name="document_intakes"
    )
    op.drop_column("document_intakes", "file_hash")
