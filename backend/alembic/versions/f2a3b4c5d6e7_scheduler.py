"""add scheduler runs and settings

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-11-25
"""

import json
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f2a3b4c5d6e7"
down_revision: str | Sequence[str] | None = "e1f2a3b4c5d6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SETTINGS = (
    ("scheduler.enabled", False, "Activer la veille automatique"),
    ("scheduler.checks_interval_seconds", 60, "Fréquence du planificateur de contrôles"),
    ("scheduler.veeam_enabled", True, "Vérifier Veeam chaque jour"),
    ("scheduler.veeam_hour", 6, "Heure de la vérification Veeam"),
    ("scheduler.veeam_minute", 0, "Minute de la vérification Veeam"),
    ("scheduler.veeam_stale_hours", 48, "Ancienneté maximale d'une sauvegarde Veeam"),
    ("scheduler.backup_enabled", True, "Planifier la sauvegarde de SI PILOT"),
    ("scheduler.backup_frequency", "daily", "Fréquence de sauvegarde"),
    ("scheduler.backup_weekday", 0, "Jour de sauvegarde hebdomadaire"),
    ("scheduler.backup_hour", 2, "Heure de sauvegarde"),
    ("scheduler.backup_minute", 0, "Minute de sauvegarde"),
    ("scheduler.backup_retention_days", 30, "Rétention des sauvegardes en jours"),
    ("scheduler.backup_keep_min", 3, "Nombre minimal de sauvegardes conservées"),
    ("scheduler.digest_enabled", True, "Envoyer le digest quotidien"),
    ("scheduler.digest_hour", 7, "Heure du digest quotidien"),
    ("scheduler.digest_minute", 30, "Minute du digest quotidien"),
    ("scheduler.digest_emails", "", "Destinataires du digest, séparés par des virgules"),
)


def upgrade() -> None:
    op.create_table(
        "scheduler_runs",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("job", sa.String(length=30), nullable=False),
        sa.Column("trigger", sa.String(length=20), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("summary", sa.Text()),
        sa.Column("details_json", sa.Text()),
        sa.Column("duration_ms", sa.Integer()),
    )
    op.create_index("ix_scheduler_runs_job", "scheduler_runs", ["job"], unique=False)
    op.create_index(
        "ix_scheduler_runs_started_at", "scheduler_runs", ["started_at"], unique=False
    )
    op.create_index(
        "ix_scheduler_runs_status", "scheduler_runs", ["status"], unique=False
    )

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
        sa.text("DELETE FROM settings WHERE key LIKE 'scheduler.%'")
    )
    op.drop_index("ix_scheduler_runs_status", table_name="scheduler_runs")
    op.drop_index("ix_scheduler_runs_started_at", table_name="scheduler_runs")
    op.drop_index("ix_scheduler_runs_job", table_name="scheduler_runs")
    op.drop_table("scheduler_runs")
