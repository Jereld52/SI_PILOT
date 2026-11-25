"""add commercial documents for quotes and purchase orders

Revision ID: c6d7e8f9a0b1
Revises: a4b5c6d7e8f9
Create Date: 2026-11-25
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c6d7e8f9a0b1"
down_revision: str | Sequence[str] | None = "a4b5c6d7e8f9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "commercial_documents",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("kind", sa.String(length=30), nullable=False),
        sa.Column("reference", sa.String(length=80), nullable=False),
        sa.Column("object", sa.String(length=255), nullable=False),
        sa.Column("supplier_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("issue_date", sa.Date(), nullable=False),
        sa.Column("valid_until", sa.Date()),
        sa.Column("expected_date", sa.Date()),
        sa.Column("amount_ht", sa.Numeric(12, 2)),
        sa.Column("amount_ttc", sa.Numeric(12, 2)),
        sa.Column("vat_rate", sa.Numeric(5, 2)),
        sa.Column("budget_line_id", sa.Uuid(as_uuid=True)),
        sa.Column("contract_id", sa.Uuid(as_uuid=True)),
        sa.Column("document_id", sa.Uuid(as_uuid=True)),
        sa.Column("source_document_id", sa.Uuid(as_uuid=True)),
        sa.Column("notes", sa.Text()),
        sa.Column("created_by_id", sa.Uuid(as_uuid=True)),
        sa.Column("updated_by_id", sa.Uuid(as_uuid=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "kind IN ('quote','purchase_order')",
            name="commercial_document_kind",
        ),
        sa.ForeignKeyConstraint(
            ["supplier_id"], ["suppliers.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["budget_line_id"], ["budget_lines.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["contract_id"], ["contracts.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["document_id"], ["documents.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["source_document_id"],
            ["commercial_documents.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_id"], ["users.id"], ondelete="SET NULL"
        ),
    )
    for column in ("kind", "reference", "supplier_id", "status", "issue_date"):
        op.create_index(
            f"ix_commercial_documents_{column}",
            "commercial_documents",
            [column],
            unique=column == "reference",
        )


def downgrade() -> None:
    for column in ("issue_date", "status", "supplier_id", "reference", "kind"):
        op.drop_index(
            f"ix_commercial_documents_{column}", table_name="commercial_documents"
        )
    op.drop_table("commercial_documents")
