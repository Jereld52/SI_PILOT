from __future__ import annotations

import json
import time
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any

import httpx
from app.core.crypto import decrypt_secret, encrypt_secret
from app.core.errors import ValidationAppError
from app.models.ai import AiRun
from app.models.assets import Asset, AssetCategory, AssetSoftware
from app.models.auth import User
from app.models.contracts import Contract
from app.models.network import NetworkShare
from app.models.setting import Setting
from app.models.tickets import Ticket, TicketStatus
from app.schemas.ai import (
    AiChatMessage,
    AiChatResponse,
    AiConfigRead,
    AiConfigUpdate,
    AiStatusRead,
    AiTestResponse,
)
from app.services.audit_service import write_audit
from fastapi import Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

DEFAULT_BASE_URLS = {
    "openai": "https://api.openai.com/v1",
    "azure_openai": "https://<ressource>.openai.azure.com/openai/deployments/<deploiement>",
    "mistral": "https://api.mistral.ai/v1",
    "groq": "https://api.groq.com/openai/v1",
    "openrouter": "https://openrouter.ai/api/v1",
    "gemini": "https://generativelanguage.googleapis.com/v1beta/openai",
    "anthropic": "https://api.anthropic.com/v1",
    "ollama": "http://127.0.0.1:11434/v1",
    "openwebui": "https://ai.example.org/api",
    "custom": "",
}

DEFAULT_MODELS = {
    "openai": "gpt-4.1-mini",
    "azure_openai": "<nom-du-deploiement>",
    "mistral": "mistral-small-latest",
    "groq": "llama-3.3-70b-versatile",
    "openrouter": "openai/gpt-4.1-mini",
    "gemini": "gemini-2.5-flash",
    "anthropic": "claude-sonnet-4-5",
    "ollama": "llama3.2",
    "openwebui": "",
    "custom": "",
}

NO_KEY_PROVIDERS = {"ollama", "openwebui"}
OPEN_TICKET_CODES = ("new", "to_qualify", "in_progress", "waiting_user", "waiting_provider")
ASSET_STATUS_LABELS = {
    "in_service": "en service",
    "in_stock": "en stock",
    "maintenance": "en maintenance",
    "broken": "en panne",
    "to_renew": "à renouveler",
    "retired": "réformé",
}


@dataclass(frozen=True)
class AiConfig:
    enabled: bool
    provider: str
    base_url: str
    model: str
    api_key: str
    temperature: float
    max_tokens: int
    timeout_seconds: int
    include_fleet_context: bool

    @property
    def ready(self) -> bool:
        if not self.base_url.strip() or not self.model.strip():
            return False
        return bool(self.api_key) or self.provider in NO_KEY_PROVIDERS

    @property
    def configured(self) -> bool:
        return self.enabled and self.ready


def _value(db: Session, key: str, default: object = "") -> object:
    setting = db.get(Setting, key)
    if setting is None or setting.value_json is None:
        return default
    try:
        return json.loads(setting.value_json)
    except json.JSONDecodeError:
        return setting.value_json


def _set_value(
    db: Session,
    key: str,
    value: object,
    *,
    is_secret: bool = False,
    description: str | None = None,
) -> None:
    setting = db.get(Setting, key)
    if setting is None:
        setting = Setting(
            key=key,
            category="ai",
            is_secret=is_secret,
            description=description,
        )
        db.add(setting)
    setting.value_json = json.dumps(value, ensure_ascii=False)
    setting.is_secret = is_secret


def get_config(db: Session) -> AiConfig:
    provider = str(_value(db, "ai.provider", "openai") or "openai")
    encrypted = str(_value(db, "ai.api_key_encrypted", "") or "")
    base_url = str(
        _value(db, "ai.base_url", DEFAULT_BASE_URLS.get(provider, "")) or ""
    ).strip()
    model = str(_value(db, "ai.model", DEFAULT_MODELS.get(provider, "")) or "").strip()
    return AiConfig(
        enabled=bool(_value(db, "ai.enabled", False)),
        provider=provider,
        base_url=base_url,
        model=model,
        api_key=(decrypt_secret(encrypted) or "") if encrypted else "",
        temperature=float(str(_value(db, "ai.temperature", 0.2) or 0.2)),
        max_tokens=int(str(_value(db, "ai.max_tokens", 1200) or 1200)),
        timeout_seconds=int(str(_value(db, "ai.timeout_seconds", 60) or 60)),
        include_fleet_context=bool(_value(db, "ai.include_fleet_context", True)),
    )


def get_settings(db: Session) -> AiConfigRead:
    config = get_config(db)
    return AiConfigRead(
        enabled=config.enabled,
        provider=config.provider,
        base_url=config.base_url,
        model=config.model,
        api_key_set=bool(config.api_key),
        temperature=config.temperature,
        max_tokens=config.max_tokens,
        timeout_seconds=config.timeout_seconds,
        include_fleet_context=config.include_fleet_context,
        configured=config.configured,
    )


def get_status(db: Session) -> AiStatusRead:
    config = get_config(db)
    return AiStatusRead(
        enabled=config.enabled,
        configured=config.configured,
        provider=config.provider,
        model=config.model,
    )


def update_settings(
    db: Session,
    payload: AiConfigUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> AiConfigRead:
    base_url = payload.base_url.strip() or DEFAULT_BASE_URLS.get(payload.provider, "")
    model = payload.model.strip() or DEFAULT_MODELS.get(payload.provider, "")
    if payload.enabled and (not base_url or not model):
        raise ValidationAppError(
            "Renseignez l'URL de base et le modèle pour activer l'assistant."
        )
    if payload.enabled and payload.provider not in NO_KEY_PROVIDERS and not payload.api_key:
        existing = str(_value(db, "ai.api_key_encrypted", "") or "")
        if not existing:
            raise ValidationAppError(
                "Renseignez la clé d'API du fournisseur pour activer l'assistant."
            )
    before = get_settings(db).model_dump()
    _set_value(db, "ai.enabled", payload.enabled)
    _set_value(db, "ai.provider", payload.provider)
    _set_value(db, "ai.base_url", base_url)
    _set_value(db, "ai.model", model)
    _set_value(db, "ai.temperature", payload.temperature)
    _set_value(db, "ai.max_tokens", payload.max_tokens)
    _set_value(db, "ai.timeout_seconds", payload.timeout_seconds)
    _set_value(db, "ai.include_fleet_context", payload.include_fleet_context)
    if payload.api_key:
        _set_value(
            db,
            "ai.api_key_encrypted",
            encrypt_secret(payload.api_key) or "",
            is_secret=True,
            description="Clé d'API du fournisseur IA, chiffrée",
        )
    write_audit(
        db,
        module="ai",
        action="ai_settings_updated",
        actor=actor,
        entity_type="setting",
        entity_id="ai",
        entity_label="Configuration assistant IA",
        before=before,
        after={
            "enabled": payload.enabled,
            "provider": payload.provider,
            "model": model,
            "api_key_changed": bool(payload.api_key),
            "include_fleet_context": payload.include_fleet_context,
        },
        request=request,
    )
    db.commit()
    return get_settings(db)


def _fleet_context(db: Session) -> str:
    today = date.today()
    now = datetime.now(UTC)
    lines: list[str] = [f"Contexte du parc au {today:%d/%m/%Y} :"]

    total_assets = int(
        db.scalar(
            select(func.count())
            .select_from(Asset)
            .where(Asset.archived_at.is_(None))
        )
        or 0
    )
    status_rows = db.execute(
        select(Asset.status, func.count(Asset.id))
        .where(Asset.archived_at.is_(None))
        .group_by(Asset.status)
    ).all()
    status_text = ", ".join(
        f"{ASSET_STATUS_LABELS.get(status, status)} : {count}"
        for status, count in status_rows
    )
    category_rows = db.execute(
        select(AssetCategory.name, func.count(Asset.id))
        .join(Asset, Asset.category_id == AssetCategory.id)
        .where(Asset.archived_at.is_(None))
        .group_by(AssetCategory.name)
        .order_by(func.count(Asset.id).desc())
        .limit(8)
    ).all()
    category_text = ", ".join(f"{name} : {count}" for name, count in category_rows)
    lines.append(f"- Équipements actifs : {total_assets}.")
    if status_text:
        lines.append(f"- Répartition par statut : {status_text}.")
    if category_text:
        lines.append(f"- Répartition par catégorie : {category_text}.")

    broken = db.scalars(
        select(Asset)
        .where(Asset.archived_at.is_(None), Asset.status == "broken")
        .order_by(Asset.updated_at.desc())
        .limit(8)
    ).all()
    if broken:
        lines.append(
            "- Équipements en panne : "
            + ", ".join(f"{asset.asset_tag} ({asset.name})" for asset in broken)
            + "."
        )
    renew = db.scalars(
        select(Asset)
        .where(Asset.archived_at.is_(None), Asset.status == "to_renew")
        .order_by(Asset.updated_at.desc())
        .limit(8)
    ).all()
    if renew:
        lines.append(
            "- À renouveler : "
            + ", ".join(f"{asset.asset_tag} ({asset.name})" for asset in renew)
            + "."
        )
    warranty = db.scalars(
        select(Asset)
        .where(
            Asset.archived_at.is_(None),
            Asset.warranty_end.is_not(None),
            Asset.warranty_end >= today,
            Asset.warranty_end <= today + timedelta(days=180),
        )
        .order_by(Asset.warranty_end.asc())
        .limit(10)
    ).all()
    if warranty:
        lines.append(
            "- Garanties à moins de 180 jours : "
            + ", ".join(
                f"{asset.asset_tag} ({asset.warranty_end:%d/%m/%Y})"
                for asset in warranty
            )
            + "."
        )

    software_total = int(
        db.scalar(select(func.count()).select_from(AssetSoftware)) or 0
    )
    hosts_with_updates = int(
        db.scalar(
            select(func.count(func.distinct(AssetSoftware.asset_id))).where(
                AssetSoftware.update_available.is_(True)
            )
        )
        or 0
    )
    update_rows = db.execute(
        select(AssetSoftware.package_name, func.count(AssetSoftware.id))
        .where(AssetSoftware.update_available.is_(True))
        .group_by(AssetSoftware.package_name)
        .order_by(func.count(AssetSoftware.id).desc())
        .limit(8)
    ).all()
    if software_total:
        lines.append(
            f"- Logiciels suivis : {software_total} installation(s), "
            f"{hosts_with_updates} poste(s) avec mise(s) à jour."
        )
    if update_rows:
        lines.append(
            "- Mises à jour WAPT en attente : "
            + ", ".join(f"{name} ({count} poste(s))" for name, count in update_rows)
            + "."
        )

    open_tickets = int(
        db.scalar(
            select(func.count())
            .select_from(Ticket)
            .join(TicketStatus)
            .where(TicketStatus.code.in_(OPEN_TICKET_CODES))
        )
        or 0
    )
    overdue_tickets = int(
        db.scalar(
            select(func.count())
            .select_from(Ticket)
            .join(TicketStatus)
            .where(
                TicketStatus.code.in_(OPEN_TICKET_CODES),
                Ticket.due_at.is_not(None),
                Ticket.due_at < now,
            )
        )
        or 0
    )
    if open_tickets or overdue_tickets:
        lines.append(
            f"- Demandes IT ouvertes : {open_tickets}, dont {overdue_tickets} en retard."
        )

    contracts = db.scalars(
        select(Contract)
        .where(
            Contract.status.in_(("active", "expiring")),
            Contract.end_date.is_not(None),
            Contract.end_date >= today,
            Contract.end_date <= today + timedelta(days=90),
        )
        .order_by(Contract.end_date.asc())
        .limit(6)
    ).all()
    if contracts:
        lines.append(
            "- Contrats à échéance sous 90 jours : "
            + ", ".join(
                f"{contract.reference} ({contract.end_date:%d/%m/%Y})"
                for contract in contracts
            )
            + "."
        )

    shares = db.scalars(
        select(NetworkShare)
        .where(
            NetworkShare.is_active.is_(True),
            NetworkShare.last_status.in_(("warning", "critical", "error")),
        )
        .limit(5)
    ).all()
    if shares:
        lines.append(
            "- Partages réseau en alerte : "
            + ", ".join(share.name for share in shares)
            + "."
        )

    text = "\n".join(lines)
    return text[:4500]


SYSTEM_PROMPT = (
    "Tu es l'assistant IA de SI PILOT, un outil de gestion du parc informatique. "
    "Tu aides les équipes IT à analyser le parc, les demandes, les logiciels WAPT, les "
    "contrats, le budget, la sécurité et les échéances. "
    "Réponds en français, de façon concise, structurée et concrète. "
    "Appuie-toi uniquement sur le contexte fourni et sur les informations de la conversation. "
    "Si une information manque, dis-le clairement et indique où la trouver dans l'application. "
    "Tu ne modifies jamais les données : tu peux proposer des actions, mais l'utilisateur doit "
    "les valider dans SI PILOT. Ne divulgue aucun secret, mot de passe ou clé d'API. "
    "Pour les listes de postes, cite les noms machine et numéros d'inventaire fournis."
)


def _provider_url(config: AiConfig) -> str:
    base = config.base_url.rstrip("/")
    if config.provider == "azure_openai":
        url = f"{base}/chat/completions" if not base.endswith("/chat/completions") else base
        if "api-version=" not in url:
            url += "?api-version=2024-02-15-preview"
        return url
    if config.provider == "anthropic":
        return f"{base}/messages" if not base.endswith("/messages") else base
    return f"{base}/chat/completions" if not base.endswith("/chat/completions") else base


def _extract_openai_content(payload: dict[str, Any]) -> str:
    try:
        message = payload["choices"][0]["message"]
        content = message.get("content")
    except (KeyError, IndexError, TypeError) as exc:
        raise ValidationAppError(
            "La réponse du fournisseur IA ne contient pas de texte exploitable."
        ) from exc
    if isinstance(content, str) and content.strip():
        return content.strip()
    if isinstance(content, list):
        parts = [
            str(part.get("text", ""))
            for part in content
            if isinstance(part, dict)
        ]
        text = "\n".join(part for part in parts if part).strip()
        if text:
            return text
    if isinstance(message, dict) and message.get("reasoning"):
        raise ValidationAppError(
            "Le modèle a consommé sa limite de jetons en raisonnement sans produire de réponse. "
            "Augmentez la limite de jetons ou choisissez un modèle non raisonneur."
        )
    raise ValidationAppError(
        "La réponse du fournisseur IA ne contient pas de texte exploitable."
    )


def _complete_ollama(
    config: AiConfig, messages: list[dict[str, str]], token_limit: int
) -> tuple[str, dict[str, int] | None]:
    base = config.base_url.rstrip("/")
    if base.endswith("/v1"):
        base = base[:-3]
    url = f"{base}/api/chat"
    payload = {
        "model": config.model,
        "messages": messages,
        "stream": False,
        "think": False,
        "options": {
            "temperature": config.temperature,
            "num_predict": token_limit,
        },
    }
    try:
        with httpx.Client(timeout=config.timeout_seconds, follow_redirects=True) as client:
            response = client.post(url, json=payload)
    except httpx.HTTPError as exc:
        raise ValidationAppError(
            f"Connexion au serveur Ollama impossible : {exc}"
        ) from exc
    if response.status_code >= 400:
        detail = response.text[:400].strip()
        raise ValidationAppError(
            f"Ollama a répondu {response.status_code} : {detail}"
        )
    try:
        data = response.json()
    except ValueError as exc:
        raise ValidationAppError("Ollama a renvoyé une réponse non JSON.") from exc
    message = data.get("message") if isinstance(data, dict) else None
    content = message.get("content") if isinstance(message, dict) else None
    if not isinstance(content, str) or not content.strip():
        if isinstance(message, dict) and message.get("reasoning"):
            raise ValidationAppError(
                "Le modèle a produit uniquement du raisonnement. Augmentez la limite de jetons "
                "ou utilisez un modèle non raisonneur."
            )
        raise ValidationAppError("Ollama n'a pas renvoyé de texte exploitable.")
    usage: dict[str, int] | None = None
    prompt_tokens = data.get("prompt_eval_count")
    completion_tokens = data.get("eval_count")
    if isinstance(prompt_tokens, (int, float)) or isinstance(
        completion_tokens, (int, float)
    ):
        usage = {
            "prompt_tokens": int(prompt_tokens or 0),
            "completion_tokens": int(completion_tokens or 0),
            "total_tokens": int((prompt_tokens or 0) + (completion_tokens or 0)),
        }
    return content.strip(), usage


def _complete(
    config: AiConfig,
    messages: list[dict[str, str]],
    *,
    max_tokens: int | None = None,
) -> tuple[str, dict[str, int] | None]:
    if not config.ready:
        raise ValidationAppError(
            "L'assistant IA n'est pas configuré. Renseignez le fournisseur, l'URL, "
            "le modèle et la clé dans Administration → Assistant IA."
        )
    token_limit = max_tokens or config.max_tokens
    if config.provider == "ollama":
        return _complete_ollama(config, messages, token_limit)
    url = _provider_url(config)
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if config.provider == "azure_openai":
        headers["api-key"] = config.api_key
    elif config.api_key:
        headers["Authorization"] = f"Bearer {config.api_key}"

    if config.provider == "anthropic":
        headers["x-api-key"] = config.api_key
        headers["anthropic-version"] = "2023-06-01"
        system_parts = [
            message["content"] for message in messages if message["role"] == "system"
        ]
        conversation = [
            {"role": message["role"], "content": message["content"]}
            for message in messages
            if message["role"] in {"user", "assistant"}
        ]
        body: dict[str, Any] = {
            "model": config.model,
            "max_tokens": token_limit,
            "temperature": config.temperature,
            "messages": conversation,
        }
        if system_parts:
            body["system"] = "\n\n".join(system_parts)
    else:
        body = {
            "model": config.model,
            "messages": messages,
            "temperature": config.temperature,
            "max_tokens": token_limit,
        }

    try:
        with httpx.Client(timeout=config.timeout_seconds, follow_redirects=True) as client:
            response = client.post(url, headers=headers, json=body)
    except httpx.HTTPError as exc:
        raise ValidationAppError(
            f"Connexion au fournisseur IA impossible : {exc}"
        ) from exc
    if response.status_code >= 400:
        detail = response.text[:400].strip()
        raise ValidationAppError(
            f"Le fournisseur IA a répondu {response.status_code} : {detail}"
        )
    try:
        payload = response.json()
    except ValueError as exc:
        raise ValidationAppError(
            "Le fournisseur IA a renvoyé une réponse non JSON."
        ) from exc

    if config.provider == "anthropic":
        blocks = payload.get("content")
        if not isinstance(blocks, list):
            raise ValidationAppError(
                "La réponse du fournisseur IA ne contient pas de texte exploitable."
            )
        text = "\n".join(
            str(block.get("text", ""))
            for block in blocks
            if isinstance(block, dict) and block.get("type") == "text"
        ).strip()
        if not text:
            raise ValidationAppError(
                "La réponse du fournisseur IA ne contient pas de texte exploitable."
            )
    else:
        text = _extract_openai_content(payload)

    usage_raw = payload.get("usage")
    usage: dict[str, int] | None = None
    if isinstance(usage_raw, dict):
        usage = {
            str(key): int(value)
            for key, value in usage_raw.items()
            if isinstance(value, (int, float))
        }
    return text, usage


def _record_run(
    db: Session,
    *,
    actor: User,
    request_summary: str,
    include_context: bool,
    status: str,
    duration_ms: int,
    response_text: str | None = None,
    http_status: int | None = None,
    error_code: str | None = None,
) -> None:
    run = AiRun(
        user_id=actor.id,
        feature_code="assistant_chat",
        scope_json=json.dumps({"include_fleet_context": include_context}),
        request_summary=request_summary[:500],
        response_text=response_text[:8000] if response_text else None,
        status=status,
        http_status=http_status,
        duration_ms=duration_ms,
        error_code=error_code,
    )
    db.add(run)
    db.commit()


def test_connection(
    db: Session, *, actor: User, request: Request | None = None
) -> AiTestResponse:
    config = get_config(db)
    started = time.perf_counter()
    try:
        text, _ = _complete(
            config,
            [
                {
                    "role": "user",
                    "content": "Réponds uniquement par le mot OK.",
                }
            ],
            max_tokens=20,
        )
    except ValidationAppError:
        raise
    latency = round((time.perf_counter() - started) * 1000)
    write_audit(
        db,
        module="ai",
        action="ai_connection_tested",
        actor=actor,
        entity_type="ai",
        entity_id="connection",
        entity_label=f"{config.provider} — {config.model}",
        after={"latency_ms": latency},
        request=request,
    )
    db.commit()
    return AiTestResponse(
        ok=True,
        message=f"Connexion IA réussie en {latency} ms.",
        model=config.model,
        latency_ms=latency,
    )


def chat(
    db: Session,
    messages: list[AiChatMessage],
    *,
    actor: User,
    include_context: bool | None = None,
    request: Request | None = None,
) -> AiChatResponse:
    config = get_config(db)
    if not config.enabled:
        raise ValidationAppError("L'assistant IA est désactivé.")
    use_context = (
        config.include_fleet_context if include_context is None else include_context
    )
    system_content = SYSTEM_PROMPT
    if use_context:
        system_content = f"{SYSTEM_PROMPT}\n\n{_fleet_context(db)}"
    payload_messages: list[dict[str, str]] = [
        {"role": "system", "content": system_content}
    ]
    for message in messages[-12:]:
        payload_messages.append({"role": message.role, "content": message.content})
    summary = next(
        (message.content for message in messages if message.role == "user"),
        "Question assistant",
    )
    started = time.perf_counter()
    try:
        answer, usage = _complete(config, payload_messages)
    except Exception as exc:
        duration = round((time.perf_counter() - started) * 1000)
        _record_run(
            db,
            actor=actor,
            request_summary=summary,
            include_context=use_context,
            status="error",
            duration_ms=duration,
            error_code=type(exc).__name__,
        )
        raise
    duration = round((time.perf_counter() - started) * 1000)
    _record_run(
        db,
        actor=actor,
        request_summary=summary,
        include_context=use_context,
        status="success",
        duration_ms=duration,
        response_text=answer,
        http_status=200,
    )
    return AiChatResponse(
        message=answer,
        model=config.model,
        provider=config.provider,
        duration_ms=duration,
        usage=usage,
    )
