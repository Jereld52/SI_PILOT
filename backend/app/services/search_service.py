import time
from collections.abc import Iterable
from urllib.parse import quote

from app.core.permissions import has_permission
from app.models.assets import Asset, Supplier
from app.models.auth import User
from app.models.contracts import Contract
from app.models.documents import Document
from app.models.organization import Agent
from app.models.projects import Project
from app.models.tickets import Ticket
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

    results.sort(key=lambda item: (-item.score, item.title.lower()))
    elapsed = int((time.perf_counter() - started) * 1000)
    return SearchResponse(query=clean, results=results, total=len(results), took_ms=elapsed)
