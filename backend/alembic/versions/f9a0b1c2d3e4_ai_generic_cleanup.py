"""rename AI integration objects

Revision ID: f9a0b1c2d3e4
Revises: b5c6d7e8f9a0
Create Date: 2026-11-08
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f9a0b1c2d3e4"
down_revision: str | Sequence[str] | None = "b5c6d7e8f9a0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SETTING_KEYS = (
    ("sylvia.enabled", "ai.enabled", "Activation de l'assistant IA"),
    ("sylvia.base_url", "ai.base_url", "URL de base Open WebUI / Ollama"),
    ("sylvia.model", "ai.model", "Modèle utilisé par l'assistant IA"),
)


def _rename_settings(
    connection,
    pairs: Sequence[tuple[str, str, str]],
    category: str = "ai",
) -> None:
    for old, new, description in pairs:
        connection.execute(
            sa.text(
                "UPDATE settings SET key = :new, category = :category, "
                "description = :description WHERE key = :old"
            ),
            {
                "old": old,
                "new": new,
                "category": category,
                "description": description,
            },
        )


def _rename_permissions(
    connection, pairs: Sequence[tuple[str, str, str]], module: str = "ai"
) -> None:
    for old, new, description in pairs:
        connection.execute(
            sa.text(
                "UPDATE permissions SET code = :new, module = :module, description = :description "
                "WHERE code = :old"
            ),
            {"old": old, "new": new, "description": description, "module": module},
        )


def upgrade() -> None:
    connection = op.get_bind()
    _rename_settings(connection, SETTING_KEYS)
    _rename_permissions(
        connection,
        (
            ("sylvia.use", "ai.use", "Utiliser l'assistant IA"),
            ("sylvia.configure", "ai.configure", "Configurer la connexion de l'assistant IA"),
        ),
    )

    connection.execute(sa.text("ALTER TABLE sylvia_runs RENAME TO ai_runs"))
    connection.execute(
        sa.text("ALTER TABLE ai_runs RENAME CONSTRAINT pk_sylvia_runs TO pk_ai_runs")
    )
    connection.execute(
        sa.text(
            "ALTER TABLE ai_runs RENAME CONSTRAINT "
            "fk_sylvia_runs_user_id_users TO fk_ai_runs_user_id_users"
        )
    )
    connection.execute(
        sa.text(
            "ALTER INDEX ix_sylvia_runs_feature_code "
            "RENAME TO ix_ai_runs_feature_code"
        )
    )
    connection.execute(
        sa.text("ALTER INDEX ix_sylvia_runs_status RENAME TO ix_ai_runs_status")
    )
    connection.execute(
        sa.text("ALTER INDEX ix_sylvia_runs_user_id RENAME TO ix_ai_runs_user_id")
    )

    connection.execute(sa.text("ALTER TABLE sylvia_proposals RENAME TO ai_proposals"))
    connection.execute(
        sa.text(
            "ALTER TABLE ai_proposals RENAME CONSTRAINT "
            "pk_sylvia_proposals TO pk_ai_proposals"
        )
    )
    connection.execute(
        sa.text(
            "ALTER TABLE ai_proposals RENAME CONSTRAINT "
            "fk_sylvia_proposals_accepted_by_id_users TO "
            "fk_ai_proposals_accepted_by_id_users"
        )
    )
    connection.execute(
        sa.text(
            "ALTER TABLE ai_proposals RENAME CONSTRAINT "
            "fk_sylvia_proposals_run_id_sylvia_runs TO "
            "fk_ai_proposals_run_id_ai_runs"
        )
    )
    connection.execute(
        sa.text(
            "ALTER INDEX ix_sylvia_proposals_run_id "
            "RENAME TO ix_ai_proposals_run_id"
        )
    )


def downgrade() -> None:
    connection = op.get_bind()
    connection.execute(
        sa.text(
            "ALTER INDEX ix_ai_proposals_run_id "
            "RENAME TO ix_sylvia_proposals_run_id"
        )
    )
    connection.execute(
        sa.text(
            "ALTER TABLE ai_proposals RENAME CONSTRAINT "
            "fk_ai_proposals_run_id_ai_runs TO "
            "fk_sylvia_proposals_run_id_sylvia_runs"
        )
    )
    connection.execute(
        sa.text(
            "ALTER TABLE ai_proposals RENAME CONSTRAINT "
            "fk_ai_proposals_accepted_by_id_users TO "
            "fk_sylvia_proposals_accepted_by_id_users"
        )
    )
    connection.execute(
        sa.text(
            "ALTER TABLE ai_proposals RENAME CONSTRAINT "
            "pk_ai_proposals TO pk_sylvia_proposals"
        )
    )
    connection.execute(sa.text("ALTER TABLE ai_proposals RENAME TO sylvia_proposals"))

    connection.execute(
        sa.text("ALTER INDEX ix_ai_runs_user_id RENAME TO ix_sylvia_runs_user_id")
    )
    connection.execute(
        sa.text("ALTER INDEX ix_ai_runs_status RENAME TO ix_sylvia_runs_status")
    )
    connection.execute(
        sa.text(
            "ALTER INDEX ix_ai_runs_feature_code "
            "RENAME TO ix_sylvia_runs_feature_code"
        )
    )
    connection.execute(
        sa.text(
            "ALTER TABLE ai_runs RENAME CONSTRAINT "
            "fk_ai_runs_user_id_users TO fk_sylvia_runs_user_id_users"
        )
    )
    connection.execute(
        sa.text("ALTER TABLE ai_runs RENAME CONSTRAINT pk_ai_runs TO pk_sylvia_runs")
    )
    connection.execute(sa.text("ALTER TABLE ai_runs RENAME TO sylvia_runs"))

    _rename_permissions(
        connection,
        (
            ("ai.use", "sylvia.use", "Utiliser l'assistant IA"),
            ("ai.configure", "sylvia.configure", "Configurer la connexion de l'assistant IA"),
        ),
        module="sylvia",
    )
    _rename_settings(
        connection,
        tuple((new, old, description) for old, new, description in SETTING_KEYS),
        category="sylvia",
    )
