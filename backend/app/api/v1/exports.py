from datetime import UTC, date, datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.core.errors import PermissionDeniedError
from app.core.permissions import has_permission
from app.db.session import get_db
from app.exports import assets as assets_export
from app.exports import infrastructure as infrastructure_export
from app.exports import mobile as mobile_export
from app.exports import statistics as statistics_export
from app.exports import tickets as tickets_export
from app.models.assets import Asset, AssetAssignment
from app.models.auth import User
from app.models.infrastructure import InfraDependency, InfraEquipment, MonitoringCheck
from app.models.organization import Agent, Location, Service
from app.models.tickets import Ticket
from app.services import assets_service, mobile_service, statistics_service
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
