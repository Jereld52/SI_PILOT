from __future__ import annotations

from collections import Counter
from collections.abc import Callable
from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID

from app.core.errors import ValidationAppError
from app.models.assets import Asset
from app.models.budget import Budget, BudgetLine
from app.models.contracts import Contract
from app.models.documents import Document
from app.models.mobile import MobileLine
from app.models.projects import Project
from app.models.security import SecurityIncident
from app.models.tickets import Intervention, Ticket
from app.schemas.statistics import (
    StatisticsOverview,
    StatsBudget,
    StatsBudgetCategory,
    StatsCommercial,
    StatsCommercialRow,
    StatsKpi,
    StatsPeriodPoint,
    StatsPoint,
)
from app.services import budget_service, commercial_service
from app.services.periods import Granularity, StatPeriod, build_periods, default_range, period_key
from sqlalchemy import or_, select
from sqlalchemy.orm import Session


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def _distribution(values: list[str]) -> list[StatsPoint]:
    counts = Counter(value or "Non renseigné" for value in values)
    return [StatsPoint(label=label, value=value) for label, value in counts.most_common()]


def _period_series(
    records: list[Any],
    periods: list[StatPeriod],
    granularity: Granularity,
    *,
    created_getter: Callable[[Any], datetime | None],
    resolved_getter: Callable[[Any], datetime | None] | None = None,
    closed_getter: Callable[[Any], datetime | None] | None = None,
) -> list[StatsPeriodPoint]:
    created = Counter(
        period_key(value, granularity)
        for record in records
        if (value := created_getter(record)) is not None
    )
    resolved = Counter(
        period_key(value, granularity)
        for record in records
        if resolved_getter is not None and (value := resolved_getter(record)) is not None
    )
    closed = Counter(
        period_key(value, granularity)
        for record in records
        if closed_getter is not None and (value := closed_getter(record)) is not None
    )
    return [
        StatsPeriodPoint(
            key=period.key,
            label=period.label,
            created=created.get(period.key, 0),
            resolved=resolved.get(period.key, 0),
            closed=closed.get(period.key, 0),
        )
        for period in periods
    ]


def get_overview(
    db: Session,
    *,
    start: date | None = None,
    end: date | None = None,
    granularity: Granularity = "month",
) -> StatisticsOverview:
    if start is None or end is None:
        default_start, default_end = default_range(granularity)
        start = start or default_start
        end = end or default_end
    periods = build_periods(start, end, granularity)
    start_dt = datetime.combine(start, datetime.min.time(), tzinfo=UTC)
    end_dt = datetime.combine(end, datetime.max.time(), tzinfo=UTC)
    now = datetime.now(UTC)

    tickets = list(
        db.scalars(
            select(Ticket)
            .where(
                or_(
                    Ticket.opened_at.between(start_dt, end_dt),
                    Ticket.resolved_at.between(start_dt, end_dt),
                    Ticket.closed_at.between(start_dt, end_dt),
                )
            )
            .order_by(Ticket.opened_at.desc())
        ).all()
    )
    created_tickets = [
        ticket
        for ticket in tickets
        if (opened := _aware(ticket.opened_at)) is not None and start_dt <= opened <= end_dt
    ]
    resolved_tickets = [
        ticket
        for ticket in tickets
        if (resolved := _aware(ticket.resolved_at)) is not None
        and start_dt <= resolved <= end_dt
    ]
    open_tickets = [
        ticket for ticket in created_tickets if not ticket.status.is_closed
    ]
    resolution_hours = [
        (ticket.resolved_at - ticket.opened_at).total_seconds() / 3600
        for ticket in resolved_tickets
        if ticket.resolved_at and ticket.opened_at
    ]
    sla_base = [
        ticket
        for ticket in resolved_tickets
        if ticket.due_at is not None
    ]
    sla_ok = [
        ticket
        for ticket in sla_base
        if (ticket.resolved_at or ticket.closed_at) <= ticket.due_at  # type: ignore[operator]
    ]

    interventions = list(
        db.scalars(
            select(Intervention).where(
                or_(
                    Intervention.created_at.between(start_dt, end_dt),
                    Intervention.ended_at.between(start_dt, end_dt),
                )
            )
        ).all()
    )
    incidents = list(
        db.scalars(
            select(SecurityIncident).where(
                or_(
                    SecurityIncident.detected_at.between(start_dt, end_dt),
                    SecurityIncident.closed_at.between(start_dt, end_dt),
                )
            )
        ).all()
    )

    assets = list(
        db.scalars(select(Asset).where(Asset.archived_at.is_(None))).all()
    )
    contracts = list(db.scalars(select(Contract)).all())
    projects = list(db.scalars(select(Project)).all())
    documents = list(db.scalars(select(Document)).all())
    mobile_lines = list(db.scalars(select(MobileLine)).all())
    expiring_contracts = [
        contract
        for contract in contracts
        if contract.status in ("active", "expiring")
        and contract.end_date is not None
        and start <= contract.end_date <= end
    ]

    budget_row = db.scalar(select(Budget).where(Budget.year == date.today().year))
    budget_data: StatsBudget | None = None
    if budget_row is not None:
        detail = budget_service.get_budget_detail(db, budget_row.id)
        categories: dict[str, StatsBudgetCategory] = {}
        for line in detail.lines:
            entry = categories.setdefault(
                line.category.name, StatsBudgetCategory(label=line.category.name)
            )
            entry.voted += line.voted_amount or 0
            entry.committed += line.committed_amount or 0
            entry.invoiced += line.invoiced_amount or 0
        budget_data = StatsBudget(
            year=detail.year,
            status=detail.status,
            voted=detail.voted_total or 0,
            committed=detail.committed_total,
            invoiced=detail.invoiced_total,
            available=detail.available_total,
            categories=sorted(categories.values(), key=lambda item: item.voted, reverse=True),
        )
    else:
        budget_data = None

    kpis = [
        StatsKpi(
            key="tickets_created",
            label="Tickets créés",
            value=len(created_tickets),
            hint=f"du {start.strftime('%d/%m/%Y')} au {end.strftime('%d/%m/%Y')}",
            severity="neutral",
        ),
        StatsKpi(
            key="tickets_open",
            label="Tickets encore ouverts",
            value=len(open_tickets),
            hint="parmi les tickets créés sur la période",
            severity="warning" if open_tickets else "success",
        ),
        StatsKpi(
            key="resolution_hours",
            label="Délai moyen de résolution",
            value=round(sum(resolution_hours) / len(resolution_hours), 1)
            if resolution_hours
            else 0,
            unit="h",
            hint=f"{len(resolved_tickets)} ticket(s) résolu(s)",
            severity="neutral",
        ),
        StatsKpi(
            key="sla_rate",
            label="Respect du SLA",
            value=round(len(sla_ok) * 100 / len(sla_base), 1) if sla_base else 0,
            unit="%",
            hint=f"{len(sla_ok)} / {len(sla_base)} ticket(s) dans les délais",
            severity="success" if sla_base and len(sla_ok) == len(sla_base) else "warning",
        ),
        StatsKpi(
            key="interventions_done",
            label="Interventions terminées",
            value=sum(
                1
                for intervention in interventions
                if (ended := _aware(intervention.ended_at)) is not None
                and start_dt <= ended <= end_dt
            ),
            hint=f"{len(interventions)} intervention(s) suivie(s)",
            severity="neutral",
        ),
        StatsKpi(
            key="assets_total",
            label="Équipements suivis",
            value=len(assets),
            hint=f"{sum(1 for asset in assets if asset.status == 'broken')} en panne",
            severity="danger" if any(asset.status == "broken" for asset in assets) else "success",
        ),
        StatsKpi(
            key="contracts_expiring",
            label="Contrats à échéance",
            value=len(expiring_contracts),
            hint="sur la période sélectionnée",
            severity="warning" if expiring_contracts else "success",
        ),
        StatsKpi(
            key="security_incidents",
            label="Incidents de sécurité",
            value=sum(
                1
                for incident in incidents
                if (detected := _aware(incident.detected_at)) is not None
                and start_dt <= detected <= end_dt
            ),
            hint="détectés sur la période",
            severity="danger"
            if any(
                (detected := _aware(incident.detected_at)) is not None
                and detected >= start_dt
                for incident in incidents
            )
            else "success",
        ),
        StatsKpi(
            key="budget_engaged",
            label="Budget engagé",
            value=budget_data.committed if budget_data else 0,
            unit="EUR",
            hint=f"Exercice {date.today().year}",
            severity="warning",
        ),
        StatsKpi(
            key="budget_available",
            label="Budget disponible",
            value=budget_data.available if budget_data else 0,
            unit="EUR",
            hint=f"Exercice {date.today().year}",
            severity="danger" if budget_data and budget_data.available < 0 else "success",
        ),
        StatsKpi(
            key="documents_published",
            label="Documents publiés",
            value=sum(1 for document in documents if document.status == "published"),
            hint=f"{len(documents)} document(s) au total",
            severity="neutral",
        ),
    ]

    return StatisticsOverview(
        start=start,
        end=end,
        granularity=granularity,
        generated_at=now,
        kpis=kpis,
        ticket_periods=_period_series(
            tickets,
            periods,
            granularity,
            created_getter=lambda item: item.opened_at,
            resolved_getter=lambda item: item.resolved_at,
            closed_getter=lambda item: item.closed_at,
        ),
        intervention_periods=_period_series(
            interventions,
            periods,
            granularity,
            created_getter=lambda item: item.created_at,
            resolved_getter=lambda item: item.ended_at,
        ),
        security_periods=_period_series(
            incidents,
            periods,
            granularity,
            created_getter=lambda item: item.detected_at,
            closed_getter=lambda item: item.closed_at,
        ),
        tickets_by_status=_distribution([ticket.status.name for ticket in created_tickets]),
        tickets_by_priority=_distribution([ticket.priority.name for ticket in created_tickets]),
        tickets_by_category=_distribution([ticket.category.name for ticket in created_tickets]),
        tickets_by_assignee=_distribution(
            [
                f"{ticket.assignee.first_name} {ticket.assignee.last_name}"
                if ticket.assignee
                else "Non assigné"
                for ticket in created_tickets
            ]
        ),
        assets_by_status=_distribution([asset.status for asset in assets]),
        assets_by_category=_distribution([asset.category.name for asset in assets]),
        interventions_by_status=_distribution(
            [intervention.status for intervention in interventions]
        ),
        contracts_by_status=_distribution([contract.status for contract in contracts]),
        projects_by_status=_distribution([project.status for project in projects]),
        security_by_severity=_distribution(
            [
                incident.severity
                for incident in incidents
                if (detected := _aware(incident.detected_at)) is not None
                and start_dt <= detected <= end_dt
            ]
        ),
        mobile_by_status=_distribution([line.status for line in mobile_lines]),
        documents_by_status=_distribution([document.status for document in documents]),
        budget=budget_data,
    )


def get_commercial_overview(
    db: Session,
    *,
    start: date | None = None,
    end: date | None = None,
    granularity: Granularity = "month",
    kind: str | None = None,
    status: str | None = None,
    supplier_id: UUID | None = None,
    with_engagement: bool | None = None,
    q: str | None = None,
) -> StatsCommercial:
    today = date.today()
    start = start or date(today.year, 1, 1)
    end = end or today
    if start > end:
        raise ValidationAppError("La date de début doit précéder la date de fin.")
    periods = build_periods(start, end, granularity)
    documents = commercial_service.select_documents(
        db,
        kind=kind,
        status=status,
        supplier_id=supplier_id,
        with_engagement=with_engagement,
        start=start,
        end=end,
        q=q,
    )
    now = datetime.now(UTC)
    quotes = [document for document in documents if document.kind == "quote"]
    orders = [document for document in documents if document.kind == "purchase_order"]
    active_orders = [order for order in orders if order.status != "cancelled"]
    quotes_pending = [
        quote for quote in quotes if quote.status in {"draft", "sent", "accepted"}
    ]
    converted_quotes = [quote for quote in quotes if quote.status == "converted"]
    eligible_quotes = [quote for quote in quotes if quote.status != "draft"]
    conversion_rate = (
        round(len(converted_quotes) * 100 / len(eligible_quotes), 1)
        if eligible_quotes
        else 0.0
    )
    without_engagement = [
        order for order in orders if not (order.engagement_number or "").strip()
    ]
    late_orders = [
        order
        for order in active_orders
        if order.expected_date is not None
        and order.expected_date < today
        and order.status != "delivered"
    ]
    quotes_total = sum(float(quote.amount_ttc or 0) for quote in quotes)
    engaged_total = sum(float(order.amount_ttc or 0) for order in active_orders)
    delivered_total = sum(
        float(order.amount_ttc or 0)
        for order in orders
        if order.status == "delivered"
    )

    kpis = [
        StatsKpi(
            key="commercial_quotes",
            label="Devis sur la période",
            value=len(quotes),
            hint=f"du {start.strftime('%d/%m/%Y')} au {end.strftime('%d/%m/%Y')}",
            severity="neutral",
        ),
        StatsKpi(
            key="commercial_quotes_total",
            label="Montant des devis",
            value=round(quotes_total, 2),
            unit="EUR",
            hint=f"{len(quotes_pending)} devis en attente",
            severity="neutral",
        ),
        StatsKpi(
            key="commercial_conversion_rate",
            label="Taux de conversion",
            value=conversion_rate,
            unit="%",
            hint=f"{len(converted_quotes)} devis converti(s)",
            severity="success" if conversion_rate >= 50 else "warning",
        ),
        StatsKpi(
            key="commercial_orders",
            label="Bons de commande",
            value=len(orders),
            hint=f"{len(active_orders)} actif(s)",
            severity="neutral",
        ),
        StatsKpi(
            key="commercial_engaged_total",
            label="Montant engagé",
            value=round(engaged_total, 2),
            unit="EUR",
            hint="bons de commande hors annulés",
            severity="warning",
        ),
        StatsKpi(
            key="commercial_delivered_total",
            label="Montant livré",
            value=round(delivered_total, 2),
            unit="EUR",
            hint=f"{sum(1 for order in orders if order.status == 'delivered')} commande(s) livrée(s)",
            severity="success",
        ),
        StatsKpi(
            key="commercial_without_engagement",
            label="BC sans engagement",
            value=len(without_engagement),
            hint="numéro d'engagement à compléter",
            severity="danger" if without_engagement else "success",
        ),
        StatsKpi(
            key="commercial_late_orders",
            label="Livraisons en retard",
            value=len(late_orders),
            hint="date de livraison dépassée",
            severity="danger" if late_orders else "success",
        ),
    ]

    period_counts = Counter(
        period_key(document.issue_date, granularity) for document in documents
    )
    period_points = [
        StatsPeriodPoint(
            key=period.key,
            label=period.label,
            created=period_counts.get(period.key, 0),
        )
        for period in periods
    ]

    supplier_totals: dict[str, float] = {}
    for document in documents:
        supplier_name = document.supplier.name if document.supplier else "Non renseigné"
        supplier_totals[supplier_name] = supplier_totals.get(supplier_name, 0) + float(
            document.amount_ttc or 0
        )
    by_supplier = [
        StatsPoint(label=label, value=round(total, 2))
        for label, total in sorted(
            supplier_totals.items(), key=lambda item: item[1], reverse=True
        )
    ]

    budget_ids = {document.budget_line_id for document in documents if document.budget_line_id}
    budget_lines = (
        {
            line.id: line.label
            for line in db.scalars(select(BudgetLine).where(BudgetLine.id.in_(budget_ids))).all()
        }
        if budget_ids
        else {}
    )
    contract_ids = {document.contract_id for document in documents if document.contract_id}
    contracts_map = (
        {
            contract.id: contract.reference
            for contract in db.scalars(select(Contract).where(Contract.id.in_(contract_ids))).all()
        }
        if contract_ids
        else {}
    )

    rows = [
        StatsCommercialRow(
            id=document.id,
            kind=document.kind,
            reference=document.reference,
            object=document.object,
            supplier=document.supplier.name if document.supplier else "Non renseigné",
            status=document.status,
            issue_date=document.issue_date,
            due_date=(
                document.valid_until
                if document.kind == "quote"
                else document.expected_date
            ),
            engagement_number=document.engagement_number,
            amount_ht=float(document.amount_ht) if document.amount_ht is not None else None,
            amount_ttc=float(document.amount_ttc) if document.amount_ttc is not None else None,
            budget_line=budget_lines.get(document.budget_line_id) if document.budget_line_id else None,
            contract_reference=contracts_map.get(document.contract_id) if document.contract_id else None,
            document_id=document.document_id,
            created_at=document.created_at,
        )
        for document in documents
    ]

    return StatsCommercial(
        start=start,
        end=end,
        generated_at=now,
        kind=kind,
        status=status,
        supplier_id=supplier_id,
        with_engagement=with_engagement,
        q=q,
        kpis=kpis,
        by_status=_distribution([document.status for document in documents]),
        by_supplier=by_supplier,
        by_kind=_distribution(
            [
                "Devis" if document.kind == "quote" else "Bon de commande"
                for document in documents
            ]
        ),
        periods=period_points,
        documents=rows,
    )
