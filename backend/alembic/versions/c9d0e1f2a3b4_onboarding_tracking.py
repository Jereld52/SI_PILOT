"""add onboarding tracking fields

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-11-11
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c9d0e1f2a3b4"
down_revision: str | Sequence[str] | None = "b8c9d0e1f2a3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "checklist_runs", sa.Column("due_date", sa.Date(), nullable=True)
    )
    op.create_index(
        "ix_checklist_runs_due_date", "checklist_runs", ["due_date"]
    )
    op.add_column(
        "checklist_runs", sa.Column("notes", sa.Text(), nullable=True)
    )
    op.add_column(
        "checklist_run_items",
        sa.Column(
            "is_required",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )


def downgrade() -> None:
    op.drop_column("checklist_run_items", "is_required")
    op.drop_column("checklist_runs", "notes")
    op.drop_index("ix_checklist_runs_due_date", table_name="checklist_runs")
    op.drop_column("checklist_runs", "due_date")
