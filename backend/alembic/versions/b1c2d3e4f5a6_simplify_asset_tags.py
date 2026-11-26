"""simplify asset tag numbering without year

Revision ID: b1c2d3e4f5a6
Revises: a0b1c2d3e4f5
Create Date: 2026-11-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b1c2d3e4f5a6"
down_revision: str | Sequence[str] | None = "a0b1c2d3e4f5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _strip_year(template: str) -> str:
    result = template.replace("{YEAR}-", "").replace("-{YEAR}", "").replace("{YEAR}", "")
    if result.startswith("PNFOR-{PREFIX}"):
        result = result[len("PNFOR-") :]
    while "--" in result:
        result = result.replace("--", "-")
    return result.strip("- ") or "{PREFIX}-{SEQ:4}"


def upgrade() -> None:
    connection = op.get_bind()
    rows = connection.execute(
        sa.text("SELECT id, tag_template FROM asset_categories")
    ).fetchall()
    for row in rows:
        template = row.tag_template or "{PREFIX}-{SEQ:4}"
        connection.execute(
            sa.text(
                "UPDATE asset_categories "
                "SET tag_template = :template, tag_sequence_mode = 'global' "
                "WHERE id = :id"
            ),
            {"template": _strip_year(template), "id": row.id},
        )


def downgrade() -> None:
    # Transformation de données volontairement non réversible :
    # les numéros existants ne doivent pas être réécrits.
    pass
