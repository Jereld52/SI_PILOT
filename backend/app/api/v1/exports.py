from datetime import UTC, date, datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.core.errors import NotFoundError, PermissionDeniedError, ValidationAppError
from app.core.permissions import has_permission
from app.db.session import get_db
from app.exports import assets as assets_export
from app.exports import custom as custom_export
from app.exports import infrastructure as infrastructure_export
from app.exports import mobile as mobile_export
from app.exports import rgpd as rgpd_export
from app.exports import statistics as statistics_export
from app.exports import tickets as tickets_export
from app.models.assets import Asset, AssetAssignment, StockMovement
from app.models.auth import User
from app.models.infrastructure import InfraDependency, InfraEquipment, MonitoringCheck
from app.models.mobile import MobileLine
from app.models.organization import Agent, AgentAccount, Location, Service
from app.models.rgpd import (
    DataBreach,
    DataCollection,
    DpoRequest,
    ProcessingActivity,
    RightsRequest,
)
from app.models.tickets import Ticket
from app.services import assets_service, mobile_service, rgpd_service, statistics_service
from app.services.audit_service import write_audit
from app.services.periods import Granularity, build_periods, default_range

router = APIRouter(prefix="/exports", tags=["Exports"])


def _filename(prefix: str, extension: str) -> str:
    return f"{prefix}-{datetime.now().strftime('%Y%m%d-%H%M%S')}.{extension}"


@router.get("/assets")
def export_assets(
    request: Request,
    format: Literal["xlsx", "pdf"] = Query("xlsx"),
    actor: User = Depends(require_permission("exports.run")),
    db: Session = Depends(get_db),
):
    if not has_permission(actor, "assets.read"):
        raise PermissionDeniedError("Vous ne pouvez pas exporter le parc.")
    assets = assets_service.list_assets(db, include_archived=False)
    assignment_rows = db.execute(
        select(AssetAssignment, Asset, Agent, Service, Location)
        .join(Asset, AssetAssignment.asset_id == Asset.id)
        .outerjoin(Agent, AssetAssignment.agent_id == Agent.id)
        .outerjoin(Service, AssetAssignment.service_id == Service.id)
        .outerjoin(Location, AssetAssignment.location_id == Location.id)
        .order_by(Asset.asset_tag, AssetAssignment.started_at)
    ).all()
    assignments = [
        {
            "asset_tag": asset.asset_tag,
            "asset_name": asset.name,
            "agent_name": f"{agent.first_name} {agent.last_name}" if agent else "",
            "service_name": service.name if service else "",
            "location_name": location.name if location else "",
            "started_at": assignment.started_at.isoformat()
            if assignment.started_at
            else "",
            "ended_at": assignment.ended_at.isoformat() if assignment.ended_at else "",
            "reason": assignment.reason or "",
        }
        for assignment, asset, agent, service, location in assignment_rows
    ]
    content = (
        assets_export.assets_xlsx(assets, assignments=assignments)
        if format == "xlsx"
        else assets_export.assets_pdf(assets)
    )
    media_type = (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        if format == "xlsx"
        else "application/pdf"
    )
    write_audit(
        db,
        module="exports",
        action="assets_exported",
        actor=actor,
        entity_type="export",
        entity_label=f"parc.{format}",
        after={"count": len(assets), "format": format},
        request=request,
    )
    db.commit()
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{_filename("parc-informatique", format)}"'},
    )


@router.get("/tickets")
def export_tickets(
    request: Request,
    format: Literal["xlsx", "pdf"] = Query("xlsx"),
    start: date | None = None,
    end: date | None = None,
    granularity: Granularity = Query("month"),
    actor: User = Depends(require_permission("exports.run")),
    db: Session = Depends(get_db),
):
    if not has_permission(actor, "tickets.read"):
        raise PermissionDeniedError("Vous ne pouvez pas exporter les tickets.")
    if start is None or end is None:
        start, end = default_range(granularity)
    periods = build_periods(start, end, granularity)
    start_dt = datetime.combine(start, datetime.min.time(), tzinfo=UTC)
    end_dt = datetime.combine(end, datetime.max.time(), tzinfo=UTC)
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
    content = (
        tickets_export.tickets_xlsx(
            tickets, periods, granularity, start=start, end=end
        )
        if format == "xlsx"
        else tickets_export.tickets_pdf(
            tickets, periods, granularity, start=start, end=end
        )
    )
    media_type = (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        if format == "xlsx"
        else "application/pdf"
    )
    write_audit(
        db,
        module="exports",
        action="tickets_exported",
        actor=actor,
        entity_type="export",
        entity_label=f"tickets.{format}",
        after={
            "count": len(tickets),
            "format": format,
            "start": start.isoformat(),
            "end": end.isoformat(),
            "granularity": granularity,
        },
        request=request,
    )
    db.commit()
    return Response(
        content=content,
        media_type=media_type,
        headers={
            "Content-Disposition": (
                f'attachment; filename="tickets-{start.isoformat()}-{end.isoformat()}-{granularity}.{format}"'
            )
        },
    )


@router.get("/statistics")
def export_statistics(
    request: Request,
    format: Literal["xlsx", "pdf"] = Query("xlsx"),
    start: date | None = None,
    end: date | None = None,
    granularity: Granularity = Query("month"),
    actor: User = Depends(require_permission("exports.run")),
    db: Session = Depends(get_db),
):
    if not has_permission(actor, "statistics.read"):
        raise PermissionDeniedError("Vous ne pouvez pas exporter les statistiques.")
    overview = statistics_service.get_overview(
        db, start=start, end=end, granularity=granularity
    )
    content = (
        statistics_export.statistics_xlsx(overview)
        if format == "xlsx"
        else statistics_export.statistics_pdf(overview)
    )
    media_type = (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        if format == "xlsx"
        else "application/pdf"
    )
    write_audit(
        db,
        module="exports",
        action="statistics_exported",
        actor=actor,
        entity_type="export",
        entity_label=f"statistics.{format}",
        after={
            "format": format,
            "start": overview.start.isoformat(),
            "end": overview.end.isoformat(),
            "granularity": granularity,
        },
        request=request,
    )
    db.commit()
    return Response(
        content=content,
        media_type=media_type,
        headers={
            "Content-Disposition": (
                f'attachment; filename="statistiques-{overview.start.isoformat()}-'
                f'{overview.end.isoformat()}-{granularity}.{format}"'
            )
        },
    )


@router.get("/mobile-lines")
def export_mobile_lines(
    request: Request,
    format: Literal["xlsx", "pdf"] = Query("xlsx"),
    actor: User = Depends(require_permission("exports.run")),
    db: Session = Depends(get_db),
):
    if not has_permission(actor, "mobile_lines.read"):
        raise PermissionDeniedError("Vous ne pouvez pas exporter les lignes mobiles.")
    lines = mobile_service.list_mobile_lines(db)
    content = mobile_export.mobile_lines_xlsx(lines) if format == "xlsx" else mobile_export.mobile_lines_pdf(lines)
    media_type = (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        if format == "xlsx"
        else "application/pdf"
    )
    write_audit(
        db,
        module="exports",
        action="mobile_lines_exported",
        actor=actor,
        entity_type="export",
        entity_label=f"mobile-lines.{format}",
        after={"count": len(lines), "format": format},
        request=request,
    )
    db.commit()
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{_filename("lignes-mobiles", format)}"'},
    )


@router.get("/infrastructure")
def export_infrastructure(
    request: Request,
    format: Literal["xlsx", "pdf"] = Query("xlsx"),
    actor: User = Depends(require_permission("exports.run")),
    db: Session = Depends(get_db),
):
    if not has_permission(actor, "infrastructure.read"):
        raise PermissionDeniedError("Vous ne pouvez pas exporter l'infrastructure.")
    equipments = list(
        db.scalars(
            select(InfraEquipment).order_by(InfraEquipment.type, InfraEquipment.name)
        ).all()
    )
    dependencies = list(
        db.scalars(
            select(InfraDependency).order_by(
                InfraDependency.dependency_type, InfraDependency.source_id
            )
        ).all()
    )
    checks = list(
        db.scalars(
            select(MonitoringCheck).order_by(MonitoringCheck.check_type)
        ).all()
    )
    content = (
        infrastructure_export.infrastructure_xlsx(equipments, dependencies, checks)
        if format == "xlsx"
        else infrastructure_export.infrastructure_pdf(equipments)
    )
    media_type = (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        if format == "xlsx"
        else "application/pdf"
    )
    write_audit(
        db,
        module="exports",
        action="infrastructure_exported",
        actor=actor,
        entity_type="export",
        entity_label=f"infrastructure.{format}",
        after={
            "count": len(equipments),
            "dependencies": len(dependencies),
            "checks": len(checks),
            "format": format,
        },
        request=request,
    )
    db.commit()
    return Response(
        content=content,
        media_type=media_type,
        headers={
            "Content-Disposition": (
                f'attachment; filename="{_filename("infrastructure", format)}"'
            )
        },
    )


def _rgpd_lists(db: Session) -> tuple[
    list[ProcessingActivity],
    list[DataCollection],
    list[DpoRequest],
    list[RightsRequest],
    list[DataBreach],
]:
    activities = list(
        db.scalars(
            select(ProcessingActivity).order_by(
                ProcessingActivity.status, ProcessingActivity.name
            )
        ).all()
    )
    collections = list(
        db.scalars(
            select(DataCollection).order_by(
                DataCollection.status, DataCollection.name
            )
        ).all()
    )
    dpo_requests = list(
        db.scalars(
            select(DpoRequest).order_by(DpoRequest.status, DpoRequest.due_date)
        ).all()
    )
    rights_requests = list(
        db.scalars(
            select(RightsRequest).order_by(
                RightsRequest.status, RightsRequest.due_date
            )
        ).all()
    )
    breaches = list(
        db.scalars(
            select(DataBreach).order_by(DataBreach.status, DataBreach.discovered_at)
        ).all()
    )
    return activities, collections, dpo_requests, rights_requests, breaches


@router.get("/rgpd")
def export_rgpd(
    request: Request,
    format: Literal["xlsx", "pdf"] = Query("xlsx"),
    actor: User = Depends(require_permission("exports.run")),
    db: Session = Depends(get_db),
):
    if not has_permission(actor, "rgpd.read"):
        raise PermissionDeniedError("Vous ne pouvez pas exporter le registre RGPD.")
    activities, collections, dpo_requests, rights_requests, breaches = _rgpd_lists(db)
    content = (
        rgpd_export.rgpd_xlsx(
            activities, collections, dpo_requests, rights_requests, breaches
        )
        if format == "xlsx"
        else rgpd_export.rgpd_pdf(
            activities, collections, dpo_requests, rights_requests, breaches
        )
    )
    media_type = (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        if format == "xlsx"
        else "application/pdf"
    )
    write_audit(
        db,
        module="exports",
        action="rgpd_exported",
        actor=actor,
        entity_type="export",
        entity_label=f"rgpd.{format}",
        after={
            "activities": len(activities),
            "collections": len(collections),
            "dpo_requests": len(dpo_requests),
            "rights_requests": len(rights_requests),
            "breaches": len(breaches),
            "format": format,
        },
        request=request,
    )
    db.commit()
    return Response(
        content=content,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{_filename("registre-rgpd", format)}"'
        },
    )


@router.get("/rgpd/rights-requests/{rights_id}")
def export_rights_request_dossier(
    rights_id: UUID,
    request: Request,
    format: Literal["xlsx", "pdf"] = Query("xlsx"),
    actor: User = Depends(require_permission("exports.run")),
    db: Session = Depends(get_db),
):
    if not has_permission(actor, "rgpd.read"):
        raise PermissionDeniedError("Vous ne pouvez pas exporter une demande RGPD.")
    rights_request = rgpd_service.get_rights_request(db, rights_id)
    activity = rights_request.processing_activity
    collections = (
        list(
            db.scalars(
                select(DataCollection)
                .where(DataCollection.processing_activity_id == activity.id)
                .order_by(DataCollection.name)
            ).all()
        )
        if activity
        else []
    )
    content = (
        rgpd_export.rights_dossier_xlsx(rights_request, activity, collections)
        if format == "xlsx"
        else rgpd_export.rights_dossier_pdf(rights_request, activity, collections)
    )
    media_type = (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        if format == "xlsx"
        else "application/pdf"
    )
    write_audit(
        db,
        module="exports",
        action="rgpd_rights_dossier_exported",
        actor=actor,
        entity_type="rights_request",
        entity_id=str(rights_request.id),
        entity_label=rights_request.reference,
        after={"collections": len(collections), "format": format},
        request=request,
    )
    db.commit()
    return Response(
        content=content,
        media_type=media_type,
        headers={
            "Content-Disposition": (
                f'attachment; filename="{_filename("rgpd-demande-" + rights_request.reference, format)}"'
            )
        },
    )


@router.get("/rgpd/agents/{agent_id}")
def export_agent_personal_data(
    agent_id: UUID,
    request: Request,
    format: Literal["xlsx", "pdf"] = Query("xlsx"),
    actor: User = Depends(require_permission("exports.run")),
    db: Session = Depends(get_db),
):
    if not has_permission(actor, "rgpd.read") or not has_permission(actor, "agents.read"):
        raise PermissionDeniedError(
            "Vous ne pouvez pas exporter les données personnelles d'un agent."
        )
    agent = db.get(Agent, agent_id)
    if agent is None:
        raise NotFoundError("Agent introuvable.")
    accounts = list(
        db.scalars(
            select(AgentAccount)
            .where(AgentAccount.agent_id == agent.id)
            .order_by(AgentAccount.system_label)
        ).all()
    )
    assets = list(
        db.scalars(
            select(Asset)
            .where(Asset.assigned_agent_id == agent.id)
            .order_by(Asset.asset_tag)
        ).all()
    )
    assignments = list(
        db.scalars(
            select(AssetAssignment)
            .where(AssetAssignment.agent_id == agent.id)
            .order_by(AssetAssignment.started_at)
        ).all()
    )
    stock_movements = list(
        db.scalars(
            select(StockMovement)
            .where(StockMovement.recipient_agent_id == agent.id)
            .order_by(StockMovement.moved_at)
        ).all()
    )
    tickets = list(
        db.scalars(
            select(Ticket)
            .where(Ticket.requester_agent_id == agent.id)
            .order_by(Ticket.opened_at.desc())
        ).all()
    )
    full_name = f"{agent.first_name} {agent.last_name}".strip()
    mobile_lines = list(
        db.scalars(
            select(MobileLine)
            .where(
                or_(
                    func.lower(MobileLine.email) == agent.email_pro.lower(),
                    MobileLine.holder_name == full_name,
                )
            )
            .order_by(MobileLine.line_number)
        ).all()
    )
    content = (
        rgpd_export.agent_xlsx(
            agent, accounts, assets, assignments, stock_movements, tickets, mobile_lines
        )
        if format == "xlsx"
        else rgpd_export.agent_pdf(
            agent, accounts, assets, assignments, stock_movements, tickets, mobile_lines
        )
    )
    media_type = (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        if format == "xlsx"
        else "application/pdf"
    )
    write_audit(
        db,
        module="exports",
        action="rgpd_agent_data_exported",
        actor=actor,
        entity_type="agent",
        entity_id=str(agent.id),
        entity_label=agent.email_pro,
        after={
            "accounts": len(accounts),
            "assets": len(assets),
            "assignments": len(assignments),
            "mobile_lines": len(mobile_lines),
            "tickets": len(tickets),
            "stock_movements": len(stock_movements),
            "format": format,
        },
        request=request,
    )
    db.commit()
    return Response(
        content=content,
        media_type=media_type,
        headers={
            "Content-Disposition": (
                f'attachment; filename="{_filename("rgpd-donnees-agent", format)}"'
            )
        },
    )


@router.get("/custom/catalog")
def custom_export_catalog(
    actor: User = Depends(require_permission("exports.run")),
) -> list[dict]:
    return custom_export.catalog(actor)


@router.get("/custom")
def export_custom(
    request: Request,
    dataset: str = Query(..., max_length=60),
    format: Literal["xlsx", "pdf"] = Query("xlsx"),
    columns: str | None = Query(None, max_length=4000),
    q: str | None = Query(None, max_length=120),
    status: str | None = Query(None, max_length=60),
    type_: str | None = Query(None, alias="type", max_length=60),
    location_id: UUID | None = None,
    start: date | None = None,
    end: date | None = None,
    actor: User = Depends(require_permission("exports.run")),
    db: Session = Depends(get_db),
):
    spec = custom_export.DATASETS.get(dataset)
    if spec is None:
        raise ValidationAppError("Jeu de données d'export inconnu.")
    if not has_permission(actor, spec.permission):
        raise PermissionDeniedError(
            "Vous ne pouvez pas exporter ce jeu de données."
        )
    requested = [key.strip() for key in (columns or "").split(",") if key.strip()]
    selected = custom_export.select_columns(spec, requested)
    rows = custom_export.load_rows(
        db,
        dataset,
        q=q,
        status=status,
        type_=type_,
        location_id=location_id,
        start=start,
        end=end,
    )
    title = spec.label
    content = (
        custom_export.custom_xlsx(title, selected, rows)
        if format == "xlsx"
        else custom_export.custom_pdf(title, selected, rows)
    )
    media_type = (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        if format == "xlsx"
        else "application/pdf"
    )
    write_audit(
        db,
        module="exports",
        action="custom_exported",
        actor=actor,
        entity_type="export",
        entity_label=f"custom.{dataset}.{format}",
        after={
            "dataset": dataset,
            "columns": len(selected),
            "rows": len(rows),
            "format": format,
            "filtered": bool(q or status or type_ or location_id or start or end),
        },
        request=request,
    )
    db.commit()
    return Response(
        content=content,
        media_type=media_type,
        headers={
            "Content-Disposition": (
                f'attachment; filename="{_filename("export-" + dataset, format)}"'
            )
        },
    )
