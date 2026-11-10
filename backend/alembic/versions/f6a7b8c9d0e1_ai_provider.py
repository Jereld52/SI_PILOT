"""add AI provider settings

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-11-10
"""

import json
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f6a7b8c9d0e1"
down_revision: str | Sequence[str] | None = "e5f6a7b8c9d0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SETTINGS = (
    ("ai.provider", "openai", False, "Fournisseur de l'assistant IA"),
    (
        "ai.api_key_encrypted",
        "",
        True,
        "Clé d'API du fournisseur IA, chiffrée",
    ),
    ("ai.temperature", 0.2, False, "Température de génération (0 à 2)"),
    ("ai.max_tokens", 1200, False, "Nombre maximal de jetons en réponse"),
    ("ai.timeout_seconds", 60, False, "Délai maximal des appels IA"),
    (
        "ai.include_fleet_context",
        True,
        False,
        "Envoyer un contexte agrégé du parc",
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
                "VALUES (:key, :value, 'ai', :is_secret, :description, now())"
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
