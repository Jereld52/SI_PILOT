from __future__ import annotations

import contextlib
import csv
import io
import ipaddress
import json
import re
import unicodedata
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from uuid import UUID

from app.core.config import settings
from app.core.crypto import encrypt_secret
from app.core.errors import ConflictError, NotFoundError, ValidationAppError
from app.db.base import utcnow
from app.models.assets import Asset, AssetCategory
from app.models.auth import User
from app.models.imports import ImportJob, ImportRow
from app.models.mobile import MobileLine
from app.models.organization import Agent, Location, Service
from app.schemas.agents import AgentCreate
from app.schemas.assets import AssetCreate
from app.schemas.imports import (
    ImportApplyResponse,
    ImportJobRead,
    ImportPreviewResponse,
    ImportRowPreview,
)
from app.schemas.mobile import MobileLineCreate
from app.services import agents_service, assets_service, mobile_service
from app.services.audit_service import write_audit
from fastapi import Request
from openpyxl import load_workbook
from sqlalchemy import select
from sqlalchemy.orm import Session

AGENT_HEADERS = [
    "nom",
    "prenom",
    "email_pro",
    "telephone",
    "service_code",
    "fonction",
    "site_code",
    "login",
    "date_arrivee",
    "date_depart",
    "statut",
    "notes",
]

ASSET_HEADERS = [
    "nom",
    "numero_inventaire",
    "categorie_code",
    "marque",
    "modele",
    "numero_serie",
    "mac",
    "ip",
    "nom_machine",
    "os",
    "version_os",
    "date_achat",
    "date_mise_en_service",
    "fin_garantie",
    "prix",
    "agent_email",
    "service_code",
    "site_code",
    "etat",
    "commentaires",
]

AGENT_EXAMPLE = [
    "EXEMPLE",
    "A_Supprimer",
    "exemple.agent@pnfor.fr",
    "0102030405",
    "DSI",
    "Technicien",
    "SIEGE",
    "exemple.agent",
    "01/01/2026",
    "",
    "active",
    "Ligne d'exemple à supprimer",
]

ASSET_EXAMPLE = [
    "EXEMPLE-PC",
    "",
    "desktop",
    "Dell",
    "OptiPlex",
    "SN-EXEMPLE",
    "00:11:22:33:44:55",
    "192.0.2.10",
    "PC-EXEMPLE",
    "Windows 11",
    "23H2",
    "01/01/2025",
    "15/01/2025",
    "01/01/2028",
    "850.00",
    "exemple.agent@pnfor.fr",
    "DSI",
    "SIEGE",
    "good",
    "Ligne d'exemple à supprimer",
]

MOBILE_TEMPLATE_HEADERS = [
    "Référence",
    "Civilité",
    "Nom",
    "Prénom",
    "E-mail",
    "SIREN",
    "Raison Sociale",
    "N° Contrat",
    "N° Titulaire",
    "N° CF",
    "Nom CF",
    "Statut Ligne",
    "Date de mise en service",
    "Date de fin d'engagement",
    "Date de facturation",
    "Date de portage IN",
    "Liste",
    "Forfait",
    "Terminal communiquant",
    "Terminal acheté",
    "IMEI communiquant",
    "IMEI acheté",
    "Hors-forfait",
    "Format SIM",
    "Identifiant VPN",
    "Numéro privé",
    "Date de changement du terminal",
    "Date de modification du forfait",
    "Ligne secondaire",
    "N° Ligne Principale",
    "Master ID Accès",
    "Type d'offre",
    "Id société",
]

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

AGENT_STATUS = {
    "active": "active",
    "actif": "active",
    "arriving": "arriving",
    "arrive": "arriving",
    "arrivee": "arriving",
    "departed": "departed",
    "parti": "departed",
    "suspendu": "suspended",
    "suspended": "suspended",
}

ASSET_STATUS = {
    "in_service": "in_service",
    "en service": "in_service",
    "en_service": "in_service",
    "in_stock": "in_stock",
    "en stock": "in_stock",
    "en_stock": "in_stock",
    "maintenance": "maintenance",
    "broken": "broken",
    "en panne": "broken",
    "en_panne": "broken",
    "to_renew": "to_renew",
    "a renouveler": "to_renew",
    "a_renouveler": "to_renew",
    "retired": "retired",
    "reforme": "retired",
}

def template_csv(entity_type: str) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";", lineterminator="\r\n")
    if entity_type == "agents":
        writer.writerow(AGENT_HEADERS)
        writer.writerow(AGENT_EXAMPLE)
    elif entity_type == "assets":
        writer.writerow(ASSET_HEADERS)
        writer.writerow(ASSET_EXAMPLE)
    elif entity_type == "mobile_lines":
        writer.writerow(MOBILE_TEMPLATE_HEADERS)
    else:
        raise ValidationAppError("Type d'import inconnu.")
    return "\ufeff" + buffer.getvalue()


def _normalize_header(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode()
    normalized = normalized.strip().lower()
    return re.sub(r"[^a-z0-9]+", "_", normalized).strip("_")


def _value_key(value: str | None) -> str:
    return _normalize_header(value or "")


def _pick(row: dict[str, str], *keys: str) -> str:
    for key in keys:
        value = row.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return ""


def _cell_text(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value).strip()


def _read_xlsx(content: bytes) -> tuple[list[str], list[dict[str, str]]]:
    workbook = load_workbook(io.BytesIO(content), data_only=True, read_only=True)
    worksheet = workbook.active
    values = list(worksheet.iter_rows(values_only=True))
    if not values:
        raise ValidationAppError("Le classeur est vide.")
    headers = [_normalize_header(str(header or "")) for header in values[0]]
    if len(headers) != len(set(headers)):
        raise ValidationAppError("Le classeur contient des en-têtes en double.")
    rows: list[dict[str, str]] = []
    for index, raw_row in enumerate(values[1:], start=2):
        if not any(value not in (None, "") for value in raw_row):
            continue
        row = {"__line__": str(index)}
        for position, header in enumerate(headers):
            row[header] = _cell_text(raw_row[position]) if position < len(raw_row) else ""
        rows.append(row)
    if not rows:
        raise ValidationAppError("Le classeur ne contient aucune ligne de données.")
    if len(rows) > 2000:
        raise ValidationAppError("Le fichier dépasse la limite de 2 000 lignes par import.")
    workbook.close()
    return headers, rows


def _decode(content: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise ValidationAppError("Encodage du fichier non reconnu. Utilisez UTF-8.")


def _read_csv(content: bytes) -> tuple[list[str], list[dict[str, str]]]:
    text = _decode(content)
    if not text.strip():
        raise ValidationAppError("Le fichier est vide.")
    delimiter = ";"
    with contextlib.suppress(csv.Error):
        delimiter = csv.Sniffer().sniff(text[:4096], delimiters=";,").delimiter
    matrix = list(csv.reader(io.StringIO(text), delimiter=delimiter))
    if not matrix:
        raise ValidationAppError("Le fichier ne contient aucune ligne.")
    headers = [_normalize_header(header) for header in matrix[0]]
    if len(headers) != len(set(headers)):
        raise ValidationAppError("Le fichier contient des en-têtes en double.")
    rows: list[dict[str, str]] = []
    for index, values in enumerate(matrix[1:], start=2):
        if not any(value.strip() for value in values):
            continue
        row = {"__line__": str(index)}
        if len(values) != len(headers):
            row["__error__"] = f"{len(values)} colonne(s) au lieu de {len(headers)}"
        for position, header in enumerate(headers):
            row[header] = values[position].strip() if position < len(values) else ""
        rows.append(row)
    if not rows:
        raise ValidationAppError("Le fichier ne contient aucune ligne de données.")
    if len(rows) > 2000:
        raise ValidationAppError("Le fichier dépasse la limite de 2 000 lignes par import.")
    return headers, rows


def _require_headers(headers: list[str], entity_type: str, *, wapt: bool = False) -> None:
    if entity_type == "agents":
        required = ["nom", "prenom", "email_pro"]
    elif entity_type == "mobile_lines":
        required = ["reference"]
    elif wapt:
        required = ["machine"]
    else:
        required = ["nom", "categorie_code"]
    missing = [header for header in required if header not in headers]
    if missing:
        raise ValidationAppError(
            "Colonnes obligatoires manquantes.",
            fields=[{"field": "headers", "message": header} for header in missing],
        )


def _parse_date(value: str | None, field: str, errors: list[str]) -> date | None:
    if not value:
        return None
    from datetime import datetime

    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%y", "%Y/%m/%d"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    errors.append(f"Date invalide pour {field} : {value}")
    return None


def _parse_decimal(value: str | None, field: str, errors: list[str]) -> Decimal | None:
    if not value:
        return None
    cleaned = value.replace("€", "").replace(" ", "").replace(",", ".")
    try:
        return Decimal(cleaned).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        errors.append(f"Montant invalide pour {field} : {value}")
        return None


def _raw_row(row: dict[str, str], entity_type: str) -> dict[str, str]:
    excluded = {"pin_1", "pin_2", "puk_1", "puk_2"} if entity_type == "mobile_lines" else set()
    return {
        key: value
        for key, value in row.items()
        if not key.startswith("__") and key not in excluded
    }


def _is_example(row: dict[str, str]) -> bool:
    name = row.get("nom", "").strip().upper()
    email = row.get("email_pro", "").strip().lower()
    serial = row.get("numero_serie", "").strip().upper()
    reference = row.get("reference", "").replace(" ", "")
    return (
        name.startswith("EXEMPLE")
        or email == "exemple.agent@pnfor.fr"
        or serial == "SN-EXEMPLE"
        or reference == "0600000000"
    )


def _preload(db: Session) -> dict:
    agents = list(db.scalars(select(Agent)).all())
    assets = list(db.scalars(select(Asset)).all())
    return {
        "services": {service.code.lower(): service for service in db.scalars(select(Service)).all()},
        "locations": {
            location.code.lower(): location
            for location in db.scalars(select(Location)).all()
            if location.code
        },
        "categories": {
            category.code.lower(): category
            for category in db.scalars(select(AssetCategory)).all()
        },
        "agents_by_email": {agent.email_pro.lower(): agent for agent in agents},
        "agent_emails": {agent.email_pro.lower() for agent in agents},
        "agent_logins": {agent.login.lower() for agent in agents if agent.login},
        "asset_tags": {asset.asset_tag for asset in assets},
        "serial_numbers": {asset.serial_number for asset in assets if asset.serial_number},
        "macs": {asset.mac_address for asset in assets if asset.mac_address},
        "ips": {asset.ip_address for asset in assets if asset.ip_address},
        "hostnames": {asset.hostname for asset in assets if asset.hostname},
        "external_ids": {asset.external_id for asset in assets if asset.external_id},
        "mobile_lines": {
            line.line_number for line in db.scalars(select(MobileLine)).all()
        },
    }


def _normalize_mobile_line(
    row: dict[str, str], maps: dict, seen: dict
) -> tuple[dict, list[str], list[str]]:
    errors: list[str] = []
    duplicates: list[str] = []
    reference = mobile_service.normalize_phone(_pick(row, "reference"))
    if not reference:
        errors.append("La référence de ligne est obligatoire.")
    if reference and (
        reference in maps["mobile_lines"] or reference in seen["mobile_lines"]
    ):
        duplicates.append(f"Ligne déjà présente : {reference}")

    activation = _parse_date(_pick(row, "date_de_mise_en_service"), "date de mise en service", errors)
    commitment = _parse_date(
        _pick(row, "date_de_fin_de_periode_d_engagement", "date_de_fin_d_engagement"),
        "date de fin d'engagement",
        errors,
    )
    billing = _parse_date(_pick(row, "date_de_facturation"), "date de facturation", errors)
    portability = _parse_date(_pick(row, "date_de_portage_in"), "date de portage", errors)
    terminal_change = _parse_date(
        _pick(row, "date_de_chgt_du_terminal", "date_de_changement_du_terminal"),
        "date de changement du terminal",
        errors,
    )
    plan_change = _parse_date(
        _pick(row, "date_de_modification_du_forfait"),
        "date de modification du forfait",
        errors,
    )
    out_of_bundle = _parse_decimal(_pick(row, "hors_forfait"), "hors-forfait", errors)
    secondary = _value_key(_pick(row, "ligne_secondaire")) in {"oui", "yes", "true", "1"}

    normalized = {
        "line_number": reference,
        "civility": _clean_wapt(_pick(row, "civilite")),
        "holder_name": _clean_wapt(_pick(row, "nom")),
        "role_label": _clean_wapt(_pick(row, "prenom")),
        "email": _clean_wapt(_pick(row, "e_mail", "email")),
        "siren": _clean_wapt(_pick(row, "siren")),
        "company_name": _clean_wapt(_pick(row, "raison_sociale")),
        "contract_number": _clean_wapt(_pick(row, "n_contrat", "numero_contrat")),
        "titulaire_number": _clean_wapt(_pick(row, "n_titulaire", "numero_titulaire")),
        "cf_number": _clean_wapt(_pick(row, "n_cf", "numero_cf")),
        "cf_name": _clean_wapt(_pick(row, "nom_cf")),
        "status": _clean_wapt(_pick(row, "statut_ligne")) or "Actif",
        "activation_date": activation.isoformat() if activation else None,
        "commitment_end_date": commitment.isoformat() if commitment else None,
        "billing_date": billing.isoformat() if billing else None,
        "portability_date": portability.isoformat() if portability else None,
        "rio": _clean_wapt(_pick(row, "rio")),
        "qr_code": _clean_wapt(_pick(row, "qr_code")),
        "eid": _clean_wapt(_pick(row, "eid")),
        "csim_number": _clean_wapt(_pick(row, "n_de_csim", "csim_number")),
        "pin_1": _clean_wapt(_pick(row, "pin_1")),
        "pin_2": _clean_wapt(_pick(row, "pin_2")),
        "puk_1": _clean_wapt(_pick(row, "puk_1")),
        "puk_2": _clean_wapt(_pick(row, "puk_2")),
        "list_name": _clean_wapt(_pick(row, "liste")),
        "plan_name": _clean_wapt(_pick(row, "forfait")),
        "terminal_communicating": _clean_wapt(_pick(row, "terminal_communiquant")),
        "terminal_purchased": _clean_wapt(_pick(row, "terminal_achete")),
        "imei_communicating": _clean_wapt(_pick(row, "imei_communiquant")),
        "imei_purchased": _clean_wapt(_pick(row, "imei_achete")),
        "out_of_bundle": float(out_of_bundle) if out_of_bundle is not None else None,
        "sim_format": _clean_wapt(_pick(row, "format_sim")),
        "vpn_identifier": _clean_wapt(_pick(row, "identifiant_vpn")),
        "private_number": _clean_wapt(_pick(row, "numero_prive")),
        "terminal_change_date": terminal_change.isoformat() if terminal_change else None,
        "plan_change_date": plan_change.isoformat() if plan_change else None,
        "is_secondary_line": secondary,
        "main_line_number": mobile_service.normalize_phone(_pick(row, "n_ligne_principale"))
        or None,
        "master_access_id": _clean_wapt(_pick(row, "master_id_acces")),
        "offer_type": _clean_wapt(_pick(row, "type_d_offre")),
        "company_id": _clean_wapt(_pick(row, "id_societe")),
        "notes": None,
        "_label": f"{reference} — {_clean_wapt(_pick(row, 'nom')) or 'Sans titulaire'}",
    }
    if not errors and not duplicates and reference:
        seen["mobile_lines"].add(reference)
    return normalized, errors, duplicates


def _normalize_agent(
    row: dict[str, str], maps: dict, seen: dict
) -> tuple[dict, list[str], list[str]]:
    errors: list[str] = []
    duplicates: list[str] = []
    last_name = row.get("nom", "").strip()
    first_name = row.get("prenom", "").strip()
    email = row.get("email_pro", "").strip().lower()
    if not last_name:
        errors.append("Le nom est obligatoire.")
    if not first_name:
        errors.append("Le prénom est obligatoire.")
    if not email:
        errors.append("L'adresse e-mail est obligatoire.")
    elif not EMAIL_RE.match(email):
        errors.append(f"Adresse e-mail invalide : {email}")

    login = row.get("login", "").strip() or None
    if login and login.lower() in maps["agent_logins"]:
        duplicates.append(f"Identifiant déjà utilisé : {login}")
    if email and email in maps["agent_emails"]:
        duplicates.append(f"E-mail déjà présent : {email}")
    if email and email in seen["emails"]:
        duplicates.append(f"E-mail présent plusieurs fois dans le fichier : {email}")
    if login and login.lower() in seen["logins"]:
        duplicates.append(f"Identifiant présent plusieurs fois dans le fichier : {login}")

    service = None
    service_code = row.get("service_code", "").strip()
    if service_code:
        service = maps["services"].get(service_code.lower())
        if service is None:
            errors.append(f"Service inconnu : {service_code}")

    location = None
    site_code = row.get("site_code", "").strip()
    if site_code:
        location = maps["locations"].get(site_code.lower())
        if location is None:
            errors.append(f"Site inconnu : {site_code}")

    status = AGENT_STATUS.get(_value_key(row.get("statut", "")), "active")
    if row.get("statut") and _value_key(row.get("statut", "")) not in AGENT_STATUS:
        errors.append(f"Statut d'agent inconnu : {row.get('statut')}")

    arrival = _parse_date(row.get("date_arrivee"), "date_arrivee", errors)
    departure = _parse_date(row.get("date_depart"), "date_depart", errors)

    normalized = {
        "first_name": first_name,
        "last_name": last_name,
        "email_pro": email,
        "phone_pro": row.get("telephone", "").strip() or None,
        "service_id": str(service.id) if service else None,
        "function_label": row.get("fonction", "").strip() or None,
        "location_id": str(location.id) if location else None,
        "login": login,
        "arrival_date": arrival.isoformat() if arrival else None,
        "departure_date": departure.isoformat() if departure else None,
        "status": status,
        "notes": row.get("notes", "").strip() or None,
        "_label": f"{first_name} {last_name} ({email})",
    }
    if not errors and not duplicates:
        seen["emails"].add(email)
        if login:
            seen["logins"].add(login.lower())
    return normalized, errors, duplicates


def _normalize_asset(
    row: dict[str, str], maps: dict, seen: dict
) -> tuple[dict, list[str], list[str]]:
    errors: list[str] = []
    duplicates: list[str] = []
    name = row.get("nom", "").strip()
    if not name:
        errors.append("Le nom de l'équipement est obligatoire.")

    category_code = row.get("categorie_code", "").strip().lower()
    category = maps["categories"].get(category_code)
    if not category:
        errors.append(f"Catégorie inconnue : {category_code or '(vide)'}")

    explicit_tag = row.get("numero_inventaire", "").strip() or None
    if explicit_tag and (explicit_tag in maps["asset_tags"] or explicit_tag in seen["tags"]):
        duplicates.append(f"Numéro d'inventaire déjà présent : {explicit_tag}")

    serial = row.get("numero_serie", "").strip() or None
    mac = row.get("mac", "").strip() or None
    ip = row.get("ip", "").strip() or None
    hostname = row.get("nom_machine", "").strip() or None
    for label, value, db_set, seen_set in (
        ("numéro de série", serial, maps["serial_numbers"], seen["serials"]),
        ("adresse MAC", mac, maps["macs"], seen["macs"]),
        ("adresse IP", ip, maps["ips"], seen["ips"]),
        ("nom machine", hostname, maps["hostnames"], seen["hostnames"]),
    ):
        if value and (value in db_set or value in seen_set):
            duplicates.append(f"{label.capitalize()} déjà présent : {value}")

    agent = None
    agent_email = row.get("agent_email", "").strip().lower()
    if agent_email:
        agent = maps["agents_by_email"].get(agent_email)
        if agent is None:
            errors.append(f"Agent inconnu : {agent_email}")

    service = None
    service_code = row.get("service_code", "").strip()
    if service_code:
        service = maps["services"].get(service_code.lower())
        if service is None:
            errors.append(f"Service inconnu : {service_code}")

    location = None
    site_code = row.get("site_code", "").strip()
    if site_code:
        location = maps["locations"].get(site_code.lower())
        if location is None:
            errors.append(f"Site inconnu : {site_code}")

    status = ASSET_STATUS.get(_value_key(row.get("etat", "")), "in_stock")
    if row.get("etat") and _value_key(row.get("etat", "")) not in ASSET_STATUS:
        errors.append(f"État d'équipement inconnu : {row.get('etat')}")
    condition = "good"

    purchase = _parse_date(row.get("date_achat"), "date_achat", errors)
    commissioning = _parse_date(row.get("date_mise_en_service"), "date_mise_en_service", errors)
    warranty = _parse_date(row.get("fin_garantie"), "fin_garantie", errors)
    price = _parse_decimal(row.get("prix"), "prix", errors)

    normalized = {
        "name": name,
        "asset_tag": explicit_tag,
        "category_id": str(category.id) if category else None,
        "brand": row.get("marque", "").strip() or None,
        "model": row.get("modele", "").strip() or None,
        "serial_number": serial,
        "mac_address": mac,
        "ip_address": ip,
        "hostname": hostname,
        "os_name": row.get("os", "").strip() or None,
        "os_version": row.get("version_os", "").strip() or None,
        "purchase_date": purchase.isoformat() if purchase else None,
        "commissioning_date": commissioning.isoformat() if commissioning else None,
        "warranty_end": warranty.isoformat() if warranty else None,
        "purchase_price": float(price) if price is not None else None,
        "assigned_agent_id": str(agent.id) if agent else None,
        "service_id": str(service.id) if service else None,
        "location_id": str(location.id) if location else None,
        "status": status,
        "condition": condition,
        "comments": row.get("commentaires", "").strip() or None,
        "_label": f"{name} ({explicit_tag or 'numéro auto'})",
    }
    if not errors and not duplicates:
        if explicit_tag:
            seen["tags"].add(explicit_tag)
        for value, seen_set in (
            (serial, seen["serials"]),
            (mac, seen["macs"]),
            (ip, seen["ips"]),
            (hostname, seen["hostnames"]),
        ):
            if value:
                seen_set.add(value)
    return normalized, errors, duplicates


def _new_seen() -> dict:
    return {
        "emails": set(),
        "logins": set(),
        "tags": set(),
        "serials": set(),
        "macs": set(),
        "ips": set(),
        "hostnames": set(),
        "external_ids": set(),
        "mobile_lines": set(),
    }


def _is_wapt(headers: list[str]) -> bool:
    return "machine" in headers and (
        "numero_de_serie" in headers or "systeme_d_exploitation" in headers
    )


def _clean_wapt(value: str | None) -> str | None:
    text = (value or "").strip()
    if not text or text.lower() in {"default string", "none", "n/a", "-", "sans terminal -"}:
        return None
    return text


def _parse_ip(value: str | None) -> str | None:
    text = (value or "").strip()
    if not text:
        return None
    candidates = [text]
    if ":" in text:
        candidates.append(text.rsplit(":", 1)[-1])
    for candidate in candidates:
        try:
            ipaddress.ip_address(candidate)
            return candidate
        except ValueError:
            continue
    return None


def _wapt_category(hostname: str, dn: str, categories: dict) -> AssetCategory | None:
    host = hostname.lower()
    dn_lower = dn.lower()
    if "ou=laptops" in dn_lower or host.startswith(("port-", "laptop-", "lt-")):
        return categories.get("laptop")
    if "ou=desktops" in dn_lower or host.startswith(("pc-", "desktop-", "ops-pc")):
        return categories.get("desktop")
    if "ou=servers" in dn_lower or host.startswith(("srv-", "server-")):
        return categories.get("server")
    if "ou=virtual" in dn_lower or host.startswith(("vm-", "v-")):
        return categories.get("vm")
    return categories.get("desktop")


def _normalize_wapt_asset(
    row: dict[str, str], maps: dict, seen: dict
) -> tuple[dict, list[str], list[str]]:
    errors: list[str] = []
    duplicates: list[str] = []
    machine = _clean_wapt(row.get("machine")) or ""
    serial = _clean_wapt(row.get("numero_de_serie"))
    if not machine and not serial:
        errors.append("Machine et numéro de série absents.")
    hostname = machine or None
    name = machine.split(".")[0] if machine else (serial or "Poste WAPT")
    category = _wapt_category(hostname or "", row.get("dn_dans_l_ad", ""), maps["categories"])
    if category is None:
        errors.append("Catégorie d'équipement introuvable.")

    external_id = _clean_wapt(row.get("uuid"))
    if external_id and (external_id in maps["external_ids"] or external_id in seen["external_ids"]):
        duplicates.append(f"UUID WAPT déjà présent : {external_id}")

    mac = _clean_wapt(row.get("adresse_mac"))
    ip = _parse_ip(row.get("adresse_ip")) or _parse_ip(row.get("adresse_d_ecoute"))
    for label, value, db_set, seen_set in (
        ("numéro de série", serial, maps["serial_numbers"], seen["serials"]),
        ("adresse MAC", mac, maps["macs"], seen["macs"]),
        ("adresse IP", ip, maps["ips"], seen["ips"]),
        ("nom machine", hostname, maps["hostnames"], seen["hostnames"]),
    ):
        if value and (value in db_set or value in seen_set):
            duplicates.append(f"{label.capitalize()} déjà présent : {value}")

    raw_status = _value_key(row.get("statut"))
    status = {"ok": "in_service", "error": "broken", "warning": "maintenance"}.get(
        raw_status, "in_stock"
    )

    purchase = _parse_date(row.get("date_d_achat"), "date_d_achat", errors)
    comments_parts = ["Import WAPT"]
    for label, key in (
        ("Statut", "statut"),
        ("Joignable", "joignable"),
        ("Dernière connexion", "derniere_connexion"),
        ("Dernier utilisateur", "dernier_utilisateur_logue"),
        ("Description", "description"),
    ):
        value = _clean_wapt(row.get(key))
        if value:
            comments_parts.append(f"{label}: {value}")

    normalized = {
        "name": name,
        "asset_tag": None,
        "external_id": external_id,
        "category_id": str(category.id) if category else None,
        "brand": _clean_wapt(row.get("manufacteur")),
        "model": _clean_wapt(row.get("modele")),
        "serial_number": serial,
        "mac_address": mac,
        "ip_address": ip,
        "hostname": hostname,
        "os_name": _clean_wapt(row.get("systeme_d_exploitation"))
        or _clean_wapt(row.get("plateforme")),
        "os_version": None,
        "purchase_date": purchase.isoformat() if purchase else None,
        "commissioning_date": None,
        "warranty_end": None,
        "purchase_price": None,
        "assigned_agent_id": None,
        "service_id": None,
        "location_id": None,
        "status": status,
        "condition": "good",
        "comments": " · ".join(comments_parts)[:2000],
        "external_data_json": json.dumps(
            _raw_row(row, "assets"), ensure_ascii=False, default=str
        ),
        "is_critical": False,
        "_label": f"{name} ({hostname or serial or 'WAPT'})",
    }
    if not errors and not duplicates:
        if external_id:
            seen["external_ids"].add(external_id)
        for value, seen_set in (
            (serial, seen["serials"]),
            (mac, seen["macs"]),
            (ip, seen["ips"]),
            (hostname, seen["hostnames"]),
        ):
            if value:
                seen_set.add(value)
    return normalized, errors, duplicates


def preview_import(
    db: Session,
    *,
    entity_type: str,
    filename: str,
    content: bytes,
    actor: User,
    request: Request | None = None,
) -> ImportPreviewResponse:
    if entity_type not in {"agents", "assets", "mobile_lines"}:
        raise ValidationAppError("Type d'import inconnu.")
    lower_name = filename.lower()
    is_xlsx = lower_name.endswith((".xlsx", ".xlsm"))
    if entity_type != "mobile_lines" and not lower_name.endswith(".csv"):
        raise ValidationAppError("Seuls les fichiers CSV sont acceptés pour cet import.")
    if entity_type == "mobile_lines" and not lower_name.endswith((".csv", ".xlsx", ".xlsm")):
        raise ValidationAppError("Formats acceptés pour les lignes mobiles : CSV, XLSX ou XLSM.")
    if len(content) > 5 * 1024 * 1024:
        raise ValidationAppError("Le fichier dépasse la limite de 5 Mo.")

    headers, rows = _read_xlsx(content) if is_xlsx else _read_csv(content)
    wapt = entity_type == "assets" and _is_wapt(headers)
    _require_headers(headers, entity_type, wapt=wapt)

    maps = _preload(db)
    seen = _new_seen()

    job = ImportJob(
        entity_type=entity_type,
        original_filename=filename,
        storage_key="",
        status="preview",
        created_by_id=actor.id,
    )
    db.add(job)
    db.flush()
    if entity_type != "mobile_lines":
        import_dir = Path(settings.upload_dir) / "imports"
        import_dir.mkdir(parents=True, exist_ok=True)
        storage_key = f"imports/{job.id}.csv"
        (Path(settings.upload_dir) / storage_key).write_bytes(content)
        job.storage_key = storage_key

    previews: list[ImportRowPreview] = []
    counts = {"valid": 0, "error": 0, "duplicate": 0, "skipped": 0}
    for row in rows:
        line_number = int(row.get("__line__", "0"))
        errors: list[str] = []
        duplicates: list[str] = []
        normalized: dict = {"_label": f"Ligne {line_number}"}

        if row.get("__error__"):
            errors.append(row["__error__"])
        elif _is_example(row):
            normalized["_label"] = "Ligne d'exemple"
            status = "skipped"
            counts["skipped"] += 1
            previews.append(
                ImportRowPreview(
                    row_number=line_number,
                    status=status,
                    label=normalized["_label"],
                    errors=[],
                )
            )
            db.add(
                ImportRow(
                    job_id=job.id,
                    row_number=line_number,
                    raw_json=json.dumps(_raw_row(row, entity_type), ensure_ascii=False),
                    normalized_json=json.dumps(normalized, ensure_ascii=False),
                    status=status,
                    errors_json="[]",
                )
            )
            continue
        else:
            if entity_type == "agents":
                normalized, errors, duplicates = _normalize_agent(row, maps, seen)
            elif entity_type == "mobile_lines":
                normalized, errors, duplicates = _normalize_mobile_line(row, maps, seen)
            elif wapt:
                normalized, errors, duplicates = _normalize_wapt_asset(row, maps, seen)
            else:
                normalized, errors, duplicates = _normalize_asset(row, maps, seen)

        secrets_encrypted_json = None
        if entity_type == "mobile_lines":
            secrets = {
                key: normalized.pop(key, None)
                for key in ("pin_1", "pin_2", "puk_1", "puk_2")
            }
            try:
                encrypted = {
                    key: encrypt_secret(value) for key, value in secrets.items() if value
                }
                if encrypted:
                    secrets_encrypted_json = json.dumps(encrypted, ensure_ascii=False)
            except ValidationAppError as exc:
                errors.append(str(exc))

        if errors:
            status = "error"
            counts["error"] += 1
        elif duplicates:
            status = "duplicate"
            counts["duplicate"] += 1
        else:
            status = "valid"
            counts["valid"] += 1

        all_errors = [*errors, *duplicates]
        previews.append(
            ImportRowPreview(
                row_number=line_number,
                status=status,
                label=str(normalized.get("_label", f"Ligne {line_number}")),
                errors=all_errors,
            )
        )
        db.add(
            ImportRow(
                job_id=job.id,
                row_number=line_number,
                raw_json=json.dumps(_raw_row(row, entity_type), ensure_ascii=False),
                normalized_json=json.dumps(normalized, ensure_ascii=False, default=str),
                status=status,
                errors_json=json.dumps(all_errors, ensure_ascii=False),
                secrets_encrypted_json=secrets_encrypted_json,
            )
        )

    job.total_rows = len(rows)
    job.valid_rows = counts["valid"]
    job.error_rows = counts["error"]
    job.duplicate_rows = counts["duplicate"]
    job.warning_rows = counts["skipped"]
    write_audit(
        db,
        module="imports",
        action="import_preview",
        actor=actor,
        entity_type="import_job",
        entity_id=str(job.id),
        entity_label=filename,
        after={
            "entity_type": entity_type,
            "total": job.total_rows,
            "valid": job.valid_rows,
            "errors": job.error_rows,
            "duplicates": job.duplicate_rows,
            "skipped": counts["skipped"],
        },
        request=request,
    )
    db.commit()
    db.refresh(job)
    message = (
        f"{job.valid_rows} ligne(s) prête(s), {job.error_rows} erreur(s), "
        f"{job.duplicate_rows} doublon(s), {counts['skipped']} ligne(s) ignorée(s)."
    )
    if wapt:
        message = "Format WAPT détecté. " + message
    detected_format = "wapt" if wapt else ("xlsx" if is_xlsx else "standard")
    return ImportPreviewResponse(
        job=ImportJobRead.model_validate(job),
        rows=previews[:200],
        can_apply=job.valid_rows > 0,
        message=message,
        detected_format=detected_format,
    )


def apply_import(
    db: Session,
    *,
    job_id: UUID,
    actor: User,
    request: Request | None = None,
) -> ImportApplyResponse:
    job = db.get(ImportJob, job_id)
    if job is None:
        raise NotFoundError("Import introuvable.")
    if job.status != "preview":
        raise ConflictError("Cet import a déjà été appliqué ou n'est plus en prévisualisation.")

    rows = list(
        db.scalars(
            select(ImportRow)
            .where(ImportRow.job_id == job.id, ImportRow.status == "valid")
            .order_by(ImportRow.row_number)
        ).all()
    )
    if not rows:
        raise ValidationAppError("Aucune ligne valide à appliquer.")

    created = 0
    errors = 0
    for row in rows:
        try:
            data = json.loads(row.normalized_json or "{}")
            data.pop("_label", None)
            created_id = None
            with db.begin_nested():
                if job.entity_type == "agents":
                    agent = agents_service.create_agent(
                        db,
                        AgentCreate.model_validate(data),
                        actor=actor,
                        request=request,
                        commit=False,
                        source="import",
                    )
                    created_id = agent.id
                elif job.entity_type == "assets":
                    asset = assets_service.create_asset(
                        db,
                        AssetCreate.model_validate(data),
                        actor=actor,
                        request=request,
                        source="import",
                        commit=False,
                    )
                    created_id = asset.id
                elif job.entity_type == "mobile_lines":
                    secrets = json.loads(row.secrets_encrypted_json or "{}")
                    mobile = mobile_service.create_mobile_line(
                        db,
                        MobileLineCreate.model_validate(data),
                        actor=actor,
                        request=request,
                        source="import",
                        commit=False,
                        secrets_encrypted=secrets,
                    )
                    created_id = mobile.id
                else:
                    raise ValidationAppError("Type d'import inconnu.")
            row.status = "created"
            row.action = "create"
            row.matched_entity_id = created_id
            created += 1
        except Exception as exc:
            row.status = "error"
            row.errors_json = json.dumps([_error_message(exc)], ensure_ascii=False)
            errors += 1

    job.applied_at = utcnow()
    job.status = "applied" if errors == 0 else "partial"
    job.report_json = json.dumps(
        {"created": created, "errors": errors, "valid_rows": job.valid_rows},
        ensure_ascii=False,
    )
    write_audit(
        db,
        module="imports",
        action="import_applied",
        actor=actor,
        entity_type="import_job",
        entity_id=str(job.id),
        entity_label=job.original_filename,
        after={"created": created, "errors": errors, "entity_type": job.entity_type},
        request=request,
    )
    db.commit()
    db.refresh(job)
    return ImportApplyResponse(
        job=ImportJobRead.model_validate(job),
        created=created,
        skipped=job.total_rows - len(rows),
        errors=errors,
        message=f"{created} élément(s) créé(s), {errors} erreur(s) lors de l'application.",
    )


def list_import_jobs(db: Session, *, limit: int = 50) -> list[ImportJob]:
    return list(
        db.scalars(select(ImportJob).order_by(ImportJob.created_at.desc()).limit(limit)).all()
    )


def get_import_job(db: Session, job_id: UUID) -> ImportJob:
    job = db.get(ImportJob, job_id)
    if job is None:
        raise NotFoundError("Import introuvable.")
    return job


def _error_message(exc: Exception) -> str:
    detail = getattr(exc, "detail", None)
    if detail:
        return str(detail)
    text = str(exc).replace("\n", " ").strip()
    return text[:500] or exc.__class__.__name__
