"""add communication module tables

Revision ID: d4e5f6a7b8c9
Revises: d3e4f5a6b7c8
Create Date: 2026-11-10
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d4e5f6a7b8c9"
down_revision: str | Sequence[str] | None = "d3e4f5a6b7c8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "communications",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("category", sa.String(length=40), nullable=False),
        sa.Column("audience", sa.String(length=20), nullable=False),
        sa.Column("audience_service_id", sa.Uuid(as_uuid=True)),
        sa.Column("audience_role_id", sa.Uuid(as_uuid=True)),
        sa.Column("audience_user_ids_json", sa.Text()),
        sa.Column("channel", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column(
            "is_pinned", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column("scheduled_at", sa.DateTime(timezone=True)),
        sa.Column("published_at", sa.DateTime(timezone=True)),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
        sa.Column("author_user_id", sa.Uuid(as_uuid=True)),
        sa.Column("created_by_id", sa.Uuid(as_uuid=True)),
        sa.Column("updated_by_id", sa.Uuid(as_uuid=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["audience_service_id"], ["services.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["audience_role_id"], ["roles.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["author_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["updated_by_id"], ["users.id"], ondelete="SET NULL"),
    )
    for column in (
        "title",
        "category",
        "status",
        "audience_service_id",
        "audience_role_id",
        "author_user_id",
    ):
        op.create_index(f"ix_communications_{column}", "communications", [column])

    op.create_table(
        "communication_receipts",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("communication_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("user_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["communication_id"], ["communications.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "communication_id", "user_id", name="communication_receipt_unique"
        ),
    )
    op.create_index(
        "ix_communication_receipts_communication_id",
        "communication_receipts",
        ["communication_id"],
    )
    op.create_index(
        "ix_communication_receipts_user_id", "communication_receipts", ["user_id"]
    )

    op.create_table(
        "meetings",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("meeting_type", sa.String(length=30), nullable=False),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("location", sa.String(length=255)),
        sa.Column("visio_url", sa.String(length=500)),
        sa.Column("organizer_user_id", sa.Uuid(as_uuid=True)),
        sa.Column("participant_user_ids_json", sa.Text()),
        sa.Column("agenda", sa.Text()),
        sa.Column("notes", sa.Text()),
        sa.Column("decisions", sa.Text()),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_by_id", sa.Uuid(as_uuid=True)),
        sa.Column("updated_by_id", sa.Uuid(as_uuid=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["organizer_user_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["updated_by_id"], ["users.id"], ondelete="SET NULL"),
    )
    for column in ("title", "meeting_type", "scheduled_at", "organizer_user_id", "status"):
        op.create_index(f"ix_meetings_{column}", "meetings", [column])

    op.create_table(
        "meeting_points",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("meeting_id", sa.Uuid(as_uuid=True)),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("priority", sa.String(length=20), nullable=False),
        sa.Column("due_date", sa.Date()),
        sa.Column("next_review_at", sa.Date()),
        sa.Column("last_discussed_at", sa.Date()),
        sa.Column("owner_user_id", sa.Uuid(as_uuid=True)),
        sa.Column("notes", sa.Text()),
        sa.Column("created_by_id", sa.Uuid(as_uuid=True)),
        sa.Column("updated_by_id", sa.Uuid(as_uuid=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["meeting_id"], ["meetings.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["updated_by_id"], ["users.id"], ondelete="SET NULL"),
    )
    for column in ("meeting_id", "title", "status", "owner_user_id"):
        op.create_index(f"ix_meeting_points_{column}", "meeting_points", [column])

    op.create_table(
        "trainings",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("provider", sa.String(length=180)),
        sa.Column("description", sa.Text()),
        sa.Column("category", sa.String(length=40)),
        sa.Column("start_date", sa.Date()),
        sa.Column("end_date", sa.Date()),
        sa.Column("duration_hours", sa.Numeric(6, 1)),
        sa.Column("location", sa.String(length=255)),
        sa.Column(
            "mandatory", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column("cost", sa.Numeric(12, 2)),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("capacity", sa.Integer()),
        sa.Column("participant_agent_ids_json", sa.Text()),
        sa.Column("notes", sa.Text()),
        sa.Column("created_by_id", sa.Uuid(as_uuid=True)),
        sa.Column("updated_by_id", sa.Uuid(as_uuid=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["updated_by_id"], ["users.id"], ondelete="SET NULL"),
    )
    for column in ("title", "category", "start_date", "status"):
        op.create_index(f"ix_trainings_{column}", "trainings", [column])


def downgrade() -> None:
    op.drop_table("trainings")
    op.drop_table("meeting_points")
    op.drop_table("meetings")
    op.drop_table("communication_receipts")
    op.drop_table("communications")
