from __future__ import annotations

import io
from typing import Any
from xml.sax.saxutils import escape

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, Spacer

from app.exports.pdf_utils import PdfBranding, create_document, heading, meta_line
from app.models.ai import AiConversation
from app.schemas.ai import AiMessageRead


def conversation_pdf(
    conversation: AiConversation,
    messages: list[AiMessageRead],
    *,
    branding: PdfBranding | None = None,
) -> bytes:
    buffer = io.BytesIO()
    document = create_document(
        buffer,
        title="Conversation avec l'assistant IA",
        subtitle=conversation.title,
        pagesize=A4,
        branding=branding,
    )
    base = getSampleStyleSheet()["BodyText"]
    body = ParagraphStyle(
        "AiConversationBody",
        parent=base,
        fontSize=9,
        leading=13,
        spaceAfter=4 * mm,
    )
    meta = ParagraphStyle(
        "AiConversationMeta",
        parent=base,
        fontSize=8,
        leading=11,
        textColor="#666666",
    )
    story: list[Any] = [
        meta_line(count=len(messages), label="message(s)"),
        Paragraph(
            f"Contexte : {escape(conversation.context_label or 'Général')} · "
            f"Créée le {conversation.created_at.strftime('%d/%m/%Y %H:%M')}",
            meta,
        ),
        Spacer(1, 4 * mm),
    ]
    for message in messages:
        role = "Vous" if message.role == "user" else "Assistant"
        story.append(heading(role))
        text = escape(message.content).replace("\n", "<br/>")
        story.append(Paragraph(text, body))
        if message.tools_used:
            story.append(
                Paragraph(
                    f"Outils utilisés : {escape(', '.join(message.tools_used))}",
                    meta,
                )
            )
        story.append(Spacer(1, 3 * mm))
    document.build(story)
    return buffer.getvalue()
