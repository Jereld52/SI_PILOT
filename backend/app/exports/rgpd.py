import io
from collections import Counter
from datetime import date, datetime
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm

from app.exports.pdf_utils import create_document, make_table, meta_line
from app.models.assets import Asset, AssetAssignment, StockMovement
from app.models.mobile import MobileLine
from app.models.organization import Agent, AgentAccount
from app.models.rgpd import (
    DataBreach,
    DataCollection,
    DpoRequest,
    ProcessingActivity,
    RightsRequest,
)
from app.models.tickets import Ticket

HEADER_FILL = PatternFill("solid", fgColor="772B2F")
HEADER_FONT = Font(color="F3EFE2", bold=True)

STATUS_LABELS = {
    "draft": "Brouillon",
    "active": "Actif",
    "archived": "Archivé",
    "deleted": "Supprimé",
    "new": "Nouveau",
    "in_progress": "En cours",
    "answered": "Répondu",
    "closed": "Clôturé",
    "open": "Ouverte",
    "contained": "Contenue",
}

COLLECTION_TYPE_LABELS = {
    "form": "Formulaire",
    "survey": "Enquête",
    "contact_list": "Liste de contacts",
    "registration": "Inscription",
    "event": "Événement",
    "ad_hoc": "Ad hoc",
}

RIGHTS_TYPE_LABELS = {
    "access": "Accès",
    "rectification": "Rectification",
    "erasure": "Effacement",
    "objection": "Opposition",
    "portability": "Portabilité",
    "limitation": "Limitation",
}

SEVERITY_LABELS = {
    "low": "Faible",
    "medium": "Moyenne",
    "high": "Élevée",
    "critical": "Critique",
}

ASSET_STATUS_LABELS = {
    "in_service": "En service",
    "in_stock": "En stock",
    "maintenance": "Maintenance",
    "broken": "En panne",
    "to_renew": "À renouveler",
    "retired": "Retiré",
}


def _text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.strftime("%d/%m/%Y %H:%M")
    if isinstance(value, date):
        return value.strftime("%d/%m/%Y")
    return str(value)


def _status(value: str | None) -> str:
    if not value:
        return ""
    return STATUS_LABELS.get(value, value)


def _append_sheet(
    workbook: Workbook,
    title: str,
    headers: list[str],
    rows: list[list[Any]],
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
            46, max(14, len(str(header)) + 4)
        )
        sheet.column_dimensions[get_column_letter(index)].width = width


def _activity_row(activity: ProcessingActivity) -> list[Any]:
    return [
        activity.reference,
        activity.name,
        activity.purpose or "",
        activity.legal_basis or "",
        activity.data_categories or "",
        activity.data_subjects or "",
        activity.recipients or "",
        activity.retention_period or "",
        activity.security_measures or "",
        activity.suppliers or "",
        f"{activity.owner.first_name} {activity.owner.last_name}".strip()
        if activity.owner
        else "",
        activity.dpo_notes or "",
        _status(activity.status),
        _text(activity.last_review_at),
        _text(activity.next_review_at),
        _text(activity.created_at),
        _text(activity.updated_at),
    ]


def _collection_row(collection: DataCollection) -> list[Any]:
    return [
        collection.name,
        COLLECTION_TYPE_LABELS.get(collection.collection_type, collection.collection_type),
        collection.purpose or "",
        collection.processing_activity.name if collection.processing_activity else "",
        collection.data_categories or "",
        collection.subjects_count if collection.subjects_count is not None else "",
        _text(collection.collected_at),
        _text(collection.retention_end),
        _status(collection.status),
        collection.notes or "",
        _text(collection.created_at),
        _text(collection.updated_at),
    ]


def _dpo_row(request: DpoRequest) -> list[Any]:
    return [
        request.reference,
        request.subject,
        request.requester_name or "",
        request.requester_type or "",
        request.description or "",
        request.response or "",
        request.recommendations or "",
        _text(request.due_date),
        _status(request.status),
        _text(request.closed_at),
        _text(request.created_at),
        _text(request.updated_at),
    ]


def _rights_row(request: RightsRequest) -> list[Any]:
    return [
        request.reference,
        RIGHTS_TYPE_LABELS.get(request.request_type, request.request_type),
        request.requester_name or "",
        request.processing_activity.name if request.processing_activity else "",
        _text(request.received_at),
        _text(request.due_date),
        _status(request.status),
        request.response or "",
        request.resolution or "",
        _text(request.closed_at),
        _text(request.created_at),
        _text(request.updated_at),
    ]


def _breach_row(breach: DataBreach) -> list[Any]:
    return [
        breach.reference,
        _text(breach.occurred_at),
        _text(breach.discovered_at),
        breach.description or "",
        SEVERITY_LABELS.get(breach.severity, breach.severity),
        breach.affected_count if breach.affected_count is not None else "",
        breach.containment or "",
        _text(breach.cnil_notified_at),
        _text(breach.subjects_notified_at),
        _status(breach.status),
        breach.lessons_learned or "",
        _text(breach.created_at),
        _text(breach.updated_at),
    ]


def _synthesis_rows(
    activities: list[ProcessingActivity],
    collections: list[DataCollection],
    dpo_requests: list[DpoRequest],
    rights_requests: list[RightsRequest],
    breaches: list[DataBreach],
) -> list[list[Any]]:
    rows: list[list[Any]] = [
        ["Généré le", datetime.now().strftime("%d/%m/%Y %H:%M"), ""],
        ["Traitements", "Total", len(activities)],
        ["Traitements", "Actifs", sum(1 for row in activities if row.status == "active")],
        ["Collectes", "Total", len(collections)],
        ["Collectes", "Actives", sum(1 for row in collections if row.status == "active")],
        ["Demandes DPO", "Total", len(dpo_requests)],
        ["Demandes DPO", "Ouvertes", sum(1 for row in dpo_requests if row.status in {"new", "in_progress"})],
        ["Droits des personnes", "Total", len(rights_requests)],
        ["Droits des personnes", "Ouvertes", sum(1 for row in rights_requests if row.status in {"new", "in_progress"})],
        ["Violations", "Total", len(breaches)],
        ["Violations", "Ouvertes", sum(1 for row in breaches if row.status == "open")],
    ]
    for label, counter in (
        ("Traitement · statut", Counter(_status(row.status) for row in activities)),
        ("Collecte · type", Counter(COLLECTION_TYPE_LABELS.get(row.collection_type, row.collection_type) for row in collections)),
        ("Droits · nature", Counter(RIGHTS_TYPE_LABELS.get(row.request_type, row.request_type) for row in rights_requests)),
        ("Violation · gravité", Counter(SEVERITY_LABELS.get(row.severity, row.severity) for row in breaches)),
    ):
        rows.extend([[label, key, value] for key, value in counter.most_common()])
    return rows


def rgpd_xlsx(
    activities: list[ProcessingActivity],
    collections: list[DataCollection],
    dpo_requests: list[DpoRequest],
    rights_requests: list[RightsRequest],
    breaches: list[DataBreach],
) -> bytes:
    workbook = Workbook()
    workbook.remove(workbook.active)

    _append_sheet(
        workbook,
        "Registre des traitements",
        [
            "Référence",
            "Traitement",
            "Finalité",
            "Base légale",
            "Catégories de données",
            "Personnes concernées",
            "Destinataires",
            "Durée de conservation",
            "Mesures de sécurité",
            "Sous-traitants",
            "Responsable",
            "Notes DPO",
            "Statut",
            "Dernière revue",
            "Prochaine revue",
            "Créé le",
            "Modifié le",
        ],
        [_activity_row(row) for row in activities],
        [16, 34, 40, 22, 40, 28, 30, 24, 40, 30, 24, 40, 14, 16, 16, 18, 18],
    )

    _append_sheet(
        workbook,
        "Données collectées",
        [
            "Collecte",
            "Type",
            "Finalité",
            "Traitement lié",
            "Catégories de données",
            "Personnes concernées",
            "Date de collecte",
            "Fin de conservation",
            "Statut",
            "Notes",
            "Créée le",
            "Modifiée le",
        ],
        [_collection_row(row) for row in collections],
        [34, 20, 40, 34, 40, 16, 16, 18, 14, 40, 18, 18],
    )

    _append_sheet(
        workbook,
        "Demandes DPO",
        [
            "Référence",
            "Objet",
            "Demandeur",
            "Type de demandeur",
            "Description",
            "Réponse",
            "Recommandations",
            "Échéance",
            "Statut",
            "Clôturée le",
            "Créée le",
            "Modifiée le",
        ],
        [_dpo_row(row) for row in dpo_requests],
        [16, 36, 26, 20, 44, 44, 40, 16, 14, 18, 18, 18],
    )

    _append_sheet(
        workbook,
        "Droits des personnes",
        [
            "Référence",
            "Droit exercé",
            "Demandeur",
            "Traitement lié",
            "Reçue le",
            "Échéance",
            "Statut",
            "Réponse",
            "Résolution",
            "Clôturée le",
            "Créée le",
            "Modifiée le",
        ],
        [_rights_row(row) for row in rights_requests],
        [16, 20, 26, 34, 16, 16, 14, 44, 44, 18, 18, 18],
    )

    _append_sheet(
        workbook,
        "Violations",
        [
            "Référence",
            "Survenue le",
            "Découverte le",
            "Description",
            "Gravité",
            "Personnes concernées",
            "Confinement",
            "Notification CNIL",
            "Information des personnes",
            "Statut",
            "Enseignements",
            "Créée le",
            "Modifiée le",
        ],
        [_breach_row(row) for row in breaches],
        [16, 18, 18, 44, 14, 18, 40, 18, 20, 14, 40, 18, 18],
    )

    _append_sheet(
        workbook,
        "Synthèse",
        ["Répartition", "Libellé", "Valeur"],
        _synthesis_rows(activities, collections, dpo_requests, rights_requests, breaches),
    )

    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def rgpd_pdf(
    activities: list[ProcessingActivity],
    collections: list[DataCollection],
    dpo_requests: list[DpoRequest],
    rights_requests: list[RightsRequest],
    breaches: list[DataBreach],
) -> bytes:
    buffer = io.BytesIO()
    document = create_document(
        buffer,
        title="Registre RGPD",
        subtitle=(
            f"{len(activities)} traitement(s) · {len(collections)} collecte(s) · "
            f"{len(dpo_requests)} demande(s) DPO · {len(rights_requests)} droit(s) · "
            f"{len(breaches)} violation(s)"
        ),
    )
    rows: list[list[Any]] = [
        ["Référence", "Traitement", "Base légale", "Conservation", "Statut", "Prochaine revue"]
    ]
    for activity in activities:
        rows.append(
            [
                activity.reference,
                activity.name,
                activity.legal_basis or "",
                activity.retention_period or "",
                _status(activity.status),
                _text(activity.next_review_at),
            ]
        )
    table = make_table(
        rows,
        [24 * mm, 54 * mm, 36 * mm, 36 * mm, 24 * mm, 30 * mm],
        font_size=7,
    )
    document.build(
        [
            meta_line(
                count=len(activities),
                label="traitement(s) — vue synthétique du registre",
            ),
            table,
        ]
    )
    return buffer.getvalue()


def rights_dossier_xlsx(
    request: RightsRequest,
    activity: ProcessingActivity | None,
    collections: list[DataCollection],
) -> bytes:
    workbook = Workbook()
    workbook.remove(workbook.active)

    _append_sheet(
        workbook,
        "Demande",
        ["Champ", "Valeur"],
        [
            ["Référence", request.reference],
            ["Droit exercé", RIGHTS_TYPE_LABELS.get(request.request_type, request.request_type)],
            ["Demandeur", request.requester_name or ""],
            ["Traitement lié", activity.name if activity else ""],
            ["Reçue le", _text(request.received_at)],
            ["Échéance", _text(request.due_date)],
            ["Statut", _status(request.status)],
            ["Réponse apportée", request.response or ""],
            ["Résolution", request.resolution or ""],
            ["Clôturée le", _text(request.closed_at)],
            ["Créée le", _text(request.created_at)],
            ["Mise à jour le", _text(request.updated_at)],
        ],
        [28, 90],
    )

    if activity:
        _append_sheet(
            workbook,
            "Traitement lié",
            ["Champ", "Valeur"],
            [
                ["Référence", activity.reference],
                ["Traitement", activity.name],
                ["Finalité", activity.purpose or ""],
                ["Base légale", activity.legal_basis or ""],
                ["Catégories de données", activity.data_categories or ""],
                ["Personnes concernées", activity.data_subjects or ""],
                ["Destinataires", activity.recipients or ""],
                ["Durée de conservation", activity.retention_period or ""],
                ["Mesures de sécurité", activity.security_measures or ""],
                ["Sous-traitants", activity.suppliers or ""],
                ["Notes DPO", activity.dpo_notes or ""],
                ["Statut", _status(activity.status)],
            ],
            [28, 90],
        )
    else:
        _append_sheet(
            workbook,
            "Traitement lié",
            ["Champ", "Valeur"],
            [["Traitement lié", "Aucun traitement spécifique rattaché à cette demande."]],
            [28, 90],
        )

    _append_sheet(
        workbook,
        "Données collectées",
        [
            "Collecte",
            "Type",
            "Finalité",
            "Catégories de données",
            "Personnes concernées",
            "Date de collecte",
            "Fin de conservation",
            "Notes",
        ],
        [
            [
                row.name,
                COLLECTION_TYPE_LABELS.get(row.collection_type, row.collection_type),
                row.purpose or "",
                row.data_categories or "",
                row.subjects_count if row.subjects_count is not None else "",
                _text(row.collected_at),
                _text(row.retention_end),
                row.notes or "",
            ]
            for row in collections
        ],
        [34, 20, 40, 40, 16, 16, 18, 40],
    )

    _append_sheet(
        workbook,
        "Synthèse",
        ["Répartition", "Libellé", "Valeur"],
        [
            ["Dossier", "Référence", request.reference],
            ["Dossier", "Droit exercé", RIGHTS_TYPE_LABELS.get(request.request_type, request.request_type)],
            ["Dossier", "Statut", _status(request.status)],
            ["Dossier", "Traitement lié", activity.name if activity else ""],
            ["Dossier", "Collectes rattachées", len(collections)],
            ["Généré le", datetime.now().strftime("%d/%m/%Y %H:%M"), ""],
        ],
    )

    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def rights_dossier_pdf(
    request: RightsRequest,
    activity: ProcessingActivity | None,
    collections: list[DataCollection],
) -> bytes:
    buffer = io.BytesIO()
    document = create_document(
        buffer,
        title=f"Dossier de demande de droits — {request.reference}",
        subtitle=(
            f"{RIGHTS_TYPE_LABELS.get(request.request_type, request.request_type)} · "
            f"{request.requester_name or 'Demandeur non précisé'} · {_status(request.status)}"
        ),
        pagesize=A4,
    )
    rows: list[list[Any]] = [["Champ", "Valeur"]]
    for label, value in (
        ("Référence", request.reference),
        ("Droit exercé", RIGHTS_TYPE_LABELS.get(request.request_type, request.request_type)),
        ("Demandeur", request.requester_name or ""),
        ("Reçue le", _text(request.received_at)),
        ("Échéance", _text(request.due_date)),
        ("Statut", _status(request.status)),
        ("Réponse apportée", request.response or ""),
        ("Résolution", request.resolution or ""),
        ("Traitement lié", activity.name if activity else ""),
        ("Base légale", activity.legal_basis if activity else ""),
        ("Durée de conservation", activity.retention_period if activity else ""),
        ("Collectes rattachées", str(len(collections))),
    ):
        rows.append([label, value])
    table = make_table(rows, [45 * mm, 105 * mm], font_size=8)
    document.build(
        [
            meta_line(count=len(rows) - 1, label="champ(s) — dossier de demande"),
            table,
        ]
    )
    return buffer.getvalue()


def agent_xlsx(
    agent: Agent,
    accounts: list[AgentAccount],
    assets: list[Asset],
    assignments: list[AssetAssignment],
    stock_movements: list[StockMovement],
    tickets: list[Ticket],
    mobile_lines: list[MobileLine],
) -> bytes:
    workbook = Workbook()
    workbook.remove(workbook.active)
    full_name = f"{agent.first_name} {agent.last_name}".strip()

    _append_sheet(
        workbook,
        "Identité",
        ["Champ", "Valeur"],
        [
            ["Nom complet", full_name],
            ["E-mail professionnel", agent.email_pro],
            ["Téléphone professionnel", agent.phone_pro or ""],
            ["Service", agent.service.name if agent.service else ""],
            ["Site", agent.location.name if agent.location else ""],
            ["Fonction", agent.function_label or ""],
            ["Identifiant de connexion", agent.login or ""],
            ["Date d'arrivée", _text(agent.arrival_date)],
            ["Date de départ", _text(agent.departure_date)],
            ["Statut", _status(agent.status)],
            ["Notes", agent.notes or ""],
            ["Créé le", _text(agent.created_at)],
            ["Modifié le", _text(agent.updated_at)],
        ],
        [30, 90],
    )

    _append_sheet(
        workbook,
        "Comptes et accès",
        ["Système", "Identifiant", "Type de compte", "Privilégié", "Actif", "Dernière revue", "Notes"],
        [
            [
                row.system_label,
                row.login,
                row.account_type or "",
                "Oui" if row.is_privileged else "Non",
                "Oui" if row.is_active else "Non",
                _text(row.last_review_at),
                row.notes or "",
            ]
            for row in accounts
        ],
        [30, 30, 22, 12, 10, 16, 40],
    )

    _append_sheet(
        workbook,
        "Matériel affecté",
        [
            "Inventaire",
            "Équipement",
            "Catégorie",
            "Marque",
            "Modèle",
            "N° série",
            "Nom machine",
            "IP",
            "MAC",
            "Système",
            "État",
            "Site",
            "Date d'achat",
            "Fin de garantie",
        ],
        [
            [
                row.asset_tag,
                row.name,
                row.category.name if row.category else "",
                row.brand or "",
                row.model or "",
                row.serial_number or "",
                row.hostname or "",
                row.ip_address or "",
                row.mac_address or "",
                f"{row.os_name or ''} {row.os_version or ''}".strip(),
                ASSET_STATUS_LABELS.get(row.status, row.status),
                row.location.name if row.location else "",
                _text(row.purchase_date),
                _text(row.warranty_end),
            ]
            for row in assets
        ],
    )

    _append_sheet(
        workbook,
        "Historique des affectations",
        ["Inventaire", "Équipement", "Début", "Fin", "Motif"],
        [
            [
                row.asset.asset_tag if row.asset else "",
                row.asset.name if row.asset else "",
                _text(row.started_at),
                _text(row.ended_at),
                row.reason or "",
            ]
            for row in assignments
        ],
    )

    _append_sheet(
        workbook,
        "Lignes mobiles",
        [
            "Ligne",
            "Titulaire",
            "E-mail",
            "Statut",
            "Forfait",
            "Terminal",
            "IMEI",
            "Mise en service",
            "Fin d'engagement",
            "Codes PIN/PUK disponibles",
        ],
        [
            [
                row.line_number,
                row.holder_name or "",
                row.email or "",
                _status(row.status),
                row.plan_name or "",
                row.terminal_communicating or row.terminal_purchased or "",
                row.imei_communicating or row.imei_purchased or "",
                _text(row.activation_date),
                _text(row.commitment_end_date),
                "Oui" if row.has_secrets else "Non",
            ]
            for row in mobile_lines
        ],
    )

    _append_sheet(
        workbook,
        "Tickets",
        ["Référence", "Objet", "Catégorie", "Priorité", "Statut", "Ouvert le", "Résolu le", "Clôturé le"],
        [
            [
                row.reference,
                row.subject,
                row.category.name if row.category else "",
                row.priority.name if row.priority else "",
                row.status.name if row.status else "",
                _text(row.opened_at),
                _text(row.resolved_at),
                _text(row.closed_at),
            ]
            for row in tickets
        ],
    )

    _append_sheet(
        workbook,
        "Mouvements de stock",
        ["Date", "Article", "Référence", "Sens", "Quantité", "Motif"],
        [
            [
                _text(row.moved_at),
                row.stock_item.name if row.stock_item else "",
                row.stock_item.reference if row.stock_item else "",
                row.direction,
                row.quantity,
                row.reason or "",
            ]
            for row in stock_movements
        ],
    )

    _append_sheet(
        workbook,
        "Synthèse",
        ["Catégorie", "Éléments", "Nombre"],
        [
            ["Identité", "Agent", 1],
            ["Comptes et accès", "Comptes", len(accounts)],
            ["Matériel", "Équipements affectés", len(assets)],
            ["Matériel", "Affectations historiques", len(assignments)],
            ["Téléphonie", "Lignes mobiles", len(mobile_lines)],
            ["Support", "Tickets demandés", len(tickets)],
            ["Stock", "Mouvements reçus", len(stock_movements)],
            ["Généré le", datetime.now().strftime("%d/%m/%Y %H:%M"), ""],
        ],
    )

    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def agent_pdf(
    agent: Agent,
    accounts: list[AgentAccount],
    assets: list[Asset],
    assignments: list[AssetAssignment],
    stock_movements: list[StockMovement],
    tickets: list[Ticket],
    mobile_lines: list[MobileLine],
) -> bytes:
    buffer = io.BytesIO()
    full_name = f"{agent.first_name} {agent.last_name}".strip()
    document = create_document(
        buffer,
        title=f"Données personnelles — {full_name}",
        subtitle=(
            f"{agent.email_pro} · "
            f"{agent.service.name if agent.service else 'Service non précisé'}"
        ),
        pagesize=A4,
    )
    rows: list[list[Any]] = [["Champ", "Valeur"]]
    for label, value in (
        ("Nom complet", full_name),
        ("E-mail professionnel", agent.email_pro),
        ("Téléphone professionnel", agent.phone_pro or ""),
        ("Service", agent.service.name if agent.service else ""),
        ("Site", agent.location.name if agent.location else ""),
        ("Fonction", agent.function_label or ""),
        ("Identifiant de connexion", agent.login or ""),
        ("Date d'arrivée", _text(agent.arrival_date)),
        ("Date de départ", _text(agent.departure_date)),
        ("Statut", _status(agent.status)),
        ("Comptes et accès", str(len(accounts))),
        ("Matériel affecté", str(len(assets))),
        ("Affectations historiques", str(len(assignments))),
        ("Lignes mobiles", str(len(mobile_lines))),
        ("Tickets demandés", str(len(tickets))),
        ("Mouvements de stock", str(len(stock_movements))),
    ):
        rows.append([label, value])
    table = make_table(rows, [45 * mm, 105 * mm], font_size=8)
    document.build(
        [
            meta_line(count=len(rows) - 1, label="champ(s) — données personnelles"),
            table,
        ]
    )
    return buffer.getvalue()
