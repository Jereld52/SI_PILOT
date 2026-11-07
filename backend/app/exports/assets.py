import io
from datetime import datetime

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.models.assets import Asset

HEADERS = [
    "N° inventaire",
    "Nom",
    "Catégorie",
    "Marque",
    "Modèle",
    "N° série",
    "Nom machine",
    "Adresse IP",
    "Adresse MAC",
    "Système",
    "État",
    "Condition",
    "Agent affecté",
    "Service",
    "Site",
    "Date d'achat",
    "Fin de garantie",
    "Prix",
    "WAPT statut",
    "WAPT joignable",
    "Dernière connexion",
    "Dernier utilisateur",
    "Commentaires",
]


def _row(asset: Asset) -> list:
    return [
        asset.asset_tag,
        asset.name,
        asset.category.name if asset.category else "",
        asset.brand or "",
        asset.model or "",
        asset.serial_number or "",
        asset.hostname or "",
        asset.ip_address or "",
        asset.mac_address or "",
        asset.os_name or "",
        asset.status,
        asset.condition,
        f"{asset.assigned_agent.first_name} {asset.assigned_agent.last_name}"
        if asset.assigned_agent
        else "",
        asset.service.name if asset.service else "",
        asset.location.name if asset.location else "",
        asset.purchase_date.isoformat() if asset.purchase_date else "",
        asset.warranty_end.isoformat() if asset.warranty_end else "",
        float(asset.purchase_price) if asset.purchase_price is not None else "",
        asset.wapt_status or "",
        asset.wapt_reachable or "",
        asset.wapt_last_seen or "",
        asset.wapt_last_user or "",
        asset.comments or "",
    ]


def assets_xlsx(assets: list[Asset]) -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Parc informatique"
    sheet.append(HEADERS)
    header_fill = PatternFill("solid", fgColor="772B2F")
    header_font = Font(color="F3EFE2", bold=True)
    for cell in sheet[1]:
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(vertical="center")
    for asset in assets:
        sheet.append(_row(asset))
    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = sheet.dimensions
    widths = [18, 28, 18, 14, 20, 18, 26, 16, 18, 22, 14, 14, 24, 24, 20, 13, 13, 12, 12, 14, 20, 20, 40]
    for index, width in enumerate(widths, start=1):
        sheet.column_dimensions[get_column_letter(index)].width = width
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def assets_pdf(assets: list[Asset]) -> bytes:
    buffer = io.BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        leftMargin=10 * mm,
        rightMargin=10 * mm,
        topMargin=10 * mm,
        bottomMargin=10 * mm,
        title="Parc informatique",
    )
    styles = getSampleStyleSheet()
    title = Paragraph(
        f"Parc informatique — {len(assets)} équipement(s) — {datetime.now().strftime('%d/%m/%Y')}",
        styles["Title"],
    )
    headers = ["Inventaire", "Nom", "Catégorie", "Machine", "Système", "État", "Agent", "Dernier utilisateur"]
    rows = [headers]
    for asset in assets:
        agent = (
            f"{asset.assigned_agent.first_name} {asset.assigned_agent.last_name}"
            if asset.assigned_agent
            else ""
        )
        rows.append(
            [
                asset.asset_tag,
                asset.name,
                asset.category.name if asset.category else "",
                asset.hostname or "",
                asset.os_name or "",
                asset.status,
                agent,
                asset.wapt_last_user or "",
            ]
        )
    table = Table(rows, repeatRows=1, colWidths=[32 * mm, 48 * mm, 28 * mm, 42 * mm, 38 * mm, 24 * mm, 38 * mm, 34 * mm])
    table.setStyle(
        TableStyle(
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
    )
    document.build([title, Spacer(1, 6), table])
    return buffer.getvalue()
