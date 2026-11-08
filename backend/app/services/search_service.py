import time
from collections.abc import Iterable
from urllib.parse import quote

from app.core.permissions import has_permission
from app.models.assets import Asset, License, Supplier
from app.models.auth import User
from app.models.budget import Budget
from app.models.calendar import ActionItem, CalendarEvent
from app.models.contracts import Contract
from app.models.documents import Document
from app.models.infrastructure import InfraEquipment
from app.models.mobile import MobileLine
from app.models.organization import Agent
from app.models.projects import Project
from app.models.reservations import ReservableEquipment
from app.models.rgpd import ProcessingActivity
from app.models.security import Certificate, SecurityAudit, SecurityIncident, Vulnerability
from app.models.stock import StockItem
from app.models.tickets import Intervention, Ticket
from app.schemas.search import SearchResponse, SearchResult
from sqlalchemy import or_, select
from sqlalchemy.orm import Session


def _pattern(query: str) -> str:
    escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _search_link(path: str, value: str) -> str:
    return f"{path}?q={quote(value)}"


def _add(
    results: list[SearchResult],
    *,
    type_name: str,
    id_value: object,
    title: str,
    subtitle: str | None,
    link: str,
    query: str,
) -> None:
    score = 100 if title.lower().startswith(query.lower()) else 50
    results.append(
        SearchResult(
            type=type_name,
            id=str(id_value),
            title=title,
            subtitle=subtitle,
            link=link,
            score=score,
        )
    )


def global_search(
    db: Session,
    *,
    user: User,
    query: str,
    types: Iterable[str] | None,
    limit: int = 5,
) -> SearchResponse:
    started = time.perf_counter()
    clean = query.strip()
    if len(clean) < 2:
        return SearchResponse(query=clean, results=[], total=0, took_ms=0)

    allowed = set(types) if types else None
    pattern = _pattern(clean)
    results: list[SearchResult] = []

    def can(name: str, permission: str) -> bool:
        return (allowed is None or name in allowed) and has_permission(user, permission)

    if can("users", "admin.users.read"):
        user_rows = db.scalars(
            select(User)
            .where(
                or_(
                    User.email.ilike(pattern, escape="\\"),
                    User.first_name.ilike(pattern, escape="\\"),
                    User.last_name.ilike(pattern, escape="\\"),
                )
            )
            .order_by(User.last_name, User.first_name)
            .limit(limit)
        ).all()
        for user_row in user_rows:
            _add(
                results,
                type_name="user",
                id_value=user_row.id,
                title=f"{user_row.first_name} {user_row.last_name}",
                subtitle=user_row.email,
                link=_search_link("/admin/users", user_row.email),
                query=clean,
            )

    if can("agents", "agents.read"):
        agent_rows = db.scalars(
            select(Agent)
            .where(
                or_(
                    Agent.first_name.ilike(pattern, escape="\\"),
                    Agent.last_name.ilike(pattern, escape="\\"),
                    Agent.email_pro.ilike(pattern, escape="\\"),
                )
            )
            .order_by(Agent.last_name, Agent.first_name)
            .limit(limit)
        ).all()
        for agent_row in agent_rows:
            _add(
                results,
                type_name="agent",
                id_value=agent_row.id,
                title=f"{agent_row.first_name} {agent_row.last_name}",
                subtitle=agent_row.email_pro,
                link=_search_link("/agents", agent_row.email_pro),
                query=clean,
            )

    if can("assets", "assets.read"):
        asset_rows = db.scalars(
            select(Asset)
            .where(
                or_(
                    Asset.name.ilike(pattern, escape="\\"),
                    Asset.asset_tag.ilike(pattern, escape="\\"),
                    Asset.serial_number.ilike(pattern, escape="\\"),
                    Asset.hostname.ilike(pattern, escape="\\"),
                    Asset.external_data_json.ilike(pattern, escape="\\"),
                )
            )
            .order_by(Asset.name)
            .limit(limit)
        ).all()
        for asset_row in asset_rows:
            _add(
                results,
                type_name="asset",
                id_value=asset_row.id,
                title=asset_row.name,
                subtitle=f"{asset_row.asset_tag} — {asset_row.category.name}",
                link=_search_link("/parc", asset_row.asset_tag),
                query=clean,
            )

    if can("tickets", "tickets.read"):
        ticket_rows = db.scalars(
            select(Ticket)
            .where(
                or_(
                    Ticket.reference.ilike(pattern, escape="\\"),
                    Ticket.subject.ilike(pattern, escape="\\"),
                )
            )
            .order_by(Ticket.opened_at.desc())
            .limit(limit)
        ).all()
        for ticket_row in ticket_rows:
            _add(
                results,
                type_name="ticket",
                id_value=ticket_row.id,
                title=ticket_row.subject,
                subtitle=f"{ticket_row.reference} — {ticket_row.status.name}",
                link=_search_link("/demandes", ticket_row.reference),
                query=clean,
            )

    if can("contracts", "contracts.read"):
        contract_rows = db.scalars(
            select(Contract)
            .where(
                or_(
                    Contract.reference.ilike(pattern, escape="\\"),
                    Contract.object.ilike(pattern, escape="\\"),
                )
            )
            .order_by(Contract.end_date.asc().nulls_last())
            .limit(limit)
        ).all()
        for contract_row in contract_rows:
            _add(
                results,
                type_name="contract",
                id_value=contract_row.id,
                title=contract_row.object,
                subtitle=f"{contract_row.reference} — {contract_row.supplier.name}",
                link=f"/contrats/{contract_row.id}",
                query=clean,
            )

    if can("projects", "projects.read"):
        project_rows = db.scalars(
            select(Project)
            .where(
                or_(
                    Project.name.ilike(pattern, escape="\\"),
                    Project.code.ilike(pattern, escape="\\"),
                )
            )
            .order_by(Project.name)
            .limit(limit)
        ).all()
        for project_row in project_rows:
            _add(
                results,
                type_name="project",
                id_value=project_row.id,
                title=project_row.name,
                subtitle=project_row.code,
                link=_search_link("/projets", project_row.code),
                query=clean,
            )

    if can("documents", "documents.read"):
        document_rows = db.scalars(
            select(Document)
            .where(
                or_(
                    Document.title.ilike(pattern, escape="\\"),
                    Document.description.ilike(pattern, escape="\\"),
                )
            )
            .order_by(Document.title)
            .limit(limit)
        ).all()
        for document_row in document_rows:
            _add(
                results,
                type_name="document",
                id_value=document_row.id,
                title=document_row.title,
                subtitle=document_row.doc_type,
                link=_search_link("/documentation", document_row.title),
                query=clean,
            )

    if can("suppliers", "suppliers.read"):
        supplier_rows = db.scalars(
            select(Supplier)
            .where(Supplier.name.ilike(pattern, escape="\\"))
            .order_by(Supplier.name)
            .limit(limit)
        ).all()
        for supplier_row in supplier_rows:
            _add(
                results,
                type_name="supplier",
                id_value=supplier_row.id,
                title=supplier_row.name,
                subtitle=supplier_row.type,
                link=_search_link("/fournisseurs", supplier_row.name),
                query=clean,
            )

    if can("mobile_lines", "mobile_lines.read"):
        mobile_rows = db.scalars(
            select(MobileLine)
            .where(
                or_(
                    MobileLine.line_number.ilike(pattern, escape="\\"),
                    MobileLine.holder_name.ilike(pattern, escape="\\"),
                    MobileLine.email.ilike(pattern, escape="\\"),
                    MobileLine.role_label.ilike(pattern, escape="\\"),
                    MobileLine.plan_name.ilike(pattern, escape="\\"),
                    MobileLine.company_name.ilike(pattern, escape="\\"),
                    MobileLine.contract_number.ilike(pattern, escape="\\"),
                    MobileLine.imei_communicating.ilike(pattern, escape="\\"),
                    MobileLine.imei_purchased.ilike(pattern, escape="\\"),
                )
            )
            .order_by(MobileLine.line_number)
            .limit(limit)
        ).all()
        for line in mobile_rows:
            _add(
                results,
                type_name="mobile_line",
                id_value=line.id,
                title=line.holder_name or line.line_number,
                subtitle=f"{line.line_number} · {line.plan_name or line.status}",
                link=_search_link("/telephonie", line.line_number),
                query=clean,
            )

    if can("infrastructure", "infrastructure.read"):
        infra_rows = db.scalars(
            select(InfraEquipment)
            .where(
                or_(
                    InfraEquipment.name.ilike(pattern, escape="\\"),
                    InfraEquipment.ip_address.ilike(pattern, escape="\\"),
                    InfraEquipment.mac_address.ilike(pattern, escape="\\"),
                    InfraEquipment.role.ilike(pattern, escape="\\"),
                    InfraEquipment.os_name.ilike(pattern, escape="\\"),
                )
            )
            .order_by(InfraEquipment.name)
            .limit(limit)
        ).all()
        for equipment in infra_rows:
            _add(
                results,
                type_name="infrastructure",
                id_value=equipment.id,
                title=equipment.name,
                subtitle=f"{equipment.ip_address or 'IP non renseignée'} · {equipment.type}",
                link=_search_link("/infrastructure", equipment.name),
                query=clean,
            )

    if can("stock", "stock.read"):
        stock_rows = db.scalars(
            select(StockItem)
            .where(
                or_(
                    StockItem.name.ilike(pattern, escape="\\"),
                    StockItem.reference.ilike(pattern, escape="\\"),
                    StockItem.brand.ilike(pattern, escape="\\"),
                    StockItem.model.ilike(pattern, escape="\\"),
                )
            )
            .order_by(StockItem.name)
            .limit(limit)
        ).all()
        for item in stock_rows:
            _add(
                results,
                type_name="stock_item",
                id_value=item.id,
                title=item.name,
                subtitle=f"{item.reference} · {item.quantity} {item.unit}",
                link=_search_link("/stock", item.reference),
                query=clean,
            )

    if can("licenses", "licenses.read"):
        license_rows = db.scalars(
            select(License)
            .where(
                or_(
                    License.name.ilike(pattern, escape="\\"),
                    License.vendor.ilike(pattern, escape="\\"),
                    License.license_type.ilike(pattern, escape="\\"),
                )
            )
            .order_by(License.name)
            .limit(limit)
        ).all()
        for license_row in license_rows:
            _add(
                results,
                type_name="license",
                id_value=license_row.id,
                title=license_row.name,
                subtitle=license_row.vendor or license_row.license_type,
                link=_search_link("/fournisseurs", license_row.name) + "&tab=licenses",
                query=clean,
            )

    if can("security_incidents", "security.read"):
        incident_rows = db.scalars(
            select(SecurityIncident)
            .where(
                or_(
                    SecurityIncident.reference.ilike(pattern, escape="\\"),
                    SecurityIncident.title.ilike(pattern, escape="\\"),
                    SecurityIncident.description.ilike(pattern, escape="\\"),
                )
            )
            .order_by(SecurityIncident.detected_at.desc())
            .limit(limit)
        ).all()
        for incident in incident_rows:
            _add(
                results,
                type_name="security_incident",
                id_value=incident.id,
                title=incident.title,
                subtitle=f"{incident.reference} · {incident.severity}",
                link=_search_link("/cybersecurite", incident.reference) + "&tab=incidents",
                query=clean,
            )

    if can("vulnerabilities", "security.read"):
        vulnerability_rows = db.scalars(
            select(Vulnerability)
            .where(
                or_(
                    Vulnerability.title.ilike(pattern, escape="\\"),
                    Vulnerability.cve_id.ilike(pattern, escape="\\"),
                    Vulnerability.remediation.ilike(pattern, escape="\\"),
                )
            )
            .order_by(Vulnerability.detected_at.desc().nulls_last())
            .limit(limit)
        ).all()
        for vulnerability in vulnerability_rows:
            _add(
                results,
                type_name="vulnerability",
                id_value=vulnerability.id,
                title=vulnerability.title,
                subtitle=f"{vulnerability.cve_id or 'Sans CVE'} · {vulnerability.severity}",
                link=_search_link(
                    "/cybersecurite", vulnerability.cve_id or vulnerability.title
                )
                + "&tab=vulnerabilities",
                query=clean,
            )

    if can("certificates", "security.read"):
        certificate_rows = db.scalars(
            select(Certificate)
            .where(
                or_(
                    Certificate.common_name.ilike(pattern, escape="\\"),
                    Certificate.issuer.ilike(pattern, escape="\\"),
                )
            )
            .order_by(Certificate.valid_to)
            .limit(limit)
        ).all()
        for certificate in certificate_rows:
            _add(
                results,
                type_name="certificate",
                id_value=certificate.id,
                title=certificate.common_name,
                subtitle=f"{certificate.issuer or 'Émetteur inconnu'} · {certificate.valid_to.isoformat()}",
                link=_search_link("/cybersecurite", certificate.common_name)
                + "&tab=certificates",
                query=clean,
            )

    if can("security_audits", "security.read"):
        audit_rows = db.scalars(
            select(SecurityAudit)
            .where(
                or_(
                    SecurityAudit.title.ilike(pattern, escape="\\"),
                    SecurityAudit.auditor.ilike(pattern, escape="\\"),
                )
            )
            .order_by(SecurityAudit.planned_at.desc().nulls_last())
            .limit(limit)
        ).all()
        for audit in audit_rows:
            _add(
                results,
                type_name="security_audit",
                id_value=audit.id,
                title=audit.title,
                subtitle=audit.auditor or audit.type,
                link=_search_link("/cybersecurite", audit.title) + "&tab=audits",
                query=clean,
            )

    if can("rgpd_processing", "rgpd.read"):
        processing_rows = db.scalars(
            select(ProcessingActivity)
            .where(
                or_(
                    ProcessingActivity.reference.ilike(pattern, escape="\\"),
                    ProcessingActivity.name.ilike(pattern, escape="\\"),
                    ProcessingActivity.purpose.ilike(pattern, escape="\\"),
                )
            )
            .order_by(ProcessingActivity.name)
            .limit(limit)
        ).all()
        for activity in processing_rows:
            _add(
                results,
                type_name="rgpd_processing",
                id_value=activity.id,
                title=activity.name,
                subtitle=activity.reference,
                link=_search_link("/rgpd", activity.reference) + "&tab=traitements",
                query=clean,
            )

    if can("reservation_equipments", "reservations.read"):
        reservation_rows = db.scalars(
            select(ReservableEquipment)
            .where(
                or_(
                    ReservableEquipment.name.ilike(pattern, escape="\\"),
                    ReservableEquipment.description.ilike(pattern, escape="\\"),
                    ReservableEquipment.notes.ilike(pattern, escape="\\"),
                )
            )
            .order_by(ReservableEquipment.sort_order, ReservableEquipment.name)
            .limit(limit)
        ).all()
        for reservable in reservation_rows:
            _add(
                results,
                type_name="reservation_equipment",
                id_value=reservable.id,
                title=reservable.name,
                subtitle=f"Matériel réservable · {reservable.category}",
                link=_search_link("/reservations", reservable.name) + "&tab=equipments",
                query=clean,
            )

    if can("interventions", "interventions.read"):
        intervention_rows = db.scalars(
            select(Intervention)
            .where(
                or_(
                    Intervention.reference.ilike(pattern, escape="\\"),
                    Intervention.title.ilike(pattern, escape="\\"),
                    Intervention.description.ilike(pattern, escape="\\"),
                )
            )
            .order_by(Intervention.scheduled_at.desc().nulls_last())
            .limit(limit)
        ).all()
        for intervention in intervention_rows:
            _add(
                results,
                type_name="intervention",
                id_value=intervention.id,
                title=intervention.title,
                subtitle=f"{intervention.reference} · {intervention.status}",
                link=_search_link("/demandes", intervention.reference) + "&tab=interventions",
                query=clean,
            )

    if can("calendar_events", "calendar.read"):
        event_rows = db.scalars(
            select(CalendarEvent)
            .where(
                or_(
                    CalendarEvent.title.ilike(pattern, escape="\\"),
                    CalendarEvent.description.ilike(pattern, escape="\\"),
                    CalendarEvent.location.ilike(pattern, escape="\\"),
                )
            )
            .order_by(CalendarEvent.start_at.desc())
            .limit(limit)
        ).all()
        for event in event_rows:
            _add(
                results,
                type_name="calendar_event",
                id_value=event.id,
                title=event.title,
                subtitle=f"{event.start_at:%d/%m/%Y %H:%M} · {event.event_type}",
                link=_search_link("/calendrier", event.title)
                + f"&date={quote(event.start_at.isoformat())}",
                query=clean,
            )

    if can("calendar_actions", "calendar.read"):
        action_rows = db.scalars(
            select(ActionItem)
            .where(
                or_(
                    ActionItem.title.ilike(pattern, escape="\\"),
                    ActionItem.description.ilike(pattern, escape="\\"),
                )
            )
            .order_by(ActionItem.due_date.asc().nulls_last())
            .limit(limit)
        ).all()
        for action in action_rows:
            _add(
                results,
                type_name="calendar_action",
                id_value=action.id,
                title=action.title,
                subtitle=f"Action · {action.status}",
                link=_search_link("/calendrier", action.title) + "&tab=actions",
                query=clean,
            )

    if can("budgets", "budget.read"):
        budget_conditions: list = [Budget.name.ilike(pattern, escape="\\")]
        if clean.isdigit():
            budget_conditions.append(Budget.year == int(clean))
        budget_rows = db.scalars(
            select(Budget)
            .where(or_(*budget_conditions))
            .order_by(Budget.year.desc())
            .limit(limit)
        ).all()
        for budget in budget_rows:
            _add(
                results,
                type_name="budget",
                id_value=budget.id,
                title=f"Budget {budget.year}",
                subtitle=budget.name,
                link=f"/budget?year={budget.year}",
                query=clean,
            )

    results.sort(key=lambda item: (-item.score, item.title.lower()))

    elapsed = int((time.perf_counter() - started) * 1000)
    return SearchResponse(query=clean, results=results, total=len(results), took_ms=elapsed)
