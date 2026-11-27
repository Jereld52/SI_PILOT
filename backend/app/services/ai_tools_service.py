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
from app.models.documents import Document, Tag
from app.models.infrastructure import InfraEquipment
from app.models.network import NetworkShare
from app.models.organization import Agent, ChecklistRun
from app.models.projects import Project
from app.models.rgpd import ProcessingActivity
from app.models.security import Certificate, SecurityIncident
from app.models.stock import StockItem
from app.models.tickets import Intervention, Ticket, TicketStatus
from app.services import (
    backup_service,
    budget_service,
    dashboard_service,
    dashboard_today_service,
    data_quality_service,
    network_scan_service,
    onboarding_service,
    rgpd_service,
    scheduler_service,
    statistics_service,
    veeam_service,
)
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
        "key": "commercial_overview",
        "label": "Achats et engagement",
        "description": "Devis, bons de commande, montants, conversion, livraisons et numéros d'engagement.",
        "permission": "suppliers.read",
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
        "description": "Recherche d'un agent, de ses équipements, de ses demandes et de ses dossiers.",
        "permission": "agents.read",
    },
    {
        "key": "onboarding_briefing",
        "label": "Arrivées et départs",
        "description": "Dossiers d'arrivée et de départ, retards et oublis.",
        "permission": "agents.read",
    },
    {
        "key": "veeam_backup_status",
        "label": "Sauvegardes Veeam",
        "description": "Jobs, sessions, échecs et dépôts Veeam.",
        "permission": "security.read",
    },
    {
        "key": "network_discovery",
        "label": "Découverte réseau",
        "description": "Hôtes détectés sur un sous-réseau privé et rapprochement avec le parc.",
        "permission": "infrastructure.read",
    },
    {
        "key": "daily_briefing",
        "label": "Briefing du jour",
        "description": "Contrôles, sauvegardes, Veeam, alertes et dernières exécutions.",
        "permission": "dashboard.read",
    },
    {
        "key": "monthly_report_summary",
        "label": "Bilan mensuel",
        "description": "Indicateurs du mois précédent pour préparer une synthèse.",
        "permission": "statistics.read",
    },
    {
        "key": "recent_activity",
        "label": "Activité récente",
        "description": "Derniers changements enregistrés dans l'audit.",
        "permission": "audit.read",
    },
    {
        "key": "stock_overview",
        "label": "Stock et seuils",
        "description": "Articles sous le seuil d'alerte, ruptures et consommables à commander.",
        "permission": "stock.read",
    },
    {
        "key": "budget_overview",
        "label": "Budget",
        "description": "Budgets, montants prévus, engagés, facturés et disponibles.",
        "permission": "budget.read",
    },
    {
        "key": "projects_at_risk",
        "label": "Projets à risque",
        "description": "Projets en retard, en pause ou proches de leur échéance.",
        "permission": "projects.read",
    },
    {
        "key": "data_quality_overview",
        "label": "Qualité des données",
        "description": "Anomalies de données : engagements manquants, contrats incomplets, doublons et imports en erreur.",
        "permission": "dashboard.read",
    },
    {
        "key": "rgpd_overview",
        "label": "Registre RGPD",
        "description": "Traitements, revues à venir, demandes DPO, droits des personnes et violations.",
        "permission": "rgpd.read",
    },
    {
        "key": "search_documents",
        "label": "Recherche documentaire",
        "description": "Recherche dans les documents, procédures et guides avec extraits et sources.",
        "permission": "documents.read",
    },
    {
        "key": "document_consistency",
        "label": "Cohérence documentaire",
        "description": "Documents obsolètes, sans version, doublons et versions manquantes.",
        "permission": "documents.read",
    },
    {
        "key": "procedure_sources",
        "label": "Sources de procédures",
        "description": "Tickets résolus et interventions terminées pour rédiger une procédure.",
        "permission": "tickets.read",
    },
    {
        "key": "day_overview",
        "label": "Journée et planning",
        "description": "Réunions, déplacements, interventions, réservations, actions et demandes du jour.",
        "permission": "dashboard.read",
    },
)


TOOL_DOMAINS: dict[str, str] = {
    "fleet_overview": "parc",
    "search_assets": "parc",
    "assets_broken": "parc",
    "assets_renewal": "parc",
    "assets_warranty": "parc",
    "software_updates": "parc",
    "software_on_host": "parc",
    "search_tickets": "support",
    "tickets_open": "support",
    "tickets_overdue": "support",
    "contracts_expiring": "achats",
    "commercial_overview": "achats",
    "network_shares_status": "infrastructure",
    "infrastructure_equipment": "infrastructure",
    "network_discovery": "infrastructure",
    "security_incidents": "securite",
    "certificates_expiring": "securite",
    "veeam_backup_status": "securite",
    "agent_lookup": "agents",
    "onboarding_briefing": "agents",
    "daily_briefing": "pilotage",
    "monthly_report_summary": "pilotage",
    "recent_activity": "pilotage",
    "stock_overview": "parc",
    "budget_overview": "achats",
    "projects_at_risk": "pilotage",
    "data_quality_overview": "pilotage",
    "rgpd_overview": "conformite",
    "search_documents": "documents",
    "document_consistency": "documents",
    "procedure_sources": "documents",
    "day_overview": "pilotage",
}


def list_tools(actor: User) -> list[dict[str, str]]:
    return [
        {**tool, "domain": TOOL_DOMAINS.get(tool["key"], "general")}
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


def _result(
    key: str,
    items: list[str],
    *,
    note: str = "",
    sources: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    tool = next((item for item in TOOL_DEFINITIONS if item["key"] == key), None)
    return {
        "tool": key,
        "label": tool["label"] if tool else key,
        "count": len(items),
        "items": items,
        "note": note,
        "sources": sources or [],
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
        runs = db.scalars(
            select(ChecklistRun)
            .where(ChecklistRun.agent_id == agent.id)
            .order_by(ChecklistRun.started_at.desc().nullslast())
            .limit(4)
        ).all()
        dossier_text = (
            ", ".join(
                f"{run.type} {run.status} ({run.due_date:%d/%m/%Y})"
                if run.due_date
                else f"{run.type} {run.status}"
                for run in runs
            )
            or "aucun"
        )
        items.append(
            f"{agent.first_name} {agent.last_name} | {agent.email_pro} | "
            f"login: {agent.login or '—'} | service: {agent.service.name if agent.service else '—'} | "
            f"équipements: {', '.join(asset.asset_tag for asset in assets) or 'aucun'} | "
            f"demandes ouvertes: {', '.join(ticket.reference for ticket in tickets) or 'aucune'} | "
            f"dossiers: {dossier_text}"
        )
    return _result("agent_lookup", items)


def onboarding_briefing(db: Session, actor: User) -> dict[str, Any]:
    data = onboarding_service.briefing(db, actor=actor)
    counts = data.counts
    items = [
        (
            f"Arrivées à venir: {counts.get('upcoming_arrivals', 0)} | "
            f"Départs à venir: {counts.get('upcoming_departures', 0)} | "
            f"Dossiers en cours: {counts.get('in_progress', 0)} | "
            f"En retard: {counts.get('overdue', 0)} | "
            f"Arrivées sans dossier: {counts.get('missing_onboarding', 0)} | "
            f"Départs sans dossier: {counts.get('missing_offboarding', 0)}"
        )
    ]
    for alert in data.items[:25]:
        items.append(f"[{alert.severity}] {alert.title} — {alert.detail}")
    return _result("onboarding_briefing", items)


def veeam_backup_status(db: Session, actor: User) -> dict[str, Any]:
    try:
        overview = veeam_service.get_overview(db)
    except Exception as exc:  # noqa: BLE001 - le contexte doit rester exploitable
        return _result(
            "veeam_backup_status",
            [],
            note=f"Veeam indisponible ou non configuré : {exc}",
        )
    summary = overview.summary
    items = [
        (
            f"Jobs: {summary.get('jobs', 0)} | "
            f"Succès: {summary.get('success_jobs', 0)} | "
            f"Avertissements: {summary.get('warning_jobs', 0)} | "
            f"Échecs: {summary.get('failed_jobs', 0)} | "
            f"Dépôts: {summary.get('repositories', 0)} | "
            f"Dernière session: {summary.get('last_session_at') or '—'}"
        )
    ]
    for job in overview.jobs:
        if job.last_result.lower() in {"failed", "warning"}:
            items.append(
                f"{job.name} | {job.last_result} | "
                f"{job.last_session_at or '—'} | {job.last_message or ''}"
            )
    for repository in overview.repositories:
        if repository.free_percent is not None and repository.free_percent < 15:
            items.append(
                f"Dépôt {repository.name} | {repository.free_percent}% libre"
            )
    items.extend(overview.notes)
    return _result("veeam_backup_status", items)


def network_discovery(
    db: Session, actor: User, query: str | None = None, limit: int = 40
) -> dict[str, Any]:
    cidr = network_scan_service.extract_cidr(query)
    if not cidr:
        return _result(
            "network_discovery",
            [],
            note=(
                "Précisez un sous-réseau privé, par exemple « scan 192.168.1.0/24 ». "
                "Le scan est limité aux adresses privées et à 1024 adresses."
            ),
        )
    try:
        result = network_scan_service.scan(db, cidr, actor=actor)
    except Exception as exc:  # noqa: BLE001 - le contexte doit rester exploitable
        return _result("network_discovery", [], note=f"Scan réseau impossible : {exc}")
    items: list[str] = []
    for host in result.hosts[:limit]:
        ports = ", ".join(str(port) for port in host.open_ports) or "aucun port ouvert"
        known = (
            f"déjà connu ({host.known_in} : {host.known_label})"
            if host.known_in
            else "nouveau"
        )
        items.append(
            f"{host.ip_address} | {host.suggested_name} | type pressenti "
            f"{host.suggested_type} | ports {ports} | MAC {host.mac_address or '—'} | {known}"
        )
    if len(result.hosts) > limit:
        items.append(f"… {len(result.hosts) - limit} autre(s) hôte(s) non affiché(s).")
    note = (
        f"{result.scanned_addresses} adresse(s) balayée(s) en "
        f"{result.duration_seconds} s, {result.new_hosts} nouveau(x) hôte(s). "
        "Aucune écriture en base : l'ajout se fait depuis Infrastructure → Découverte "
        "ou avec la permission infrastructure.create."
    )
    return _result("network_discovery", items, note=note)


def commercial_overview(db: Session, actor: User) -> dict[str, Any]:
    stats = statistics_service.get_commercial_overview(db)
    items = [
        f"Période analysée : {stats.start:%d/%m/%Y} → {stats.end:%d/%m/%Y}.",
        "Devis (indicateurs séparés) :",
        *[
            f"- {kpi.label} : {kpi.value} {kpi.unit or ''}".strip()
            for kpi in stats.quote_kpis
        ],
        "Bons de commande (indicateurs séparés) :",
        *[
            f"- {kpi.label} : {kpi.value} {kpi.unit or ''}".strip()
            for kpi in stats.order_kpis
        ],
    ]
    without_engagement = [
        document
        for document in stats.documents
        if document.kind == "purchase_order" and not document.engagement_number
    ]
    for document in without_engagement[:8]:
        items.append(
            f"Sans engagement : {document.reference} | {document.supplier} | "
            f"{document.amount_ttc if document.amount_ttc is not None else '—'} EUR TTC"
        )
    today = date.today()
    late = [
        document
        for document in stats.documents
        if document.kind == "purchase_order"
        and document.due_date is not None
        and document.due_date < today
        and document.status not in {"delivered", "cancelled"}
    ]
    for document in late[:8]:
        items.append(
            f"Livraison en retard : {document.reference} | {document.supplier} | "
            f"prévue le {document.due_date:%d/%m/%Y} | statut {document.status}"
        )
    for document in stats.documents[:10]:
        label = "Devis" if document.kind == "quote" else "Bon de commande"
        items.append(
            f"{label} {document.reference} | {document.supplier} | {document.status} | "
            f"{document.amount_ttc if document.amount_ttc is not None else '—'} EUR TTC | "
            f"engagement {document.engagement_number or '—'}"
        )
    if len(stats.documents) > 10:
        items.append(f"… {len(stats.documents) - 10} autre(s) document(s).")
    return _result("commercial_overview", items)


def daily_briefing(db: Session, actor: User) -> dict[str, Any]:
    items: list[str] = []
    checks = scheduler_service.checks_snapshot(db)
    items.append(
        f"Contrôles : {checks['up']} OK, {len(checks['down'])} en échec, "
        f"{checks['unknown']} inconnu(s) sur {checks['total']}."
    )
    for failure in checks["down"][:8]:
        items.append(
            f"Échec {failure['infrastructure'] or 'équipement'} "
            f"[{failure['type']}] : {failure['message'] or '—'}"
        )
    backup = backup_service.status(db)
    if backup.last_backup_at:
        items.append(
            f"Sauvegarde SI PILOT : {backup.last_backup_name} "
            f"({round((backup.last_backup_size or 0) / (1024 * 1024), 1)} Mo), "
            f"le {backup.last_backup_at:%d/%m/%Y %H:%M}."
        )
    else:
        items.append("Sauvegarde SI PILOT : aucune archive enregistrée.")
    runs = scheduler_service.list_runs(db, limit=20)
    for job, label in (
        ("veeam", "Veeam"),
        ("backup", "Sauvegarde"),
        ("report", "Rapport mensuel"),
    ):
        latest = next((run for run in runs if run.job == job), None)
        if latest:
            items.append(
                f"{label} : {latest.status} — {latest.summary or 'sans détail'} "
                f"({latest.started_at:%d/%m/%Y %H:%M})."
            )
    alerts = dashboard_service.get_alerts(db).items[:8]
    for alert in alerts:
        items.append(f"Alerte [{alert.severity}] {alert.title} — {alert.detail}")
    if not alerts:
        items.append("Aucune alerte du tableau de bord.")
    return _result("daily_briefing", items)


def monthly_report_summary(db: Session, actor: User) -> dict[str, Any]:
    today = date.today()
    previous_end = today.replace(day=1) - timedelta(days=1)
    start = previous_end.replace(day=1)
    overview = statistics_service.get_overview(
        db, start=start, end=previous_end, granularity="week"
    )
    items = [
        f"Période : {start:%d/%m/%Y} → {previous_end:%d/%m/%Y}.",
        *[
            f"{kpi.label} : {kpi.value} {kpi.unit or ''}".strip()
            for kpi in overview.kpis
        ],
    ]
    for point in overview.ticket_periods:
        items.append(
            f"{point.label} : {point.created} ticket(s) créé(s), "
            f"{point.resolved} résolu(s), {point.closed} clos."
        )
    if overview.budget is not None:
        items.append(
            f"Budget {overview.budget.year} : voté {overview.budget.voted}, "
            f"engagé {overview.budget.committed}, facturé {overview.budget.invoiced}, "
            f"disponible {overview.budget.available}."
        )
    return _result("monthly_report_summary", items)


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


def stock_overview(db: Session, actor: User, limit: int = 20) -> dict[str, Any]:
    if not has_permission(actor, "stock.read"):
        return _result("stock_overview", [], note="Permission stock requise.")
    rows = db.scalars(
        select(StockItem)
        .where(
            StockItem.status == "active",
            StockItem.min_quantity > 0,
            StockItem.quantity <= StockItem.min_quantity,
        )
        .order_by(StockItem.quantity.asc(), StockItem.name.asc())
        .limit(limit)
    ).all()
    items = [
        f"{row.reference} — {row.name} : {row.quantity} {row.unit} "
        f"(seuil {row.min_quantity})"
        + (" · rupture" if row.quantity <= 0 else "")
        for row in rows
    ]
    return _result("stock_overview", items)


def budget_overview(db: Session, actor: User, limit: int = 10) -> dict[str, Any]:
    if not has_permission(actor, "budget.read"):
        return _result("budget_overview", [], note="Permission budget requise.")
    budgets = budget_service.list_budgets(db)[:limit]
    items = [
        f"Budget {budget.year} ({budget.name}) [{budget.status}] : "
        f"prévu {budget.planned_total or 0:.0f} €, voté {budget.voted_total or 0:.0f} €, "
        f"engagé {budget.committed_total:.0f} €, facturé {budget.invoiced_total:.0f} €, "
        f"disponible {budget.available_total:.0f} €"
        for budget in budgets
    ]
    return _result("budget_overview", items)


def projects_at_risk(db: Session, actor: User, limit: int = 20) -> dict[str, Any]:
    if not has_permission(actor, "projects.read"):
        return _result("projects_at_risk", [], note="Permission projets requise.")
    today = date.today()
    rows = db.scalars(
        select(Project)
        .where(
            Project.status.in_(("planned", "in_progress", "on_hold")),
            or_(
                Project.due_date.is_not(None) & (Project.due_date < today),
                Project.status == "on_hold",
            ),
        )
        .order_by(Project.due_date.asc().nullslast())
        .limit(limit)
    ).all()
    items = [
        f"{project.code} — {project.name} : statut {project.status}, "
        f"échéance {_iso(project.due_date) if project.due_date else 'non définie'}, "
        f"avancement {project.progress_percent}%"
        for project in rows
    ]
    return _result("projects_at_risk", items)


def data_quality_overview(db: Session, actor: User) -> dict[str, Any]:
    overview = data_quality_service.get_overview(db, actor)
    items = [
        f"{section.label} : {section.total} anomalie(s), dont {section.critical} critique(s)"
        for section in overview.sections
        if section.total > 0
    ]
    note = f"Total {overview.total} anomalie(s), dont {overview.critical} critique(s)."
    return _result("data_quality_overview", items, note=note)


def rgpd_overview(db: Session, actor: User) -> dict[str, Any]:
    if not has_permission(actor, "rgpd.read"):
        return _result("rgpd_overview", [], note="Permission RGPD requise.")
    overview = rgpd_service.overview(db)
    items = [
        f"Traitements : {overview.processing_total} au total, "
        f"{overview.processing_active} actifs, {overview.collections_total} collecte(s) active(s)",
        f"Revues à venir sous 30 jours : {overview.reviews_due}",
        f"Demandes DPO ouvertes : {overview.open_requests}",
        f"Demandes de droits ouvertes : {overview.open_rights}",
        f"Violations ouvertes : {overview.open_breaches}",
    ]
    for deadline in overview.deadlines[:10]:
        items.append(
            f"Échéance {deadline.due_date} · {deadline.label} · statut {deadline.status}"
        )
    activities = db.scalars(
        select(ProcessingActivity)
        .where(ProcessingActivity.status == "active")
        .order_by(ProcessingActivity.next_review_at.asc().nullslast())
        .limit(20)
    ).all()
    sources: list[dict[str, str | None]] = []
    for activity in activities:
        missing = []
        if not activity.purpose:
            missing.append("finalité")
        if not activity.legal_basis:
            missing.append("base légale")
        if not activity.retention_period:
            missing.append("durée de conservation")
        review = (
            f"revue {activity.next_review_at}"
            if activity.next_review_at
            else "revue non planifiée"
        )
        items.append(
            f"{activity.reference} — {activity.name} : {review}"
            + (f" · à compléter : {', '.join(missing)}" if missing else "")
        )
        sources.append(
            {
                "kind": "rgpd_processing",
                "id": str(activity.id),
                "title": f"{activity.reference} — {activity.name}",
                "subtitle": "Traitement RGPD",
                "link": "/rgpd?tab=traitements",
                "excerpt": (activity.purpose or "")[:220] or None,
            }
        )
    return _result("rgpd_overview", items, sources=sources)


META_SEARCH_TERMS = {
    "documentation",
    "document",
    "documents",
    "recherche",
    "rechercher",
    "cherche",
    "chercher",
    "trouve",
    "trouver",
    "cite",
    "citer",
    "source",
    "sources",
}


def search_documents(
    db: Session,
    actor: User,
    query: str | None = None,
    limit: int = 20,
) -> dict[str, Any]:
    if not has_permission(actor, "documents.read"):
        return _result("search_documents", [], note="Permission documentation requise.")
    statement = select(Document).where(Document.archived_at.is_(None))
    if query:
        terms = [
            term
            for term in query.split()
            if len(term) > 1 and term.lower() not in META_SEARCH_TERMS
        ]
        if not terms:
            terms = [query]
        conditions = []
        for term in terms[:8]:
            pattern = f"%{term}%"
            conditions.append(
                or_(
                    Document.title.ilike(pattern),
                    Document.description.ilike(pattern),
                    Document.doc_type.ilike(pattern),
                    Document.tags.any(Tag.name.ilike(pattern)),
                )
            )
        statement = statement.where(or_(*conditions))
    rows = db.scalars(
        statement.order_by(Document.updated_at.desc()).limit(limit)
    ).all()
    items: list[str] = []
    sources: list[dict[str, str | None]] = []
    for row in rows:
        category = row.category.name if row.category else "Sans catégorie"
        current = next((version for version in row.versions if version.is_current), None)
        snippet = " ".join((row.description or "").split())[:260]
        items.append(
            f"{row.title} — {category} — mis à jour le {_iso(row.updated_at)}"
            + (f" · version {current.version_number}" if current else " · sans version")
            + (f" · {snippet}" if snippet else "")
        )
        sources.append(
            {
                "kind": "document",
                "id": str(row.id),
                "title": row.title,
                "subtitle": category,
                "link": f"/documentation?document={row.id}",
                "excerpt": snippet or None,
            }
        )
    return _result("search_documents", items, sources=sources)


def document_consistency(db: Session, actor: User) -> dict[str, Any]:
    overview = data_quality_service.get_overview(db, actor)
    sections = [
        section
        for section in overview.sections
        if section.key.startswith("document")
    ]
    items = [
        f"{section.label} : {section.total} anomalie(s), dont {section.critical} critique(s)"
        for section in sections
        if section.total > 0
    ]
    sources = [
        {
            "kind": "data_quality",
            "id": section.key,
            "title": section.label,
            "subtitle": "Qualité documentaire",
            "link": "/qualite-donnees",
            "excerpt": section.description,
        }
        for section in sections
        if section.total > 0
    ]
    note = (
        f"Total {sum(section.total for section in sections)} anomalie(s) documentaire(s)."
    )
    return _result("document_consistency", items, note=note, sources=sources)


def procedure_sources(db: Session, actor: User) -> dict[str, Any]:
    if not has_permission(actor, "tickets.read"):
        return _result("procedure_sources", [], note="Permission demandes requise.")
    since = datetime.now(UTC) - timedelta(days=365)
    tickets = db.scalars(
        select(Ticket)
        .join(TicketStatus)
        .where(
            TicketStatus.code.in_(("resolved", "closed")),
            Ticket.updated_at >= since,
        )
        .order_by(Ticket.updated_at.desc())
        .limit(15)
    ).all()
    interventions = db.scalars(
        select(Intervention)
        .where(
            Intervention.status == "done",
            Intervention.ended_at.is_not(None),
            Intervention.ended_at >= since,
        )
        .order_by(Intervention.ended_at.desc())
        .limit(15)
    ).all()
    items: list[str] = []
    sources: list[dict[str, str | None]] = []
    for ticket in tickets:
        text = " ".join((ticket.description or "").split())[:180]
        items.append(f"Ticket {ticket.reference} — {ticket.subject}" + (f" · {text}" if text else ""))
        sources.append(
            {
                "kind": "ticket",
                "id": str(ticket.id),
                "title": f"{ticket.reference} — {ticket.subject}",
                "subtitle": "Demande résolue",
                "link": "/demandes",
                "excerpt": text or None,
            }
        )
    for intervention in interventions:
        text = " ".join(
            (intervention.report or intervention.description or "").split()
        )[:180]
        items.append(
            f"Intervention {intervention.reference} — {intervention.title}"
            + (f" · {text}" if text else "")
        )
        sources.append(
            {
                "kind": "intervention",
                "id": str(intervention.id),
                "title": f"{intervention.reference} — {intervention.title}",
                "subtitle": "Intervention terminée",
                "link": "/demandes",
                "excerpt": text or None,
            }
        )
    return _result("procedure_sources", items, sources=sources)


def day_overview(db: Session, actor: User) -> dict[str, Any]:
    if not has_permission(actor, "dashboard.read"):
        return _result("day_overview", [], note="Permission tableau de bord requise.")
    plan = dashboard_today_service.get_day_plan(db, actor)
    items = [
        f"Réunions : {plan.summary.meetings} · interventions : "
        f"{plan.summary.interventions} · réservations : {plan.summary.reservations}",
        f"Déplacements : {plan.summary.travels} · temps occupé : "
        f"{plan.summary.busy_minutes} min · temps libre : {plan.summary.free_minutes} min",
    ]
    for item in plan.items[:30]:
        timing = "Journée"
        if item.start_at:
            timing = item.start_at.astimezone().strftime("%H:%M")
            if item.end_at:
                timing += f"-{item.end_at.astimezone().strftime('%H:%M')}"
        detail = f" — {item.detail}" if item.detail else ""
        location = f" · {item.location}" if item.location else ""
        travel = " · déplacement" if item.travel else ""
        items.append(f"{timing} · {item.title}{detail}{location}{travel}")
    for suggestion in plan.suggestions:
        items.append(f"Vigilance : {suggestion}")
    return _result("day_overview", items)


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
    "commercial_overview": commercial_overview,
    "network_shares_status": network_shares_status,
    "security_incidents": security_incidents,
    "certificates_expiring": certificates_expiring,
    "infrastructure_equipment": infrastructure_equipment,
    "agent_lookup": agent_lookup,
    "onboarding_briefing": onboarding_briefing,
    "veeam_backup_status": veeam_backup_status,
    "network_discovery": network_discovery,
    "daily_briefing": daily_briefing,
    "monthly_report_summary": monthly_report_summary,
    "recent_activity": recent_activity,
    "stock_overview": stock_overview,
    "budget_overview": budget_overview,
    "projects_at_risk": projects_at_risk,
    "data_quality_overview": data_quality_overview,
    "rgpd_overview": rgpd_overview,
    "search_documents": search_documents,
    "document_consistency": document_consistency,
    "procedure_sources": procedure_sources,
    "day_overview": day_overview,
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
    if any(
        term in text
        for term in (
            "devis",
            "bon de commande",
            "bons de commande",
            "commande fournisseur",
            "achat",
            "achats",
            "engagement",
        )
    ):
        add("commercial_overview")
    if any(term in text for term in ("partage", "espace libre", "volume", "réseau", "reseau")):
        add("network_shares_status")
    if any(term in text for term in ("incident", "sécurité", "securite", "cyber", "vulnérab")):
        add("security_incidents")
    if any(term in text for term in ("certificat", "tls", "ssl")):
        add("certificates_expiring")
    if any(term in text for term in ("serveur", "switch", "infrastructure", " vm", "baie", "routeur", "firewall")):
        add("infrastructure_equipment", query=query)
    if any(term in text for term in ("arrivée", "arrivee", "départ", "depart", "onboarding", "offboarding", "intégration", "integration", "dossier", "checklist")):
        add("onboarding_briefing")
    if any(term in text for term in ("sauvegarde", "veeam", "backup", "restauration")) and not any(
        term in text for term in ("documentation", "document", "procédure", "procedure")
    ):
        add("veeam_backup_status")
    if any(
        term in text
        for term in (
            "briefing",
            "ma journée",
            "ma journee",
            "du jour",
            "point du jour",
            "état général",
            "etat general",
            "quoi de neuf",
        )
    ):
        add("daily_briefing")
    if any(
        term in text
        for term in (
            "bilan mensuel",
            "rapport mensuel",
            "synthèse mensuelle",
            "synthese mensuelle",
            "mois précédent",
            "mois precedent",
        )
    ):
        add("monthly_report_summary")
    if any(
        term in text
        for term in (
            "scan",
            "scanner",
            "balayage",
            "découverte réseau",
            "decouverte reseau",
            "plage ip",
            "plage d'adresses",
            "cidr",
        )
    ) or (
        network_scan_service.extract_cidr(query)
        and any(term in text for term in ("réseau", "reseau", "adresse ip", "hôte", "hote"))
    ):
        add("network_discovery", query=query)
    if any(term in text for term in ("qui est", "qui utilise", "utilisateur", "agent", "affecté", "affecte", "annuaire")):
        add("agent_lookup", query=query)
    if any(term in text for term in ("récent", "recent", "changement", "activité", "activite", "audit", "dernier")):
        add("recent_activity")
    if any(term in text for term in ("bilan", "vue d'ensemble", "état du parc", "etat du parc", "combien de poste", "statistique", "synthèse", "synthese")):
        add("fleet_overview")
    if query and any(term in text for term in ("poste", "machine", "équipement", "equipement", "inventaire", "série", "serie", "hostname")) and not any(
        existing[0] in {"assets_broken", "assets_renewal", "assets_warranty"}
        for existing in calls
    ):
        add("search_assets", query=query)
    if query and any(term in text for term in ("ticket", "demande")) and not any(
        existing[0] in {"tickets_open", "tickets_overdue"} for existing in calls
    ):
        add("search_tickets", query=query)
    if any(term in text for term in ("stock", "seuil", "consommable", "rupture", "article")):
        add("stock_overview")
    if any(term in text for term in ("budget", "engagé", "engage", "factur", "disponible")):
        add("budget_overview")
    if any(term in text for term in ("projet", "jalon", "risque projet")):
        add("projects_at_risk")
    if any(
        term in text
        for term in (
            "qualité",
            "qualite",
            "anomalie",
            "doublon",
            "donnée",
            "donnee",
            "contrôle",
            "controle",
        )
    ):
        add("data_quality_overview")
    if any(
        term in text
        for term in (
            "rgpd",
            "registre",
            "traitement",
            "dpo",
            "données personnelles",
            "donnees personnelles",
            "analyse d'impact",
            "durée de conservation",
            "duree de conservation",
        )
    ):
        add("rgpd_overview")
    if any(
        term in text
        for term in (
            "cohérence documentaire",
            "coherence documentaire",
            "documents obsolètes",
            "documents obsoletes",
            "version manquante",
            "versions manquantes",
            "doublon document",
            "doublons document",
        )
    ):
        add("document_consistency")
    if any(
        term in text
        for term in (
            "documentation",
            "document",
            "documents",
            "procédure",
            "procedure",
            "guide",
            "fiche technique",
            "où est",
            "ou est",
            "comment faire",
        )
    ):
        add("search_documents", query=query)
    if any(
        term in text
        for term in (
            "à partir des tickets",
            "a partir des tickets",
            "interventions passées",
            "interventions passees",
            "génère une procédure",
            "genere une procedure",
            "rédige une procédure",
            "redige une procedure",
            "créer une procédure",
            "creer une procedure",
        )
    ) or (
        any(term in text for term in ("procédure", "procedure"))
        and any(term in text for term in ("ticket", "intervention"))
    ):
        add("procedure_sources")
    if any(
        term in text
        for term in (
            "journée",
            "journee",
            "aujourd'hui",
            "aujourd hui",
            "agenda",
            "planning",
            "emploi du temps",
            "réunions",
            "reunions",
            "déplacements",
            "deplacements",
        )
    ):
        add("day_overview")
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
        for source in result.get("sources", []):
            lines.append(
                f"- Source {source.get('kind')} : {source.get('title')} "
                f"({source.get('link') or 'sans lien'})"
            )
        blocks.append("\n".join(lines))
    return "\n\n".join(blocks)

