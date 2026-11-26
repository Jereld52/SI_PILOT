from __future__ import annotations

import io
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from reportlab.lib.units import mm
from reportlab.platypus import Spacer

from app.exports.pdf_utils import (
    PdfBranding,
    create_document,
    heading,
    make_table,
    meta_line,
)
from app.schemas.statistics import StatsCommercial, StatsCommercialRow, StatsPoint

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
        ["Période", f"{stats.start.isoformat()} → {stats.end.isoformat()}"],
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


def _quote_row(document: StatsCommercialRow) -> list[Any]:
    return [
        document.reference,
        document.object,
        document.supplier,
        STATUS_LABELS.get(document.status, document.status),
        document.issue_date.isoformat(),
        document.due_date.isoformat() if document.due_date else "",
        document.amount_ht if document.amount_ht is not None else "",
        document.amount_ttc if document.amount_ttc is not None else "",
        document.budget_line or "",
        document.contract_reference or "",
        str(document.document_id) if document.document_id else "",
    ]


def _order_row(document: StatsCommercialRow) -> list[Any]:
    return [
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


def _quote_headers() -> list[str]:
    return [
        "Référence",
        "Objet",
        "Fournisseur",
        "Statut",
        "Date",
        "Valable jusqu'au",
        "Montant HT",
        "Montant TTC",
        "Ligne budgétaire",
        "Contrat",
        "Document",
    ]


def _order_headers() -> list[str]:
    return [
        "Référence",
        "Objet",
        "Fournisseur",
        "Statut",
        "Date",
        "Livraison prévue",
        "N° engagement",
        "Montant HT",
        "Montant TTC",
        "Ligne budgétaire",
        "Contrat",
        "Document",
    ]


def commercial_xlsx(stats: StatsCommercial) -> bytes:
    workbook = Workbook()
    workbook.remove(workbook.active)
    quotes = [item for item in stats.documents if item.kind == "quote"]
    orders = [item for item in stats.documents if item.kind == "purchase_order"]

    _append_sheet(
        workbook,
        "Synthèse devis",
        ["Indicateur", "Valeur", "Unité", "Précision"],
        [[kpi.label, kpi.value, kpi.unit or "", kpi.hint or ""] for kpi in stats.quote_kpis],
    )
    _append_sheet(
        workbook,
        "Synthèse bons de commande",
        ["Indicateur", "Valeur", "Unité", "Précision"],
        [[kpi.label, kpi.value, kpi.unit or "", kpi.hint or ""] for kpi in stats.order_kpis],
    )
    _append_sheet(
        workbook,
        "Devis",
        _quote_headers(),
        [_quote_row(document) for document in quotes],
    )
    _append_sheet(
        workbook,
        "Bons de commande",
        _order_headers(),
        [_order_row(document) for document in orders],
    )
    _append_sheet(
        workbook,
        "Statuts devis",
        ["Statut", "Nombre"],
        [
            [STATUS_LABELS.get(point.label, point.label), point.value]
            for point in stats.quotes_by_status
        ],
    )
    _append_sheet(
        workbook,
        "Statuts bons de commande",
        ["Statut", "Nombre"],
        [
            [STATUS_LABELS.get(point.label, point.label), point.value]
            for point in stats.orders_by_status
        ],
    )
    _append_sheet(
        workbook,
        "Fournisseurs devis",
        ["Fournisseur", "Montant TTC"],
        _points_rows(stats.quotes_by_supplier),
    )
    _append_sheet(
        workbook,
        "Fournisseurs bons de commande",
        ["Fournisseur", "Montant TTC"],
        _points_rows(stats.orders_by_supplier),
    )
    _append_sheet(
        workbook,
        "Évolution devis",
        ["Période", "Devis"],
        [[point.label, point.created] for point in stats.quote_periods],
    )
    _append_sheet(
        workbook,
        "Évolution bons de commande",
        ["Période", "Bons de commande"],
        [[point.label, point.created] for point in stats.order_periods],
    )
    summary = workbook.create_sheet("Paramètres", 0)
    summary.append(["Suivi des achats", "Devis et bons de commande séparés"])
    for label, value in _filter_lines(stats):
        summary.append([label, value])
    summary["A1"].font = Font(bold=True, size=14, color="772B2F")
    summary.column_dimensions["A"].width = 30
    summary.column_dimensions["B"].width = 56
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def _kpi_rows(kpis: list[Any]) -> list[list[Any]]:
    return [["Indicateur", "Valeur", "Précision"]] + [
        [kpi.label, f"{kpi.value} {kpi.unit or ''}".strip(), kpi.hint or ""]
        for kpi in kpis
    ]


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
    quotes = [item for item in stats.documents if item.kind == "quote"]
    orders = [item for item in stats.documents if item.kind == "purchase_order"]
    story: list = [meta_line(count=len(quotes), label="devis")]
    story.extend(
        [
            heading("Devis"),
            make_table(_kpi_rows(stats.quote_kpis), [90 * mm, 40 * mm, 125 * mm], font_size=7),
            Spacer(1, 5),
            make_table(
                [["Statut", "Nombre"]]
                + [
                    [STATUS_LABELS.get(point.label, point.label), point.value]
                    for point in stats.quotes_by_status
                ],
                [110 * mm, 30 * mm],
                font_size=7,
            ),
            Spacer(1, 5),
            make_table(
                [["Fournisseur", "Montant TTC"]]
                + [[point.label, point.value] for point in stats.quotes_by_supplier],
                [120 * mm, 40 * mm],
                font_size=7,
            ),
            Spacer(1, 5),
            make_table(
                [["Référence", "Objet", "Fournisseur", "Statut", "Date", "Validité", "TTC"]]
                + [
                    [
                        item.reference,
                        item.object[:50],
                        item.supplier,
                        STATUS_LABELS.get(item.status, item.status),
                        item.issue_date.strftime("%d/%m/%Y"),
                        item.due_date.strftime("%d/%m/%Y") if item.due_date else "",
                        f"{item.amount_ttc:,.2f} €".replace(",", " ")
                        if item.amount_ttc is not None
                        else "",
                    ]
                    for item in quotes
                ],
                [
                    25 * mm,
                    55 * mm,
                    38 * mm,
                    22 * mm,
                    19 * mm,
                    19 * mm,
                    22 * mm,
                ],
                font_size=6.5,
            ),
            Spacer(1, 10),
        ]
    )
    story.extend(
        [
            heading("Bons de commande"),
            make_table(_kpi_rows(stats.order_kpis), [90 * mm, 40 * mm, 125 * mm], font_size=7),
            Spacer(1, 5),
            make_table(
                [["Statut", "Nombre"]]
                + [
                    [STATUS_LABELS.get(point.label, point.label), point.value]
                    for point in stats.orders_by_status
                ],
                [110 * mm, 30 * mm],
                font_size=7,
            ),
            Spacer(1, 5),
            make_table(
                [["Fournisseur", "Montant TTC"]]
                + [[point.label, point.value] for point in stats.orders_by_supplier],
                [120 * mm, 40 * mm],
                font_size=7,
            ),
            Spacer(1, 5),
            make_table(
                [
                    [
                        "Référence",
                        "Objet",
                        "Fournisseur",
                        "Statut",
                        "Date",
                        "Livraison",
                        "Engagement",
                        "TTC",
                    ]
                ]
                + [
                    [
                        item.reference,
                        item.object[:45],
                        item.supplier,
                        STATUS_LABELS.get(item.status, item.status),
                        item.issue_date.strftime("%d/%m/%Y"),
                        item.due_date.strftime("%d/%m/%Y") if item.due_date else "",
                        item.engagement_number or "",
                        f"{item.amount_ttc:,.2f} €".replace(",", " ")
                        if item.amount_ttc is not None
                        else "",
                    ]
                    for item in orders
                ],
                [
                    25 * mm,
                    50 * mm,
                    35 * mm,
                    22 * mm,
                    19 * mm,
                    19 * mm,
                    26 * mm,
                    22 * mm,
                ],
                font_size=6.5,
            ),
        ]
    )
    document.build(story)
    return buffer.getvalue()
