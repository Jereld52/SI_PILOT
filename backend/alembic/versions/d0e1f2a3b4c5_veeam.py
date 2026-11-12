"""add Veeam settings

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-11-12
"""

import json
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d0e1f2a3b4c5"
down_revision: str | Sequence[str] | None = "c9d0e1f2a3b4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SETTINGS = (
    ("veeam.enabled", False, False, "Activer la connexion Veeam"),
    ("veeam.base_url", "", False, "URL de l'API REST Veeam"),
    ("veeam.username", "", False, "Identifiant Veeam"),
    ("veeam.password_encrypted", "", True, "Mot de passe Veeam, chiffré"),
    ("veeam.api_version", "1.2-rev1", False, "Version de l'API Veeam"),
    ("veeam.verify_tls", True, False, "Vérifier le certificat TLS Veeam"),
    ("veeam.timeout_seconds", 30, False, "Délai maximal des appels Veeam"),
)


def upgrade() -> None:
    connection = op.get_bind()
    existing = {row[0] for row in connection.execute(sa.text("SELECT key FROM settings"))}
    for key, value, is_secret, description in SETTINGS:
        if key in existing:
            continue
        connection.execute(
            sa.text(
                "INSERT INTO settings "
                "(key, value_json, category, is_secret, description, updated_at) "
                "VALUES (:key, :value, 'veeam', :is_secret, :description, now())"
            ),
            {
                "key": key,
                "value": json.dumps(value, ensure_ascii=False),
                "is_secret": is_secret,
                "description": description,
            },
        )


def downgrade() -> None:
    op.get_bind().execute(sa.text("DELETE FROM settings WHERE key LIKE 'veeam.%'"))
