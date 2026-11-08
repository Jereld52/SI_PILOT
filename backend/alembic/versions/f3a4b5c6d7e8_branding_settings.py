"""branding and application identity settings

Revision ID: f3a4b5c6d7e8
Revises: e2f3a4b5c6d7
Create Date: 2026-11-08
"""

import json
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f3a4b5c6d7e8"
down_revision: str | Sequence[str] | None = "e2f3a4b5c6d7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

NEW_SETTINGS = (
    (
        "app.organization",
        "Votre structure",
        "general",
        False,
        "Nom de la structure ou de l'organisation",
    ),
    (
        "app.tagline",
        "Cockpit du système d'information",
        "general",
        False,
        "Accroche affichée sur l'écran de connexion",
    ),
    (
        "app.description",
        "Centralisez votre parc, vos demandes, vos contrats, votre budget, "
        "vos projets et votre sécurité dans un outil unique.",
        "general",
        False,
        "Description courte de l'application",
    ),
    (
        "app.support_email",
        None,
        "general",
        False,
        "Adresse de contact affichée aux utilisateurs",
    ),
    (
        "app.primary_color",
        "#772B2F",
        "general",
        False,
        "Couleur principale de l'interface et des exports",
    ),
    (
        "app.logo_filename",
        None,
        "general",
        False,
        "Logo personnalisé de l'application",
    ),
    (
        "app.logo_version",
        None,
        "general",
        False,
        "Version technique du logo personnalisé",
    ),
)


def upgrade() -> None:
    connection = op.get_bind()
    connection.execute(
        sa.text(
            "UPDATE settings SET value_json = :new "
            "WHERE key = 'app.name' AND value_json = :old"
        ),
        {"new": json.dumps("SI PILOT", ensure_ascii=False), "old": json.dumps("SI PNFor PILOTE", ensure_ascii=False)},
    )
    connection.execute(
        sa.text(
            "UPDATE settings SET value_json = :new "
            "WHERE key = 'smtp.from_name' AND value_json = :old"
        ),
        {"new": json.dumps("SI PILOT", ensure_ascii=False), "old": json.dumps("SI PNFor PILOTE", ensure_ascii=False)},
    )
    for key, value, category, is_secret, description in NEW_SETTINGS:
        connection.execute(
            sa.text(
                "INSERT INTO settings "
                "(key, value_json, category, is_secret, description, updated_at) "
                "VALUES (:key, :value, :category, :is_secret, :description, now()) "
                "ON CONFLICT (key) DO NOTHING"
            ),
            {
                "key": key,
                "value": json.dumps(value, ensure_ascii=False),
                "category": category,
                "is_secret": is_secret,
                "description": description,
            },
        )


def downgrade() -> None:
    connection = op.get_bind()
    connection.execute(
        sa.text(
            "UPDATE settings SET value_json = :new "
            "WHERE key = 'app.name' AND value_json = :old"
        ),
        {"new": json.dumps("SI PNFor PILOTE", ensure_ascii=False), "old": json.dumps("SI PILOT", ensure_ascii=False)},
    )
    connection.execute(
        sa.text(
            "UPDATE settings SET value_json = :new "
            "WHERE key = 'smtp.from_name' AND value_json = :old"
        ),
        {"new": json.dumps("SI PNFor PILOTE", ensure_ascii=False), "old": json.dumps("SI PILOT", ensure_ascii=False)},
    )
    connection.execute(
        sa.text(
            "DELETE FROM settings WHERE key IN :keys"
        ).bindparams(sa.bindparam("keys", expanding=True)),
        {"keys": [row[0] for row in NEW_SETTINGS]},
    )
