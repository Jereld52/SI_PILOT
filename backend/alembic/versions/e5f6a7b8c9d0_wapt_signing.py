"""add WAPT signing settings

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-11-10
"""

import json
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e5f6a7b8c9d0"
down_revision: str | Sequence[str] | None = "d4e5f6a7b8c9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SETTINGS = (
    (
        "wapt.trigger_action_path",
        "/api/v3/trigger_host_action",
        False,
        "Chemin API des actions signées",
    ),
    (
        "wapt.signing_key_path",
        "",
        False,
        "Chemin de la clé privée de signature WAPT",
    ),
    (
        "wapt.signing_cert_path",
        "",
        False,
        "Chemin du certificat de signature WAPT",
    ),
    (
        "wapt.signing_key_password_encrypted",
        "",
        True,
        "Mot de passe de la clé privée WAPT, chiffré",
    ),
)


def upgrade() -> None:
    connection = op.get_bind()
    existing = {
        row[0] for row in connection.execute(sa.text("SELECT key FROM settings"))
    }
    for key, value, is_secret, description in SETTINGS:
        if key in existing:
            continue
        connection.execute(
            sa.text(
                "INSERT INTO settings "
                "(key, value_json, category, is_secret, description, updated_at) "
                "VALUES (:key, :value, 'wapt', :is_secret, :description, now())"
            ),
            {
                "key": key,
                "value": json.dumps(value, ensure_ascii=False),
                "is_secret": is_secret,
                "description": description,
            },
        )


def downgrade() -> None:
    connection = op.get_bind()
    connection.execute(
        sa.text("DELETE FROM settings WHERE key IN :keys").bindparams(
            sa.bindparam("keys", expanding=True)
        ),
        {"keys": [item[0] for item in SETTINGS]},
    )
