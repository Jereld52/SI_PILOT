"""add module activation setting

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-11-10
"""

import json
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b8c9d0e1f2a3"
down_revision: str | Sequence[str] | None = "a7b8c9d0e1f2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    connection = op.get_bind()
    existing = connection.execute(
        sa.text("SELECT 1 FROM settings WHERE key = 'modules.disabled'")
    ).first()
    if existing:
        return
    connection.execute(
        sa.text(
            "INSERT INTO settings "
            "(key, value_json, category, is_secret, description, updated_at) "
            "VALUES ('modules.disabled', :value, 'modules', false, :description, now())"
        ),
        {
            "value": json.dumps([], ensure_ascii=False),
            "description": "Modules désactivés",
        },
    )


def downgrade() -> None:
    op.get_bind().execute(
        sa.text("DELETE FROM settings WHERE key = 'modules.disabled'")
    )
