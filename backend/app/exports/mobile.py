import io
from collections import Counter

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from reportlab.lib.units import mm

from app.exports.pdf_utils import PdfBranding, create_document, make_table, meta_line
from app.models.mobile import MobileLine

HEADERS = [
    "Ligne",
    "Civilité",
    "Titulaire",
    "Fonction",
    "E-mail",
    "SIREN",
    "Société",
    "Statut",
    "N° contrat",
    "N° titulaire",
    "N° CF",
    "Nom CF",
    "Mise en service",
    "Fin d'engagement",
    "Date de facturation",
    "Date de portabilité",
    "RIO",
    "QR code SIM",
    "EID",
    "N° CSIM",
    "Codes PIN/PUK disponibles",
    "Liste",
    "Forfait",
    "Terminal communicant",
    "Terminal acheté",
    "IMEI communicant",
    "IMEI acheté",
    "Hors-forfait",
    "Format SIM",
    "Identifiant VPN",
    "Numéro privé",
    "Changement terminal",
    "Changement forfait",
    "Ligne secondaire",
    "Ligne principale",
    "Master access ID",
    "Type d'offre",
    "Company ID",
    "Notes",
    "Créée le",
    "Modifiée le",
]

WIDTHS = [
    16, 10, 28, 28, 32, 14, 26, 12, 18, 16, 16, 24, 16, 16, 16, 16, 14,
    24, 24, 18, 18, 18, 38, 28, 28, 20, 20, 12, 12, 18, 16, 16, 16, 12,
    16, 18, 14, 16, 40, 20, 20,
]

HEADER_FILL = PatternFill("solid", fgColor="772B2F")
HEADER_FONT = Font(color="F3EFE2", bold=True)


def _row(line: MobileLine) -> list:
    return [
        line.line_number,
        line.civility or "",
        line.holder_name or "",
        line.role_label or "",
        line.email or "",
        line.siren or "",
        line.company_name or "",
        line.status,
        line.contract_number or "",
        line.titulaire_number or "",
        line.cf_number or "",
        line.cf_name or "",
        line.activation_date.isoformat() if line.activation_date else "",
        line.commitment_end_date.isoformat() if line.commitment_end_date else "",
        line.billing_date.isoformat() if line.billing_date else "",
        line.portability_date.isoformat() if line.portability_date else "",
        line.rio or "",
        line.qr_code or "",
        line.eid or "",
        line.csim_number or "",
        "Oui" if line.has_secrets else "Non",
        line.list_name or "",
        line.plan_name or "",
        line.terminal_communicating or "",
        line.terminal_purchased or "",
        line.imei_communicating or "",
        line.imei_purchased or "",
        float(line.out_of_bundle) if line.out_of_bundle is not None else "",
        line.sim_format or "",
        line.vpn_identifier or "",
        line.private_number or "",
        line.terminal_change_date.isoformat() if line.terminal_change_date else "",
        line.plan_change_date.isoformat() if line.plan_change_date else "",
        "Oui" if line.is_secondary_line else "Non",
        line.main_line_number or "",
        line.master_access_id or "",
        line.offer_type or "",
        line.company_id or "",
        line.notes or "",
        line.created_at.isoformat() if line.created_at else "",
        line.updated_at.isoformat() if line.updated_at else "",
    ]


def _append_sheet(
    workbook: Workbook,
    title: str,
    headers: list[str],
    rows: list[list],
    widths: list[int] | None = None,
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
        width = widths[index - 1] if widths and index <= len(widths) else min(
            40, max(12, len(str(header)) + 4)
        )
        sheet.column_dimensions[get_column_letter(index)].width = width


def mobile_lines_xlsx(lines: list[MobileLine]) -> bytes:
    workbook = Workbook()
    workbook.remove(workbook.active)
    _append_sheet(
        workbook,
        "Lignes mobiles détaillées",
        HEADERS,
        [_row(line) for line in lines],
        WIDTHS,
    )
    status_counts = Counter(line.status for line in lines)
    plan_counts = Counter(line.plan_name or "Non renseigné" for line in lines)
    _append_sheet(
        workbook,
        "Synthèse",
        ["Répartition", "Libellé", "Nombre"],
        [
            *[["Statut", label, value] for label, value in status_counts.most_common()],
            *[["Forfait", label, value] for label, value in plan_counts.most_common()],
            ["Total", "Lignes", len(lines)],
            ["Secrets", "Lignes avec PIN/PUK disponibles", sum(1 for line in lines if line.has_secrets)],
        ],
    )
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def mobile_lines_pdf(
    lines: list[MobileLine],
    branding: PdfBranding | None = None,
) -> bytes:
    buffer = io.BytesIO()
    document = create_document(
        buffer,
        title="Lignes mobiles détaillées",
        subtitle=f"{len(lines)} ligne(s)",
        branding=branding,
    )
    headers = [
        "Ligne",
        "Titulaire",
        "Fonction",
        "Statut",
        "Forfait",
        "Terminal",
        "IMEI",
        "Fin engagement",
        "Contrat",
    ]
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
                line.imei_communicating or line.imei_purchased or "",
                line.commitment_end_date.isoformat() if line.commitment_end_date else "",
                line.contract_number or "",
            ]
        )
    table = make_table(
        rows,
        [
            24 * mm,
            40 * mm,
            34 * mm,
            20 * mm,
            40 * mm,
            36 * mm,
            27 * mm,
            23 * mm,
            23 * mm,
        ],
        font_size=6.8,
    )
    document.build([meta_line(count=len(lines), label="ligne(s)"), table])
    return buffer.getvalue()
