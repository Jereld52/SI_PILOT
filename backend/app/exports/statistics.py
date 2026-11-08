from __future__ import annotations

import io

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.schemas.statistics import StatisticsOverview, StatsPoint

HEADER_FILL = PatternFill("solid", fgColor="772B2F")
HEADER_FONT = Font(color="F3EFE2", bold=True)


def _append_sheet(workbook: Workbook, title: str, headers: list[str], rows: list[list]) -> None:
    sheet = workbook.create_sheet(title)
    sheet.append(headers)
    for cell in sheet[1]:
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(vertical="center")
    for row in rows:
        sheet.append(row)
    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = sheet.dimensions
    for index, header in enumerate(headers, start=1):
        width = max(14, min(50, len(str(header)) + 6))
        if rows:
            width = max(width, min(50, max(len(str(row[index - 1] or "")) for row in rows) + 2))
        sheet.column_dimensions[get_column_letter(index)].width = width


def _points_rows(points: list[StatsPoint]) -> list[list]:
    return [[point.label, point.value] for point in points]


def statistics_xlsx(overview: StatisticsOverview) -> bytes:
    workbook = Workbook()
    workbook.remove(workbook.active)
    _append_sheet(
        workbook,
        "Synthèse",
        ["Indicateur", "Valeur", "Unité", "Précision"],
        [
            [kpi.label, kpi.value, kpi.unit or "", kpi.hint or ""]
            for kpi in overview.kpis
        ],
    )
    _append_sheet(
        workbook,
        "Tickets",
        ["Période", "Créés", "Résolus", "Clos"],
        [
            [point.label, point.created, point.resolved, point.closed]
            for point in overview.ticket_periods
        ],
    )
    _append_sheet(
        workbook,
        "Interventions",
        ["Période", "Créées", "Terminées"],
        [
            [point.label, point.created, point.resolved]
            for point in overview.intervention_periods
        ],
    )
    _append_sheet(
        workbook,
        "Cybersécurité",
        ["Période", "Incidents", "Clos"],
        [
            [point.label, point.created, point.closed]
            for point in overview.security_periods
        ],
    )
    for title, points in (
        ("Tickets statut", overview.tickets_by_status),
        ("Tickets priorité", overview.tickets_by_priority),
        ("Tickets catégorie", overview.tickets_by_category),
        ("Tickets assigné", overview.tickets_by_assignee),
        ("Parc statut", overview.assets_by_status),
        ("Parc catégorie", overview.assets_by_category),
        ("Interventions statut", overview.interventions_by_status),
        ("Contrats statut", overview.contracts_by_status),
        ("Projets statut", overview.projects_by_status),
        ("Sécurité gravité", overview.security_by_severity),
        ("Téléphonie statut", overview.mobile_by_status),
        ("Documents statut", overview.documents_by_status),
    ):
        _append_sheet(workbook, title, ["Libellé", "Valeur"], _points_rows(points))
    if overview.budget is not None:
        _append_sheet(
            workbook,
            "Budget",
            ["Catégorie", "Voté", "Engagé", "Facturé"],
            [
                [category.label, category.voted, category.committed, category.invoiced]
                for category in overview.budget.categories
            ],
        )
    summary = workbook.create_sheet("Paramètres", 0)
    summary.append(
        [
            "Statistiques consolidées",
            f"{overview.start.isoformat()} → {overview.end.isoformat()}",
        ]
    )
    summary.append(["Granularité", overview.granularity])
    summary["A1"].font = Font(bold=True, size=14, color="772B2F")
    summary.column_dimensions["A"].width = 28
    summary.column_dimensions["B"].width = 44
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def _table_style() -> TableStyle:
    return TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#772B2F")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#F3EFE2")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 7),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#CDCDCD")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F7F4EA")]),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 3),
            ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ]
    )


def statistics_pdf(overview: StatisticsOverview) -> bytes:
    buffer = io.BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        leftMargin=10 * mm,
        rightMargin=10 * mm,
        topMargin=10 * mm,
        bottomMargin=10 * mm,
        title="Statistiques consolidées",
    )
    styles = getSampleStyleSheet()
    story = [
        Paragraph(
            f"Statistiques consolidées — du {overview.start.strftime('%d/%m/%Y')} "
            f"au {overview.end.strftime('%d/%m/%Y')} — granularité {overview.granularity}",
            styles["Title"],
        ),
        Spacer(1, 6),
    ]
    kpi_rows = [["Indicateur", "Valeur", "Précision"]] + [
        [
            kpi.label,
            f"{kpi.value} {kpi.unit or ''}".strip(),
            kpi.hint or "",
        ]
        for kpi in overview.kpis
    ]
    table = Table(kpi_rows, repeatRows=1, colWidths=[80 * mm, 35 * mm, 140 * mm])
    table.setStyle(_table_style())
    story.extend([Paragraph("Indicateurs clés", styles["Heading2"]), table, Spacer(1, 8)])

    period_rows = [["Période", "Créés", "Résolus", "Clos", "Interventions", "Incidents"]] + [
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
        for index, point in enumerate(overview.ticket_periods)
    ]
    table = Table(period_rows, repeatRows=1, colWidths=[45 * mm, 22 * mm, 22 * mm, 22 * mm, 32 * mm, 30 * mm])
    table.setStyle(_table_style())
    story.extend([Paragraph("Activité par période", styles["Heading2"]), table, Spacer(1, 8)])

    for title, points in (
        ("Tickets par statut", overview.tickets_by_status),
        ("Tickets par priorité", overview.tickets_by_priority),
        ("Tickets par catégorie", overview.tickets_by_category),
    ):
        rows = [["Libellé", "Tickets"]] + [[point.label, point.value] for point in points]
        table = Table(rows, repeatRows=1, colWidths=[110 * mm, 30 * mm])
        table.setStyle(_table_style())
        story.extend([Paragraph(title, styles["Heading2"]), table, Spacer(1, 5)])

    if overview.budget is not None:
        rows = [["Catégorie", "Voté", "Engagé", "Facturé"]] + [
            [category.label, category.voted, category.committed, category.invoiced]
            for category in overview.budget.categories
        ]
        table = Table(rows, repeatRows=1, colWidths=[100 * mm, 30 * mm, 30 * mm, 30 * mm])
        table.setStyle(_table_style())
        story.extend([Paragraph("Budget par catégorie", styles["Heading2"]), table])

    document.build(story)
    return buffer.getvalue()
