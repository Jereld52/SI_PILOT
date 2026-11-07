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

from app.models.mobile import MobileLine

HEADERS = [
    "Ligne",
    "Civilité",
    "Titulaire",
    "Fonction",
    "E-mail",
    "Statut",
    "Forfait",
    "Terminal",
    "IMEI",
    "Date de mise en service",
    "Fin d'engagement",
    "Hors-forfait",
    "Format SIM",
    "Ligne principale",
    "Type d'offre",
    "N° contrat",
    "N° CF",
    "Identifiant VPN",
]


def _row(line: MobileLine) -> list:
    return [
        line.line_number,
        line.civility or "",
        line.holder_name or "",
        line.role_label or "",
        line.email or "",
        line.status,
        line.plan_name or "",
        line.terminal_communicating or line.terminal_purchased or "",
        line.imei_communicating or line.imei_purchased or "",
        line.activation_date.isoformat() if line.activation_date else "",
        line.commitment_end_date.isoformat() if line.commitment_end_date else "",
        float(line.out_of_bundle) if line.out_of_bundle is not None else "",
        line.sim_format or "",
        line.main_line_number or "",
        line.offer_type or "",
        line.contract_number or "",
        line.cf_number or "",
        line.vpn_identifier or "",
    ]


def mobile_lines_xlsx(lines: list[MobileLine]) -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Lignes mobiles"
    sheet.append(HEADERS)
    header_fill = PatternFill("solid", fgColor="772B2F")
    header_font = Font(color="F3EFE2", bold=True)
    for cell in sheet[1]:
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(vertical="center")
    for line in lines:
        sheet.append(_row(line))
    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = sheet.dimensions
    widths = [16, 10, 28, 28, 32, 12, 38, 30, 20, 18, 18, 12, 12, 18, 14, 16, 16, 18]
    for index, width in enumerate(widths, start=1):
        sheet.column_dimensions[get_column_letter(index)].width = width
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def mobile_lines_pdf(lines: list[MobileLine]) -> bytes:
    buffer = io.BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        leftMargin=10 * mm,
        rightMargin=10 * mm,
        topMargin=10 * mm,
        bottomMargin=10 * mm,
        title="Lignes mobiles",
    )
    styles = getSampleStyleSheet()
    title = Paragraph(
        f"Lignes mobiles — {len(lines)} ligne(s) — {datetime.now().strftime('%d/%m/%Y')}",
        styles["Title"],
    )
    headers = ["Ligne", "Titulaire", "Fonction", "Statut", "Forfait", "Terminal", "Fin engagement"]
    rows = [headers]
    for line in lines:
        rows.append(
            [
                line.line_number,
                line.holder_name or "",
                line.role_label or "",
                line.status,
                line.plan_name or "",
                line.terminal_communicating or line.terminal_purchased or "",
                line.commitment_end_date.isoformat() if line.commitment_end_date else "",
            ]
        )
    table = Table(rows, repeatRows=1, colWidths=[28 * mm, 48 * mm, 42 * mm, 22 * mm, 55 * mm, 48 * mm, 30 * mm])
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
