import io
from collections import Counter

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from reportlab.lib.units import mm

from app.exports.pdf_utils import PdfBranding, create_document, make_table, meta_line
from app.models.assets import Asset

BASE_HEADERS = [
    "N° inventaire",
    "Nom",
    "Catégorie",
    "Marque",
    "Modèle",
    "N° série",
    "ID externe",
    "Nom machine",
    "Adresse IP",
    "Adresse MAC",
    "Système",
    "Version système",
    "État",
    "Condition",
    "Critique",
    "Agent affecté",
    "E-mail agent",
    "Service",
    "Site",
    "Fournisseur",
    "Date d'achat",
    "Mise en service",
    "Fin de garantie",
    "Prix d'achat",
    "WAPT statut",
    "WAPT joignable",
    "WAPT dernière connexion",
    "WAPT dernier utilisateur",
    "WAPT domaine",
    "WAPT groupes",
    "Commentaires",
]

BASE_WIDTHS = [
    18,
    28,
    18,
    14,
    20,
    18,
    20,
    26,
    16,
    18,
    22,
    14,
    14,
    14,
    10,
    24,
    28,
    24,
    20,
    22,
    13,
    13,
    13,
    12,
    12,
    14,
    20,
    20,
    22,
    26,
    40,
]

HEADER_FILL = PatternFill("solid", fgColor="772B2F")
HEADER_FONT = Font(color="F3EFE2", bold=True)


def _base_row(asset: Asset) -> list:
    agent = asset.assigned_agent
    return [
        asset.asset_tag,
        asset.name,
        asset.category.name if asset.category else "",
        asset.brand or "",
        asset.model or "",
        asset.serial_number or "",
        asset.external_id or "",
        asset.hostname or "",
        asset.ip_address or "",
        asset.mac_address or "",
        asset.os_name or "",
        asset.os_version or "",
        asset.status,
        asset.condition,
        "Oui" if asset.is_critical else "Non",
        f"{agent.first_name} {agent.last_name}" if agent else "",
        agent.email_pro if agent else "",
        asset.service.name if asset.service else "",
        asset.location.name if asset.location else "",
        asset.supplier.name if asset.supplier else "",
        asset.purchase_date.isoformat() if asset.purchase_date else "",
        asset.commissioning_date.isoformat() if asset.commissioning_date else "",
        asset.warranty_end.isoformat() if asset.warranty_end else "",
        float(asset.purchase_price) if asset.purchase_price is not None else "",
        asset.wapt_status or "",
        asset.wapt_reachable or "",
        asset.wapt_last_seen or "",
        asset.wapt_last_user or "",
        asset.wapt_domain or "",
        asset.wapt_groups or "",
        asset.comments or "",
    ]


def _external_headers(assets: list[Asset]) -> list[str]:
    keys: set[str] = set()
    for asset in assets:
        if asset.external_data:
            keys.update(asset.external_data.keys())
    return sorted(keys)


def _external_values(asset: Asset, keys: list[str]) -> list:
    data = asset.external_data or {}
    values = []
    for key in keys:
        value = data.get(key, "")
        if isinstance(value, (list, dict)):
            value = ", ".join(str(item) for item in value) if isinstance(value, list) else str(value)
        values.append(value)
    return values


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
            42, max(12, len(str(header)) + 4)
        )
        sheet.column_dimensions[get_column_letter(index)].width = width


def assets_xlsx(
    assets: list[Asset],
    *,
    assignments: list[dict] | None = None,
) -> bytes:
    workbook = Workbook()
    workbook.remove(workbook.active)
    external_keys = _external_headers(assets)
    headers = BASE_HEADERS + [f"WAPT · {key}" for key in external_keys]
    widths = BASE_WIDTHS + [min(38, max(12, len(key) + 8)) for key in external_keys]
    rows = [
        _base_row(asset) + _external_values(asset, external_keys) for asset in assets
    ]
    _append_sheet(workbook, "Parc détaillé", headers, rows, widths)

    if assignments is not None:
        _append_sheet(
            workbook,
            "Affectations",
            [
                "Inventaire",
                "Équipement",
                "Agent",
                "Service",
                "Site",
                "Début",
                "Fin",
                "Motif",
            ],
            [
                [
                    item.get("asset_tag", ""),
                    item.get("asset_name", ""),
                    item.get("agent_name", ""),
                    item.get("service_name", ""),
                    item.get("location_name", ""),
                    item.get("started_at", ""),
                    item.get("ended_at", ""),
                    item.get("reason", ""),
                ]
                for item in assignments
            ],
        )

    status_counts = Counter(asset.status for asset in assets)
    category_counts = Counter(
        asset.category.name if asset.category else "Non classé" for asset in assets
    )
    _append_sheet(
        workbook,
        "Synthèse",
        ["Répartition", "Libellé", "Nombre"],
        [
            *[["État", label, value] for label, value in status_counts.most_common()],
            *[["Catégorie", label, value] for label, value in category_counts.most_common()],
            ["Total", "Équipements", len(assets)],
        ],
    )
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def assets_pdf(assets: list[Asset], branding: PdfBranding | None = None) -> bytes:
    buffer = io.BytesIO()
    document = create_document(
        buffer,
        title="Parc informatique détaillé",
        subtitle=f"{len(assets)} équipement(s)",
        branding=branding,
    )
    headers = [
        "Inventaire",
        "Nom",
        "Catégorie",
        "Machine",
        "IP",
        "N° série",
        "Système",
        "État",
        "Agent",
        "WAPT utilisateur",
    ]
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
                asset.ip_address or "",
                asset.serial_number or "",
                f"{asset.os_name or ''} {asset.os_version or ''}".strip(),
                asset.status,
                agent,
                asset.wapt_last_user or "",
            ]
        )
    table = make_table(
        rows,
        [
            26 * mm,
            40 * mm,
            24 * mm,
            34 * mm,
            23 * mm,
            28 * mm,
            32 * mm,
            20 * mm,
            32 * mm,
            32 * mm,
        ],
        font_size=6.2,
    )
    document.build([meta_line(count=len(assets), label="équipement(s)"), table])
    return buffer.getvalue()
