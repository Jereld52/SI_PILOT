from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta

from app.core.permissions import has_permission
from app.models.assets import License
from app.models.auth import User
from app.models.budget import Budget
from app.models.calendar import ActionItem, CalendarEvent
from app.models.commercial import CommercialDocument
from app.models.communication import Meeting
from app.models.contracts import Contract
from app.models.infrastructure import InfraEquipment
from app.models.projects import Project
from app.models.reservations import EquipmentReservation
from app.models.rgpd import DataBreach, DpoRequest, RightsRequest
from app.models.security import Certificate, SecurityIncident
from app.models.stock import StockItem
from app.models.tickets import Intervention, Ticket, TicketPriority, TicketStatus
from app.schemas.dashboard import (
    DashboardToday,
    DayPlan,
    DayPlanItem,
    DayPlanSummary,
    TodayItem,
    TodaySection,
)
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


def _person_name(person: object | None) -> str | None:
    if person is None:
        return None
    first = getattr(person, "first_name", "") or ""
    last = getattr(person, "last_name", "") or ""
    label = f"{first} {last}".strip()
    return label or None


def _is_virtual_location(location: str | None, visio_url: str | None) -> bool:
    if visio_url:
        return True
    if not location:
        return False
    lowered = location.lower()
    return any(
        term in lowered
        for term in ("visio", "teams", "zoom", "en ligne", "distanciel", "remote")
    )


def _utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _merge_intervals(
    intervals: list[tuple[datetime, datetime]],
    day_start: datetime,
    day_end: datetime,
) -> list[tuple[datetime, datetime]]:
    clipped = sorted(
        (max(start, day_start), min(end, day_end))
        for start, end in intervals
        if start < day_end and end > day_start
    )
    merged: list[tuple[datetime, datetime]] = []
    for start, end in clipped:
        if start >= end:
            continue
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    return merged


def _build_day_plan(db: Session, actor: User, now: datetime, today: date) -> DayPlan:
    day_start = datetime.combine(today, time.min, tzinfo=UTC)
    day_end = day_start + timedelta(days=1)
    items: list[DayPlanItem] = []

    if has_permission(actor, "meetings.read"):
        meetings = db.scalars(
            select(Meeting)
            .where(
                Meeting.status != "cancelled",
                Meeting.scheduled_at >= day_start,
                Meeting.scheduled_at < day_end,
            )
            .order_by(Meeting.scheduled_at.asc())
        ).all()
        for meeting in meetings:
            start = _utc(meeting.scheduled_at)
            if start is None:
                continue
            end = start + timedelta(minutes=meeting.duration_minutes or 60)
            location = (meeting.location or "").strip() or None
            virtual = _is_virtual_location(location, meeting.visio_url)
            detail_parts = [
                meeting.agenda[:180] if meeting.agenda else None,
                _person_name(meeting.organizer),
                "Visio" if meeting.visio_url and not location else None,
            ]
            items.append(
                DayPlanItem(
                    id=f"meeting-{meeting.id}",
                    kind="meeting",
                    title=f"Réunion — {meeting.title}",
                    detail=" · ".join(part for part in detail_parts if part) or None,
                    start_at=start,
                    end_at=end,
                    location=location or ("Visio" if meeting.visio_url else None),
                    travel=bool(location) and not virtual,
                    severity="info",
                    href="/communication/reunions",
                    action_label="Ouvrir",
                    permission="meetings.read",
                    module_key="meetings",
                )
            )

    if has_permission(actor, "interventions.read"):
        interventions = db.scalars(
            select(Intervention)
            .where(
                Intervention.status != "cancelled",
                Intervention.scheduled_at >= day_start,
                Intervention.scheduled_at < day_end,
            )
            .order_by(Intervention.scheduled_at.asc())
        ).all()
        for intervention in interventions:
            start_at = _utc(intervention.scheduled_at)
            if start_at is None:
                continue
            end = start_at + timedelta(minutes=intervention.duration_minutes or 60)
            location = (
                intervention.asset.location.name
                if intervention.asset and intervention.asset.location
                else None
            )
            detail_parts = [
                intervention.asset.name if intervention.asset else None,
                intervention.ticket.reference if intervention.ticket else None,
                _person_name(intervention.technician),
            ]
            items.append(
                DayPlanItem(
                    id=f"intervention-{intervention.id}",
                    kind="intervention",
                    title=f"Intervention — {intervention.title}",
                    detail=" · ".join(part for part in detail_parts if part) or None,
                    start_at=start_at,
                    end_at=end,
                    location=location,
                    travel=bool(location),
                    severity=(
                        "warning"
                        if intervention.status == "in_progress"
                        else "info"
                    ),
                    href="/demandes?tab=interventions",
                    action_label="Ouvrir",
                    permission="interventions.read",
                    module_key="tickets",
                )
            )

    if has_permission(actor, "reservations.read"):
        reservations = db.scalars(
            select(EquipmentReservation)
            .where(
                EquipmentReservation.status != "cancelled",
                EquipmentReservation.start_at < day_end,
                EquipmentReservation.end_at > day_start,
            )
            .order_by(EquipmentReservation.start_at.asc())
        ).unique().all()
        for reservation in reservations:
            start_at = _utc(reservation.start_at)
            end_at = _utc(reservation.end_at)
            if start_at is None or end_at is None:
                continue
            location = (
                reservation.equipment.location.name
                if reservation.equipment and reservation.equipment.location
                else None
            )
            items.append(
                DayPlanItem(
                    id=f"reservation-{reservation.id}",
                    kind="reservation",
                    title=f"Réservation — {reservation.equipment.name}",
                    detail=" · ".join(
                        part
                        for part in (
                            reservation.purpose,
                            reservation.requester_name,
                        )
                        if part
                    )
                    or None,
                    start_at=start_at,
                    end_at=end_at,
                    location=location,
                    travel=False,
                    severity="info",
                    href="/reservations",
                    action_label="Ouvrir",
                    permission="reservations.read",
                    module_key="reservations",
                )
            )

    if has_permission(actor, "calendar.read"):
        events = db.scalars(
            select(CalendarEvent)
            .where(
                CalendarEvent.status.not_in(("done", "cancelled")),
                CalendarEvent.start_at < day_end,
                (
                    (CalendarEvent.end_at.is_not(None))
                    & (CalendarEvent.end_at > day_start)
                )
                | (
                    (CalendarEvent.end_at.is_(None))
                    & (CalendarEvent.start_at >= day_start)
                ),
            )
            .order_by(CalendarEvent.start_at.asc())
        ).all()
        event_labels = {
            "maintenance": "Maintenance",
            "intervention": "Intervention",
            "deadline": "Échéance",
            "renewal": "Renouvellement",
            "audit": "Audit",
            "project": "Projet",
            "meeting": "Réunion",
            "action": "Action",
            "other": "Événement",
        }
        for event in events:
            start_at = _utc(event.start_at)
            if start_at is None:
                continue
            explicit_end = _utc(event.end_at)
            end = explicit_end or (
                day_end if event.all_day else start_at + timedelta(minutes=60)
            )
            location = (event.location or "").strip() or None
            travel = (
                bool(location)
                and event.event_type in ("meeting", "intervention", "other", "audit")
                and not _is_virtual_location(location, None)
            )
            items.append(
                DayPlanItem(
                    id=f"event-{event.id}",
                    kind="event",
                    title=f"{event_labels.get(event.event_type, 'Événement')} — {event.title}",
                    detail=event.description[:180] if event.description else None,
                    start_at=start_at,
                    end_at=end,
                    all_day=event.all_day,
                    location=location,
                    travel=travel,
                    severity="warning" if event.priority in ("high", "critical") else "info",
                    href="/calendrier",
                    action_label="Ouvrir",
                    permission="calendar.read",
                    module_key="calendar",
                )
            )

    if has_permission(actor, "actions.read"):
        actions = db.scalars(
            select(ActionItem)
            .where(
                ActionItem.status.in_(("todo", "in_progress", "blocked")),
                ActionItem.due_date.is_not(None),
                ActionItem.due_date < day_end,
            )
            .order_by(ActionItem.due_date.asc())
            .limit(20)
        ).all()
        for action in actions:
            due = _utc(action.due_date)
            overdue = due is not None and due < now
            items.append(
                DayPlanItem(
                    id=f"action-{action.id}",
                    kind="action",
                    title=f"Action — {action.title}",
                    detail=" · ".join(
                        part
                        for part in (
                            action.module,
                            "En retard" if overdue else None,
                        )
                        if part
                    )
                    or None,
                    start_at=due,
                    end_at=(
                        due + timedelta(minutes=30)
                        if due
                        else None
                    ),
                    severity=(
                        "danger"
                        if overdue
                        else "warning"
                        if action.priority in ("high", "critical")
                        else "info"
                    ),
                    href="/calendrier?tab=actions",
                    action_label="Traiter",
                    permission="actions.read",
                    module_key="calendar",
                )
            )

    if has_permission(actor, "tickets.read"):
        open_statuses = select(TicketStatus.id).where(TicketStatus.is_closed.is_(False))
        tickets = db.scalars(
            select(Ticket)
            .where(
                Ticket.status_id.in_(open_statuses),
                Ticket.due_at.is_not(None),
                Ticket.due_at < day_end,
            )
            .order_by(Ticket.due_at.asc())
            .limit(20)
        ).all()
        for ticket in tickets:
            due = _utc(ticket.due_at)
            overdue = due is not None and due < now
            items.append(
                DayPlanItem(
                    id=f"ticket-{ticket.id}",
                    kind="ticket",
                    title=f"Demande — {ticket.reference}",
                    detail=" · ".join(
                        part
                        for part in (
                            ticket.subject,
                            f"priorité {ticket.priority.name.lower()}"
                            if ticket.priority
                            else None,
                            "En retard" if overdue else None,
                        )
                        if part
                    )
                    or None,
                    start_at=due,
                    end_at=(
                        due + timedelta(minutes=30)
                        if due
                        else None
                    ),
                    severity="danger" if overdue else "warning",
                    href=f"/demandes?q={ticket.reference}",
                    action_label="Traiter",
                    permission="tickets.read",
                    module_key="tickets",
                )
            )

    items.sort(
        key=lambda item: (
            0 if item.all_day else 1,
            item.start_at or day_start,
            item.kind,
            item.title.lower(),
        )
    )
    timed_intervals = [
        (item.start_at, item.end_at)
        for item in items
        if item.start_at and item.end_at and not item.all_day
    ]
    merged = _merge_intervals(timed_intervals, day_start, day_end)
    busy_minutes = round(
        sum((end - start).total_seconds() for start, end in merged) / 60
    )
    free_minutes = max(0, 600 - busy_minutes)
    first_start = min((start for start, _ in timed_intervals), default=None)
    last_end = max((end for _, end in timed_intervals), default=None)
    conflicts: list[str] = []
    for index, (start, end) in enumerate(timed_intervals):
        for other_start, other_end in timed_intervals[index + 1 :]:
            if start < other_end and other_start < end:
                conflicts.append("Deux activités se chevauchent sur le créneau.")
                break
        if len(conflicts) >= 5:
            break
    travel_locations = sorted(
        {item.location for item in items if item.travel and item.location}
    )
    suggestions: list[str] = []
    if conflicts:
        suggestions.append(
            f"Résoudre {len(conflicts)} conflit(s) de planning avant la journée."
        )
    if travel_locations:
        suggestions.append(
            "Déplacements à prévoir : " + ", ".join(travel_locations[:4]) + "."
        )
    if free_minutes >= 120:
        suggestions.append(
            f"Un créneau libre de {free_minutes // 60}h{free_minutes % 60:02d} "
            "peut être réservé aux actions prioritaires."
        )
    overdue_count = sum(
        1 for item in items if item.severity == "danger" and item.kind in ("action", "ticket")
    )
    if overdue_count:
        suggestions.append(
            f"{overdue_count} action(s) ou demande(s) en retard à traiter en priorité."
        )
    if not any(item.kind in ("meeting", "intervention") for item in items):
        suggestions.append(
            "Aucun rendez-vous planifié : journée propice aux actions de fond."
        )
    summary = DayPlanSummary(
        meetings=sum(1 for item in items if item.kind == "meeting"),
        interventions=sum(1 for item in items if item.kind == "intervention"),
        reservations=sum(1 for item in items if item.kind == "reservation"),
        events=sum(1 for item in items if item.kind == "event"),
        actions=sum(1 for item in items if item.kind == "action"),
        tickets=sum(1 for item in items if item.kind == "ticket"),
        travels=len(travel_locations),
        busy_minutes=busy_minutes,
        free_minutes=free_minutes,
        conflicts=len(conflicts),
        first_start=first_start,
        last_end=last_end,
    )
    return DayPlan(
        date=today,
        items=items,
        summary=summary,
        suggestions=suggestions,
    )


def get_day_plan(
    db: Session, actor: User, *, day: date | None = None
) -> DayPlan:
    return _build_day_plan(
        db,
        actor,
        datetime.now(UTC),
        day or date.today(),
    )


_ICS_PRODID = "-//SI PILOT//Plan du jour//FR"


def _ics_escape(value: str) -> str:
    return (
        value.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
        .replace("\r", "\\n")
    )


def _ics_fold(line: str) -> str:
    chunks: list[str] = []
    current = ""
    size = 0
    for char in line:
        char_size = len(char.encode("utf-8"))
        limit = 75 if not chunks else 74
        if size + char_size > limit:
            chunks.append(current)
            current = char
            size = char_size
        else:
            current += char
            size += char_size
    chunks.append(current)
    return "\r\n ".join(chunks)


def build_day_ics(db: Session, actor: User, *, day: date | None = None) -> str:
    plan = get_day_plan(db, actor, day=day)
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    all_day_start = plan.date.strftime("%Y%m%d")
    all_day_end = (plan.date + timedelta(days=1)).strftime("%Y%m%d")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        f"PRODID:{_ICS_PRODID}",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:Plan du jour {plan.date.isoformat()}",
    ]
    for item in plan.items:
        lines.append("BEGIN:VEVENT")
        lines.append(f"UID:{item.id}@si-pilot")
        lines.append(f"DTSTAMP:{stamp}")
        if item.all_day or item.start_at is None:
            lines.append(f"DTSTART;VALUE=DATE:{all_day_start}")
            lines.append(f"DTEND;VALUE=DATE:{all_day_end}")
        else:
            start = item.start_at.astimezone(UTC)
            end = (item.end_at or item.start_at + timedelta(minutes=30)).astimezone(UTC)
            lines.append(f"DTSTART:{start.strftime('%Y%m%dT%H%M%SZ')}")
            lines.append(f"DTEND:{end.strftime('%Y%m%dT%H%M%SZ')}")
        lines.append(f"SUMMARY:{_ics_escape(item.title)}")
        description = item.detail or ""
        if item.travel:
            description = (description + "\n" if description else "") + (
                "Déplacement à prévoir."
            )
        if description:
            lines.append(f"DESCRIPTION:{_ics_escape(description)}")
        if item.location:
            lines.append(f"LOCATION:{_ics_escape(item.location)}")
        lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")
    return "".join(f"{_ics_fold(line)}\r\n" for line in lines)


def get_today(db: Session, actor: User) -> DashboardToday:
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
        plan=_build_day_plan(db, actor, now, today),
    )
