from __future__ import annotations

import io
from collections import Counter
from datetime import date

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import Spacer, TableStyle

from app.exports.pdf_utils import PdfBranding, create_document, heading, make_table, meta_line
from app.models.tickets import Ticket
from app.services.periods import Granularity, StatPeriod, period_key

HEADERS = [
    "Référence",
    "Objet",
    "Statut",
    "Priorité",
    "Catégorie",
    "Demandeur",
    "Service",
    "Assigné",
    "Origine",
    "Ouvert le",
    "Première réponse",
    "Résolu le",
    "Clos le",
    "Échéance",
    "Temps passé (min)",
    "Résolution",
    "Satisfaction",
]

SOURCE_LABELS = {
    "manual": "Saisie manuelle",
    "direct": "Demande directe",
    "email": "E-mail",
    "phone": "Téléphone",
    "portal": "Portail",
    "import": "Import",
}

HEADER_FILL = PatternFill("solid", fgColor="772B2F")
HEADER_FONT = Font(color="F3EFE2", bold=True)


def _name(agent) -> str:  # noqa: ANN001
    return f"{agent.first_name} {agent.last_name}" if agent else ""


def _user_name(user) -> str:  # noqa: ANN001
    return f"{user.first_name} {user.last_name}" if user else ""


def _row(ticket: Ticket) -> list:
    return [
        ticket.reference,
        ticket.subject,
        ticket.status.name,
        ticket.priority.name,
        ticket.category.name,
        _name(ticket.requester_agent),
        ticket.service.name if ticket.service else "",
        _user_name(ticket.assignee),
        SOURCE_LABELS.get(ticket.source, ticket.source),
        ticket.opened_at.isoformat() if ticket.opened_at else "",
        ticket.first_response_at.isoformat() if ticket.first_response_at else "",
        ticket.resolved_at.isoformat() if ticket.resolved_at else "",
        ticket.closed_at.isoformat() if ticket.closed_at else "",
        ticket.due_at.isoformat() if ticket.due_at else "",
        ticket.time_spent_minutes,
        ticket.resolution or "",
        ticket.satisfaction_score,
    ]


def ticket_period_rows(
    tickets: list[Ticket], periods: list[StatPeriod], granularity: Granularity
) -> list[dict]:
    rows: list[dict] = []
    for period in periods:
        created = [
            ticket
            for ticket in tickets
            if period_key(ticket.opened_at, granularity) == period.key
        ]
        resolved = [
            ticket
            for ticket in tickets
            if ticket.resolved_at and period_key(ticket.resolved_at, granularity) == period.key
        ]
        closed = [
            ticket
            for ticket in tickets
            if ticket.closed_at and period_key(ticket.closed_at, granularity) == period.key
        ]
        resolution_hours = [
            (ticket.resolved_at - ticket.opened_at).total_seconds() / 3600
            for ticket in resolved
            if ticket.resolved_at and ticket.opened_at
        ]
        sla_base = [
            ticket
            for ticket in created
            if ticket.due_at is not None
            and (ticket.resolved_at is not None or ticket.closed_at is not None)
        ]
        sla_ok = [
            ticket
            for ticket in sla_base
            if (ticket.resolved_at or ticket.closed_at) <= ticket.due_at  # type: ignore[operator]
        ]
        rows.append(
            {
                "Période": period.label,
                "Créés": len(created),
                "Résolus": len(resolved),
                "Clos": len(closed),
                "Temps passé (min)": sum(ticket.time_spent_minutes or 0 for ticket in created),
                "Résolution moyenne (h)": round(
                    sum(resolution_hours) / len(resolution_hours), 1
                )
                if resolution_hours
                else 0,
                "SLA respecté (%)": round(len(sla_ok) * 100 / len(sla_base), 1)
                if sla_base
                else None,
            }
        )
    return rows


def _distribution(tickets: list[Ticket], getter) -> Counter:  # noqa: ANN001
    return Counter(getter(ticket) or "Non renseigné" for ticket in tickets)


def _append_sheet(writer: Workbook, title: str, headers: list[str], rows: list[list]) -> None:
    sheet = writer.create_sheet(title)
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
        width = max(12, min(44, len(str(header)) + 6))
        if rows:
            width = max(width, min(44, max(len(str(row[index - 1] or "")) for row in rows) + 2))
        sheet.column_dimensions[get_column_letter(index)].width = width


def tickets_xlsx(
    tickets: list[Ticket],
    periods: list[StatPeriod],
    granularity: Granularity,
    *,
    start: date,
    end: date,
) -> bytes:
    workbook = Workbook()
    workbook.remove(workbook.active)
    period_rows = ticket_period_rows(tickets, periods, granularity)
    _append_sheet(
        workbook,
        "Synthèse",
        list(period_rows[0].keys()) if period_rows else ["Période", "Créés", "Résolus", "Clos"],
        [list(row.values()) for row in period_rows],
    )
    _append_sheet(
        workbook,
        "Tickets",
        HEADERS,
        [_row(ticket) for ticket in tickets],
    )
    for title, getter in (
        ("Par statut", lambda ticket: ticket.status.name),
        ("Par priorité", lambda ticket: ticket.priority.name),
        ("Par catégorie", lambda ticket: ticket.category.name),
        ("Par assigné", lambda ticket: _user_name(ticket.assignee)),
        ("Par service", lambda ticket: ticket.service.name if ticket.service else ""),
    ):
        counts = _distribution(tickets, getter)
        _append_sheet(
            workbook,
            title,
            ["Libellé", "Tickets"],
            [[label, count] for label, count in counts.most_common()],
        )
    summary = workbook.create_sheet("Paramètres", 0)
    summary.append(["Export tickets", f"{start.isoformat()} → {end.isoformat()}"])
    summary.append(["Granularité", granularity])
    summary.append(["Nombre de tickets", len(tickets)])
    summary.append(["Total temps passé (min)", sum(ticket.time_spent_minutes or 0 for ticket in tickets)])
    summary["A1"].font = Font(bold=True, size=14, color="772B2F")
    summary.column_dimensions["A"].width = 28
    summary.column_dimensions["B"].width = 40
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def tickets_pdf(
    tickets: list[Ticket],
    periods: list[StatPeriod],
    granularity: Granularity,
    *,
    start: date,
    end: date,
    branding: PdfBranding | None = None,
) -> bytes:
    buffer = io.BytesIO()
    document = create_document(
        buffer,
        title="Statistiques des tickets",
        subtitle=(
            f"Du {start.strftime('%d/%m/%Y')} au {end.strftime('%d/%m/%Y')} · "
            f"granularité {granularity}"
        ),
        branding=branding,
    )
    story: list = [meta_line(count=len(tickets), label="ticket(s)")]

    period_rows = ticket_period_rows(tickets, periods, granularity)
    if period_rows:
        table_rows = [list(period_rows[0].keys())] + [list(row.values()) for row in period_rows]
        table = make_table(
            table_rows,
            [36 * mm, 48 * mm, 18 * mm, 18 * mm, 18 * mm, 30 * mm, 28 * mm, 28 * mm],
            font_size=6.8,
        )
        story.extend([heading("Synthèse par période"), table, Spacer(1, 8)])

    for title, getter in (
        ("Par statut", lambda ticket: ticket.status.name),
        ("Par priorité", lambda ticket: ticket.priority.name),
        ("Par catégorie", lambda ticket: ticket.category.name),
        ("Par assigné", lambda ticket: _user_name(ticket.assignee)),
    ):
        counts = _distribution(tickets, getter)
        rows = [["Libellé", "Tickets"]] + [[label, count] for label, count in counts.most_common()]
        table = make_table(rows, [120 * mm, 30 * mm], font_size=7)
        story.extend([heading(title), table, Spacer(1, 6)])

    if tickets:
        rows = [["Référence", "Objet", "Statut", "Priorité", "Catégorie", "Assigné", "Ouvert le", "Résolu le", "Temps"]]
        for ticket in tickets:
            rows.append(
                [
                    ticket.reference,
                    ticket.subject,
                    ticket.status.name,
                    ticket.priority.name,
                    ticket.category.name,
                    _user_name(ticket.assignee),
                    ticket.opened_at.strftime("%d/%m/%Y") if ticket.opened_at else "",
                    ticket.resolved_at.strftime("%d/%m/%Y") if ticket.resolved_at else "",
                    f"{ticket.time_spent_minutes} min",
                ]
            )
        table = make_table(
            rows,
            [24 * mm, 70 * mm, 23 * mm, 19 * mm, 28 * mm, 34 * mm, 21 * mm, 21 * mm, 18 * mm],
            font_size=6.2,
        )
        story.extend([heading("Détail des tickets"), table])
    document.build(story)
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
