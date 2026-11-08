import io
from collections import Counter

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from reportlab.lib.units import mm

from app.exports.pdf_utils import create_document, make_table, meta_line
from app.models.infrastructure import (
    InfraDependency,
    InfraEquipment,
    MonitoringCheck,
)

HEADER_FILL = PatternFill("solid", fgColor="772B2F")
HEADER_FONT = Font(color="F3EFE2", bold=True)


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
            44, max(12, len(str(header)) + 4)
        )
        sheet.column_dimensions[get_column_letter(index)].width = width


def infrastructure_xlsx(
    equipments: list[InfraEquipment],
    dependencies: list[InfraDependency],
    checks: list[MonitoringCheck],
) -> bytes:
    workbook = Workbook()
    workbook.remove(workbook.active)
    names = {equipment.id: equipment.name for equipment in equipments}

    _append_sheet(
        workbook,
        "Équipements",
        [
            "Nom",
            "Type",
            "Inventaire lié",
            "Nom du parc",
            "Adresse IP",
            "Adresse MAC",
            "Rôle",
            "Site",
            "Système",
            "Version",
            "Criticité",
            "Statut",
            "Responsable",
            "Équipement parent",
            "Dernière vérification",
            "Coordonnée X",
            "Coordonnée Y",
            "Notes / configuration",
        ],
        [
            [
                equipment.name,
                equipment.type,
                equipment.asset.asset_tag if equipment.asset else "",
                equipment.asset.name if equipment.asset else "",
                equipment.ip_address or "",
                equipment.mac_address or "",
                equipment.role or "",
                equipment.location.name if equipment.location else "",
                equipment.os_name or "",
                equipment.os_version or "",
                equipment.criticality,
                equipment.status,
                f"{equipment.responsible.first_name} {equipment.responsible.last_name}"
                if equipment.responsible
                else "",
                names.get(equipment.parent_id, "") if equipment.parent_id else "",
                equipment.last_check_at.isoformat() if equipment.last_check_at else "",
                equipment.map_x if equipment.map_x is not None else "",
                equipment.map_y if equipment.map_y is not None else "",
                equipment.config_notes or "",
            ]
            for equipment in equipments
        ],
        [28, 16, 18, 28, 16, 18, 28, 20, 22, 14, 12, 14, 28, 28, 20, 12, 12, 50],
    )

    _append_sheet(
        workbook,
        "Dépendances",
        ["Source", "Cible", "Type", "Description"],
        [
            [
                names.get(dependency.source_id, ""),
                names.get(dependency.target_id, ""),
                dependency.dependency_type,
                dependency.description or "",
            ]
            for dependency in dependencies
        ],
    )

    _append_sheet(
        workbook,
        "Supervision",
        [
            "Équipement",
            "Type",
            "Intervalle (s)",
            "Actif",
            "Autorisé",
            "Autorisé par",
            "Autorisé le",
            "Configuration",
        ],
        [
            [
                check.infra.name if check.infra else "",
                check.check_type,
                check.interval_seconds,
                "Oui" if check.is_enabled else "Non",
                "Oui" if check.authorized_at else "Non",
                f"{check.authorized_by.first_name} {check.authorized_by.last_name}"
                if check.authorized_by
                else "",
                check.authorized_at.isoformat() if check.authorized_at else "",
                check.config_json or "",
            ]
            for check in checks
        ],
    )

    type_counts = Counter(equipment.type for equipment in equipments)
    status_counts = Counter(equipment.status for equipment in equipments)
    criticality_counts = Counter(equipment.criticality for equipment in equipments)
    _append_sheet(
        workbook,
        "Synthèse",
        ["Répartition", "Libellé", "Nombre"],
        [
            *[["Type", label, value] for label, value in type_counts.most_common()],
            *[["Statut", label, value] for label, value in status_counts.most_common()],
            *[["Criticité", label, value] for label, value in criticality_counts.most_common()],
            ["Total", "Équipements", len(equipments)],
            ["Total", "Dépendances", len(dependencies)],
            ["Total", "Contrôles", len(checks)],
        ],
    )
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def infrastructure_pdf(equipments: list[InfraEquipment]) -> bytes:
    buffer = io.BytesIO()
    document = create_document(
        buffer,
        title="Infrastructure détaillée",
        subtitle=f"{len(equipments)} équipement(s)",
    )
    headers = [
        "Nom",
        "Type",
        "IP",
        "Rôle",
        "Site",
        "Système",
        "Criticité",
        "Statut",
        "Responsable",
    ]
    rows = [headers]
    for equipment in equipments:
        rows.append(
            [
                equipment.name,
                equipment.type,
                equipment.ip_address or "",
                equipment.role or "",
                equipment.location.name if equipment.location else "",
                f"{equipment.os_name or ''} {equipment.os_version or ''}".strip(),
                equipment.criticality,
                equipment.status,
                f"{equipment.responsible.first_name} {equipment.responsible.last_name}"
                if equipment.responsible
                else "",
            ]
        )
    table = make_table(
        rows,
        [
            37 * mm,
            20 * mm,
            25 * mm,
            38 * mm,
            28 * mm,
            36 * mm,
            20 * mm,
            21 * mm,
            34 * mm,
        ],
        font_size=6.8,
    )
    document.build([meta_line(count=len(equipments), label="équipement(s)"), table])
    return buffer.getvalue()
