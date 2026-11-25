from __future__ import annotations

import io

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import Spacer, TableStyle

from app.exports.pdf_utils import (
    PdfBranding,
    create_document,
    heading,
    make_table,
    meta_line,
)
from app.schemas.statistics import StatsCommercial, StatsPoint

HEADER_FILL = PatternFill("solid", fgColor="772B2F")
HEADER_FONT = Font(color="F3EFE2", bold=True)

KIND_LABELS = {"quote": "Devis", "purchase_order": "Bon de commande"}
STATUS_LABELS = {
    "draft": "Brouillon",
    "sent": "Envoyé",
    "accepted": "Accepté",
    "refused": "Refusé",
    "expired": "Expiré",
    "converted": "Converti",
    "confirmed": "Confirmé",
    "delivered": "Livré",
    "cancelled": "Annulé",
}


def _append_sheet(
    workbook: Workbook, title: str, headers: list[str], rows: list[list]
) -> None:
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
            width = max(
                width,
                min(50, max(len(str(row[index - 1] or "")) for row in rows) + 2),
            )
        sheet.column_dimensions[get_column_letter(index)].width = width


def _points_rows(points: list[StatsPoint]) -> list[list]:
    return [[point.label, point.value] for point in points]


def _filter_lines(stats: StatsCommercial) -> list[list[str]]:
    lines = [
        [
            "Période",
            f"{stats.start.isoformat()} → {stats.end.isoformat()}",
        ]
    ]
    if stats.kind:
        lines.append(["Type", KIND_LABELS.get(stats.kind, stats.kind)])
    if stats.status:
        lines.append(["Statut", STATUS_LABELS.get(stats.status, stats.status)])
    if stats.with_engagement is True:
        lines.append(["Engagement", "Avec numéro d'engagement"])
    elif stats.with_engagement is False:
        lines.append(["Engagement", "Sans numéro d'engagement"])
    if stats.q:
        lines.append(["Recherche", stats.q])
    return lines


def commercial_xlsx(stats: StatsCommercial) -> bytes:
    workbook = Workbook()
    workbook.remove(workbook.active)
    _append_sheet(
        workbook,
        "Synthèse",
        ["Indicateur", "Valeur", "Unité", "Précision"],
        [[kpi.label, kpi.value, kpi.unit or "", kpi.hint or ""] for kpi in stats.kpis],
    )
    _append_sheet(
        workbook,
        "Documents",
        [
            "Type",
            "Référence",
            "Objet",
            "Fournisseur",
            "Statut",
            "Date",
            "Échéance",
            "N° engagement",
            "Montant HT",
            "Montant TTC",
            "Ligne budgétaire",
            "Contrat",
            "Document",
        ],
        [
            [
                KIND_LABELS.get(document.kind, document.kind),
                document.reference,
                document.object,
                document.supplier,
                STATUS_LABELS.get(document.status, document.status),
                document.issue_date.isoformat(),
                document.due_date.isoformat() if document.due_date else "",
                document.engagement_number or "",
                document.amount_ht if document.amount_ht is not None else "",
                document.amount_ttc if document.amount_ttc is not None else "",
                document.budget_line or "",
                document.contract_reference or "",
                str(document.document_id) if document.document_id else "",
            ]
            for document in stats.documents
        ],
    )
    _append_sheet(
        workbook,
        "Par statut",
        ["Statut", "Nombre"],
        [
            [STATUS_LABELS.get(point.label, point.label), point.value]
            for point in stats.by_status
        ],
    )
    _append_sheet(
        workbook,
        "Par fournisseur",
        ["Fournisseur", "Montant TTC"],
        _points_rows(stats.by_supplier),
    )
    _append_sheet(
        workbook,
        "Par type",
        ["Type", "Nombre"],
        _points_rows(stats.by_kind),
    )
    _append_sheet(
        workbook,
        "Par mois",
        ["Période", "Documents"],
        [[point.label, point.created] for point in stats.periods],
    )
    summary = workbook.create_sheet("Paramètres", 0)
    summary.append(["Suivi des achats", "Devis et bons de commande"])
    for label, value in _filter_lines(stats):
        summary.append([label, value])
    summary["A1"].font = Font(bold=True, size=14, color="772B2F")
    summary.column_dimensions["A"].width = 28
    summary.column_dimensions["B"].width = 52
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def _table_style() -> TableStyle:
    return TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#772B2F")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#F3EFE2")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 6.5),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#CDCDCD")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F7F4EA")]),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 3),
            ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ]
    )


def commercial_pdf(
    stats: StatsCommercial,
    branding: PdfBranding | None = None,
) -> bytes:
    buffer = io.BytesIO()
    document = create_document(
        buffer,
        title="Suivi des achats",
        subtitle=(
            f"Du {stats.start.strftime('%d/%m/%Y')} au "
            f"{stats.end.strftime('%d/%m/%Y')}"
        ),
        branding=branding,
    )
    story: list = [
        meta_line(count=len(stats.documents), label="document(s)"),
        heading("Indicateurs clés"),
        make_table(
            [["Indicateur", "Valeur", "Précision"]]
            + [
                [kpi.label, f"{kpi.value} {kpi.unit or ''}".strip(), kpi.hint or ""]
                for kpi in stats.kpis
            ],
            [90 * mm, 40 * mm, 125 * mm],
            font_size=7,
        ),
        Spacer(1, 8),
    ]
    story.extend(
        [
            heading("Documents"),
            make_table(
                [
                    [
                        "Type",
                        "Référence",
                        "Fournisseur",
                        "Statut",
                        "Date",
                        "Échéance",
                        "Engagement",
                        "TTC",
                    ]
                ]
                + [
                    [
                        KIND_LABELS.get(item.kind, item.kind),
                        item.reference,
                        item.supplier,
                        STATUS_LABELS.get(item.status, item.status),
                        item.issue_date.strftime("%d/%m/%Y"),
                        item.due_date.strftime("%d/%m/%Y") if item.due_date else "",
                        item.engagement_number or "",
                        f"{item.amount_ttc:,.2f} €".replace(",", " ") if item.amount_ttc is not None else "",
                    ]
                    for item in stats.documents
                ],
                [
                    26 * mm,
                    28 * mm,
                    42 * mm,
                    22 * mm,
                    20 * mm,
                    20 * mm,
                    32 * mm,
                    25 * mm,
                ],
                font_size=6.5,
            ),
            Spacer(1, 8),
        ]
    )
    for title, points in (
        ("Répartition par statut", stats.by_status),
        ("Montant par fournisseur", stats.by_supplier),
    ):
        story.extend(
            [
                heading(title),
                make_table(
                    [["Libellé", "Valeur"]]
                    + [[point.label, point.value] for point in points],
                    [120 * mm, 40 * mm],
                    font_size=7,
                ),
                Spacer(1, 5),
            ]
        )
    document.build(story)
    return buffer.getvalue()
