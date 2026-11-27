from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin, utcnow


class AiRun(Base, UUIDMixin):
    __tablename__ = "ai_runs"

    user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    feature_code: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    scope_json: Mapped[str | None] = mapped_column(Text)
    request_summary: Mapped[str | None] = mapped_column(Text)
    request_payload_redacted_json: Mapped[str | None] = mapped_column(Text)
    response_text: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False, index=True)
    http_status: Mapped[int | None] = mapped_column(Integer)
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    error_code: Mapped[str | None] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AiConversation(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "ai_conversations"

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    context_type: Mapped[str | None] = mapped_column(String(30))
    context_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True))
    context_label: Mapped[str | None] = mapped_column(String(255))
    archived_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), index=True
    )
    last_message_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False, index=True
    )
    message_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    messages: Mapped[list["AiMessage"]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="AiMessage.created_at",
    )


class AiMessage(Base, UUIDMixin):
    __tablename__ = "ai_messages"

    conversation_id: Mapped[UUID] = mapped_column(
        ForeignKey("ai_conversations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    tools_used_json: Mapped[str | None] = mapped_column(Text)
    suggestions_json: Mapped[str | None] = mapped_column(Text)
    actions_json: Mapped[str | None] = mapped_column(Text)
    sources_json: Mapped[str | None] = mapped_column(Text)
    actions_done: Mapped[bool] = mapped_column(default=False, nullable=False)
    actions_ignored: Mapped[bool] = mapped_column(default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False, index=True
    )

    conversation: Mapped[AiConversation] = relationship(back_populates="messages")


class AiProposal(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "ai_proposals"

    run_id: Mapped[UUID] = mapped_column(
        ForeignKey("ai_runs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    proposal_type: Mapped[str] = mapped_column(String(80), nullable=False)
    payload_json: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)
    accepted_by_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
