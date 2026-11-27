from __future__ import annotations

import json
from uuid import UUID

from app.core.errors import NotFoundError
from app.db.base import utcnow
from app.models.ai import AiConversation, AiMessage
from app.models.auth import User
from app.schemas.ai import (
    AiActionProposal,
    AiChatMessage,
    AiContext,
    AiConversationChatResponse,
    AiConversationContext,
    AiConversationCreate,
    AiConversationDetail,
    AiConversationMessageRequest,
    AiConversationRead,
    AiConversationUpdate,
    AiMessageRead,
)
from app.services import ai_service
from fastapi import Request
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

DEFAULT_TITLE = "Nouvelle conversation"
CONTEXT_TYPES = {"asset", "ticket", "meeting", "training", "communication"}
MAX_LIST = 50


def _load_list(value: str | None) -> list[str]:
    if not value:
        return []
    try:
        data = json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return []
    if not isinstance(data, list):
        return []
    return [str(item) for item in data if isinstance(item, (str, int, float))]


def _load_actions(value: str | None) -> list[AiActionProposal]:
    if not value:
        return []
    try:
        data = json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return []
    if not isinstance(data, list):
        return []
    actions: list[AiActionProposal] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        try:
            actions.append(AiActionProposal.model_validate(item))
        except ValueError:
            continue
    return actions


def _dump_list(values: list[str] | None) -> str:
    return json.dumps(values or [], ensure_ascii=False)


def _dump_actions(actions: list[AiActionProposal] | None) -> str:
    return json.dumps(
        [action.model_dump(mode="json") for action in actions or []],
        ensure_ascii=False,
    )


def _title_from_content(content: str) -> str:
    clean = " ".join(content.replace("`", "").replace("*", "").split())
    if not clean:
        return DEFAULT_TITLE
    return clean[:80]


def conversation_read(conversation: AiConversation) -> AiConversationRead:
    return AiConversationRead.model_validate(conversation)


def message_read(message: AiMessage) -> AiMessageRead:
    return AiMessageRead(
        id=message.id,
        role=message.role,  # type: ignore[arg-type]
        content=message.content,
        tools_used=_load_list(message.tools_used_json),
        suggestions=_load_list(message.suggestions_json),
        actions=_load_actions(message.actions_json),
        actions_done=message.actions_done,
        actions_ignored=message.actions_ignored,
        created_at=message.created_at,
    )


def get_conversation(
    db: Session, actor: User, conversation_id: UUID
) -> AiConversation:
    conversation = db.scalar(
        select(AiConversation).where(
            AiConversation.id == conversation_id,
            AiConversation.user_id == actor.id,
        )
    )
    if conversation is None:
        raise NotFoundError("Conversation IA introuvable.")
    return conversation


def list_conversations(
    db: Session,
    actor: User,
    *,
    q: str | None = None,
    archived: bool | None = False,
    limit: int = MAX_LIST,
) -> list[AiConversationRead]:
    statement = select(AiConversation).where(AiConversation.user_id == actor.id)
    if archived is True:
        statement = statement.where(AiConversation.archived_at.is_not(None))
    elif archived is False:
        statement = statement.where(AiConversation.archived_at.is_(None))
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        matching_messages = select(AiMessage.conversation_id).where(
            AiMessage.content.ilike(pattern)
        )
        statement = statement.where(
            or_(
                AiConversation.title.ilike(pattern),
                AiConversation.context_label.ilike(pattern),
                AiConversation.id.in_(matching_messages),
            )
        )
    rows = db.scalars(
        statement.order_by(AiConversation.last_message_at.desc()).limit(
            min(max(limit, 1), MAX_LIST)
        )
    ).all()
    return [conversation_read(row) for row in rows]


def create_conversation(
    db: Session, actor: User, payload: AiConversationCreate
) -> AiConversationRead:
    title = (payload.title or "").strip() or DEFAULT_TITLE
    context: AiConversationContext | None = payload.context
    conversation = AiConversation(
        user_id=actor.id,
        title=title[:200],
        context_type=context.type if context else None,
        context_id=context.id if context else None,
        context_label=context.label if context else None,
        last_message_at=utcnow(),
        message_count=0,
    )
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return conversation_read(conversation)


def get_detail(
    db: Session, actor: User, conversation_id: UUID
) -> AiConversationDetail:
    conversation = get_conversation(db, actor, conversation_id)
    messages = db.scalars(
        select(AiMessage)
        .where(AiMessage.conversation_id == conversation.id)
        .order_by(AiMessage.created_at.asc())
    ).all()
    base = conversation_read(conversation)
    return AiConversationDetail(
        **base.model_dump(),
        messages=[message_read(message) for message in messages],
    )


def update_conversation(
    db: Session,
    actor: User,
    conversation_id: UUID,
    payload: AiConversationUpdate,
) -> AiConversationRead:
    conversation = get_conversation(db, actor, conversation_id)
    if payload.title is not None:
        conversation.title = payload.title.strip()[:200]
    if payload.archived is not None:
        conversation.archived_at = utcnow() if payload.archived else None
    db.commit()
    db.refresh(conversation)
    return conversation_read(conversation)


def delete_conversation(db: Session, actor: User, conversation_id: UUID) -> None:
    conversation = get_conversation(db, actor, conversation_id)
    db.delete(conversation)
    db.commit()


def _store_message(
    db: Session,
    conversation: AiConversation,
    *,
    role: str,
    content: str,
    tools_used: list[str] | None = None,
    suggestions: list[str] | None = None,
    actions: list[AiActionProposal] | None = None,
) -> AiMessage:
    created_at = utcnow()
    message = AiMessage(
        conversation_id=conversation.id,
        role=role,
        content=content,
        tools_used_json=_dump_list(tools_used),
        suggestions_json=_dump_list(suggestions),
        actions_json=_dump_actions(actions),
        actions_done=False,
        actions_ignored=False,
        created_at=created_at,
    )
    db.add(message)
    conversation.message_count += 1
    conversation.last_message_at = created_at
    if role == "user" and conversation.title == DEFAULT_TITLE:
        conversation.title = _title_from_content(content)
    db.flush()
    return message


def send_message(
    db: Session,
    actor: User,
    conversation: AiConversation,
    payload: AiConversationMessageRequest,
    *,
    request: Request | None = None,
) -> AiConversationChatResponse:
    user_message = _store_message(
        db,
        conversation,
        role="user",
        content=payload.content.strip(),
    )
    # Le message utilisateur doit rester visible même si le fournisseur IA échoue.
    db.commit()
    db.refresh(conversation)
    db.refresh(user_message)

    rows = db.scalars(
        select(AiMessage)
        .where(
            AiMessage.conversation_id == conversation.id,
            AiMessage.role.in_(("user", "assistant")),
        )
        .order_by(AiMessage.created_at.desc())
        .limit(12)
    ).all()
    history = [
        AiChatMessage(role=row.role, content=row.content)  # type: ignore[arg-type]
        for row in reversed(rows)
    ]
    context = None
    if (
        conversation.context_type in CONTEXT_TYPES
        and conversation.context_id is not None
    ):
        context = AiContext.model_validate(
            {"type": conversation.context_type, "id": conversation.context_id}
        )
    response = ai_service.chat(
        db,
        history,
        actor=actor,
        include_context=payload.include_context,
        context=context,
        request=request,
    )
    assistant_message = _store_message(
        db,
        conversation,
        role="assistant",
        content=response.message,
        tools_used=response.tools_used,
        suggestions=response.suggestions,
        actions=response.actions,
    )
    db.commit()
    db.refresh(conversation)
    db.refresh(assistant_message)
    return AiConversationChatResponse(
        conversation=conversation_read(conversation),
        user_message=message_read(user_message),
        assistant_message=message_read(assistant_message),
        model=response.model,
        provider=response.provider,
        duration_ms=response.duration_ms,
        usage=response.usage,
        tools_used=response.tools_used,
        suggestions=response.suggestions,
        actions=response.actions,
    )


def mark_message_actions(
    db: Session,
    actor: User,
    conversation_id: UUID,
    message_id: UUID,
    state: str,
) -> AiMessageRead:
    conversation = get_conversation(db, actor, conversation_id)
    message = db.scalar(
        select(AiMessage).where(
            AiMessage.id == message_id,
            AiMessage.conversation_id == conversation.id,
        )
    )
    if message is None:
        raise NotFoundError("Message IA introuvable.")
    if state == "done":
        message.actions_done = True
        message.actions_ignored = False
    else:
        message.actions_ignored = True
        message.actions_done = False
    db.commit()
    db.refresh(message)
    return message_read(message)


def export_markdown(
    conversation: AiConversation, messages: list[AiMessageRead]
) -> str:
    lines = [f"# {conversation.title}", ""]
    if conversation.context_label:
        lines.append(f"Contexte : {conversation.context_label}")
    lines.append(
        f"Créée le {conversation.created_at.strftime('%d/%m/%Y %H:%M')} · "
        f"{len(messages)} message(s)"
    )
    lines.append("")
    for message in messages:
        role = "Vous" if message.role == "user" else "Assistant"
        lines.append(f"## {role}")
        lines.append("")
        lines.append(message.content)
        if message.tools_used:
            lines.append("")
            lines.append(f"*Outils utilisés : {', '.join(message.tools_used)}*")
        lines.append("")
    return "\n".join(lines)
