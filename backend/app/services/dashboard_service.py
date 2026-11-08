from __future__ import annotations

import json
from datetime import UTC, date, datetime, timedelta

from app.db.base import utcnow
from app.models.assets import Asset, AssetAssignment, AssetCategory
from app.models.audit import AuditLog
from app.models.auth import User
from app.models.budget import Budget, BudgetCategory, BudgetCommitment, BudgetInvoice, BudgetLine
from app.models.calendar import ActionItem
from app.models.common import UserPreference
from app.models.contracts import Contract
from app.models.infrastructure import InfraEquipment
from app.models.organization import Agent
from app.models.security import SecurityIncident
from app.models.tickets import Intervention, Ticket, TicketCategory, TicketStatus
from app.schemas.dashboard import (
    ActivityItem,
    AlertItem,
    ChartPoint,
    ChartSeries,
    DashboardActivity,
    DashboardAlerts,
    DashboardCharts,
    DashboardSummary,
    KpiValue,
)
from sqlalchemy import func, select
from sqlalchemy.orm import Session

OPEN_TICKET_CODES = ("new", "to_qualify", "in_progress", "waiting_user", "waiting_provider")
STATUS_LABELS = {
    "in_service": "En service",
    "in_stock": "En stock",
    "maintenance": "Maintenance",
    "broken": "En panne",
    "to_renew": "À renouveler",
    "retired": "Réformé",
}
MONTH_LABELS = (
    "Jan",
    "Fév",
    "Mar",
    "Avr",
    "Mai",
    "Juin",
    "Juil",
    "Août",
    "Sep",
    "Oct",
    "Nov",
    "Déc",
)


def _now() -> datetime:
    return datetime.now(UTC)


def _count(db: Session, statement) -> int:
    return db.scalar(select(func.count()).select_from(statement.subquery())) or 0


def _month_keys(count: int = 12) -> list[tuple[int, int]]:
    today = date.today()
    year, month = today.year, today.month
    keys: list[tuple[int, int]] = []
    for _ in range(count):
        keys.append((year, month))
        month -= 1
        if month == 0:
            month = 12
            year -= 1
    return list(reversed(keys))


def _month_label(key: tuple[int, int]) -> str:
    return f"{MONTH_LABELS[key[1] - 1]} {str(key[0])[2:]}"


def get_summary(db: Session) -> DashboardSummary:
    now = _now()
    today = date.today()
    current_year = today.year

    agents_active = _count(
        db, select(Agent.id).where(Agent.status == "active", Agent.departure_date.is_(None))
    )
    users_active = _count(db, select(User.id).where(User.is_active.is_(True)))
    workstations = _count(
        db,
        select(Asset.id)
        .join(AssetCategory)
        .where(AssetCategory.is_workstation.is_(True), Asset.status != "retired"),
    )
    servers = _count(
        db,
        select(InfraEquipment.id).where(InfraEquipment.type.in_(("server", "vm"))),
    )
    phones = _count(
        db,
        select(Asset.id)
        .join(AssetCategory)
        .where(AssetCategory.code == "smartphone", Asset.status != "retired"),
    )
    open_tickets = _count(
        db,
        select(Ticket.id).join(TicketStatus).where(TicketStatus.code.in_(OPEN_TICKET_CODES)),
    )
    critical_incidents = _count(
        db,
        select(SecurityIncident.id).where(
            SecurityIncident.severity == "critical", SecurityIncident.status != "closed"
        ),
    )
    broken_assets = _count(db, select(Asset.id).where(Asset.status == "broken"))
    to_renew = _count(db, select(Asset.id).where(Asset.status == "to_renew"))
    contracts_expiring = _count(
        db,
        select(Contract.id).where(
            Contract.status.in_(("active", "expiring")),
            Contract.end_date.is_not(None),
            Contract.end_date >= today,
            Contract.end_date <= today + timedelta(days=90),
        ),
    )
    overdue_actions = _count(
        db,
        select(ActionItem.id).where(
            ActionItem.due_date.is_not(None),
            ActionItem.due_date < now,
            ActionItem.status.not_in(("done", "cancelled")),
        ),
    )

    budget = db.scalar(select(Budget).where(Budget.year == current_year))
    budget_engaged = 0.0
    budget_consumed = 0.0
    if budget is not None:
        engaged = db.scalar(
            select(
                func.coalesce(
                    func.sum(
                        func.coalesce(
                            BudgetCommitment.amount_ttc, BudgetCommitment.amount_ht, 0
                        )
                    ),
                    0,
                )
            )
            .select_from(BudgetCommitment)
            .join(BudgetLine, BudgetCommitment.budget_line_id == BudgetLine.id)
            .where(
                BudgetLine.budget_id == budget.id,
                BudgetCommitment.status.in_(("ordered", "delivered")),
            )
        )
        consumed = db.scalar(
            select(
                func.coalesce(
                    func.sum(
                        func.coalesce(BudgetInvoice.amount_ttc, BudgetInvoice.amount_ht, 0)
                    ),
                    0,
                )
            )
            .select_from(BudgetInvoice)
            .join(BudgetLine, BudgetInvoice.budget_line_id == BudgetLine.id)
            .where(
                BudgetLine.budget_id == budget.id,
                BudgetInvoice.status.in_(("validated", "paid")),
            )
        )
        budget_engaged = float(engaged or 0)
        budget_consumed = float(consumed or 0)

    kpis = [
        KpiValue(
            key="agents",
            label="Agents",
            value=agents_active,
            hint="Agents actifs sans date de départ",
            link="/agents",
        ),
        KpiValue(
            key="users",
            label="Comptes applicatifs",
            value=users_active,
            hint="Comptes actifs dans l'application",
            link="/admin/users",
        ),
        KpiValue(
            key="workstations",
            label="Postes",
            value=workstations,
            hint="PC fixes et portables hors réforme",
            link="/parc?category=workstation",
        ),
        KpiValue(
            key="servers",
            label="Serveurs / VM",
            value=servers,
            hint="Infrastructure inventoriée",
            link="/infrastructure",
        ),
        KpiValue(
            key="phones",
            label="Téléphones",
            value=phones,
            hint="Smartphones hors réforme",
            link="/parc?category=smartphone",
        ),
        KpiValue(
            key="open_tickets",
            label="Tickets ouverts",
            value=open_tickets,
            hint="Nouveaux, à qualifier, en cours ou en attente",
            severity="warning" if open_tickets else "neutral",
            link="/demandes",
        ),
        KpiValue(
            key="critical_incidents",
            label="Incidents critiques",
            value=critical_incidents,
            hint="Incidents de sécurité critiques non clos",
            severity="danger" if critical_incidents else "success",
            link="/cybersecurite",
        ),
        KpiValue(
            key="broken_assets",
            label="Équipements en panne",
            value=broken_assets,
            hint="À traiter ou à remplacer",
            severity="danger" if broken_assets else "success",
            link="/parc?status=broken",
        ),
        KpiValue(
            key="to_renew",
            label="À renouveler",
            value=to_renew,
            hint="Équipements marqués à renouveler",
            severity="warning" if to_renew else "neutral",
            link="/parc?status=to_renew",
        ),
        KpiValue(
            key="contracts_expiring",
            label="Contrats à échéance",
            value=contracts_expiring,
            hint="Dans les 90 prochains jours",
            severity="warning" if contracts_expiring else "success",
            link="/contrats?expiring=90",
        ),
        KpiValue(
            key="overdue_actions",
            label="Actions en retard",
            value=overdue_actions,
            hint="Échéance dépassée et action non terminée",
            severity="danger" if overdue_actions else "success",
            link="/calendrier?filter=overdue",
        ),
        KpiValue(
            key="budget_engaged",
            label="Budget engagé",
            value=round(budget_engaged, 2),
            unit="EUR",
            hint=f"Engagements {current_year} non encore facturés",
            link="/budget",
        ),
        KpiValue(
            key="budget_consumed",
            label="Budget consommé",
            value=round(budget_consumed, 2),
            unit="EUR",
            hint=f"Factures validées ou payées {current_year}",
            link="/budget",
        ),
    ]
    return DashboardSummary(kpis=kpis, generated_at=now)


def get_charts(db: Session) -> DashboardCharts:
    today = date.today()
    series: list[ChartSeries] = []

    asset_status_rows = db.execute(
        select(Asset.status, func.count()).group_by(Asset.status).order_by(Asset.status)
    ).all()
    if asset_status_rows:
        series.append(
            ChartSeries(
                key="assets_by_status",
                label="Répartition des équipements",
                points=[
                    ChartPoint(label=STATUS_LABELS.get(status, status), value=count)
                    for status, count in asset_status_rows
                ],
            )
        )

    asset_category_rows = db.execute(
        select(AssetCategory.name, func.count())
        .select_from(Asset)
        .join(AssetCategory)
        .where(Asset.status != "retired")
        .group_by(AssetCategory.name)
        .order_by(func.count().desc())
    ).all()
    if asset_category_rows:
        series.append(
            ChartSeries(
                key="assets_by_category",
                label="Équipements par catégorie",
                points=[
                    ChartPoint(label=name, value=count) for name, count in asset_category_rows
                ],
            )
        )

    ticket_status_rows = db.execute(
        select(TicketStatus.name, func.count())
        .select_from(Ticket)
        .join(TicketStatus)
        .group_by(TicketStatus.name)
        .order_by(TicketStatus.name)
    ).all()
    if ticket_status_rows:
        series.append(
            ChartSeries(
                key="tickets_by_status",
                label="Demandes par statut",
                points=[ChartPoint(label=name, value=count) for name, count in ticket_status_rows],
            )
        )

    ticket_category_rows = db.execute(
        select(TicketCategory.name, func.count())
        .select_from(Ticket)
        .join(TicketCategory)
        .group_by(TicketCategory.name)
        .order_by(func.count().desc())
    ).all()
    if ticket_category_rows:
        series.append(
            ChartSeries(
                key="tickets_by_category",
                label="Demandes par catégorie",
                points=[ChartPoint(label=name, value=count) for name, count in ticket_category_rows],
            )
        )

    budget = db.scalar(select(Budget).where(Budget.year == today.year))
    if budget is not None:
        budget_rows = db.execute(
            select(BudgetCategory.name, func.coalesce(func.sum(BudgetLine.voted_amount), 0))
            .select_from(BudgetLine)
            .join(BudgetCategory)
            .where(BudgetLine.budget_id == budget.id)
            .group_by(BudgetCategory.name)
            .order_by(func.sum(BudgetLine.voted_amount).desc())
        ).all()
        if budget_rows:
            series.append(
                ChartSeries(
                    key="budget_by_category",
                    label=f"Budget voté {today.year}",
                    unit="EUR",
                    points=[
                        ChartPoint(label=name, value=float(amount or 0))
                        for name, amount in budget_rows
                    ],
                )
            )

    contract_rows = db.execute(
        select(Contract.end_date).where(
            Contract.status.in_(("active", "expiring")),
            Contract.end_date.is_not(None),
        )
    ).all()
    buckets = {"0-30 j": 0, "31-60 j": 0, "61-90 j": 0, "91-180 j": 0}
    for (end_date,) in contract_rows:
        if end_date is None:
            continue
        days = (end_date - today).days
        if 0 <= days <= 30:
            buckets["0-30 j"] += 1
        elif 31 <= days <= 60:
            buckets["31-60 j"] += 1
        elif 61 <= days <= 90:
            buckets["61-90 j"] += 1
        elif 91 <= days <= 180:
            buckets["91-180 j"] += 1
    if any(buckets.values()):
        series.append(
            ChartSeries(
                key="contracts_expiry",
                label="Échéances des contrats",
                points=[ChartPoint(label=label, value=value) for label, value in buckets.items()],
            )
        )

    months = _month_keys(12)
    ticket_dates = db.execute(
        select(Ticket.opened_at).where(Ticket.opened_at >= datetime.now(UTC) - timedelta(days=366))
    ).all()
    ticket_counts = {key: 0 for key in months}
    for (opened_at,) in ticket_dates:
        key = (opened_at.year, opened_at.month)
        if key in ticket_counts:
            ticket_counts[key] += 1
    series.append(
        ChartSeries(
            key="tickets_evolution",
            label="Évolution des demandes (12 mois)",
            points=[ChartPoint(label=_month_label(key), value=ticket_counts[key]) for key in months],
        )
    )

    asset_dates = db.execute(
        select(Asset.commissioning_date).where(Asset.commissioning_date.is_not(None))
    ).all()
    if asset_dates:
        asset_counts = {key: 0 for key in months}
        for (commissioned,) in asset_dates:
            if commissioned is None:
                continue
            key = (commissioned.year, commissioned.month)
            if key in asset_counts:
                asset_counts[key] += 1
        cumulative = 0
        points: list[ChartPoint] = []
        for key in months:
            cumulative += asset_counts[key]
            points.append(ChartPoint(label=_month_label(key), value=cumulative))
        series.append(
            ChartSeries(
                key="assets_evolution",
                label="Évolution du parc (mises en service)",
                points=points,
            )
        )

    incident_rows = db.execute(
        select(SecurityIncident.category, func.count())
        .group_by(SecurityIncident.category)
        .order_by(func.count().desc())
    ).all()
    if incident_rows:
        series.append(
            ChartSeries(
                key="incidents_by_category",
                label="Incidents de sécurité par catégorie",
                points=[ChartPoint(label=category, value=count) for category, count in incident_rows],
            )
        )

    return DashboardCharts(series=series, generated_at=_now())


def get_alerts(db: Session) -> DashboardAlerts:
    now = _now()
    today = date.today()
    items: list[AlertItem] = []

    incidents = db.scalars(
        select(SecurityIncident)
        .where(
            SecurityIncident.severity == "critical",
            SecurityIncident.status != "closed",
        )
        .order_by(SecurityIncident.detected_at.desc())
        .limit(5)
    ).all()
    for incident in incidents:
        items.append(
            AlertItem(
                id=str(incident.id),
                severity="critical",
                title=incident.title,
                detail=f"Incident critique {incident.reference} non clos",
                link=f"/cybersecurite/incidents/{incident.id}",
                category="security",
            )
        )

    broken_assets = db.scalars(
        select(Asset).where(Asset.status == "broken").order_by(Asset.updated_at.desc()).limit(5)
    ).all()
    for asset in broken_assets:
        items.append(
            AlertItem(
                id=str(asset.id),
                severity="high",
                title=asset.name,
                detail=f"Équipement en panne — {asset.asset_tag}",
                link=f"/parc/{asset.id}",
                category="assets",
            )
        )

    expiring = db.scalars(
        select(Contract)
        .where(
            Contract.status.in_(("active", "expiring")),
            Contract.end_date.is_not(None),
            Contract.end_date >= today,
            Contract.end_date <= today + timedelta(days=30),
        )
        .order_by(Contract.end_date.asc())
        .limit(5)
    ).all()
    for contract in expiring:
        days = (contract.end_date - today).days if contract.end_date else 0
        items.append(
            AlertItem(
                id=str(contract.id),
                severity="high" if days <= 30 else "medium",
                title=contract.object,
                detail=f"Contrat {contract.reference} — échéance dans {days} jour(s)",
                link=f"/contrats/{contract.id}",
                category="contracts",
            )
        )

    overdue = db.scalars(
        select(ActionItem)
        .where(
            ActionItem.due_date.is_not(None),
            ActionItem.due_date < now,
            ActionItem.status.not_in(("done", "cancelled")),
        )
        .order_by(ActionItem.due_date.asc())
        .limit(5)
    ).all()
    for action in overdue:
        items.append(
            AlertItem(
                id=str(action.id),
                severity="high",
                title=action.title,
                detail="Action en retard",
                link=f"/calendrier/actions/{action.id}",
                category="actions",
            )
        )

    due_tickets = db.scalars(
        select(Ticket)
        .join(TicketStatus)
        .where(
            Ticket.due_at.is_not(None),
            Ticket.due_at < now,
            TicketStatus.code.in_(OPEN_TICKET_CODES),
        )
        .order_by(Ticket.due_at.asc())
        .limit(5)
    ).all()
    for ticket in due_tickets:
        items.append(
            AlertItem(
                id=str(ticket.id),
                severity="medium",
                title=ticket.subject,
                detail=f"Demande {ticket.reference} en retard sur son échéance",
                link=f"/demandes/{ticket.id}",
                category="tickets",
            )
        )

    order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    items.sort(key=lambda item: order.get(item.severity, 4))
    return DashboardAlerts(items=items, generated_at=now)


def _link_for(module: str, entity_id: str | None, entity_type: str | None) -> str | None:
    if not entity_id:
        return None
    mapping = {
        "assets": f"/parc/{entity_id}",
        "tickets": f"/demandes/{entity_id}",
        "contracts": f"/contrats/{entity_id}",
        "projects": f"/projets/{entity_id}",
        "documents": f"/documentation/{entity_id}",
        "interventions": f"/demandes/interventions/{entity_id}",
        "admin": f"/admin/users/{entity_id}" if entity_type == "user" else None,
    }
    return mapping.get(module)


def get_activity(db: Session) -> DashboardActivity:
    items: list[ActivityItem] = []

    logs = db.scalars(select(AuditLog).order_by(AuditLog.occurred_at.desc()).limit(10)).all()
    for log in logs:
        items.append(
            ActivityItem(
                id=f"audit-{log.id}",
                occurred_at=log.occurred_at,
                actor=log.actor_label,
                module=log.module,
                action=log.action,
                label=log.entity_label,
                status=log.status,
                link=_link_for(log.module, log.entity_id, log.entity_type),
            )
        )

    interventions = db.scalars(
        select(Intervention).order_by(Intervention.created_at.desc()).limit(5)
    ).all()
    for intervention in interventions:
        items.append(
            ActivityItem(
                id=f"intervention-{intervention.id}",
                occurred_at=intervention.created_at,
                actor=None,
                module="interventions",
                action="created",
                label=intervention.title,
                status="success",
                link=f"/demandes/interventions/{intervention.id}",
            )
        )

    assignments = db.execute(
        select(AssetAssignment, Asset)
        .join(Asset, AssetAssignment.asset_id == Asset.id)
        .order_by(AssetAssignment.started_at.desc())
        .limit(5)
    ).all()
    for assignment, asset in assignments:
        items.append(
            ActivityItem(
                id=f"assignment-{assignment.id}",
                occurred_at=assignment.started_at,
                actor=None,
                module="assets",
                action="assigned",
                label=f"{asset.name} ({asset.asset_tag})",
                status="success",
                link=f"/parc/{asset.id}",
            )
        )

    items.sort(key=lambda item: item.occurred_at, reverse=True)
    return DashboardActivity(items=items[:15], generated_at=_now())


def get_dashboard_tiles(db: Session, user: User) -> list[str]:
    preference = db.get(UserPreference, (user.id, "dashboard.tiles"))
    if preference is None or not preference.value_json:
        return []
    try:
        value = json.loads(preference.value_json)
    except json.JSONDecodeError:
        return []
    if not isinstance(value, list):
        return []
    return [str(item) for item in value if isinstance(item, str)]


def set_dashboard_tiles(db: Session, user: User, tiles: list[str]) -> list[str]:
    clean = list(dict.fromkeys(tile.strip() for tile in tiles if tile.strip()))
    preference = db.get(UserPreference, (user.id, "dashboard.tiles"))
    if preference is None:
        preference = UserPreference(user_id=user.id, key="dashboard.tiles")
        db.add(preference)
    preference.value_json = json.dumps(clean, ensure_ascii=False)
    preference.updated_at = utcnow()
    db.commit()
    return clean
