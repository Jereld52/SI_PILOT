from __future__ import annotations

import html
import io
from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.permissions import has_permission
from app.models.assets import Asset, License, Supplier
from app.models.auth import User
from app.models.contracts import Contract
from app.models.infrastructure import InfraEquipment
from app.models.mobile import MobileLine
from app.models.projects import Project
from app.models.rgpd import ProcessingActivity
from app.models.security import SecurityIncident
from app.models.stock import StockItem
from app.models.tickets import Ticket, TicketStatus

HEADER_FILL = PatternFill("solid", fgColor="772B2F")
HEADER_FONT = Font(color="F3EFE2", bold=True)


@dataclass(frozen=True)
class ColumnSpec:
    key: str
    label: str
    default: bool = True


@dataclass(frozen=True)
class DatasetSpec:
    key: str
    label: str
    description: str
    permission: str
    columns: tuple[ColumnSpec, ...]


DATASETS: dict[str, DatasetSpec] = {
    "assets": DatasetSpec(
        key="assets",
        label="Parc informatique",
        description="Postes, portables, écrans, imprimantes et équipements inventoriés.",
        permission="assets.read",
        columns=(
            ColumnSpec("asset_tag", "N° inventaire"),
            ColumnSpec("name", "Nom"),
            ColumnSpec("category", "Catégorie"),
            ColumnSpec("brand", "Marque"),
            ColumnSpec("model", "Modèle"),
            ColumnSpec("serial_number", "N° série"),
            ColumnSpec("external_id", "ID externe", False),
            ColumnSpec("hostname", "Nom machine"),
            ColumnSpec("ip_address", "Adresse IP"),
            ColumnSpec("mac_address", "Adresse MAC", False),
            ColumnSpec("os_name", "Système"),
            ColumnSpec("os_version", "Version système", False),
            ColumnSpec("status", "État"),
            ColumnSpec("condition", "Condition", False),
            ColumnSpec("is_critical", "Critique", False),
            ColumnSpec("assigned_agent", "Agent affecté"),
            ColumnSpec("agent_email", "E-mail agent", False),
            ColumnSpec("service", "Service"),
            ColumnSpec("location", "Site"),
            ColumnSpec("supplier", "Fournisseur", False),
            ColumnSpec("purchase_date", "Date d'achat", False),
            ColumnSpec("commissioning_date", "Mise en service", False),
            ColumnSpec("warranty_end", "Fin de garantie"),
            ColumnSpec("purchase_price", "Prix d'achat", False),
            ColumnSpec("wapt_status", "WAPT statut", False),
            ColumnSpec("wapt_reachable", "WAPT joignable", False),
            ColumnSpec("wapt_last_seen", "WAPT dernière connexion", False),
            ColumnSpec("wapt_last_user", "WAPT dernier utilisateur", False),
            ColumnSpec("wapt_domain", "WAPT domaine", False),
            ColumnSpec("wapt_groups", "WAPT groupes", False),
            ColumnSpec("comments", "Commentaires", False),
        ),
    ),
    "mobile_lines": DatasetSpec(
        key="mobile_lines",
        label="Lignes mobiles",
        description="Titulaires, forfaits, terminaux et engagements. Sans PIN/PUK.",
        permission="mobile_lines.read",
        columns=(
            ColumnSpec("line_number", "Ligne"),
            ColumnSpec("holder_name", "Titulaire"),
            ColumnSpec("role_label", "Fonction"),
            ColumnSpec("email", "E-mail"),
            ColumnSpec("status", "Statut"),
            ColumnSpec("plan_name", "Forfait"),
            ColumnSpec("terminal", "Terminal"),
            ColumnSpec("imei", "IMEI"),
            ColumnSpec("commitment_end_date", "Fin d'engagement"),
            ColumnSpec("contract_number", "N° contrat"),
            ColumnSpec("civility", "Civilité", False),
            ColumnSpec("siren", "SIREN", False),
            ColumnSpec("company_name", "Société", False),
            ColumnSpec("titulaire_number", "N° titulaire", False),
            ColumnSpec("cf_number", "N° CF", False),
            ColumnSpec("cf_name", "Nom CF", False),
            ColumnSpec("activation_date", "Mise en service", False),
            ColumnSpec("billing_date", "Date de facturation", False),
            ColumnSpec("portability_date", "Date de portabilité", False),
            ColumnSpec("rio", "RIO", False),
            ColumnSpec("qr_code", "QR code SIM", False),
            ColumnSpec("eid", "EID", False),
            ColumnSpec("csim_number", "N° CSIM", False),
            ColumnSpec("has_secrets", "Codes PIN/PUK disponibles", False),
            ColumnSpec("list_name", "Liste", False),
            ColumnSpec("terminal_purchased", "Terminal acheté", False),
            ColumnSpec("imei_purchased", "IMEI acheté", False),
            ColumnSpec("out_of_bundle", "Hors-forfait", False),
            ColumnSpec("sim_format", "Format SIM", False),
            ColumnSpec("vpn_identifier", "Identifiant VPN", False),
            ColumnSpec("private_number", "Numéro privé", False),
            ColumnSpec("terminal_change_date", "Changement terminal", False),
            ColumnSpec("plan_change_date", "Changement forfait", False),
            ColumnSpec("is_secondary_line", "Ligne secondaire", False),
            ColumnSpec("main_line_number", "Ligne principale", False),
            ColumnSpec("master_access_id", "Master access ID", False),
            ColumnSpec("offer_type", "Type d'offre", False),
            ColumnSpec("company_id", "Company ID", False),
            ColumnSpec("notes", "Notes", False),
        ),
    ),
    "infrastructure": DatasetSpec(
        key="infrastructure",
        label="Infrastructure",
        description="Serveurs, machines virtuelles, réseau et supervision.",
        permission="infrastructure.read",
        columns=(
            ColumnSpec("name", "Nom"),
            ColumnSpec("type", "Type"),
            ColumnSpec("ip_address", "Adresse IP"),
            ColumnSpec("role", "Rôle"),
            ColumnSpec("location", "Site"),
            ColumnSpec("os_name", "Système"),
            ColumnSpec("os_version", "Version"),
            ColumnSpec("criticality", "Criticité"),
            ColumnSpec("status", "Statut"),
            ColumnSpec("responsible", "Responsable"),
            ColumnSpec("last_check_at", "Dernière vérification"),
            ColumnSpec("asset_tag", "Inventaire lié", False),
            ColumnSpec("asset_name", "Nom du parc", False),
            ColumnSpec("mac_address", "Adresse MAC", False),
            ColumnSpec("parent", "Équipement parent", False),
            ColumnSpec("map_x", "Coordonnée X", False),
            ColumnSpec("map_y", "Coordonnée Y", False),
            ColumnSpec("config_notes", "Notes / configuration", False),
            ColumnSpec("created_at", "Créé le", False),
            ColumnSpec("updated_at", "Modifié le", False),
        ),
    ),
    "stock": DatasetSpec(
        key="stock",
        label="Stock IT",
        description="Accessoires et consommables, seuils et valeur du stock.",
        permission="stock.read",
        columns=(
            ColumnSpec("reference", "Référence"),
            ColumnSpec("name", "Article"),
            ColumnSpec("category", "Catégorie"),
            ColumnSpec("brand", "Marque"),
            ColumnSpec("model", "Modèle"),
            ColumnSpec("quantity", "Quantité"),
            ColumnSpec("min_quantity", "Seuil d'alerte"),
            ColumnSpec("unit", "Unité"),
            ColumnSpec("unit_price", "Prix unitaire"),
            ColumnSpec("stock_value", "Valeur du stock"),
            ColumnSpec("is_low", "Sous le seuil"),
            ColumnSpec("is_out", "Épuisé"),
            ColumnSpec("status", "Statut"),
            ColumnSpec("supplier", "Fournisseur", False),
            ColumnSpec("location", "Emplacement", False),
            ColumnSpec("notes", "Notes", False),
            ColumnSpec("created_at", "Créé le", False),
            ColumnSpec("updated_at", "Modifié le", False),
        ),
    ),
    "suppliers": DatasetSpec(
        key="suppliers",
        label="Fournisseurs",
        description="Coordonnées, SIRET, contacts et statut des prestataires.",
        permission="suppliers.read",
        columns=(
            ColumnSpec("name", "Fournisseur"),
            ColumnSpec("type", "Type"),
            ColumnSpec("siret", "SIRET"),
            ColumnSpec("contact_name", "Contact principal"),
            ColumnSpec("email", "E-mail"),
            ColumnSpec("phone", "Téléphone"),
            ColumnSpec("address", "Adresse", False),
            ColumnSpec("website", "Site web", False),
            ColumnSpec("is_active", "Actif"),
            ColumnSpec("contacts", "Contacts secondaires", False),
            ColumnSpec("notes", "Notes", False),
            ColumnSpec("created_at", "Créé le", False),
        ),
    ),
    "licenses": DatasetSpec(
        key="licenses",
        label="Licences",
        description="Éditeurs, sièges, échéances et coûts annuels.",
        permission="licenses.read",
        columns=(
            ColumnSpec("name", "Licence"),
            ColumnSpec("vendor", "Éditeur"),
            ColumnSpec("license_type", "Type"),
            ColumnSpec("seats", "Sièges"),
            ColumnSpec("seats_used", "Sièges utilisés"),
            ColumnSpec("end_date", "Fin de licence"),
            ColumnSpec("annual_cost", "Coût annuel"),
            ColumnSpec("is_active", "Active"),
            ColumnSpec("start_date", "Début", False),
            ColumnSpec("notes", "Notes", False),
            ColumnSpec("created_at", "Créée le", False),
        ),
    ),
    "contracts": DatasetSpec(
        key="contracts",
        label="Contrats",
        description="Contrats, fournisseurs, montants et échéances.",
        permission="contracts.read",
        columns=(
            ColumnSpec("reference", "Référence"),
            ColumnSpec("object", "Objet"),
            ColumnSpec("supplier", "Fournisseur"),
            ColumnSpec("category", "Catégorie"),
            ColumnSpec("start_date", "Début"),
            ColumnSpec("end_date", "Fin"),
            ColumnSpec("status", "Statut"),
            ColumnSpec("amount_ht", "Montant HT", False),
            ColumnSpec("amount_ttc", "Montant TTC", False),
            ColumnSpec("vat_rate", "TVA", False),
            ColumnSpec("annual_cost", "Coût annuel", False),
            ColumnSpec("monthly_cost", "Coût mensuel", False),
            ColumnSpec("duration_months", "Durée (mois)", False),
            ColumnSpec("notice_days", "Préavis (jours)", False),
            ColumnSpec("auto_renew", "Reconduction tacite", False),
            ColumnSpec("responsible", "Responsable", False),
            ColumnSpec("contact_name", "Contact", False),
            ColumnSpec("contact_email", "E-mail contact", False),
            ColumnSpec("comments", "Commentaires", False),
        ),
    ),
    "projects": DatasetSpec(
        key="projects",
        label="Projets",
        description="Projets, responsables, budgets et avancement.",
        permission="projects.read",
        columns=(
            ColumnSpec("code", "Code"),
            ColumnSpec("name", "Projet"),
            ColumnSpec("owner", "Responsable"),
            ColumnSpec("start_date", "Début"),
            ColumnSpec("due_date", "Échéance"),
            ColumnSpec("planned_budget", "Budget prévu"),
            ColumnSpec("priority", "Priorité"),
            ColumnSpec("status", "Statut"),
            ColumnSpec("progress_percent", "Avancement (%)"),
            ColumnSpec("description", "Description", False),
            ColumnSpec("objectives", "Objectifs", False),
        ),
    ),
    "security_incidents": DatasetSpec(
        key="security_incidents",
        label="Incidents de sécurité",
        description="Incidents, gravité, mesures et clôture.",
        permission="security.read",
        columns=(
            ColumnSpec("reference", "Référence"),
            ColumnSpec("title", "Incident"),
            ColumnSpec("severity", "Gravité"),
            ColumnSpec("category", "Catégorie"),
            ColumnSpec("detected_at", "Détecté le"),
            ColumnSpec("status", "Statut"),
            ColumnSpec("owner", "Responsable"),
            ColumnSpec("description", "Description", False),
            ColumnSpec("actions_taken", "Actions menées", False),
            ColumnSpec("corrective_measures", "Mesures correctives", False),
            ColumnSpec("lessons_learned", "Retour d'expérience", False),
            ColumnSpec("closed_at", "Clôturé le", False),
        ),
    ),
    "rgpd_processing": DatasetSpec(
        key="rgpd_processing",
        label="Registre RGPD",
        description="Traitements, finalités, bases légales et conservation.",
        permission="rgpd.read",
        columns=(
            ColumnSpec("reference", "Référence"),
            ColumnSpec("name", "Traitement"),
            ColumnSpec("purpose", "Finalité"),
            ColumnSpec("legal_basis", "Base légale"),
            ColumnSpec("data_categories", "Catégories de données"),
            ColumnSpec("data_subjects", "Personnes concernées"),
            ColumnSpec("retention_period", "Durée de conservation"),
            ColumnSpec("owner", "Responsable"),
            ColumnSpec("status", "Statut"),
            ColumnSpec("next_review_at", "Prochaine revue"),
            ColumnSpec("recipients", "Destinataires", False),
            ColumnSpec("security_measures", "Mesures de sécurité", False),
            ColumnSpec("suppliers", "Sous-traitants", False),
            ColumnSpec("dpo_notes", "Notes DPO", False),
            ColumnSpec("last_review_at", "Dernière revue", False),
        ),
    ),
    "tickets": DatasetSpec(
        key="tickets",
        label="Tickets et demandes IT",
        description="Demandes, priorités, statuts et délais de traitement.",
        permission="tickets.read",
        columns=(
            ColumnSpec("reference", "Référence"),
            ColumnSpec("subject", "Objet"),
            ColumnSpec("category", "Catégorie"),
            ColumnSpec("priority", "Priorité"),
            ColumnSpec("status", "Statut"),
            ColumnSpec("requester_agent", "Demandeur"),
            ColumnSpec("assignee", "Assigné à"),
            ColumnSpec("opened_at", "Ouvert le"),
            ColumnSpec("due_at", "Échéance"),
            ColumnSpec("resolved_at", "Résolu le"),
            ColumnSpec("closed_at", "Clôturé le", False),
            ColumnSpec("service", "Service", False),
            ColumnSpec("source", "Origine", False),
            ColumnSpec("description", "Description", False),
            ColumnSpec("resolution", "Résolution", False),
            ColumnSpec("time_spent_minutes", "Temps passé (min)", False),
            ColumnSpec("satisfaction_score", "Satisfaction", False),
        ),
    ),
}


def catalog(actor: User) -> list[dict[str, Any]]:
    return [
        {
            "key": spec.key,
            "label": spec.label,
            "description": spec.description,
            "columns": [
                {"key": column.key, "label": column.label, "default": column.default}
                for column in spec.columns
            ],
        }
        for spec in DATASETS.values()
        if has_permission(actor, spec.permission)
    ]


def select_columns(dataset: DatasetSpec, requested: list[str]) -> list[ColumnSpec]:
    if not requested:
        return [column for column in dataset.columns if column.default]
    by_key = {column.key: column for column in dataset.columns}
    selected = [by_key[key] for key in requested if key in by_key]
    return selected or [column for column in dataset.columns if column.default]


def _full_name(person: Any) -> str:
    if person is None:
        return ""
    return f"{getattr(person, 'first_name', '')} {getattr(person, 'last_name', '')}".strip()


def _date(value: date | datetime | None) -> str:
    if value is None:
        return ""
    return value.strftime("%d/%m/%Y")


def _moment(value: datetime | None) -> str:
    if value is None:
        return ""
    return value.strftime("%d/%m/%Y %H:%M")


def _asset_row(asset: Asset) -> dict[str, Any]:
    agent = asset.assigned_agent
    return {
        "asset_tag": asset.asset_tag,
        "name": asset.name,
        "category": asset.category.name if asset.category else "",
        "brand": asset.brand or "",
        "model": asset.model or "",
        "serial_number": asset.serial_number or "",
        "external_id": asset.external_id or "",
        "hostname": asset.hostname or "",
        "ip_address": asset.ip_address or "",
        "mac_address": asset.mac_address or "",
        "os_name": asset.os_name or "",
        "os_version": asset.os_version or "",
        "status": asset.status,
        "condition": asset.condition,
        "is_critical": asset.is_critical,
        "assigned_agent": _full_name(agent),
        "agent_email": agent.email_pro if agent else "",
        "service": asset.service.name if asset.service else "",
        "location": asset.location.name if asset.location else "",
        "supplier": asset.supplier.name if asset.supplier else "",
        "purchase_date": _date(asset.purchase_date),
        "commissioning_date": _date(asset.commissioning_date),
        "warranty_end": _date(asset.warranty_end),
        "purchase_price": asset.purchase_price,
        "wapt_status": asset.wapt_status or "",
        "wapt_reachable": asset.wapt_reachable or "",
        "wapt_last_seen": asset.wapt_last_seen or "",
        "wapt_last_user": asset.wapt_last_user or "",
        "wapt_domain": asset.wapt_domain or "",
        "wapt_groups": asset.wapt_groups or "",
        "comments": asset.comments or "",
    }


def _mobile_row(line: MobileLine) -> dict[str, Any]:
    return {
        "line_number": line.line_number,
        "holder_name": line.holder_name or "",
        "role_label": line.role_label or "",
        "email": line.email or "",
        "status": line.status,
        "plan_name": line.plan_name or "",
        "terminal": line.terminal_communicating or line.terminal_purchased or "",
        "imei": line.imei_communicating or line.imei_purchased or "",
        "commitment_end_date": _date(line.commitment_end_date),
        "contract_number": line.contract_number or "",
        "civility": line.civility or "",
        "siren": line.siren or "",
        "company_name": line.company_name or "",
        "titulaire_number": line.titulaire_number or "",
        "cf_number": line.cf_number or "",
        "cf_name": line.cf_name or "",
        "activation_date": _date(line.activation_date),
        "billing_date": _date(line.billing_date),
        "portability_date": _date(line.portability_date),
        "rio": line.rio or "",
        "qr_code": line.qr_code or "",
        "eid": line.eid or "",
        "csim_number": line.csim_number or "",
        "has_secrets": line.has_secrets,
        "list_name": line.list_name or "",
        "terminal_purchased": line.terminal_purchased or "",
        "imei_purchased": line.imei_purchased or "",
        "out_of_bundle": line.out_of_bundle,
        "sim_format": line.sim_format or "",
        "vpn_identifier": line.vpn_identifier or "",
        "private_number": line.private_number or "",
        "terminal_change_date": _date(line.terminal_change_date),
        "plan_change_date": _date(line.plan_change_date),
        "is_secondary_line": line.is_secondary_line,
        "main_line_number": line.main_line_number or "",
        "master_access_id": line.master_access_id or "",
        "offer_type": line.offer_type or "",
        "company_id": line.company_id or "",
        "notes": line.notes or "",
    }


def _infra_row(equipment: InfraEquipment, names: dict[UUID, str]) -> dict[str, Any]:
    return {
        "name": equipment.name,
        "type": equipment.type,
        "ip_address": equipment.ip_address or "",
        "role": equipment.role or "",
        "location": equipment.location.name if equipment.location else "",
        "os_name": equipment.os_name or "",
        "os_version": equipment.os_version or "",
        "criticality": equipment.criticality,
        "status": equipment.status,
        "responsible": _full_name(equipment.responsible),
        "last_check_at": _moment(equipment.last_check_at),
        "asset_tag": equipment.asset.asset_tag if equipment.asset else "",
        "asset_name": equipment.asset.name if equipment.asset else "",
        "mac_address": equipment.mac_address or "",
        "parent": names.get(equipment.parent_id, "") if equipment.parent_id else "",
        "map_x": equipment.map_x,
        "map_y": equipment.map_y,
        "config_notes": equipment.config_notes or "",
        "created_at": _moment(equipment.created_at),
        "updated_at": _moment(equipment.updated_at),
    }


def _stock_row(item: StockItem) -> dict[str, Any]:
    return {
        "reference": item.reference,
        "name": item.name,
        "category": item.category,
        "brand": item.brand or "",
        "model": item.model or "",
        "quantity": item.quantity,
        "min_quantity": item.min_quantity,
        "unit": item.unit,
        "unit_price": item.unit_price,
        "stock_value": item.stock_value,
        "is_low": item.is_low,
        "is_out": item.is_out,
        "status": item.status,
        "supplier": item.supplier.name if item.supplier else "",
        "location": item.location.name if item.location else "",
        "notes": item.notes or "",
        "created_at": _moment(item.created_at),
        "updated_at": _moment(item.updated_at),
    }


def _supplier_row(supplier: Supplier) -> dict[str, Any]:
    contacts = ", ".join(
        f"{contact.name}{f' ({contact.role})' if contact.role else ''}"
        for contact in supplier.contacts
    )
    return {
        "name": supplier.name,
        "type": supplier.type or "",
        "siret": supplier.siret or "",
        "contact_name": supplier.contact_name or "",
        "email": supplier.email or "",
        "phone": supplier.phone or "",
        "address": supplier.address or "",
        "website": supplier.website or "",
        "is_active": supplier.is_active,
        "contacts": contacts,
        "notes": supplier.notes or "",
        "created_at": _moment(supplier.created_at),
    }


def _license_row(license_: License) -> dict[str, Any]:
    return {
        "name": license_.name,
        "vendor": license_.vendor or "",
        "license_type": license_.license_type or "",
        "seats": license_.seats,
        "seats_used": license_.seats_used,
        "end_date": _date(license_.end_date),
        "annual_cost": license_.annual_cost,
        "is_active": license_.is_active,
        "start_date": _date(license_.start_date),
        "notes": license_.notes or "",
        "created_at": _moment(license_.created_at),
    }


def _contract_row(contract: Contract) -> dict[str, Any]:
    return {
        "reference": contract.reference,
        "object": contract.object,
        "supplier": contract.supplier.name if contract.supplier else "",
        "category": contract.category.name if contract.category else "",
        "start_date": _date(contract.start_date),
        "end_date": _date(contract.end_date),
        "status": contract.status,
        "amount_ht": contract.amount_ht,
        "amount_ttc": contract.amount_ttc,
        "vat_rate": contract.vat_rate,
        "annual_cost": contract.annual_cost,
        "monthly_cost": contract.monthly_cost,
        "duration_months": contract.duration_months,
        "notice_days": contract.notice_days,
        "auto_renew": contract.auto_renew,
        "responsible": _full_name(contract.responsible),
        "contact_name": contract.contact_name or "",
        "contact_email": contract.contact_email or "",
        "comments": contract.comments or "",
    }


def _project_row(project: Project) -> dict[str, Any]:
    return {
        "code": project.code,
        "name": project.name,
        "owner": _full_name(project.owner),
        "start_date": _date(project.start_date),
        "due_date": _date(project.due_date),
        "planned_budget": project.planned_budget,
        "priority": project.priority,
        "status": project.status,
        "progress_percent": project.progress_percent,
        "description": project.description or "",
        "objectives": project.objectives or "",
    }


def _security_row(incident: SecurityIncident) -> dict[str, Any]:
    return {
        "reference": incident.reference,
        "title": incident.title,
        "severity": incident.severity,
        "category": incident.category,
        "detected_at": _moment(incident.detected_at),
        "status": incident.status,
        "owner": _full_name(incident.owner),
        "description": incident.description or "",
        "actions_taken": incident.actions_taken or "",
        "corrective_measures": incident.corrective_measures or "",
        "lessons_learned": incident.lessons_learned or "",
        "closed_at": _moment(incident.closed_at),
    }


def _rgpd_row(activity: ProcessingActivity) -> dict[str, Any]:
    return {
        "reference": activity.reference,
        "name": activity.name,
        "purpose": activity.purpose or "",
        "legal_basis": activity.legal_basis or "",
        "data_categories": activity.data_categories or "",
        "data_subjects": activity.data_subjects or "",
        "retention_period": activity.retention_period or "",
        "owner": _full_name(activity.owner),
        "status": activity.status,
        "next_review_at": _date(activity.next_review_at),
        "recipients": activity.recipients or "",
        "security_measures": activity.security_measures or "",
        "suppliers": activity.suppliers or "",
        "dpo_notes": activity.dpo_notes or "",
        "last_review_at": _date(activity.last_review_at),
    }


def _ticket_row(ticket: Ticket) -> dict[str, Any]:
    return {
        "reference": ticket.reference,
        "subject": ticket.subject,
        "category": ticket.category.name if ticket.category else "",
        "priority": ticket.priority.name if ticket.priority else "",
        "status": ticket.status.name if ticket.status else "",
        "requester_agent": _full_name(ticket.requester_agent),
        "assignee": _full_name(ticket.assignee),
        "opened_at": _moment(ticket.opened_at),
        "due_at": _moment(ticket.due_at),
        "resolved_at": _moment(ticket.resolved_at),
        "closed_at": _moment(ticket.closed_at),
        "service": ticket.service.name if ticket.service else "",
        "source": ticket.source,
        "description": ticket.description or "",
        "resolution": ticket.resolution or "",
        "time_spent_minutes": ticket.time_spent_minutes,
        "satisfaction_score": ticket.satisfaction_score,
    }


def load_rows(
    db: Session,
    dataset_key: str,
    *,
    q: str | None = None,
    status: str | None = None,
    type_: str | None = None,
    location_id: UUID | None = None,
    start: date | None = None,
    end: date | None = None,
) -> list[dict[str, Any]]:
    pattern = f"%{q.strip()}%" if q and q.strip() else None
    statement: Any

    if dataset_key == "assets":
        statement = select(Asset)
        if pattern:
            statement = statement.where(
                or_(
                    Asset.name.ilike(pattern),
                    Asset.asset_tag.ilike(pattern),
                    Asset.serial_number.ilike(pattern),
                    Asset.hostname.ilike(pattern),
                )
            )
        if status:
            statement = statement.where(Asset.status == status)
        if location_id:
            statement = statement.where(Asset.location_id == location_id)
        rows = db.scalars(statement.order_by(Asset.asset_tag)).unique().all()
        return [_asset_row(row) for row in rows]

    if dataset_key == "mobile_lines":
        statement = select(MobileLine)
        if pattern:
            statement = statement.where(
                or_(
                    MobileLine.line_number.ilike(pattern),
                    MobileLine.holder_name.ilike(pattern),
                    MobileLine.email.ilike(pattern),
                )
            )
        if status:
            statement = statement.where(MobileLine.status == status)
        mobile_rows = db.scalars(statement.order_by(MobileLine.line_number)).all()
        return [_mobile_row(row) for row in mobile_rows]

    if dataset_key == "infrastructure":
        statement = select(InfraEquipment)
        if pattern:
            statement = statement.where(
                or_(
                    InfraEquipment.name.ilike(pattern),
                    InfraEquipment.role.ilike(pattern),
                    InfraEquipment.ip_address.ilike(pattern),
                    InfraEquipment.os_name.ilike(pattern),
                )
            )
        if status:
            statement = statement.where(InfraEquipment.status == status)
        if type_:
            statement = statement.where(InfraEquipment.type == type_)
        if location_id:
            statement = statement.where(InfraEquipment.location_id == location_id)
        equipments = list(
            db.scalars(statement.order_by(InfraEquipment.name)).all()
        )
        names = {equipment.id: equipment.name for equipment in equipments}
        return [_infra_row(row, names) for row in equipments]

    if dataset_key == "stock":
        statement = select(StockItem)
        if pattern:
            statement = statement.where(
                or_(
                    StockItem.name.ilike(pattern),
                    StockItem.reference.ilike(pattern),
                    StockItem.brand.ilike(pattern),
                    StockItem.model.ilike(pattern),
                )
            )
        if status:
            statement = statement.where(StockItem.status == status)
        if type_:
            statement = statement.where(StockItem.category == type_)
        if location_id:
            statement = statement.where(StockItem.location_id == location_id)
        stock_rows = db.scalars(
            statement.order_by(StockItem.category, StockItem.name)
        ).all()
        return [_stock_row(row) for row in stock_rows]

    if dataset_key == "suppliers":
        statement = select(Supplier)
        if pattern:
            statement = statement.where(
                or_(
                    Supplier.name.ilike(pattern),
                    Supplier.siret.ilike(pattern),
                    Supplier.contact_name.ilike(pattern),
                    Supplier.email.ilike(pattern),
                )
            )
        if status in {"active", "inactive"}:
            statement = statement.where(Supplier.is_active == (status == "active"))
        supplier_rows = db.scalars(statement.order_by(Supplier.name)).unique().all()
        return [_supplier_row(row) for row in supplier_rows]

    if dataset_key == "licenses":
        statement = select(License)
        if pattern:
            statement = statement.where(
                or_(License.name.ilike(pattern), License.vendor.ilike(pattern))
            )
        if status in {"active", "inactive"}:
            statement = statement.where(License.is_active == (status == "active"))
        license_rows = db.scalars(statement.order_by(License.name)).all()
        return [_license_row(row) for row in license_rows]

    if dataset_key == "contracts":
        statement = select(Contract)
        if pattern:
            statement = statement.where(
                or_(Contract.reference.ilike(pattern), Contract.object.ilike(pattern))
            )
        if status:
            statement = statement.where(Contract.status == status)
        contract_rows = db.scalars(statement.order_by(Contract.reference)).unique().all()
        return [_contract_row(row) for row in contract_rows]

    if dataset_key == "projects":
        statement = select(Project)
        if pattern:
            statement = statement.where(
                or_(
                    Project.code.ilike(pattern),
                    Project.name.ilike(pattern),
                    Project.description.ilike(pattern),
                )
            )
        if status:
            statement = statement.where(Project.status == status)
        project_rows = db.scalars(statement.order_by(Project.code)).unique().all()
        return [_project_row(row) for row in project_rows]

    if dataset_key == "security_incidents":
        statement = select(SecurityIncident)
        if pattern:
            statement = statement.where(
                or_(
                    SecurityIncident.reference.ilike(pattern),
                    SecurityIncident.title.ilike(pattern),
                    SecurityIncident.description.ilike(pattern),
                )
            )
        if status:
            statement = statement.where(SecurityIncident.status == status)
        security_rows = db.scalars(
            statement.order_by(SecurityIncident.detected_at.desc())
        ).unique().all()
        return [_security_row(row) for row in security_rows]

    if dataset_key == "rgpd_processing":
        statement = select(ProcessingActivity)
        if pattern:
            statement = statement.where(
                or_(
                    ProcessingActivity.reference.ilike(pattern),
                    ProcessingActivity.name.ilike(pattern),
                    ProcessingActivity.purpose.ilike(pattern),
                )
            )
        if status:
            statement = statement.where(ProcessingActivity.status == status)
        rgpd_rows = db.scalars(
            statement.order_by(ProcessingActivity.name)
        ).unique().all()
        return [_rgpd_row(row) for row in rgpd_rows]

    if dataset_key == "tickets":
        statement = select(Ticket)
        if pattern:
            statement = statement.where(
                or_(
                    Ticket.reference.ilike(pattern),
                    Ticket.subject.ilike(pattern),
                    Ticket.description.ilike(pattern),
                )
            )
        if status:
            statement = statement.where(Ticket.status.has(TicketStatus.code == status))
        if start:
            statement = statement.where(
                Ticket.opened_at
                >= datetime.combine(start, datetime.min.time(), tzinfo=UTC)
            )
        if end:
            statement = statement.where(
                Ticket.opened_at
                <= datetime.combine(end, datetime.max.time(), tzinfo=UTC)
            )
        ticket_rows = db.scalars(
            statement.order_by(Ticket.opened_at.desc())
        ).unique().all()
        return [_ticket_row(row) for row in ticket_rows]

    return []


def _cell(value: Any) -> Any:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "Oui" if value else "Non"
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, datetime):
        return value.strftime("%d/%m/%Y %H:%M")
    if isinstance(value, date):
        return value.strftime("%d/%m/%Y")
    return value


def custom_xlsx(
    title: str,
    columns: list[ColumnSpec],
    rows: list[dict[str, Any]],
) -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Export"
    sheet.append([column.label for column in columns])
    for cell in sheet[1]:
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(vertical="center")
    for row in rows:
        sheet.append([_cell(row.get(column.key)) for column in columns])
    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = sheet.dimensions
    for index, column in enumerate(columns, start=1):
        sample = max(
            (len(str(_cell(row.get(column.key)))) for row in rows[:100]),
            default=0,
        )
        width = min(48, max(12, len(column.label) + 4, sample + 2))
        sheet.column_dimensions[get_column_letter(index)].width = width
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def custom_pdf(
    title: str,
    columns: list[ColumnSpec],
    rows: list[dict[str, Any]],
    *,
    subtitle: str = "",
) -> bytes:
    buffer = io.BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        leftMargin=8 * mm,
        rightMargin=8 * mm,
        topMargin=8 * mm,
        bottomMargin=8 * mm,
        title=title,
    )
    styles = getSampleStyleSheet()
    header_style = ParagraphStyle(
        "CustomHeader",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=7,
        leading=8,
        textColor=colors.HexColor("#F3EFE2"),
    )
    cell_style = ParagraphStyle(
        "CustomCell",
        parent=styles["Normal"],
        fontSize=6,
        leading=7,
        textColor=colors.HexColor("#1F2933"),
    )
    title_flow = Paragraph(
        f"{title} — {len(rows)} ligne(s) — {datetime.now().strftime('%d/%m/%Y')}",
        styles["Title"],
    )
    story: list[Any] = [title_flow]
    if subtitle:
        story.append(Paragraph(html.escape(subtitle), styles["Normal"]))
    story.append(Spacer(1, 6))

    if columns:
        data: list[list[Any]] = [
            [Paragraph(html.escape(column.label), header_style) for column in columns]
        ]
        for row in rows:
            data.append(
                [
                    Paragraph(html.escape(str(_cell(row.get(column.key)))), cell_style)
                    for column in columns
                ]
            )
        available = landscape(A4)[0] - 16 * mm
        weights = [
            min(46, max(12, len(column.label) * 0.8 + 8)) for column in columns
        ]
        total = sum(weights)
        widths = [available * weight / total for weight in weights]
        table = Table(data, repeatRows=1, colWidths=widths)
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#772B2F")),
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#CDCDCD")),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F7F4EA")]),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 2),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 2),
                    ("TOPPADDING", (0, 0), (-1, -1), 2),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                ]
            )
        )
        story.append(table)
    document.build(story)
    return buffer.getvalue()
