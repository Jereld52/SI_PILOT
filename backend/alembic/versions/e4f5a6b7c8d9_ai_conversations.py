"""add persistent AI conversations

Revision ID: e4f5a6b7c8d9
Revises: b1c2d3e4f5a6
Create Date: 2026-11-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e4f5a6b7c8d9"
down_revision: str | Sequence[str] | None = "b1c2d3e4f5a6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "ai_conversations",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("context_type", sa.String(length=30), nullable=True),
        sa.Column("context_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("context_label", sa.String(length=255), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("message_count", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_ai_conversations_user_id", "ai_conversations", ["user_id"])
    op.create_index(
        "ix_ai_conversations_archived_at", "ai_conversations", ["archived_at"]
    )
    op.create_index(
        "ix_ai_conversations_last_message_at",
        "ai_conversations",
        ["last_message_at"],
    )

    op.create_table(
        "ai_messages",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("conversation_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("tools_used_json", sa.Text(), nullable=True),
        sa.Column("suggestions_json", sa.Text(), nullable=True),
        sa.Column("actions_json", sa.Text(), nullable=True),
        sa.Column("actions_done", sa.Boolean(), nullable=False),
        sa.Column("actions_ignored", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["conversation_id"], ["ai_conversations.id"], ondelete="CASCADE"
        ),
    )
    op.create_index("ix_ai_messages_conversation_id", "ai_messages", ["conversation_id"])
    op.create_index("ix_ai_messages_created_at", "ai_messages", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_ai_messages_created_at", table_name="ai_messages")
    op.drop_index("ix_ai_messages_conversation_id", table_name="ai_messages")
    op.drop_table("ai_messages")
    op.drop_index(
        "ix_ai_conversations_last_message_at", table_name="ai_conversations"
    )
    op.drop_index("ix_ai_conversations_archived_at", table_name="ai_conversations")
    op.drop_index("ix_ai_conversations_user_id", table_name="ai_conversations")
    op.drop_table("ai_conversations")
