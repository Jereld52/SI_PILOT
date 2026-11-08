from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from app.models.assets import Asset, License
from app.models.budget import Budget, BudgetCommitment, BudgetLine
from app.models.calendar import ActionItem, CalendarEvent
from app.models.contracts import Contract
from app.models.documents import Document
from app.models.infrastructure import InfraEquipment, MonitoringCheck
from app.models.mobile import MobileLine
from app.models.projects import Project
from app.models.rgpd import DataBreach, DpoRequest, ProcessingActivity, RightsRequest
from app.models.security import Certificate, SecurityIncident, Vulnerability
from app.models.tickets import Intervention, Ticket, TicketStatus
from app.schemas.dashboard import CockpitDeadline, CockpitModule, DashboardCockpit
from sqlalchemy import func, select
from sqlalchemy.orm import Session


def _count(db: Session, model, *conditions) -> int:
    statement = select(func.count()).select_from(model)
    for condition in conditions:
        statement = statement.where(condition)
    return db.scalar(statement) or 0


def _severity(days: int) -> str:
    if days <= 7:
        return "danger"
    if days <= 30:
        return "warning"
    return "info"


def _deadline(
    value: date | datetime | None,
    *,
    kind: str,
    label: str,
    href: str,
    entity_id: object,
) -> CockpitDeadline | None:
    if value is None:
        return None
    due = value.date() if isinstance(value, datetime) else value
    days = (due - date.today()).days
    if days < 0 or days > 90:
        return None
    return CockpitDeadline(
        id=str(entity_id),
        kind=kind,
        label=label,
        due_date=due,
        severity=_severity(days),
        href=href,
    )


def get_cockpit(db: Session) -> DashboardCockpit:
    today = date.today()
    now = datetime.now(UTC)
    horizon = today + timedelta(days=90)
    horizon_dt = now + timedelta(days=30)

    assets_total = _count(db, Asset, Asset.archived_at.is_(None))
    assets_in_service = _count(
        db, Asset, Asset.archived_at.is_(None), Asset.status == "in_service"
    )
    assets_in_stock = _count(
        db, Asset, Asset.archived_at.is_(None), Asset.status == "in_stock"
    )
    assets_broken = _count(db, Asset, Asset.archived_at.is_(None), Asset.status == "broken")

    open_tickets = _count(
        db,
        Ticket,
        Ticket.status_id.in_(
            select(TicketStatus.id).where(TicketStatus.is_closed.is_(False))
        ),
    )
    unassigned_tickets = _count(
        db,
        Ticket,
        Ticket.status_id.in_(
            select(TicketStatus.id).where(TicketStatus.is_closed.is_(False))
        ),
        Ticket.assignee_user_id.is_(None),
    )
    planned_interventions = _count(
        db, Intervention, Intervention.status.in_(("planned", "in_progress"))
    )

    active_contracts = _count(db, Contract, Contract.status.in_(("active", "expiring")))
    expiring_contracts = _count(
        db,
        Contract,
        Contract.status.in_(("active", "expiring")),
        Contract.end_date.is_not(None),
        Contract.end_date >= today,
        Contract.end_date <= horizon,
    )

    active_licenses = _count(db, License, License.is_active.is_(True))
    seats_total = db.scalar(
        select(func.coalesce(func.sum(License.seats), 0)).where(License.is_active.is_(True))
    ) or 0
    seats_used = db.scalar(
        select(func.coalesce(func.sum(License.seats_used), 0)).where(
            License.is_active.is_(True)
        )
    ) or 0

    budget = db.scalar(select(Budget).where(Budget.year == today.year))
    budget_committed = 0.0
    budget_available = 0.0
    if budget is not None:
        committed = db.scalar(
            select(func.coalesce(func.sum(func.coalesce(BudgetCommitment.amount_ht, BudgetCommitment.amount_ttc, 0)), 0))
            .select_from(BudgetCommitment)
            .join(BudgetLine, BudgetCommitment.budget_line_id == BudgetLine.id)
            .where(
                BudgetLine.budget_id == budget.id,
                BudgetCommitment.status.in_(("quoted", "ordered", "delivered", "invoiced")),
            )
        )
        voted = db.scalar(
            select(func.coalesce(func.sum(BudgetLine.voted_amount), 0)).where(
                BudgetLine.budget_id == budget.id
            )
        )
        budget_committed = float(committed or 0)
        budget_available = float(voted or 0) - budget_committed

    active_projects = _count(
        db, Project, Project.status.in_(("planned", "in_progress", "on_hold"))
    )
    late_projects = _count(
        db,
        Project,
        Project.status.in_(("planned", "in_progress", "on_hold")),
        Project.due_date.is_not(None),
        Project.due_date < today,
    )

    published_documents = _count(db, Document, Document.status == "published")

    active_infra = _count(db, InfraEquipment, InfraEquipment.status == "active")
    enabled_checks = _count(
        db, MonitoringCheck, MonitoringCheck.is_enabled.is_(True)
    )

    open_incidents = _count(db, SecurityIncident, SecurityIncident.status != "closed")
    open_vulnerabilities = _count(
        db, Vulnerability, Vulnerability.status.in_(("open", "in_progress"))
    )

    open_dpo = _count(db, DpoRequest, DpoRequest.status.in_(("new", "in_progress")))
    open_rights = _count(
        db, RightsRequest, RightsRequest.status.in_(("new", "in_progress"))
    )
    open_breaches = _count(db, DataBreach, DataBreach.status == "open")

    upcoming_events = _count(
        db,
        CalendarEvent,
        CalendarEvent.status == "planned",
        CalendarEvent.start_at >= now,
        CalendarEvent.start_at <= horizon_dt,
    )
    open_actions = _count(
        db, ActionItem, ActionItem.status.in_(("todo", "in_progress", "blocked"))
    )
    overdue_actions = _count(
        db,
        ActionItem,
        ActionItem.status.in_(("todo", "in_progress", "blocked")),
        ActionItem.due_date.is_not(None),
        ActionItem.due_date < now,
    )

    mobile_lines = _count(
        db,
        MobileLine,
        func.lower(MobileLine.status).in_(("actif", "active", "in_service")),
    )

    modules = [
        CockpitModule(
            key="assets",
            label="Parc informatique",
            href="/parc",
            primary=assets_total,
            primary_label="équipements",
            secondary=assets_broken,
            secondary_label="en panne",
            hint=f"{assets_in_service} en service · {assets_in_stock} en stock",
            tone="primary",
        ),
        CockpitModule(
            key="tickets",
            label="Demandes IT",
            href="/demandes",
            primary=open_tickets,
            primary_label="ouvertes",
            secondary=unassigned_tickets,
            secondary_label="non assignées",
            hint=f"{planned_interventions} intervention(s) à traiter",
            tone="warning" if open_tickets else "success",
        ),
        CockpitModule(
            key="contracts",
            label="Contrats",
            href="/contrats",
            primary=active_contracts,
            primary_label="actifs",
            secondary=expiring_contracts,
            secondary_label="à échéance 90 j",
            hint="Préavis et reconductions suivis",
            tone="warning" if expiring_contracts else "success",
        ),
        CockpitModule(
            key="budget",
            label="Budget",
            href="/budget",
            primary=round(budget_committed),
            primary_label="engagés",
            secondary=round(budget_available),
            secondary_label="disponibles",
            hint=f"Exercice {today.year}",
            tone="danger" if budget_available < 0 else "accent",
        ),
        CockpitModule(
            key="projects",
            label="Projets",
            href="/projets",
            primary=active_projects,
            primary_label="actifs",
            secondary=late_projects,
            secondary_label="en retard",
            hint="Jalons, tâches et risques",
            tone="danger" if late_projects else "primary",
        ),
        CockpitModule(
            key="security",
            label="Cybersécurité",
            href="/cybersecurite",
            primary=open_incidents,
            primary_label="incidents ouverts",
            secondary=open_vulnerabilities,
            secondary_label="vulnérabilités",
            hint="Sauvegardes et certificats inclus",
            tone="danger" if open_incidents or open_vulnerabilities else "success",
        ),
        CockpitModule(
            key="rgpd",
            label="RGPD",
            href="/rgpd",
            primary=open_dpo + open_rights,
            primary_label="demandes ouvertes",
            secondary=open_breaches,
            secondary_label="violations",
            hint="Registre et droits des personnes",
            tone="warning" if open_dpo or open_rights else "success",
        ),
        CockpitModule(
            key="documents",
            label="Documentation",
            href="/documentation",
            primary=published_documents,
            primary_label="documents publiés",
            secondary=active_infra,
            secondary_label="équipements infra",
            hint=f"{enabled_checks} contrôle(s) de supervision actif(s)",
            tone="accent",
        ),
        CockpitModule(
            key="calendar",
            label="Calendrier",
            href="/calendrier",
            primary=upcoming_events,
            primary_label="événements à venir",
            secondary=overdue_actions,
            secondary_label="actions en retard",
            hint=f"{open_actions} action(s) ouverte(s)",
            tone="danger" if overdue_actions else "primary",
        ),
        CockpitModule(
            key="mobile",
            label="Téléphonie",
            href="/telephonie",
            primary=mobile_lines,
            primary_label="lignes actives",
            secondary=active_licenses,
            secondary_label="licences actives",
            hint=f"{seats_used} siège(s) utilisé(s) sur {seats_total}",
            tone="accent",
        ),
    ]

    deadlines: list[CockpitDeadline] = []

    for contract in db.scalars(
        select(Contract).where(
            Contract.status.in_(("active", "expiring")),
            Contract.end_date.is_not(None),
            Contract.end_date >= today,
            Contract.end_date <= horizon,
        )
    ).all():
        deadline = _deadline(
            contract.end_date,
            kind="contract",
            label=f"Contrat {contract.reference} — {contract.object}",
            href="/contrats",
            entity_id=contract.id,
        )
        if deadline:
            deadlines.append(deadline)

    for license_row in db.scalars(
        select(License).where(
            License.is_active.is_(True),
            License.end_date.is_not(None),
            License.end_date >= today,
            License.end_date <= horizon,
        )
    ).all():
        deadline = _deadline(
            license_row.end_date,
            kind="license",
            label=f"Licence {license_row.name}",
            href="/fournisseurs",
            entity_id=license_row.id,
        )
        if deadline:
            deadlines.append(deadline)

    for project in db.scalars(
        select(Project).where(
            Project.status.in_(("planned", "in_progress", "on_hold")),
            Project.due_date.is_not(None),
            Project.due_date >= today,
            Project.due_date <= horizon,
        )
    ).all():
        deadline = _deadline(
            project.due_date,
            kind="project",
            label=f"Projet {project.code} — {project.name}",
            href="/projets",
            entity_id=project.id,
        )
        if deadline:
            deadlines.append(deadline)

    for activity in db.scalars(
        select(ProcessingActivity).where(
            ProcessingActivity.status == "active",
            ProcessingActivity.next_review_at.is_not(None),
            ProcessingActivity.next_review_at >= today,
            ProcessingActivity.next_review_at <= horizon,
        )
    ).all():
        deadline = _deadline(
            activity.next_review_at,
            kind="rgpd",
            label=f"Revue RGPD {activity.reference} — {activity.name}",
            href="/rgpd",
            entity_id=activity.id,
        )
        if deadline:
            deadlines.append(deadline)

    for action in db.scalars(
        select(ActionItem).where(
            ActionItem.status.in_(("todo", "in_progress", "blocked")),
            ActionItem.due_date.is_not(None),
        )
    ).all():
        deadline = _deadline(
            action.due_date,
            kind="action",
            label=f"Action {action.title}",
            href="/calendrier",
            entity_id=action.id,
        )
        if deadline:
            deadlines.append(deadline)

    for event in db.scalars(
        select(CalendarEvent).where(
            CalendarEvent.status == "planned",
            CalendarEvent.start_at >= now,
            CalendarEvent.start_at <= horizon_dt,
        )
    ).all():
        deadline = _deadline(
            event.start_at,
            kind="event",
            label=f"Événement {event.title}",
            href="/calendrier",
            entity_id=event.id,
        )
        if deadline:
            deadlines.append(deadline)

    for certificate in db.scalars(
        select(Certificate).where(
            Certificate.status.in_(("active", "expiring")),
            Certificate.valid_to >= today,
            Certificate.valid_to <= horizon,
        )
    ).all():
        deadline = _deadline(
            certificate.valid_to,
            kind="certificate",
            label=f"Certificat {certificate.common_name}",
            href="/cybersecurite",
            entity_id=certificate.id,
        )
        if deadline:
            deadlines.append(deadline)

    deadlines.sort(key=lambda item: item.due_date)
    return DashboardCockpit(
        modules=modules,
        deadlines=deadlines[:8],
        generated_at=datetime.now(UTC),
    )
