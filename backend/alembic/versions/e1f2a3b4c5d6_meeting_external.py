"""add external organizations and participants to meetings

Revision ID: e1f2a3b4c5d6
Revises: d0e1f2a3b4c5
Create Date: 2026-11-25
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e1f2a3b4c5d6"
down_revision: str | Sequence[str] | None = "d0e1f2a3b4c5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "meetings",
        sa.Column("external_organizations_json", sa.Text(), nullable=True),
    )
    op.add_column(
        "meetings",
        sa.Column("external_participants_json", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("meetings", "external_participants_json")
    op.drop_column("meetings", "external_organizations_json")
