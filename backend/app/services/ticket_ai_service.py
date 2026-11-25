from __future__ import annotations

import json
import re
import time
from typing import Any
from uuid import UUID

from app.core.errors import ValidationAppError
from app.models.auth import User
from app.models.tickets import Ticket
from app.schemas.ai import AiContext
from app.schemas.tickets import (
    TicketDuplicateRead,
    TicketTriageRead,
)
from app.services import ai_service, tickets_service
from sqlalchemy import select
from sqlalchemy.orm import Session

STOPWORDS = {
    "avec",
    "pour",
    "dans",
    "sans",
    "mais",
    "donc",
    "cette",
    "cela",
    "elle",
    "nous",
    "vous",
    "leur",
    "sont",
    "être",
    "avoir",
    "fait",
    "plus",
    "moins",
    "tout",
    "tous",
    "toute",
    "poste",
    "demande",
    "ticket",
    "probleme",
    "problème",
    "panne",
    "suite",
    "merci",
    "bonjour",
    "cordialement",
}


def _tokens(text: str | None) -> set[str]:
    if not text:
        return set()
    words = re.findall(r"[a-zA-ZÀ-ÿ0-9]{4,}", text.lower())
    return {word for word in words if word not in STOPWORDS}


def _duplicates(db: Session, ticket_id: UUID, source: str) -> list[TicketDuplicateRead]:
    source_tokens = _tokens(source)
    if not source_tokens:
        return []
    rows = db.scalars(
        select(Ticket)
        .where(Ticket.id != ticket_id)
        .order_by(Ticket.opened_at.desc())
        .limit(200)
    ).all()
    scored: list[tuple[float, Ticket]] = []
    for row in rows:
        tokens = _tokens(f"{row.subject} {row.description or ''}")
        if not tokens:
            continue
        common = len(source_tokens & tokens)
        score = common / len(source_tokens | tokens)
        if score >= 0.12:
            scored.append((score, row))
    scored.sort(key=lambda item: item[0], reverse=True)
    return [
        TicketDuplicateRead(
            id=row.id,
            reference=row.reference,
            subject=row.subject,
            status=row.status.name if row.status else "",
            score=round(score, 2),
        )
        for score, row in scored[:4]
    ]


def _extract_json(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start < 0 or end <= start:
        raise ValidationAppError("La réponse de l'IA n'est pas un objet JSON exploitable.")
    try:
        payload = json.loads(cleaned[start : end + 1])
    except json.JSONDecodeError as exc:
        raise ValidationAppError("La réponse de l'IA n'est pas un JSON valide.") from exc
    if not isinstance(payload, dict):
        raise ValidationAppError("La réponse de l'IA n'est pas un objet JSON exploitable.")
    return payload


def triage(
    db: Session,
    ticket_id: UUID,
    *,
    actor: User,
) -> TicketTriageRead:
    config = ai_service.get_config(db)
    if not config.enabled or not config.ready:
        raise ValidationAppError(
            "L'assistant IA doit être activé et configuré pour analyser une demande."
        )
    ticket = tickets_service.get_ticket_detail(db, ticket_id)
    meta = tickets_service.ticket_meta(db)
    categories = {item.code: item for item in meta.categories}
    priorities = {item.code: item for item in meta.priorities}
    if not categories or not priorities:
        raise ValidationAppError("Les catégories ou priorités de demande ne sont pas configurées.")
    category_list = ", ".join(f"{code} ({item.name})" for code, item in categories.items())
    priority_list = ", ".join(f"{code} ({item.name})" for code, item in priorities.items())
    comments = "\n".join(
        f"- {comment.author.first_name if comment.author else 'Utilisateur'} : {comment.body}"
        for comment in ticket.comments[-10:]
    )
    requester = (
        f"{ticket.requester_agent.first_name} {ticket.requester_agent.last_name}"
        if ticket.requester_agent
        else "Non précisé"
    )
    context = (
        f"Référence : {ticket.reference}\n"
        f"Sujet : {ticket.subject}\n"
        f"Statut : {ticket.status.name}\n"
        f"Catégorie actuelle : {ticket.category.name}\n"
        f"Priorité actuelle : {ticket.priority.name}\n"
        f"Demandeur : {requester}\n"
        f"Description : {ticket.description or '—'}\n"
        f"Commentaires :\n{comments or '—'}"
    )
    system = (
        "Tu es un copilote de support informatique. Analyse la demande et réponds "
        "UNIQUEMENT avec un objet JSON, sans texte autour. Le JSON doit contenir : "
        '"summary" (résumé factuel en 2 phrases maximum), '
        '"category" (code de catégorie), "priority" (code de priorité), '
        '"missing_info" (liste de chaînes), "suggested_reply" (réponse professionnelle '
        "en français, sans inventer d'information), "
        '"confidence" (nombre entre 0 et 1). '
        f"Catégories autorisées : {category_list}. "
        f"Priorités autorisées : {priority_list}. "
        "Ne divulgue aucun secret ni mot de passe. Si une information manque, indique-la "
        "dans missing_info plutôt que de l'inventer."
    )
    started = time.perf_counter()
    try:
        answer, _ = ai_service._complete(
            config,
            [
                {"role": "system", "content": system},
                {"role": "user", "content": context},
            ],
        )
    except Exception as exc:  # noqa: BLE001
        ai_service._record_run(
            db,
            actor=actor,
            request_summary=f"Triage {ticket.reference}",
            include_context=False,
            status="error",
            duration_ms=round((time.perf_counter() - started) * 1000),
            context=AiContext(type="ticket", id=ticket.id),
            feature_code="ticket_triage",
            error_code=type(exc).__name__,
        )
        raise
    payload = _extract_json(answer)
    duration = round((time.perf_counter() - started) * 1000)
    category = categories.get(str(payload.get("category") or ""))
    if category is None:
        category = next(
            (item for item in meta.categories if item.id == ticket.category_id),
            meta.categories[0],
        )
    priority = priorities.get(str(payload.get("priority") or ""))
    if priority is None:
        priority = next(
            (item for item in meta.priorities if item.id == ticket.priority_id),
            meta.priorities[0],
        )
    missing = payload.get("missing_info")
    missing_info = (
        [str(item).strip() for item in missing if str(item).strip()]
        if isinstance(missing, list)
        else []
    )
    try:
        confidence = float(payload.get("confidence") or 0)
    except (TypeError, ValueError):
        confidence = 0.0
    confidence = min(max(confidence, 0.0), 1.0)
    summary = str(payload.get("summary") or "").strip() or "Aucun résumé produit."
    suggested_reply = str(payload.get("suggested_reply") or "").strip()
    duplicates = _duplicates(
        db, ticket.id, f"{ticket.subject} {ticket.description or ''}"
    )
    ai_service._record_run(
        db,
        actor=actor,
        request_summary=f"Triage {ticket.reference}",
        include_context=False,
        status="success",
        duration_ms=duration,
        context=AiContext(type="ticket", id=ticket.id),
        feature_code="ticket_triage",
        response_text=summary,
        http_status=200,
    )
    return TicketTriageRead(
        summary=summary,
        category_id=category.id,
        category_code=category.code,
        category_name=category.name,
        priority_id=priority.id,
        priority_code=priority.code,
        priority_name=priority.name,
        missing_info=missing_info,
        suggested_reply=suggested_reply,
        duplicates=duplicates,
        confidence=confidence,
    )
