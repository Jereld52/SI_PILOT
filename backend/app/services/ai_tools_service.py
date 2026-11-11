from __future__ import annotations

import re
from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from typing import Any

from app.core.permissions import has_permission
from app.models.assets import Asset, AssetSoftware
from app.models.audit import AuditLog
from app.models.auth import User
from app.models.contracts import Contract
from app.models.infrastructure import InfraEquipment
from app.models.network import NetworkShare
from app.models.organization import Agent
from app.models.security import Certificate, SecurityIncident
from app.models.tickets import Ticket, TicketStatus
from sqlalchemy import false, func, or_, select
from sqlalchemy.orm import Session

OPEN_TICKET_CODES = ("new", "to_qualify", "in_progress", "waiting_user", "waiting_provider")
ASSET_STATUS_LABELS = {
    "in_service": "en service",
    "in_stock": "en stock",
    "maintenance": "en maintenance",
    "broken": "en panne",
    "to_renew": "à renouveler",
    "retired": "réformé",
}

STOPWORDS = {
    "quels", "quelles", "quel", "quelle", "sont", "est", "les", "des", "de", "du",
    "la", "le", "un", "une", "pour", "dans", "sur", "avec", "sans", "poste",
    "postes", "machine", "machines", "equipement", "équipement", "equipements",
    "équipements", "ticket", "tickets", "demande", "demandes", "logiciel",
    "logiciels", "mise", "jour", "mises", "que", "qui", "quoi", "comment",
    "combien", "liste", "donne", "moi", "je", "veux", "savoir", "il", "elle",
    "en", "et", "ou", "au", "aux", "ce", "cette", "ces", "mon", "ma", "mes",
    "notre", "nos", "votre", "vos", "utilise", "utilisé", "affecté",
    "affecte", "affectation", "y", "a", "t", "d", "l", "s",
}

TOOL_DEFINITIONS: tuple[dict[str, str], ...] = (
    {
        "key": "fleet_overview",
        "label": "Vue d'ensemble du parc",
        "description": "Compteurs du parc, des logiciels, des tickets et des contrats.",
        "permission": "assets.read",
    },
    {
        "key": "search_assets",
        "label": "Recherche d'équipements",
        "description": "Recherche par nom, inventaire, machine, série, IP ou utilisateur.",
        "permission": "assets.read",
    },
    {
        "key": "assets_broken",
        "label": "Équipements en panne",
        "description": "Liste des équipements en panne.",
        "permission": "assets.read",
    },
    {
        "key": "assets_renewal",
        "label": "Renouvellements",
        "description": "Équipements à renouveler ou hors garantie.",
        "permission": "assets.read",
    },
    {
        "key": "assets_warranty",
        "label": "Garanties",
        "description": "Garanties arrivant à échéance.",
        "permission": "assets.read",
    },
    {
        "key": "search_tickets",
        "label": "Recherche de demandes",
        "description": "Recherche de tickets par référence, sujet, demandeur ou assigné.",
        "permission": "tickets.read",
    },
    {
        "key": "tickets_open",
        "label": "Demandes ouvertes",
        "description": "Demandes en cours, priorités et échéances.",
        "permission": "tickets.read",
    },
    {
        "key": "tickets_overdue",
        "label": "Demandes en retard",
        "description": "Demandes dont l'échéance ou le SLA est dépassé.",
        "permission": "tickets.read",
    },
    {
        "key": "software_updates",
        "label": "Mises à jour WAPT",
        "description": "Logiciels avec mises à jour en attente et postes concernés.",
        "permission": "assets.read",
    },
    {
        "key": "software_on_host",
        "label": "Logiciels d'un poste",
        "description": "Logiciels installés et mises à jour d'un poste.",
        "permission": "assets.read",
    },
    {
        "key": "contracts_expiring",
        "label": "Contrats à échéance",
        "description": "Contrats arrivant à échéance.",
        "permission": "contracts.read",
    },
    {
        "key": "network_shares_status",
        "label": "Partages réseau",
        "description": "Volumétrie et alertes des partages réseau.",
        "permission": "infrastructure.read",
    },
    {
        "key": "security_incidents",
        "label": "Incidents de sécurité",
        "description": "Incidents ouverts et leur gravité.",
        "permission": "security.read",
    },
    {
        "key": "certificates_expiring",
        "label": "Certificats",
        "description": "Certificats arrivant à expiration.",
        "permission": "security.read",
    },
    {
        "key": "infrastructure_equipment",
        "label": "Infrastructure",
        "description": "Serveurs, VM, réseau et équipements d'infrastructure.",
        "permission": "infrastructure.read",
    },
    {
        "key": "agent_lookup",
        "label": "Utilisateurs et agents",
        "description": "Recherche d'un agent, de ses équipements et de ses demandes.",
        "permission": "agents.read",
    },
    {
        "key": "recent_activity",
        "label": "Activité récente",
        "description": "Derniers changements enregistrés dans l'audit.",
        "permission": "audit.read",
    },
)


def list_tools(actor: User) -> list[dict[str, str]]:
    return [
        dict(tool)
        for tool in TOOL_DEFINITIONS
        if has_permission(actor, tool["permission"])
    ]


def _agent_for_user(db: Session, actor: User) -> Agent | None:
    return db.scalar(select(Agent).where(Agent.user_id == actor.id))


def _apply_asset_scope(statement, db: Session, actor: User):  # noqa: ANN001, ANN201
    if actor.data_scope == "all":
        return statement
    agent = _agent_for_user(db, actor)
    if actor.data_scope == "service" and agent and agent.service_id:
        return statement.where(Asset.service_id == agent.service_id)
    if actor.data_scope == "own" and agent:
        return statement.where(Asset.assigned_agent_id == agent.id)
    return statement.where(false())


def _apply_ticket_scope(statement, db: Session, actor: User):  # noqa: ANN001, ANN201
    if actor.data_scope == "all":
        return statement
    agent = _agent_for_user(db, actor)
    if actor.data_scope == "service" and agent and agent.service_id:
        return statement.where(Ticket.service_id == agent.service_id)
    if actor.data_scope == "own" and agent:
        return statement.where(
            or_(
                Ticket.requester_agent_id == agent.id,
                Ticket.assignee_user_id == actor.id,
            )
        )
    return statement.where(false())


def _iso(value: Any) -> str:
    if isinstance(value, datetime):
        return value.strftime("%d/%m/%Y %H:%M")
    if isinstance(value, date):
        return value.strftime("%d/%m/%Y")
    return str(value) if value else "—"


def _asset_item(asset: Asset) -> str:
    user = (
        f"{asset.assigned_agent.first_name} {asset.assigned_agent.last_name}"
        if asset.assigned_agent
        else "non affecté"
    )
    return (
        f"{asset.asset_tag} | {asset.hostname or asset.name} | "
        f"{ASSET_STATUS_LABELS.get(asset.status, asset.status)} | "
        f"{asset.category.name if asset.category else '—'} | "
        f"affecté: {user} | garantie: {_iso(asset.warranty_end)} | "
        f"IP: {asset.ip_address or '—'}"
    )


def _ticket_item(ticket: Ticket) -> str:
    assignee = (
        f"{ticket.assignee.first_name} {ticket.assignee.last_name}"
        if ticket.assignee
        else "non assigné"
    )
    return (
        f"{ticket.reference} | {ticket.subject} | "
        f"{ticket.status.name if ticket.status else '—'} | "
        f"priorité {ticket.priority.name if ticket.priority else '—'} | "
        f"échéance {_iso(ticket.due_at)} | assigné: {assignee}"
    )


def _result(key: str, items: list[str], *, note: str = "") -> dict[str, Any]:
    tool = next((item for item in TOOL_DEFINITIONS if item["key"] == key), None)
    return {
        "tool": key,
        "label": tool["label"] if tool else key,
        "count": len(items),
        "items": items,
        "note": note,
    }


def fleet_overview(db: Session, actor: User, query: str | None = None) -> dict[str, Any]:
    total = int(
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
    software_total = int(
        db.scalar(
            select(func.count()).select_from(AssetSoftware)
        )
        or 0
    )
    updates = int(
        db.scalar(
            select(func.count())
            .select_from(AssetSoftware)
            .where(AssetSoftware.update_available.is_(True))
        )
        or 0
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
    today = date.today()
    expiring = int(
        db.scalar(
            select(func.count())
            .select_from(Contract)
            .where(
                Contract.status.in_(("active", "expiring")),
                Contract.end_date.is_not(None),
                Contract.end_date >= today,
                Contract.end_date <= today + timedelta(days=90),
            )
        )
        or 0
    )
    items = [
        f"Équipements actifs: {total}",
        "Statuts: "
        + ", ".join(
            f"{ASSET_STATUS_LABELS.get(status, status)} {count}"
            for status, count in status_rows
        ),
        f"Logiciels suivis: {software_total} installation(s), {updates} mise(s) à jour en attente",
        f"Demandes ouvertes: {open_tickets}",
        f"Contrats à échéance sous 90 jours: {expiring}",
    ]
    return _result("fleet_overview", items)


def search_assets(
    db: Session, actor: User, query: str | None = None, limit: int = 20
) -> dict[str, Any]:
    statement = select(Asset).where(Asset.archived_at.is_(None))
    statement = _apply_asset_scope(statement, db, actor)
    if query:
        pattern = f"%{query}%"
        statement = statement.where(
            or_(
                Asset.asset_tag.ilike(pattern),
                Asset.name.ilike(pattern),
                Asset.hostname.ilike(pattern),
                Asset.serial_number.ilike(pattern),
                Asset.ip_address.ilike(pattern),
                Asset.comments.ilike(pattern),
            )
        )
    rows = db.scalars(statement.order_by(Asset.name).limit(limit)).all()
    return _result("search_assets", [_asset_item(row) for row in rows])


def assets_broken(db: Session, actor: User, limit: int = 20) -> dict[str, Any]:
    statement = select(Asset).where(
        Asset.archived_at.is_(None), Asset.status == "broken"
    )
    statement = _apply_asset_scope(statement, db, actor)
    rows = db.scalars(statement.order_by(Asset.updated_at.desc()).limit(limit)).all()
    return _result("assets_broken", [_asset_item(row) for row in rows])


def assets_renewal(db: Session, actor: User, limit: int = 20) -> dict[str, Any]:
    today = date.today()
    statement = select(Asset).where(
        Asset.archived_at.is_(None),
        or_(
            Asset.status == "to_renew",
            Asset.warranty_end.is_not(None) & (Asset.warranty_end < today),
        ),
    )
    statement = _apply_asset_scope(statement, db, actor)
    rows = db.scalars(
        statement.order_by(Asset.warranty_end.asc().nullslast()).limit(limit)
    ).all()
    return _result("assets_renewal", [_asset_item(row) for row in rows])


def assets_warranty(
    db: Session, actor: User, days: int = 180, limit: int = 20
) -> dict[str, Any]:
    today = date.today()
    statement = select(Asset).where(
        Asset.archived_at.is_(None),
        Asset.warranty_end.is_not(None),
        Asset.warranty_end >= today,
        Asset.warranty_end <= today + timedelta(days=days),
    )
    statement = _apply_asset_scope(statement, db, actor)
    rows = db.scalars(statement.order_by(Asset.warranty_end.asc()).limit(limit)).all()
    return _result("assets_warranty", [_asset_item(row) for row in rows])


def search_tickets(
    db: Session, actor: User, query: str | None = None, limit: int = 20
) -> dict[str, Any]:
    statement = select(Ticket)
    statement = _apply_ticket_scope(statement, db, actor)
    if query:
        pattern = f"%{query}%"
        statement = statement.where(
            or_(
                Ticket.reference.ilike(pattern),
                Ticket.subject.ilike(pattern),
                Ticket.description.ilike(pattern),
            )
        )
    rows = db.scalars(statement.order_by(Ticket.opened_at.desc()).limit(limit)).all()
    return _result("search_tickets", [_ticket_item(row) for row in rows])


def tickets_open(db: Session, actor: User, limit: int = 20) -> dict[str, Any]:
    statement = (
        select(Ticket)
        .join(TicketStatus)
        .where(TicketStatus.code.in_(OPEN_TICKET_CODES))
    )
    statement = _apply_ticket_scope(statement, db, actor)
    rows = db.scalars(
        statement.order_by(Ticket.due_at.asc().nullslast(), Ticket.opened_at.asc()).limit(limit)
    ).all()
    return _result("tickets_open", [_ticket_item(row) for row in rows])


def tickets_overdue(db: Session, actor: User, limit: int = 20) -> dict[str, Any]:
    now = datetime.now(UTC)
    statement = (
        select(Ticket)
        .join(TicketStatus)
        .where(
            TicketStatus.code.in_(OPEN_TICKET_CODES),
            Ticket.due_at.is_not(None),
            Ticket.due_at < now,
        )
    )
    statement = _apply_ticket_scope(statement, db, actor)
    rows = db.scalars(statement.order_by(Ticket.due_at.asc()).limit(limit)).all()
    return _result("tickets_overdue", [_ticket_item(row) for row in rows])


def software_updates(
    db: Session, actor: User, query: str | None = None, limit: int = 15
) -> dict[str, Any]:
    statement = (
        select(
            AssetSoftware.package_name,
            func.count(AssetSoftware.id),
            func.max(AssetSoftware.available_version),
        )
        .where(AssetSoftware.update_available.is_(True))
        .group_by(AssetSoftware.package_name)
        .order_by(func.count(AssetSoftware.id).desc())
        .limit(limit)
    )
    if query:
        statement = statement.where(AssetSoftware.package_name.ilike(f"%{query}%"))
    rows = db.execute(statement).all()
    items = [
        f"{name} | {count} poste(s) | version disponible: {available or '—'}"
        for name, count, available in rows
    ]
    return _result("software_updates", items)


def software_on_host(
    db: Session, actor: User, query: str | None = None, limit: int = 40
) -> dict[str, Any]:
    if not query:
        return _result("software_on_host", [], note="Précisez le nom du poste.")
    pattern = f"%{query}%"
    statement = select(Asset).where(
        Asset.archived_at.is_(None),
        or_(
            Asset.hostname.ilike(pattern),
            Asset.asset_tag.ilike(pattern),
            Asset.name.ilike(pattern),
        ),
    )
    statement = _apply_asset_scope(statement, db, actor)
    asset = db.scalars(statement.limit(1)).first()
    if asset is None:
        return _result("software_on_host", [], note=f"Aucun poste trouvé pour {query}.")
    rows = db.scalars(
        select(AssetSoftware)
        .where(AssetSoftware.asset_id == asset.id)
        .order_by(AssetSoftware.package_name)
        .limit(limit)
    ).all()
    items = [
        f"{row.package_name} | installé: {row.package_version or '—'}"
        + (
            f" | mise à jour: {row.available_version}"
            if row.update_available and row.available_version
            else ""
        )
        for row in rows
    ]
    return _result("software_on_host", items, note=f"Poste: {asset.asset_tag} — {asset.hostname or asset.name}")


def contracts_expiring(
    db: Session, actor: User, days: int = 90, limit: int = 20
) -> dict[str, Any]:
    today = date.today()
    rows = db.scalars(
        select(Contract)
        .where(
            Contract.status.in_(("active", "expiring")),
            Contract.end_date.is_not(None),
            Contract.end_date >= today,
            Contract.end_date <= today + timedelta(days=days),
        )
        .order_by(Contract.end_date.asc())
        .limit(limit)
    ).all()
    items = [
        f"{row.reference} | {row.object} | fin: {_iso(row.end_date)} | {row.status} | "
        f"fournisseur: {row.supplier.name if row.supplier else '—'}"
        for row in rows
    ]
    return _result("contracts_expiring", items)


def network_shares_status(db: Session, actor: User, limit: int = 20) -> dict[str, Any]:
    rows = db.scalars(
        select(NetworkShare)
        .where(NetworkShare.is_active.is_(True))
        .order_by(NetworkShare.last_status.desc(), NetworkShare.name)
        .limit(limit)
    ).all()
    items = []
    for row in rows:
        free = "—"
        if row.last_total_bytes and row.last_free_bytes is not None:
            free = f"{row.last_free_bytes / row.last_total_bytes * 100:.1f} % libre"
        items.append(
            f"{row.name} | {row.last_status or 'inconnu'} | {free} | {row.last_error or ''}"
        )
    return _result("network_shares_status", items)


def security_incidents(db: Session, actor: User, limit: int = 20) -> dict[str, Any]:
    rows = db.scalars(
        select(SecurityIncident)
        .where(SecurityIncident.status != "closed")
        .order_by(SecurityIncident.detected_at.desc())
        .limit(limit)
    ).all()
    items = [
        f"{row.reference} | {row.title} | {row.severity} | {row.status} | "
        f"détecté: {_iso(row.detected_at)}"
        for row in rows
    ]
    return _result("security_incidents", items)


def certificates_expiring(
    db: Session, actor: User, days: int = 90, limit: int = 20
) -> dict[str, Any]:
    today = date.today()
    rows = db.scalars(
        select(Certificate)
        .where(
            Certificate.status.in_(("active", "expiring")),
            Certificate.valid_to >= today,
            Certificate.valid_to <= today + timedelta(days=days),
        )
        .order_by(Certificate.valid_to.asc())
        .limit(limit)
    ).all()
    items = [
        f"{row.common_name} | expire: {_iso(row.valid_to)} | {row.status}"
        for row in rows
    ]
    return _result("certificates_expiring", items)


def infrastructure_equipment(
    db: Session, actor: User, query: str | None = None, limit: int = 20
) -> dict[str, Any]:
    statement = select(InfraEquipment)
    if query:
        pattern = f"%{query}%"
        statement = statement.where(
            or_(
                InfraEquipment.name.ilike(pattern),
                InfraEquipment.type.ilike(pattern),
                InfraEquipment.os_name.ilike(pattern),
            )
        )
    rows = db.scalars(statement.order_by(InfraEquipment.name).limit(limit)).all()
    items = [
        f"{row.name} | {row.type} | {row.status} | criticité {row.criticality} | "
        f"{row.location.name if row.location else '—'}"
        for row in rows
    ]
    return _result("infrastructure_equipment", items)


def agent_lookup(
    db: Session, actor: User, query: str | None = None, limit: int = 10
) -> dict[str, Any]:
    if not query:
        return _result("agent_lookup", [], note="Précisez un nom, un login ou un e-mail.")
    pattern = f"%{query}%"
    rows = db.scalars(
        select(Agent)
        .where(
            or_(
                Agent.first_name.ilike(pattern),
                Agent.last_name.ilike(pattern),
                Agent.email_pro.ilike(pattern),
                Agent.login.ilike(pattern),
            )
        )
        .limit(limit)
    ).all()
    items = []
    for agent in rows:
        assets = db.scalars(
            select(Asset)
            .where(Asset.assigned_agent_id == agent.id, Asset.archived_at.is_(None))
            .limit(5)
        ).all()
        tickets = db.scalars(
            select(Ticket)
            .join(TicketStatus)
            .where(
                Ticket.requester_agent_id == agent.id,
                TicketStatus.code.in_(OPEN_TICKET_CODES),
            )
            .limit(5)
        ).all()
        items.append(
            f"{agent.first_name} {agent.last_name} | {agent.email_pro} | "
            f"login: {agent.login or '—'} | service: {agent.service.name if agent.service else '—'} | "
            f"équipements: {', '.join(asset.asset_tag for asset in assets) or 'aucun'} | "
            f"demandes ouvertes: {', '.join(ticket.reference for ticket in tickets) or 'aucune'}"
        )
    return _result("agent_lookup", items)


def recent_activity(db: Session, actor: User, limit: int = 15) -> dict[str, Any]:
    rows = db.scalars(
        select(AuditLog).order_by(AuditLog.occurred_at.desc()).limit(limit)
    ).all()
    items = [
        f"{_iso(row.occurred_at)} | {row.module}.{row.action} | "
        f"{row.entity_label or '—'} | {row.actor_label or 'système'} | {row.status}"
        for row in rows
    ]
    return _result("recent_activity", items)


HANDLERS: dict[str, Callable[..., dict[str, Any]]] = {
    "fleet_overview": fleet_overview,
    "search_assets": search_assets,
    "assets_broken": assets_broken,
    "assets_renewal": assets_renewal,
    "assets_warranty": assets_warranty,
    "search_tickets": search_tickets,
    "tickets_open": tickets_open,
    "tickets_overdue": tickets_overdue,
    "software_updates": software_updates,
    "software_on_host": software_on_host,
    "contracts_expiring": contracts_expiring,
    "network_shares_status": network_shares_status,
    "security_incidents": security_incidents,
    "certificates_expiring": certificates_expiring,
    "infrastructure_equipment": infrastructure_equipment,
    "agent_lookup": agent_lookup,
    "recent_activity": recent_activity,
}


def extract_query(message: str) -> str | None:
    tokens = re.findall(r"[A-Za-zÀ-ÖØ-öø-ÿ0-9][A-Za-zÀ-ÖØ-öø-ÿ0-9._-]{1,}", message)
    kept = [
        token
        for token in tokens
        if token.lower() not in STOPWORDS and len(token) > 1
    ]
    return " ".join(kept[:8]) or None


def select_tools(message: str, actor: User) -> list[tuple[str, dict[str, Any]]]:
    text = message.lower()
    query = extract_query(message)
    calls: list[tuple[str, dict[str, Any]]] = []
    allowed = {tool["key"] for tool in list_tools(actor)}

    def add(key: str, **kwargs: Any) -> None:
        if key in allowed and all(existing[0] != key for existing in calls):
            calls.append((key, kwargs))

    if any(term in text for term in ("en panne", "panne", "hors service", " hs")):
        add("assets_broken")
    if any(term in text for term in ("renouvel", "remplac", "vétuste", "vetuste", "trop vieux")):
        add("assets_renewal")
    if "garantie" in text:
        add("assets_warranty")
    if any(term in text for term in ("ticket", "demande", "sla")) and any(
        term in text for term in ("retard", "échéance", "echeance", "dépass")
    ):
        add("tickets_overdue")
    if any(term in text for term in ("ticket", "demande", "support")) and any(
        term in text for term in ("ouvert", "priorit", "en cours", "liste", "combien")
    ):
        add("tickets_open")
    if any(term in text for term in ("mise à jour", "mises à jour", "mise a jour", "wapt")):
        add("software_updates")
    if any(term in text for term in ("logiciels de", "logiciels sur", "logiciel de", "logiciel sur")):
        add("software_on_host", query=query)
    if "contrat" in text:
        add("contracts_expiring")
    if any(term in text for term in ("partage", "espace libre", "volume", "réseau", "reseau")):
        add("network_shares_status")
    if any(term in text for term in ("incident", "sécurité", "securite", "cyber", "vulnérab")):
        add("security_incidents")
    if any(term in text for term in ("certificat", "tls", "ssl")):
        add("certificates_expiring")
    if any(term in text for term in ("serveur", "switch", "infrastructure", " vm", "baie", "routeur", "firewall")):
        add("infrastructure_equipment", query=query)
    if any(term in text for term in ("qui est", "qui utilise", "utilisateur", "agent", "affecté", "affecte", "annuaire")):
        add("agent_lookup", query=query)
    if any(term in text for term in ("récent", "recent", "changement", "activité", "activite", "audit", "dernier")):
        add("recent_activity")
    if any(term in text for term in ("bilan", "vue d'ensemble", "état du parc", "etat du parc", "combien de poste", "statistique", "synthèse", "synthese")):
        add("fleet_overview")
    if query and any(term in text for term in ("poste", "machine", "équipement", "equipement", "inventaire", "série", "serie", "hostname")):
        add("search_assets", query=query)
    if query and any(term in text for term in ("ticket", "demande")) and not any(
        existing[0] in {"tickets_open", "tickets_overdue"} for existing in calls
    ):
        add("search_tickets", query=query)
    return calls[:3]


def run_tools(
    db: Session, actor: User, message: str
) -> tuple[list[dict[str, Any]], list[str]]:
    results: list[dict[str, Any]] = []
    for key, kwargs in select_tools(message, actor):
        handler = HANDLERS.get(key)
        if handler is None:
            continue
        results.append(handler(db, actor, **kwargs))
    return results, [result["tool"] for result in results]


def format_tool_results(results: list[dict[str, Any]]) -> str:
    blocks: list[str] = []
    for result in results:
        lines = [f"Outil {result['label']} ({result['count']} résultat(s)) :"]
        if result["items"]:
            lines.extend(f"- {item}" for item in result["items"])
        elif result.get("note"):
            lines.append(f"- {result['note']}")
        else:
            lines.append("- Aucun résultat.")
        blocks.append("\n".join(lines))
    return "\n\n".join(blocks)

