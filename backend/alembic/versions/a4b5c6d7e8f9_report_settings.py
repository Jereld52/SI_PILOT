"""add monthly operations report settings

Revision ID: a4b5c6d7e8f9
Revises: f2a3b4c5d6e7
Create Date: 2026-11-25
"""

import json
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a4b5c6d7e8f9"
down_revision: str | Sequence[str] | None = "f2a3b4c5d6e7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SETTINGS = (
    ("scheduler.report_enabled", True, "Envoyer le rapport mensuel d'exploitation"),
    ("scheduler.report_day", 1, "Jour du mois pour le rapport"),
    ("scheduler.report_hour", 8, "Heure du rapport mensuel"),
    ("scheduler.report_minute", 0, "Minute du rapport mensuel"),
    ("scheduler.report_emails", "", "Destinataires du rapport, séparés par des virgules"),
)


def upgrade() -> None:
    connection = op.get_bind()
    existing = {
        row[0] for row in connection.execute(sa.text("SELECT key FROM settings"))
    }
    for key, value, description in SETTINGS:
        if key in existing:
            continue
        connection.execute(
            sa.text(
                "INSERT INTO settings "
                "(key, value_json, category, is_secret, description, updated_at) "
                "VALUES (:key, :value, 'scheduler', false, :description, now())"
            ),
            {
                "key": key,
                "value": json.dumps(value, ensure_ascii=False),
                "description": description,
            },
        )


def downgrade() -> None:
    op.get_bind().execute(
        sa.text("DELETE FROM settings WHERE key LIKE 'scheduler.report_%'")
    )
