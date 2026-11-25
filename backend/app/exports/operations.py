from __future__ import annotations

import io
import json
from datetime import date, datetime
from typing import Any
from xml.sax.saxutils import escape

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, Spacer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.exports.pdf_utils import (
    PdfBranding,
    create_document,
    heading,
    make_table,
    meta_line,
)
from app.models.automation import SchedulerRun
from app.schemas.statistics import StatsPoint
from app.services import backup_service, scheduler_service, statistics_service


def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "body": ParagraphStyle(
            "OperationsBody",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9,
            leading=13,
            spaceAfter=4,
        ),
        "muted": ParagraphStyle(
            "OperationsMuted",
            parent=base["Normal"],
            fontName="Helvetica-Oblique",
            fontSize=8,
            leading=11,
            textColor="#666666",
            spaceAfter=4,
        ),
    }


def _euro(value: float | int | None) -> str:
    return f"{float(value or 0):,.0f} €".replace(",", " ")


def _date(value: date | datetime | None) -> str:
    return value.strftime("%d/%m/%Y") if value else "—"


def _distribution(rows: list[StatsPoint]) -> list[list[Any]]:
    return [["Libellé", "Valeur"]] + [[point.label, point.value] for point in rows]


def _last_veeam_run(db: Session) -> tuple[str, list[dict[str, Any]]]:
    run = db.scalars(
        select(SchedulerRun)
        .where(SchedulerRun.job == "veeam")
        .order_by(SchedulerRun.started_at.desc())
        .limit(1)
    ).first()
    if run is None:
        return "Aucune vérification Veeam enregistrée.", []
    details: dict[str, Any] = {}
    if run.details_json:
        try:
            parsed = json.loads(run.details_json)
            details = parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            details = {}
    alerts = details.get("alerts")
    return run.summary or "Vérification Veeam", alerts if isinstance(alerts, list) else []


def operations_report_pdf(
    db: Session,
    *,
    start: date,
    end: date,
    branding: PdfBranding | None = None,
) -> bytes:
    overview = statistics_service.get_overview(
        db, start=start, end=end, granularity="week"
    )
    checks = scheduler_service.checks_snapshot(db)
    veeam_note, veeam_alerts = _last_veeam_run(db)
    backup = backup_service.status(db)
    styles = _styles()

    buffer = io.BytesIO()
    document = create_document(
        buffer,
        title="Rapport d'exploitation",
        subtitle=(
            f"Du {start.strftime('%d/%m/%Y')} au {end.strftime('%d/%m/%Y')}"
        ),
        pagesize=A4,
        branding=branding,
    )
    story: list[Any] = [
        meta_line(count=len(overview.kpis), label="indicateur(s)"),
    ]

    story.append(heading("Synthèse"))
    kpi_rows = [["Indicateur", "Valeur", "Précision"]] + [
        [
            kpi.label,
            f"{kpi.value} {kpi.unit or ''}".strip(),
            kpi.hint or "",
        ]
        for kpi in overview.kpis
    ]
    story.extend(
        [
            make_table(kpi_rows, [80 * mm, 30 * mm, 80 * mm], font_size=7.5),
            Spacer(1, 6),
        ]
    )

    story.append(heading("Support et interventions"))
    period_rows: list[list[Any]] = [["Période", "Tickets créés", "Résolus", "Clos", "Interventions", "Incidents"]]
    for index, point in enumerate(overview.ticket_periods):
        period_rows.append(
            [
                point.label,
                point.created,
                point.resolved,
                point.closed,
                overview.intervention_periods[index].created
                if index < len(overview.intervention_periods)
                else 0,
                overview.security_periods[index].created
                if index < len(overview.security_periods)
                else 0,
            ]
        )
    story.extend(
        [
            make_table(
                period_rows,
                [42 * mm, 24 * mm, 20 * mm, 18 * mm, 30 * mm, 24 * mm],
                font_size=7.5,
            ),
            Spacer(1, 6),
        ]
    )
    story.append(heading("Tickets par statut"))
    story.append(make_table(_distribution(overview.tickets_by_status), [100 * mm, 30 * mm], font_size=7.5))
    story.append(heading("Tickets par priorité"))
    story.append(make_table(_distribution(overview.tickets_by_priority), [100 * mm, 30 * mm], font_size=7.5))
    story.append(Spacer(1, 6))

    story.append(heading("Parc et sécurité"))
    story.append(heading("Parc par état"))
    story.append(make_table(_distribution(overview.assets_by_status), [100 * mm, 30 * mm], font_size=7.5))
    story.append(heading("Sécurité par gravité"))
    story.append(make_table(_distribution(overview.security_by_severity), [100 * mm, 30 * mm], font_size=7.5))
    story.append(Spacer(1, 6))

    story.append(heading("Sauvegardes et supervision"))
    story.append(
        Paragraph(
            escape(
                f"Contrôles : {checks['up']} OK, {len(checks['down'])} en échec, "
                f"{checks['unknown']} inconnu(s) sur {checks['total']}."
            ),
            styles["body"],
        )
    )
    if checks["down"]:
        down_rows = [["Équipement", "Type", "Message", "Dernier contrôle"]]
        for item in checks["down"]:
            down_rows.append(
                [
                    item["infrastructure"] or "—",
                    item["type"],
                    item["message"] or "",
                    item["checked_at"],
                ]
            )
        story.append(make_table(down_rows, [45 * mm, 20 * mm, 85 * mm, 35 * mm], font_size=7.5))
    else:
        story.append(Paragraph("Aucun contrôle en échec actuellement.", styles["muted"]))
    story.append(Spacer(1, 4))
    story.append(Paragraph(escape(veeam_note), styles["body"]))
    if veeam_alerts:
        alert_rows = [["Alerte", "Détail"]] + [
            [item["title"], item["detail"]] for item in veeam_alerts[:15]
        ]
        story.append(make_table(alert_rows, [65 * mm, 110 * mm], font_size=7.5))
    story.append(Spacer(1, 4))
    if backup.last_backup_at:
        story.append(
            Paragraph(
                escape(
                    f"Sauvegarde SI PILOT : {backup.last_backup_name} "
                    f"({round((backup.last_backup_size or 0) / (1024 * 1024), 1)} Mo), "
                    f"le {_date(backup.last_backup_at)}."
                ),
                styles["body"],
            )
        )
    else:
        story.append(
            Paragraph("Sauvegarde SI PILOT : aucune archive enregistrée.", styles["body"])
        )
    story.append(Spacer(1, 6))

    story.append(heading("Contrats et projets"))
    story.append(heading("Contrats par statut"))
    story.append(make_table(_distribution(overview.contracts_by_status), [100 * mm, 30 * mm], font_size=7.5))
    story.append(heading("Projets par statut"))
    story.append(make_table(_distribution(overview.projects_by_status), [100 * mm, 30 * mm], font_size=7.5))

    if overview.budget is not None:
        story.append(heading(f"Budget {overview.budget.year}"))
        story.append(
            Paragraph(
                escape(
                    f"Voté : {_euro(overview.budget.voted)} · "
                    f"Engagé : {_euro(overview.budget.committed)} · "
                    f"Facturé : {_euro(overview.budget.invoiced)} · "
                    f"Disponible : {_euro(overview.budget.available)}"
                ),
                styles["body"],
            )
        )
        budget_rows = [["Catégorie", "Voté", "Engagé", "Facturé"]]
        for category in overview.budget.categories:
            budget_rows.append(
                [
                    category.label,
                    _euro(category.voted),
                    _euro(category.committed),
                    _euro(category.invoiced),
                ]
            )
        story.append(make_table(budget_rows, [85 * mm, 30 * mm, 30 * mm, 30 * mm], font_size=7.5))

    story.append(Spacer(1, 8))
    story.append(
        Paragraph(
            "Document généré automatiquement par SI PILOT. Vérifier les données "
            "personnelles et les informations sensibles avant diffusion.",
            styles["muted"],
        )
    )

    document.build(story)
    return buffer.getvalue()
