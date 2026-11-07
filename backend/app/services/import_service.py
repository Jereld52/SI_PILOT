from __future__ import annotations

import contextlib
import csv
import io
import json
import re
import unicodedata
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path
from uuid import UUID

from app.core.config import settings
from app.core.errors import ConflictError, NotFoundError, ValidationAppError
from app.db.base import utcnow
from app.models.assets import Asset, AssetCategory
from app.models.auth import User
from app.models.imports import ImportJob, ImportRow
from app.models.organization import Agent, Location, Service
from app.schemas.agents import AgentCreate
from app.schemas.assets import AssetCreate
from app.schemas.imports import (
    ImportApplyResponse,
    ImportJobRead,
    ImportPreviewResponse,
    ImportRowPreview,
)
from app.services import agents_service, assets_service
from app.services.audit_service import write_audit
from fastapi import Request
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
    if entity_type == "agents":
        headers, example = AGENT_HEADERS, AGENT_EXAMPLE
    elif entity_type == "assets":
        headers, example = ASSET_HEADERS, ASSET_EXAMPLE
    else:
        raise ValidationAppError("Type d'import inconnu.")
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";", lineterminator="\r\n")
    writer.writerow(headers)
    writer.writerow(example)
    return "\ufeff" + buffer.getvalue()


def _normalize_header(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode()
    return normalized.strip().lower().replace(" ", "_").replace("-", "_")


def _value_key(value: str | None) -> str:
    return _normalize_header(value or "")


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


def _require_headers(headers: list[str], entity_type: str) -> None:
    required = ["nom", "prenom", "email_pro"] if entity_type == "agents" else ["nom", "categorie_code"]
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


def _is_example(row: dict[str, str]) -> bool:
    name = row.get("nom", "").strip().upper()
    email = row.get("email_pro", "").strip().lower()
    serial = row.get("numero_serie", "").strip().upper()
    return (
        name.startswith("EXEMPLE")
        or email == "exemple.agent@pnfor.fr"
        or serial == "SN-EXEMPLE"
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
    }


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
    }


def preview_import(
    db: Session,
    *,
    entity_type: str,
    filename: str,
    content: bytes,
    actor: User,
    request: Request | None = None,
) -> ImportPreviewResponse:
    if entity_type not in {"agents", "assets"}:
        raise ValidationAppError("Type d'import inconnu.")
    if not filename.lower().endswith(".csv"):
        raise ValidationAppError("Seuls les fichiers CSV sont acceptés pour cet import.")
    if len(content) > 5 * 1024 * 1024:
        raise ValidationAppError("Le fichier dépasse la limite de 5 Mo.")

    headers, rows = _read_csv(content)
    _require_headers(headers, entity_type)

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
                    raw_json=json.dumps(
                        {key: value for key, value in row.items() if not key.startswith("__")},
                        ensure_ascii=False,
                    ),
                    normalized_json=json.dumps(normalized, ensure_ascii=False),
                    status=status,
                    errors_json="[]",
                )
            )
            continue
        else:
            if entity_type == "agents":
                normalized, errors, duplicates = _normalize_agent(row, maps, seen)
            else:
                normalized, errors, duplicates = _normalize_asset(row, maps, seen)

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
                raw_json=json.dumps(
                    {key: value for key, value in row.items() if not key.startswith("__")},
                    ensure_ascii=False,
                ),
                normalized_json=json.dumps(normalized, ensure_ascii=False, default=str),
                status=status,
                errors_json=json.dumps(all_errors, ensure_ascii=False),
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
    return ImportPreviewResponse(
        job=ImportJobRead.model_validate(job),
        rows=previews[:200],
        can_apply=job.valid_rows > 0,
        message=message,
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
