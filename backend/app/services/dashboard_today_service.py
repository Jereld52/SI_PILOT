from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from app.models.assets import License
from app.models.budget import Budget
from app.models.calendar import ActionItem
from app.models.commercial import CommercialDocument
from app.models.contracts import Contract
from app.models.infrastructure import InfraEquipment
from app.models.projects import Project
from app.models.rgpd import DataBreach, DpoRequest, RightsRequest
from app.models.security import Certificate, SecurityIncident
from app.models.stock import StockItem
from app.models.tickets import Intervention, Ticket, TicketPriority, TicketStatus
from app.schemas.dashboard import DashboardToday, TodayItem, TodaySection
from app.services import backup_service, budget_service, onboarding_service, scheduler_service
from sqlalchemy import select
from sqlalchemy.orm import Session

_SEVERITY_RANK = {"danger": 0, "warning": 1, "info": 2, "success": 3}


def _severity_from_days(days: int) -> str:
    if days <= 7:
        return "danger"
    if days <= 30:
        return "warning"
    return "info"


def _item(
    *,
    item_id: str,
    title: str,
    detail: str | None,
    severity: str,
    href: str,
    action_label: str,
    due_date: date | None = None,
    permission: str | None = None,
    module_key: str | None = None,
) -> TodayItem:
    return TodayItem(
        id=item_id,
        title=title,
        detail=detail,
        severity=severity,
        href=href,
        action_label=action_label,
        due_date=due_date,
        permission=permission,
        module_key=module_key,
    )


def _clean(items: list[TodayItem], limit: int = 12) -> list[TodayItem]:
    unique: dict[str, TodayItem] = {}
    for item in items:
        unique.setdefault(item.title, item)
    ordered = sorted(
        unique.values(),
        key=lambda item: (
            _SEVERITY_RANK.get(item.severity, 9),
            item.due_date or date.max,
            item.title.lower(),
        ),
    )
    return ordered[:limit]


def _ticket_link(ticket: Ticket) -> str:
    return f"/demandes?q={ticket.reference}"


def _support_items(db: Session, now: datetime) -> list[TodayItem]:
    items: list[TodayItem] = []
    open_statuses = select(TicketStatus.id).where(TicketStatus.is_closed.is_(False))

    overdue = db.scalars(
        select(Ticket)
        .where(
            Ticket.due_at.is_not(None),
            Ticket.due_at < now,
            Ticket.status_id.in_(open_statuses),
        )
        .order_by(Ticket.due_at.asc())
        .limit(8)
    ).all()
    for ticket in overdue:
        items.append(
            _item(
                item_id=f"ticket-overdue-{ticket.id}",
                title=f"Demande en retard · {ticket.reference}",
                detail=f"{ticket.subject} — échéance dépassée.",
                severity="danger",
                href=_ticket_link(ticket),
                action_label="Traiter",
                due_date=ticket.due_at.date() if ticket.due_at else None,
                permission="tickets.read",
                module_key="tickets",
            )
        )

    unassigned = db.scalars(
        select(Ticket)
        .where(
            Ticket.assignee_user_id.is_(None),
            Ticket.status_id.in_(open_statuses),
            Ticket.priority.has(TicketPriority.level >= 3),
        )
        .order_by(Ticket.opened_at.asc())
        .limit(6)
    ).all()
    for ticket in unassigned:
        items.append(
            _item(
                item_id=f"ticket-unassigned-{ticket.id}",
                title=f"Demande prioritaire non assignée · {ticket.reference}",
                detail=f"{ticket.subject} — priorité {ticket.priority.name.lower()}.",
                severity="warning",
                href=_ticket_link(ticket),
                action_label="Assigner",
                due_date=ticket.due_at.date() if ticket.due_at else None,
                permission="tickets.read",
                module_key="tickets",
            )
        )

    interventions = db.scalars(
        select(Intervention)
        .where(
            Intervention.status.in_(("planned", "in_progress")),
            Intervention.scheduled_at.is_not(None),
            Intervention.scheduled_at <= now + timedelta(days=1),
        )
        .order_by(Intervention.scheduled_at.asc())
        .limit(6)
    ).all()
    for intervention in interventions:
        scheduled = intervention.scheduled_at
        late = scheduled is not None and scheduled < now
        items.append(
            _item(
                item_id=f"intervention-{intervention.id}",
                title=(
                    f"Intervention en retard · {intervention.reference}"
                    if late
                    else f"Intervention à traiter · {intervention.reference}"
                ),
                detail=intervention.title,
                severity="danger" if late else "warning",
                href="/demandes?tab=interventions",
                action_label="Ouvrir",
                due_date=scheduled.date() if scheduled else None,
                permission="interventions.read",
                module_key="tickets",
            )
        )
    return items


def _purchase_items(db: Session, today: date, horizon: date) -> list[TodayItem]:
    items: list[TodayItem] = []

    late_orders = db.scalars(
        select(CommercialDocument)
        .where(
            CommercialDocument.kind == "purchase_order",
            CommercialDocument.expected_date.is_not(None),
            CommercialDocument.expected_date < today,
            CommercialDocument.status.notin_(("delivered", "cancelled")),
        )
        .order_by(CommercialDocument.expected_date.asc())
        .limit(8)
    ).unique().all()
    for order in late_orders:
        items.append(
            _item(
                item_id=f"purchase-late-{order.id}",
                title=f"Livraison en retard · {order.reference}",
                detail=f"{order.object} — {order.supplier.name if order.supplier else 'fournisseur'}.",
                severity="danger",
                href="/bons-commande",
                action_label="Relancer",
                due_date=order.expected_date,
                permission="suppliers.read",
                module_key="suppliers",
            )
        )

    without_engagement = db.scalars(
        select(CommercialDocument)
        .where(
            CommercialDocument.kind == "purchase_order",
            CommercialDocument.engagement_number.is_(None),
            CommercialDocument.status != "cancelled",
        )
        .order_by(CommercialDocument.issue_date.desc())
        .limit(8)
    ).unique().all()
    for order in without_engagement:
        items.append(
            _item(
                item_id=f"purchase-engagement-{order.id}",
                title=f"Bon de commande sans engagement · {order.reference}",
                detail=f"{order.object} — numéro d'engagement à compléter.",
                severity="danger",
                href="/bons-commande",
                action_label="Compléter",
                due_date=order.expected_date,
                permission="suppliers.read",
                module_key="suppliers",
            )
        )

    accepted_quotes = db.scalars(
        select(CommercialDocument)
        .where(
            CommercialDocument.kind == "quote",
            CommercialDocument.status == "accepted",
        )
        .order_by(CommercialDocument.issue_date.asc())
        .limit(6)
    ).unique().all()
    for quote in accepted_quotes:
        items.append(
            _item(
                item_id=f"quote-convert-{quote.id}",
                title=f"Devis accepté à convertir · {quote.reference}",
                detail=f"{quote.object} — créer le bon de commande avec l'engagement.",
                severity="warning",
                href="/devis",
                action_label="Convertir",
                due_date=quote.valid_until,
                permission="suppliers.read",
                module_key="suppliers",
            )
        )

    old_quotes = db.scalars(
        select(CommercialDocument)
        .where(
            CommercialDocument.kind == "quote",
            CommercialDocument.status == "sent",
            CommercialDocument.issue_date <= today - timedelta(days=14),
        )
        .order_by(CommercialDocument.issue_date.asc())
        .limit(6)
    ).unique().all()
    for quote in old_quotes:
        items.append(
            _item(
                item_id=f"quote-relance-{quote.id}",
                title=f"Devis à relancer · {quote.reference}",
                detail=f"{quote.object} — envoyé depuis plus de 14 jours.",
                severity="warning",
                href="/devis",
                action_label="Relancer",
                due_date=quote.valid_until,
                permission="suppliers.read",
                module_key="suppliers",
            )
        )

    expired_contracts = db.scalars(
        select(Contract)
        .where(
            Contract.status.in_(("active", "expiring")),
            Contract.end_date.is_not(None),
            Contract.end_date < today,
        )
        .order_by(Contract.end_date.asc())
        .limit(6)
    ).unique().all()
    for contract in expired_contracts:
        items.append(
            _item(
                item_id=f"contract-expired-{contract.id}",
                title=f"Contrat expiré · {contract.reference}",
                detail=contract.object,
                severity="danger",
                href="/contrats",
                action_label="Traiter",
                due_date=contract.end_date,
                permission="contracts.read",
                module_key="contracts",
            )
        )

    expiring_contracts = db.scalars(
        select(Contract)
        .where(
            Contract.status.in_(("active", "expiring")),
            Contract.end_date.is_not(None),
            Contract.end_date >= today,
            Contract.end_date <= horizon,
        )
        .order_by(Contract.end_date.asc())
        .limit(8)
    ).unique().all()
    for contract in expiring_contracts:
        days = (contract.end_date - today).days if contract.end_date else 0
        items.append(
            _item(
                item_id=f"contract-expiring-{contract.id}",
                title=f"Contrat à échéance · {contract.reference}",
                detail=f"{contract.object} — dans {days} jour(s).",
                severity=_severity_from_days(days),
                href="/contrats",
                action_label="Renouveler",
                due_date=contract.end_date,
                permission="contracts.read",
                module_key="contracts",
            )
        )

    expiring_licenses = db.scalars(
        select(License)
        .where(
            License.is_active.is_(True),
            License.end_date.is_not(None),
            License.end_date >= today,
            License.end_date <= horizon,
        )
        .order_by(License.end_date.asc())
        .limit(6)
    ).all()
    for license_row in expiring_licenses:
        days = (license_row.end_date - today).days if license_row.end_date else 0
        items.append(
            _item(
                item_id=f"license-expiring-{license_row.id}",
                title=f"Licence à échéance · {license_row.name}",
                detail=f"{license_row.vendor or 'Éditeur'} — dans {days} jour(s).",
                severity=_severity_from_days(days),
                href="/fournisseurs",
                action_label="Renouveler",
                due_date=license_row.end_date,
                permission="suppliers.read",
                module_key="suppliers",
            )
        )
    return items


def _infrastructure_items(db: Session, today: date, horizon: date, now: datetime) -> list[TodayItem]:
    items: list[TodayItem] = []

    checks = scheduler_service.checks_snapshot(db)
    for failure in checks["down"][:8]:
        items.append(
            _item(
                item_id=f"check-down-{failure.get('infrastructure')}-{failure.get('type')}",
                title=f"Contrôle en échec · {failure.get('infrastructure') or 'équipement'}",
                detail=f"{failure.get('type')} — {failure.get('message') or 'aucun détail'}",
                severity="danger",
                href="/supervision",
                action_label="Diagnostiquer",
                permission="infrastructure.read",
                module_key="supervision",
            )
        )

    offline = db.scalars(
        select(InfraEquipment)
        .where(InfraEquipment.status == "offline")
        .order_by(InfraEquipment.name.asc())
        .limit(6)
    ).all()
    for equipment in offline:
        items.append(
            _item(
                item_id=f"infra-offline-{equipment.id}",
                title=f"Équipement hors ligne · {equipment.name}",
                detail=equipment.ip_address or equipment.role or "Infrastructure",
                severity="warning",
                href="/infrastructure",
                action_label="Vérifier",
                permission="infrastructure.read",
                module_key="infrastructure",
            )
        )

    incidents = db.scalars(
        select(SecurityIncident)
        .where(SecurityIncident.status != "closed")
        .order_by(SecurityIncident.detected_at.desc())
        .limit(8)
    ).unique().all()
    for incident in incidents:
        items.append(
            _item(
                item_id=f"security-{incident.id}",
                title=f"Incident de sécurité · {incident.reference}",
                detail=f"{incident.title} — gravité {incident.severity}.",
                severity="danger" if incident.severity in ("critical", "high") else "warning",
                href="/cybersecurite",
                action_label="Traiter",
                due_date=incident.detected_at.date() if incident.detected_at else None,
                permission="security.read",
                module_key="security",
            )
        )

    certificates = db.scalars(
        select(Certificate)
        .where(
            Certificate.status.in_(("active", "expiring")),
            Certificate.valid_to >= today,
            Certificate.valid_to <= horizon,
        )
        .order_by(Certificate.valid_to.asc())
        .limit(6)
    ).all()
    for certificate in certificates:
        days = (certificate.valid_to - today).days
        items.append(
            _item(
                item_id=f"certificate-{certificate.id}",
                title=f"Certificat à renouveler · {certificate.common_name}",
                detail=f"Expire dans {days} jour(s).",
                severity=_severity_from_days(days),
                href="/cybersecurite",
                action_label="Renouveler",
                due_date=certificate.valid_to,
                permission="security.read",
                module_key="security",
            )
        )

    backup = backup_service.status(db)
    if backup.last_backup_at is None:
        items.append(
            _item(
                item_id="backup-missing",
                title="Aucune sauvegarde SI PILOT",
                detail="Aucune archive de sauvegarde n'est enregistrée.",
                severity="danger",
                href="/admin/backup",
                action_label="Sauvegarder",
                permission="admin.backup.manage",
                module_key="backup",
            )
        )
    elif backup.last_backup_at < now - timedelta(hours=48):
        items.append(
            _item(
                item_id="backup-old",
                title="Sauvegarde SI PILOT ancienne",
                detail=f"Dernière archive le {backup.last_backup_at:%d/%m/%Y %H:%M}.",
                severity="warning",
                href="/admin/backup",
                action_label="Sauvegarder",
                due_date=backup.last_backup_at.date(),
                permission="admin.backup.manage",
                module_key="backup",
            )
        )
    return items


def _organisation_items(db: Session) -> list[TodayItem]:
    items: list[TodayItem] = []

    briefing = onboarding_service.briefing(db)
    severity_map = {
        "critical": "danger",
        "high": "danger",
        "medium": "warning",
        "low": "info",
        "info": "info",
    }
    for alert in briefing.items[:8]:
        items.append(
            _item(
                item_id=f"onboarding-{alert.run_id or alert.agent_id or alert.title}",
                title=alert.title,
                detail=alert.detail,
                severity=severity_map.get(alert.severity, "info"),
                href=alert.link or "/arrivees-departs",
                action_label="Ouvrir",
                permission="agents.read",
                module_key="onboarding",
            )
        )

    stock_rows = db.scalars(
        select(StockItem).where(StockItem.status == "active")
    ).all()
    for stock in stock_rows:
        if not stock.is_low and not stock.is_out:
            continue
        items.append(
            _item(
                item_id=f"stock-{stock.id}",
                title=(
                    f"Stock épuisé · {stock.name}"
                    if stock.is_out
                    else f"Stock sous le seuil · {stock.name}"
                ),
                detail=f"{stock.quantity} unité(s) — seuil {stock.min_quantity}.",
                severity="danger" if stock.is_out else "warning",
                href="/stock",
                action_label="Réapprovisionner",
                permission="stock.read",
                module_key="stock",
            )
        )
    return items


def _pilotage_items(db: Session, today: date) -> list[TodayItem]:
    items: list[TodayItem] = []

    actions = db.scalars(
        select(ActionItem)
        .where(
            ActionItem.status.in_(("todo", "in_progress", "blocked")),
            ActionItem.due_date.is_not(None),
            ActionItem.due_date < datetime.now(UTC),
        )
        .order_by(ActionItem.due_date.asc())
        .limit(8)
    ).unique().all()
    for action in actions:
        items.append(
            _item(
                item_id=f"action-{action.id}",
                title=f"Action en retard · {action.title}",
                detail=action.description,
                severity="warning",
                href="/calendrier?tab=actions",
                action_label="Traiter",
                due_date=action.due_date.date() if action.due_date else None,
                permission="actions.read",
                module_key="calendar",
            )
        )

    projects = db.scalars(
        select(Project)
        .where(
            Project.status.in_(("planned", "in_progress", "on_hold")),
            Project.due_date.is_not(None),
            Project.due_date < today,
        )
        .order_by(Project.due_date.asc())
        .limit(6)
    ).unique().all()
    for project in projects:
        items.append(
            _item(
                item_id=f"project-{project.id}",
                title=f"Projet en retard · {project.code}",
                detail=project.name,
                severity="warning",
                href="/projets",
                action_label="Ouvrir",
                due_date=project.due_date,
                permission="projects.read",
                module_key="projects",
            )
        )

    budget = db.scalar(select(Budget).where(Budget.year == today.year))
    if budget is not None:
        detail = budget_service.get_budget_detail(db, budget.id)
        if detail.available_total < 0:
            items.append(
                _item(
                    item_id=f"budget-{budget.id}",
                    title=f"Budget {budget.year} dépassé",
                    detail=f"Disponible négatif : {detail.available_total:.2f} EUR.",
                    severity="danger",
                    href="/budget",
                    action_label="Analyser",
                    permission="budget.read",
                    module_key="budget",
                )
            )

    breaches = db.scalars(
        select(DataBreach)
        .where(DataBreach.status == "open")
        .order_by(DataBreach.discovered_at.asc())
        .limit(4)
    ).all()
    for breach in breaches:
        items.append(
            _item(
                item_id=f"breach-{breach.id}",
                title=f"Violation RGPD ouverte · {breach.reference}",
                detail=breach.description or "Violation de données à traiter.",
                severity="danger",
                href="/rgpd",
                action_label="Traiter",
                due_date=breach.discovered_at.date() if breach.discovered_at else None,
                permission="rgpd.read",
                module_key="rgpd",
            )
        )

    open_requests = db.scalars(
        select(DpoRequest)
        .where(DpoRequest.status.in_(("new", "in_progress")))
        .limit(4)
    ).unique().all()
    for request in open_requests:
        items.append(
            _item(
                item_id=f"dpo-{request.id}",
                title=f"Demande DPO · {request.reference}",
                detail=request.subject,
                severity="warning",
                href="/rgpd",
                action_label="Traiter",
                due_date=request.due_date,
                permission="rgpd.read",
                module_key="rgpd",
            )
        )

    rights = db.scalars(
        select(RightsRequest)
        .where(RightsRequest.status.in_(("new", "in_progress")))
        .limit(4)
    ).unique().all()
    for rights_request in rights:
        items.append(
            _item(
                item_id=f"rights-{rights_request.id}",
                title=f"Demande de droits · {rights_request.reference}",
                detail=f"Type : {rights_request.request_type}.",
                severity="warning",
                href="/rgpd",
                action_label="Traiter",
                due_date=rights_request.due_date,
                permission="rgpd.read",
                module_key="rgpd",
            )
        )
    return items


def get_today(db: Session) -> DashboardToday:
    now = datetime.now(UTC)
    today = date.today()
    horizon = today + timedelta(days=30)

    sections = [
        TodaySection(
            key="support",
            label="Support & demandes",
            items=_clean(_support_items(db, now)),
        ),
        TodaySection(
            key="achats",
            label="Achats & contrats",
            items=_clean(_purchase_items(db, today, horizon)),
        ),
        TodaySection(
            key="infrastructure",
            label="Infrastructure & sécurité",
            items=_clean(_infrastructure_items(db, today, horizon, now)),
        ),
        TodaySection(
            key="organisation",
            label="Agents & organisation",
            items=_clean(_organisation_items(db)),
        ),
        TodaySection(
            key="pilotage",
            label="Pilotage & conformité",
            items=_clean(_pilotage_items(db, today)),
        ),
    ]
    sections = [section for section in sections if section.items]
    total = sum(len(section.items) for section in sections)
    urgent = sum(
        1
        for section in sections
        for item in section.items
        if item.severity == "danger"
    )
    return DashboardToday(
        generated_at=now,
        total=total,
        urgent=urgent,
        sections=sections,
    )
