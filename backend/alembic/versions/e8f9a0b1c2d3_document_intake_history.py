"""add document intake history

Revision ID: e8f9a0b1c2d3
Revises: d7e8f9a0b1c2
Create Date: 2026-11-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e8f9a0b1c2d3"
down_revision: str | Sequence[str] | None = "d7e8f9a0b1c2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "document_intakes",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("token", sa.String(length=64), nullable=False),
        sa.Column("batch_id", sa.String(length=64), nullable=True),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("mime_type", sa.String(length=120), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("document_type", sa.String(length=30), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("supplier", sa.String(length=150), nullable=True),
        sa.Column("reference", sa.String(length=80), nullable=True),
        sa.Column("amount_ttc", sa.Numeric(12, 2), nullable=True),
        sa.Column("target", sa.String(length=30), nullable=True),
        sa.Column("link", sa.String(length=255), nullable=True),
        sa.Column("document_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("ocr_used", sa.Boolean(), nullable=False),
        sa.Column("integrated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["document_id"], ["documents.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"], ["users.id"], ondelete="SET NULL"
        ),
    )
    op.create_index(
        "ix_document_intakes_token", "document_intakes", ["token"], unique=True
    )
    op.create_index(
        "ix_document_intakes_batch_id", "document_intakes", ["batch_id"]
    )
    op.create_index("ix_document_intakes_status", "document_intakes", ["status"])
    op.create_index(
        "ix_document_intakes_created_by_id",
        "document_intakes",
        ["created_by_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_document_intakes_created_by_id", table_name="document_intakes")
    op.drop_index("ix_document_intakes_status", table_name="document_intakes")
    op.drop_index("ix_document_intakes_batch_id", table_name="document_intakes")
    op.drop_index("ix_document_intakes_token", table_name="document_intakes")
    op.drop_table("document_intakes")
