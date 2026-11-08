from __future__ import annotations

import json
import ssl
from datetime import UTC, datetime
from typing import Any

from app.core.crypto import decrypt_secret, encrypt_secret
from app.core.errors import ValidationAppError
from app.db.base import utcnow
from app.models.auth import User
from app.models.imports import ImportJob
from app.models.organization import Agent, Service
from app.models.setting import Setting
from app.schemas.ldap import (
    LdapConfigRead,
    LdapConfigUpdate,
    LdapPreviewResponse,
    LdapSyncResponse,
    LdapTestResponse,
    LdapUserPreview,
)
from app.services.audit_service import write_audit
from fastapi import Request
from sqlalchemy import select
from sqlalchemy.orm import Session

DEFAULT_FILTER = (
    "(&(objectCategory=person)(objectClass=user)"
    "(!(userAccountControl:1.2.840.113556.1.4.803:=2)))"
)

LDAP_ATTRIBUTES = [
    "sAMAccountName",
    "mail",
    "userPrincipalName",
    "givenName",
    "sn",
    "displayName",
    "telephoneNumber",
    "department",
    "title",
    "distinguishedName",
]


def _setting(db: Session, key: str) -> Setting | None:
    return db.get(Setting, key)


def _value(db: Session, key: str, default: Any = None) -> Any:
    setting = _setting(db, key)
    if setting is None or not setting.value_json:
        return default
    try:
        return json.loads(setting.value_json)
    except json.JSONDecodeError:
        return setting.value_json


def _set_value(db: Session, key: str, value: Any, *, is_secret: bool = False) -> None:
    setting = _setting(db, key)
    if setting is None:
        setting = Setting(
            key=key,
            value_json=json.dumps(value, ensure_ascii=False),
            category="ldap",
            is_secret=is_secret,
            updated_at=datetime.now(UTC),
        )
        db.add(setting)
    else:
        setting.value_json = json.dumps(value, ensure_ascii=False)
        setting.is_secret = is_secret
        setting.updated_at = datetime.now(UTC)


def get_config(db: Session) -> LdapConfigRead:
    encrypted = _value(db, "ldap.bind_password_encrypted", "") or ""
    return LdapConfigRead(
        enabled=bool(_value(db, "ldap.enabled", False)),
        url=str(_value(db, "ldap.url", "") or ""),
        base_dn=str(_value(db, "ldap.base_dn", "") or ""),
        bind_dn=str(_value(db, "ldap.bind_dn", "") or ""),
        user_filter=str(_value(db, "ldap.user_filter", DEFAULT_FILTER) or DEFAULT_FILTER),
        tls_verify=bool(_value(db, "ldap.tls_verify", True)),
        bind_password_set=bool(encrypted),
    )


def update_config(
    db: Session,
    payload: LdapConfigUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> LdapConfigRead:
    url = payload.url.strip()
    if url and not url.lower().startswith(("ldap://", "ldaps://")):
        raise ValidationAppError("L'URL LDAP doit commencer par ldap:// ou ldaps://.")
    if payload.enabled and (not url or not payload.base_dn.strip()):
        raise ValidationAppError(
            "L'URL et la base de recherche sont obligatoires pour activer la synchronisation."
        )
    _set_value(db, "ldap.enabled", payload.enabled)
    _set_value(db, "ldap.url", url)
    _set_value(db, "ldap.base_dn", payload.base_dn.strip())
    _set_value(db, "ldap.bind_dn", payload.bind_dn.strip())
    _set_value(db, "ldap.user_filter", payload.user_filter.strip() or DEFAULT_FILTER)
    _set_value(db, "ldap.tls_verify", payload.tls_verify)
    if payload.bind_password is not None:
        encrypted = encrypt_secret(payload.bind_password) if payload.bind_password else ""
        _set_value(db, "ldap.bind_password_encrypted", encrypted or "", is_secret=True)
    write_audit(
        db,
        module="ldap",
        action="ldap_config_updated",
        actor=actor,
        entity_type="setting",
        entity_label="ldap.config",
        after={
            "enabled": payload.enabled,
            "url": url,
            "base_dn": payload.base_dn.strip(),
            "bind_dn": payload.bind_dn.strip(),
            "password_changed": payload.bind_password is not None,
        },
        request=request,
    )
    db.commit()
    return get_config(db)


def _safe_error(exc: Exception) -> str:
    text = str(exc).strip().replace("\n", " ")
    return text[:400] or exc.__class__.__name__


def _connection(db: Session):
    try:
        from ldap3 import ALL, SUBTREE, Connection, Server, Tls
    except ImportError as exc:  # pragma: no cover - dépendance de déploiement
        raise ValidationAppError(
            "Le module ldap3 n'est pas installé sur le serveur."
        ) from exc

    url = str(_value(db, "ldap.url", "") or "")
    if not url:
        raise ValidationAppError("Configurez d'abord l'URL du serveur LDAP.")
    tls_verify = bool(_value(db, "ldap.tls_verify", True))
    bind_dn = str(_value(db, "ldap.bind_dn", "") or "")
    encrypted = str(_value(db, "ldap.bind_password_encrypted", "") or "")
    password = decrypt_secret(encrypted) if encrypted else None
    try:
        server = Server(
            url,
            use_ssl=url.lower().startswith("ldaps://"),
            tls=Tls(validate=ssl.CERT_REQUIRED if tls_verify else ssl.CERT_NONE),
            get_info=ALL,
            connect_timeout=8,
        )
        connection = Connection(
            server,
            user=bind_dn or None,
            password=password or None,
            auto_bind=True,
            receive_timeout=20,
            read_only=True,
        )
        return connection, server, SUBTREE
    except Exception as exc:
        raise ValidationAppError(f"Connexion LDAP impossible : {_safe_error(exc)}") from exc


def test_connection(db: Session) -> LdapTestResponse:
    connection, server, subtree = _connection(db)
    base_dn = str(_value(db, "ldap.base_dn", "") or "")
    user_filter = str(_value(db, "ldap.user_filter", DEFAULT_FILTER) or DEFAULT_FILTER)
    count = None
    try:
        if base_dn:
            connection.search(
                base_dn,
                user_filter,
                search_scope=subtree,
                attributes=["sAMAccountName"],
                paged_size=500,
                size_limit=1000,
                time_limit=20,
            )
            count = len(connection.entries)
        info = server.info
        vendor = getattr(info, "vendor_name", None) if info else None
        version = getattr(info, "vendor_version", None) if info else None
        return LdapTestResponse(
            success=True,
            message=f"Connexion LDAP établie. {count if count is not None else 0} utilisateur(s) détecté(s) dans la première page.",
            server_vendor=str(vendor) if vendor else None,
            server_version=str(version) if version else None,
            user_count=count,
        )
    except Exception as exc:
        raise ValidationAppError(f"Recherche LDAP impossible : {_safe_error(exc)}") from exc
    finally:
        connection.unbind()


def _attr(entry: dict[str, Any], name: str) -> str:
    value = (entry.get("attributes") or {}).get(name)
    if isinstance(value, (list, tuple)):
        value = value[0] if value else ""
    if value is None:
        return ""
    return str(value).strip()


def _collect_users(db: Session, *, update_existing: bool) -> list[LdapUserPreview]:
    base_dn = str(_value(db, "ldap.base_dn", "") or "")
    user_filter = str(_value(db, "ldap.user_filter", DEFAULT_FILTER) or DEFAULT_FILTER)
    if not base_dn:
        raise ValidationAppError("Configurez la base de recherche LDAP.")

    connection, _, subtree = _connection(db)
    services = list(db.scalars(select(Service)).all())
    service_by_code = {service.code.lower(): service for service in services}
    service_by_name = {service.name.lower(): service for service in services}
    agents = list(db.scalars(select(Agent)).all())
    by_email = {agent.email_pro.lower(): agent for agent in agents}
    by_login = {agent.login.lower(): agent for agent in agents if agent.login}

    rows: list[LdapUserPreview] = []
    seen_emails: set[str] = set()
    seen_logins: set[str] = set()
    try:
        for entry in connection.extend.standard.paged_search(
            search_base=base_dn,
            search_filter=user_filter,
            search_scope=subtree,
            attributes=LDAP_ATTRIBUTES,
            paged_size=500,
            generator=True,
        ):
            if entry.get("type") != "searchResEntry":
                continue
            email = (_attr(entry, "mail") or _attr(entry, "userPrincipalName")).lower()
            login = _attr(entry, "sAMAccountName")
            first_name = _attr(entry, "givenName")
            last_name = _attr(entry, "sn")
            display_name = _attr(entry, "displayName")
            if not first_name or not last_name:
                parts = display_name.split()
                if parts:
                    first_name = first_name or parts[0]
                    last_name = last_name or " ".join(parts[1:])
            department = _attr(entry, "department")
            service = service_by_code.get(department.lower()) or service_by_name.get(
                department.lower()
            )
            errors: list[str] = []
            if not email:
                errors.append("Adresse e-mail absente.")
            if not first_name or not last_name:
                errors.append("Nom ou prénom absent.")
            if not login:
                errors.append("Identifiant sAMAccountName absent.")
            if email and email in seen_emails:
                errors.append("Utilisateur présent plusieurs fois dans l'annuaire.")
            if login and login.lower() in seen_logins:
                errors.append("Identifiant présent plusieurs fois dans l'annuaire.")
            existing = by_email.get(email) if email else None
            if existing is None and login:
                existing = by_login.get(login.lower())
            if errors:
                status = "error"
            elif existing is not None:
                status = "update" if update_existing else "skip"
            else:
                status = "create"
            if email:
                seen_emails.add(email)
            if login:
                seen_logins.add(login.lower())
            label = f"{first_name} {last_name}".strip() or login or email or "Utilisateur"
            rows.append(
                LdapUserPreview(
                    status=status,
                    label=label,
                    first_name=first_name or None,
                    last_name=last_name or None,
                    email=email or None,
                    login=login or None,
                    department=department or None,
                    service_name=service.name if service else None,
                    agent_id=existing.id if existing else None,
                    errors=errors,
                )
            )
            if len(rows) >= 5000:
                break
    except Exception as exc:
        raise ValidationAppError(f"Lecture LDAP impossible : {_safe_error(exc)}") from exc
    finally:
        connection.unbind()
    return rows


def preview_sync(db: Session, *, update_existing: bool = True) -> LdapPreviewResponse:
    rows = _collect_users(db, update_existing=update_existing)
    counts = {
        "create": sum(1 for row in rows if row.status == "create"),
        "update": sum(1 for row in rows if row.status == "update"),
        "skip": sum(1 for row in rows if row.status == "skip"),
        "error": sum(1 for row in rows if row.status == "error"),
    }
    message = (
        f"{len(rows)} utilisateur(s) analysé(s) : {counts['create']} à créer, "
        f"{counts['update']} à mettre à jour, {counts['skip']} ignoré(s), "
        f"{counts['error']} erreur(s)."
    )
    return LdapPreviewResponse(
        total=len(rows),
        to_create=counts["create"],
        to_update=counts["update"],
        skipped=counts["skip"],
        errors=counts["error"],
        message=message,
        rows=rows[:500],
    )


def sync_agents(
    db: Session,
    *,
    update_existing: bool,
    actor: User,
    request: Request | None = None,
) -> LdapSyncResponse:
    if not bool(_value(db, "ldap.enabled", False)):
        raise ValidationAppError("Activez la synchronisation LDAP avant de lancer l'import.")
    rows = _collect_users(db, update_existing=update_existing)
    services = list(db.scalars(select(Service)).all())
    service_by_code = {service.code.lower(): service for service in services}
    service_by_name = {service.name.lower(): service for service in services}
    agents = list(db.scalars(select(Agent)).all())
    by_email = {agent.email_pro.lower(): agent for agent in agents}
    by_login = {agent.login.lower(): agent for agent in agents if agent.login}

    created = updated = skipped = errors = 0
    for row in rows:
        if row.status in {"error", "skip"}:
            if row.status == "skip":
                skipped += 1
            else:
                errors += 1
            continue
        service = None
        if row.department:
            service = service_by_code.get(row.department.lower()) or service_by_name.get(
                row.department.lower()
            )
        existing = by_email.get((row.email or "").lower())
        if existing is None and row.login:
            existing = by_login.get(row.login.lower())
        if existing is not None:
            if not update_existing:
                skipped += 1
                continue
            existing.first_name = row.first_name or existing.first_name
            existing.last_name = row.last_name or existing.last_name
            existing.email_pro = row.email or existing.email_pro
            existing.login = row.login or existing.login
            existing.service_id = service.id if service else existing.service_id
            existing.status = "active"
            updated += 1
            continue
        if not row.email or not row.login:
            errors += 1
            continue
        if row.login.lower() in by_login:
            errors += 1
            continue
        parts = row.label.split(" ", 1)
        agent = Agent(
            first_name=row.first_name or parts[0],
            last_name=row.last_name or (parts[1] if len(parts) > 1 else parts[0]),
            email_pro=row.email,
            login=row.login,
            service_id=service.id if service else None,
            status="active",
            notes="Synchronisé depuis Active Directory",
        )
        db.add(agent)
        db.flush()
        by_email[agent.email_pro.lower()] = agent
        if agent.login:
            by_login[agent.login.lower()] = agent
        created += 1

    job = ImportJob(
        entity_type="ldap",
        original_filename="Active Directory",
        storage_key="",
        status="applied" if errors == 0 else "partial",
        total_rows=len(rows),
        valid_rows=created + updated,
        warning_rows=skipped,
        error_rows=errors,
        created_by_id=actor.id,
        applied_at=utcnow(),
        report_json=json.dumps(
            {"created": created, "updated": updated, "skipped": skipped, "errors": errors},
            ensure_ascii=False,
        ),
    )
    db.add(job)
    write_audit(
        db,
        module="ldap",
        action="ldap_sync_applied",
        actor=actor,
        entity_type="agent",
        entity_label="Active Directory",
        after={
            "created": created,
            "updated": updated,
            "skipped": skipped,
            "errors": errors,
        },
        request=request,
    )
    db.commit()
    return LdapSyncResponse(
        created=created,
        updated=updated,
        skipped=skipped,
        errors=errors,
        message=(
            f"{created} agent(s) créé(s), {updated} mis à jour, "
            f"{skipped} ignoré(s), {errors} erreur(s)."
        ),
    )
