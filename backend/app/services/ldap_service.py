from __future__ import annotations

import json
import ssl
from datetime import UTC, datetime
from typing import Any

from app.core.crypto import decrypt_secret, encrypt_secret
from app.core.errors import NotFoundError, ValidationAppError
from app.db.base import utcnow
from app.models.auth import User
from app.models.imports import ImportJob
from app.models.organization import Agent, Service
from app.models.setting import Setting
from app.schemas.ldap import (
    LdapConfigRead,
    LdapConfigUpdate,
    LdapDirectoryActionResponse,
    LdapDirectoryGroup,
    LdapDirectoryGroupList,
    LdapDirectoryUser,
    LdapDirectoryUserCreate,
    LdapDirectoryUserList,
    LdapDirectoryUserUpdate,
    LdapGroupMembershipUpdate,
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

DIRECTORY_USER_ATTRIBUTES = [
    *LDAP_ATTRIBUTES,
    "userAccountControl",
    "cn",
]

DIRECTORY_GROUP_ATTRIBUTES = [
    "cn",
    "description",
    "distinguishedName",
    "member",
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
        users_base_dn=str(_value(db, "ldap.users_base_dn", "") or ""),
        groups_base_dn=str(_value(db, "ldap.groups_base_dn", "") or ""),
        write_enabled=bool(_value(db, "ldap.write_enabled", False)),
        upn_suffix=str(_value(db, "ldap.upn_suffix", "") or ""),
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
    if payload.write_enabled and not payload.bind_dn.strip():
        raise ValidationAppError(
            "Un compte de service avec des droits d'écriture est requis pour activer la gestion de l'annuaire."
        )
    upn_suffix = payload.upn_suffix.strip()
    if upn_suffix and not upn_suffix.startswith("@"):
        upn_suffix = f"@{upn_suffix}"
    _set_value(db, "ldap.enabled", payload.enabled)
    _set_value(db, "ldap.url", url)
    _set_value(db, "ldap.base_dn", payload.base_dn.strip())
    _set_value(db, "ldap.bind_dn", payload.bind_dn.strip())
    _set_value(db, "ldap.user_filter", payload.user_filter.strip() or DEFAULT_FILTER)
    _set_value(db, "ldap.tls_verify", payload.tls_verify)
    _set_value(db, "ldap.users_base_dn", payload.users_base_dn.strip())
    _set_value(db, "ldap.groups_base_dn", payload.groups_base_dn.strip())
    _set_value(db, "ldap.write_enabled", payload.write_enabled)
    _set_value(db, "ldap.upn_suffix", upn_suffix)
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
            "write_enabled": payload.write_enabled,
            "users_base_dn": payload.users_base_dn.strip(),
            "groups_base_dn": payload.groups_base_dn.strip(),
            "password_changed": payload.bind_password is not None,
        },
        request=request,
    )
    db.commit()
    return get_config(db)


def _safe_error(exc: Exception) -> str:
    text = str(exc).strip().replace("\n", " ")
    return text[:400] or exc.__class__.__name__


def _connection(db: Session, *, read_only: bool = True):
    if not read_only and not bool(_value(db, "ldap.write_enabled", False)):
        raise ValidationAppError(
            "Activez la gestion de l'annuaire avant toute opération d'écriture."
        )
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
            read_only=read_only,
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


def _ldap3():
    try:
        import ldap3
        from ldap3.utils.conv import escape_filter_chars
        from ldap3.utils.dn import escape_rdn
    except ImportError as exc:  # pragma: no cover - dépendance de déploiement
        raise ValidationAppError(
            "Le module ldap3 n'est pas installé sur le serveur."
        ) from exc
    return ldap3, escape_filter_chars, escape_rdn


def _users_base(db: Session) -> str:
    base = str(_value(db, "ldap.users_base_dn", "") or "")
    return base or str(_value(db, "ldap.base_dn", "") or "")


def _groups_base(db: Session) -> str:
    base = str(_value(db, "ldap.groups_base_dn", "") or "")
    return base or str(_value(db, "ldap.base_dn", "") or "")


def _entry_dn(entry: dict[str, Any]) -> str:
    return str(entry.get("dn") or "").strip()


def _attr_list(entry: dict[str, Any], name: str) -> list[str]:
    value = (entry.get("attributes") or {}).get(name)
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        return [str(item).strip() for item in value if str(item).strip()]
    return [str(value).strip()] if str(value).strip() else []


def _directory_user(entry: dict[str, Any]) -> LdapDirectoryUser:
    control = _attr(entry, "userAccountControl")
    try:
        uac = int(control) if control else 512
    except ValueError:
        uac = 512
    return LdapDirectoryUser(
        distinguished_name=_entry_dn(entry),
        login=_attr(entry, "sAMAccountName"),
        email=_attr(entry, "mail") or _attr(entry, "userPrincipalName") or None,
        first_name=_attr(entry, "givenName") or None,
        last_name=_attr(entry, "sn") or None,
        display_name=_attr(entry, "displayName") or None,
        department=_attr(entry, "department") or None,
        title=_attr(entry, "title") or None,
        phone=_attr(entry, "telephoneNumber") or None,
        enabled=not bool(uac & 2),
    )


def _directory_group(entry: dict[str, Any]) -> LdapDirectoryGroup:
    members = _attr_list(entry, "member")
    return LdapDirectoryGroup(
        distinguished_name=_entry_dn(entry),
        name=_attr(entry, "cn") or _entry_dn(entry),
        description=_attr(entry, "description") or None,
        member_count=len(members) if members else None,
    )


def search_directory_users(
    db: Session,
    *,
    query: str | None = None,
    limit: int = 200,
) -> LdapDirectoryUserList:
    base = _users_base(db)
    if not base:
        raise ValidationAppError("Configurez la base de recherche des utilisateurs.")
    _, escape_filter_chars, _ = _ldap3()
    term = (query or "").strip()
    search_filter = "(&(objectCategory=person)(objectClass=user)"
    if term:
        escaped = escape_filter_chars(term)
        search_filter += (
            f"(|(sAMAccountName=*{escaped}*)(mail=*{escaped}*)"
            f"(displayName=*{escaped}*)(cn=*{escaped}*))"
        )
    search_filter += ")"

    connection, _, subtree = _connection(db)
    rows: list[LdapDirectoryUser] = []
    truncated = False
    try:
        for entry in connection.extend.standard.paged_search(
            search_base=base,
            search_filter=search_filter,
            search_scope=subtree,
            attributes=DIRECTORY_USER_ATTRIBUTES,
            paged_size=200,
            size_limit=limit + 1,
            generator=True,
        ):
            if entry.get("type") != "searchResEntry":
                continue
            if len(rows) >= limit:
                truncated = True
                break
            rows.append(_directory_user(entry))
    except Exception as exc:
        raise ValidationAppError(f"Lecture de l'annuaire impossible : {_safe_error(exc)}") from exc
    finally:
        connection.unbind()
    rows.sort(key=lambda user: (user.display_name or user.login).lower())
    return LdapDirectoryUserList(total=len(rows), truncated=truncated, rows=rows)


def list_directory_groups(
    db: Session,
    *,
    query: str | None = None,
    limit: int = 500,
) -> LdapDirectoryGroupList:
    base = _groups_base(db)
    if not base:
        raise ValidationAppError("Configurez la base de recherche des groupes.")
    _, escape_filter_chars, _ = _ldap3()
    term = (query or "").strip()
    search_filter = "(&(objectClass=group)"
    if term:
        search_filter += f"(cn=*{escape_filter_chars(term)}*)"
    search_filter += ")"

    connection, _, subtree = _connection(db)
    rows: list[LdapDirectoryGroup] = []
    try:
        for entry in connection.extend.standard.paged_search(
            search_base=base,
            search_filter=search_filter,
            search_scope=subtree,
            attributes=DIRECTORY_GROUP_ATTRIBUTES,
            paged_size=200,
            size_limit=limit,
            generator=True,
        ):
            if entry.get("type") != "searchResEntry":
                continue
            rows.append(_directory_group(entry))
    except Exception as exc:
        raise ValidationAppError(f"Lecture des groupes impossible : {_safe_error(exc)}") from exc
    finally:
        connection.unbind()
    rows.sort(key=lambda group: group.name.lower())
    return LdapDirectoryGroupList(total=len(rows), rows=rows)


def get_user_groups(db: Session, user_dn: str) -> LdapDirectoryGroupList:
    base = _groups_base(db)
    if not base:
        raise ValidationAppError("Configurez la base de recherche des groupes.")
    _, escape_filter_chars, _ = _ldap3()
    search_filter = (
        f"(&(objectClass=group)(member={escape_filter_chars(user_dn)}))"
    )
    connection, _, subtree = _connection(db)
    rows: list[LdapDirectoryGroup] = []
    try:
        for entry in connection.extend.standard.paged_search(
            search_base=base,
            search_filter=search_filter,
            search_scope=subtree,
            attributes=["cn", "description", "distinguishedName"],
            paged_size=200,
            size_limit=1000,
            generator=True,
        ):
            if entry.get("type") != "searchResEntry":
                continue
            rows.append(_directory_group(entry))
    except Exception as exc:
        raise ValidationAppError(f"Lecture des groupes de l'utilisateur impossible : {_safe_error(exc)}") from exc
    finally:
        connection.unbind()
    rows.sort(key=lambda group: group.name.lower())
    return LdapDirectoryGroupList(total=len(rows), rows=rows)


def _find_user_entry(connection: Any, user_dn: str) -> dict[str, Any]:
    ldap3, _, _ = _ldap3()
    connection.search(
        user_dn,
        "(objectClass=user)",
        search_scope=ldap3.BASE,
        attributes=DIRECTORY_USER_ATTRIBUTES,
    )
    if not connection.response:
        raise NotFoundError("Utilisateur Active Directory introuvable.")
    return connection.response[0]


def _require_ldaps_for_password(db: Session, password: str | None) -> None:
    if not password:
        return
    url = str(_value(db, "ldap.url", "") or "")
    if not url.lower().startswith("ldaps://"):
        raise ValidationAppError(
            "La définition d'un mot de passe Active Directory nécessite une connexion LDAPS."
        )


def create_directory_user(
    db: Session,
    payload: LdapDirectoryUserCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> LdapDirectoryActionResponse:
    _require_ldaps_for_password(db, payload.password)
    ldap3, _, escape_rdn = _ldap3()
    base = _users_base(db)
    if not base:
        raise ValidationAppError("Configurez l'OU ou la base de création des utilisateurs.")
    connection, _, _ = _connection(db, read_only=False)
    display_name = f"{payload.first_name} {payload.last_name}".strip()
    user_dn = f"CN={escape_rdn(display_name)},{base}"
    suffix = str(_value(db, "ldap.upn_suffix", "") or "")
    upn = f"{payload.login}{suffix}" if suffix else str(payload.email)
    attributes: dict[str, Any] = {
        "objectClass": ["top", "person", "organizationalPerson", "user"],
        "cn": display_name,
        "sAMAccountName": payload.login,
        "userPrincipalName": upn,
        "givenName": payload.first_name,
        "sn": payload.last_name,
        "displayName": display_name,
        "mail": str(payload.email),
        "userAccountControl": "514",
    }
    if payload.department:
        attributes["department"] = payload.department
    if payload.title:
        attributes["title"] = payload.title
    if payload.phone:
        attributes["telephoneNumber"] = payload.phone

    created = False
    try:
        if not connection.add(user_dn, attributes=attributes):
            raise ValidationAppError(
                f"Création impossible : {connection.result.get('description', 'erreur AD')}"
            )
        created = True
        if payload.password:
            if not connection.extend.microsoft.modify_password(user_dn, payload.password):
                raise ValidationAppError(
                    f"Définition du mot de passe impossible : {connection.result.get('description', 'erreur AD')}"
                )
            if not connection.modify(
                user_dn,
                {"userAccountControl": [(ldap3.MODIFY_REPLACE, ["512"])]},
            ):
                raise ValidationAppError(
                    f"Activation impossible : {connection.result.get('description', 'erreur AD')}"
                )
        write_audit(
            db,
            module="ldap",
            action="ldap_user_created",
            actor=actor,
            entity_type="ldap_user",
            entity_id=user_dn,
            entity_label=display_name,
            after={
                "login": payload.login,
                "email": str(payload.email),
                "enabled": bool(payload.password),
                "department": payload.department,
            },
            request=request,
        )
        db.commit()
        message = (
            "Utilisateur créé et activé."
            if payload.password
            else "Utilisateur créé mais désactivé : définissez un mot de passe dans Active Directory pour l'activer."
        )
        return LdapDirectoryActionResponse(
            message=message,
            user=LdapDirectoryUser(
                distinguished_name=user_dn,
                login=payload.login,
                email=str(payload.email),
                first_name=payload.first_name,
                last_name=payload.last_name,
                display_name=display_name,
                department=payload.department,
                title=payload.title,
                phone=payload.phone,
                enabled=bool(payload.password),
            ),
        )
    except Exception:
        if created:
            connection.delete(user_dn)
        raise
    finally:
        connection.unbind()


def update_directory_user(
    db: Session,
    payload: LdapDirectoryUserUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> LdapDirectoryActionResponse:
    _require_ldaps_for_password(db, payload.password)
    ldap3, _, _ = _ldap3()
    connection, _, _ = _connection(db, read_only=False)
    try:
        entry = _find_user_entry(connection, payload.user_dn)
        before = _directory_user(entry)
        data = payload.model_dump(exclude_unset=True)
        data.pop("user_dn", None)
        data.pop("password", None)
        changes: dict[str, list[tuple[str, list[str]]]] = {}

        for field, attribute in (
            ("first_name", "givenName"),
            ("last_name", "sn"),
            ("department", "department"),
            ("title", "title"),
            ("phone", "telephoneNumber"),
        ):
            if field not in data:
                continue
            value = data[field]
            if field in {"first_name", "last_name"} and not value:
                raise ValidationAppError("Le prénom et le nom ne peuvent pas être vides.")
            changes[attribute] = (
                [(ldap3.MODIFY_REPLACE, [str(value)])]
                if value
                else [(ldap3.MODIFY_DELETE, [])]
            )
        if "email" in data and data["email"]:
            changes["mail"] = [(ldap3.MODIFY_REPLACE, [str(data["email"])])]
        if "enabled" in data and data["enabled"] is not None:
            current = int(_attr(entry, "userAccountControl") or 512)
            enabled = bool(data["enabled"])
            new_control = (current & ~2) if enabled else (current | 2)
            changes["userAccountControl"] = [
                (ldap3.MODIFY_REPLACE, [str(new_control)])
            ]
        if "first_name" in data or "last_name" in data:
            display = (
                f"{data.get('first_name', before.first_name or '')} "
                f"{data.get('last_name', before.last_name or '')}"
            ).strip()
            if display:
                changes["displayName"] = [(ldap3.MODIFY_REPLACE, [display])]

        if changes and not connection.modify(payload.user_dn, changes):
            raise ValidationAppError(
                f"Modification impossible : {connection.result.get('description', 'erreur AD')}"
            )
        if payload.password and not connection.extend.microsoft.modify_password(
            payload.user_dn, payload.password
        ):
            raise ValidationAppError(
                f"Réinitialisation du mot de passe impossible : {connection.result.get('description', 'erreur AD')}"
            )
        write_audit(
            db,
            module="ldap",
            action="ldap_user_updated",
            actor=actor,
            entity_type="ldap_user",
            entity_id=payload.user_dn,
            entity_label=before.display_name or before.login,
            before=before.model_dump(exclude={"groups"}),
            after={
                **data,
                "password_changed": bool(payload.password),
            },
            request=request,
        )
        db.commit()
        return LdapDirectoryActionResponse(
            message="Utilisateur mis à jour."
            + (" Mot de passe réinitialisé." if payload.password else "")
        )
    finally:
        connection.unbind()


def update_group_memberships(
    db: Session,
    payload: LdapGroupMembershipUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> LdapDirectoryActionResponse:
    ldap3, _, _ = _ldap3()
    current = get_user_groups(db, payload.user_dn)
    current_dns = {group.distinguished_name for group in current.rows}
    add_dns = [dn for dn in payload.add_group_dns if dn and dn not in current_dns]
    remove_dns = [dn for dn in payload.remove_group_dns if dn and dn in current_dns]
    if not add_dns and not remove_dns:
        return LdapDirectoryActionResponse(message="Aucun changement d'appartenance.")

    connection, _, _ = _connection(db, read_only=False)
    applied_add: list[str] = []
    applied_remove: list[str] = []
    try:
        for group_dn in add_dns:
            if not connection.modify(
                group_dn,
                {"member": [(ldap3.MODIFY_ADD, [payload.user_dn])]},
            ):
                raise ValidationAppError(
                    f"Ajout au groupe impossible : {connection.result.get('description', group_dn)}"
                )
            applied_add.append(group_dn)
        for group_dn in remove_dns:
            if not connection.modify(
                group_dn,
                {"member": [(ldap3.MODIFY_DELETE, [payload.user_dn])]},
            ):
                raise ValidationAppError(
                    f"Retrait du groupe impossible : {connection.result.get('description', group_dn)}"
                )
            applied_remove.append(group_dn)
        write_audit(
            db,
            module="ldap",
            action="ldap_user_groups_updated",
            actor=actor,
            entity_type="ldap_user",
            entity_id=payload.user_dn,
            entity_label=payload.user_dn,
            after={
                "added": applied_add,
                "removed": applied_remove,
            },
            request=request,
        )
        db.commit()
        return LdapDirectoryActionResponse(
            message=(
                f"{len(applied_add)} groupe(s) ajouté(s), "
                f"{len(applied_remove)} groupe(s) retiré(s)."
            )
        )
    except Exception:
        if applied_add or applied_remove:
            write_audit(
                db,
                module="ldap",
                action="ldap_user_groups_updated",
                actor=actor,
                entity_type="ldap_user",
                entity_id=payload.user_dn,
                entity_label=payload.user_dn,
                after={
                    "added": applied_add,
                    "removed": applied_remove,
                    "partial": True,
                },
                request=request,
                status="failure",
            )
            db.commit()
        raise
    finally:
        connection.unbind()
