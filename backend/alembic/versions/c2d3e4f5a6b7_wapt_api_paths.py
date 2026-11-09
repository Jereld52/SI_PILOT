"""align WAPT API paths with WAPT 2.4 endpoints

Revision ID: c2d3e4f5a6b7
Revises: f9a0b1c2d3e4
Create Date: 2026-11-09
"""

import json
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c2d3e4f5a6b7"
down_revision: str | Sequence[str] | None = "f9a0b1c2d3e4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PATH_UPDATES = (
    (
        "wapt.host_detail_path",
        "/api/v1/hosts/{uuid}",
        "/api/v1/hosts?uuid={uuid}",
    ),
    (
        "wapt.packages_path",
        "/api/v1/packages",
        "/api/v3/packages",
    ),
    (
        "wapt.host_packages_path",
        "/api/v1/hosts/{uuid}/packages",
        "/api/v1/host_data?uuid={uuid}&field=installed_packages",
    ),
)


def _update_paths(connection, pairs: Sequence[tuple[str, str, str]]) -> None:
    for key, old, new in pairs:
        connection.execute(
            sa.text(
                "UPDATE settings SET value_json = :new "
                "WHERE key = :key AND value_json = :old"
            ),
            {
                "key": key,
                "old": json.dumps(old, ensure_ascii=False),
                "new": json.dumps(new, ensure_ascii=False),
            },
        )


def upgrade() -> None:
    connection = op.get_bind()
    _update_paths(connection, PATH_UPDATES)
    connection.execute(
        sa.text(
            "UPDATE settings SET value_json = :new "
            "WHERE key = 'wapt.fetch_details' AND value_json = :old"
        ),
        {"old": json.dumps(True), "new": json.dumps(False)},
    )


def downgrade() -> None:
    connection = op.get_bind()
    _update_paths(connection, tuple((key, new, old) for key, old, new in PATH_UPDATES))
    connection.execute(
        sa.text(
            "UPDATE settings SET value_json = :new "
            "WHERE key = 'wapt.fetch_details' AND value_json = :old"
        ),
        {"old": json.dumps(False), "new": json.dumps(True)},
    )
