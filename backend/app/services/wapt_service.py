from __future__ import annotations

import json
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import httpx
from app.core.crypto import decrypt_secret, encrypt_secret
from app.core.errors import ValidationAppError
from app.models.assets import Asset, AssetCategory
from app.models.auth import User
from app.models.setting import Setting
from app.schemas.wapt import (
    WaptActionResponse,
    WaptConfigRead,
    WaptConfigUpdate,
    WaptHostPackageRead,
    WaptHostRead,
    WaptPackageRead,
    WaptSyncResponse,
    WaptTestResponse,
)
from app.services.assets_service import generate_asset_tag
from app.services.audit_service import write_audit
from fastapi import Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session


@dataclass(frozen=True)
class WaptConfig:
    enabled: bool
    base_url: str
    username: str
    password: str
    verify_tls: bool
    hosts_path: str
    host_detail_path: str
    fetch_details: bool
    packages_path: str
    host_packages_path: str
    install_path: str
    uninstall_path: str
    package_field: str
    timeout_seconds: int

    @property
    def configured(self) -> bool:
        return bool(self.base_url)


def _value(db: Session, key: str, default: object = "") -> object:
    setting = db.get(Setting, key)
    if setting is None or setting.value_json is None:
        return default
    try:
        return json.loads(setting.value_json)
    except json.JSONDecodeError:
        return setting.value_json


def _set_value(
    db: Session,
    key: str,
    value: object,
    *,
    is_secret: bool = False,
    description: str | None = None,
) -> None:
    setting = db.get(Setting, key)
    if setting is None:
        setting = Setting(
            key=key,
            category="wapt",
            is_secret=is_secret,
            description=description,
        )
        db.add(setting)
    setting.value_json = json.dumps(value, ensure_ascii=False)
    setting.is_secret = is_secret


def get_config(db: Session) -> WaptConfig:
    encrypted = str(_value(db, "wapt.password_encrypted", "") or "")
    return WaptConfig(
        enabled=bool(_value(db, "wapt.enabled", False)),
        base_url=str(_value(db, "wapt.base_url", "") or "").rstrip("/"),
        username=str(_value(db, "wapt.username", "") or ""),
        password=(decrypt_secret(encrypted) or "") if encrypted else "",
        verify_tls=bool(_value(db, "wapt.verify_tls", True)),
        hosts_path=str(_value(db, "wapt.hosts_path", "/api/v1/hosts") or "/api/v1/hosts"),
        host_detail_path=str(
            _value(db, "wapt.host_detail_path", "/api/v1/hosts?uuid={uuid}")
            or "/api/v1/hosts?uuid={uuid}"
        ),
        fetch_details=bool(_value(db, "wapt.fetch_details", False)),
        packages_path=str(
            _value(db, "wapt.packages_path", "/api/v3/packages")
            or "/api/v3/packages"
        ),
        host_packages_path=str(
            _value(
                db,
                "wapt.host_packages_path",
                "/api/v1/host_data?uuid={uuid}&field=installed_packages",
            )
            or "/api/v1/host_data?uuid={uuid}&field=installed_packages"
        ),
        install_path=str(
            _value(db, "wapt.install_path", "/api/v1/hosts/{uuid}/install")
            or "/api/v1/hosts/{uuid}/install"
        ),
        uninstall_path=str(
            _value(db, "wapt.uninstall_path", "/api/v1/hosts/{uuid}/uninstall")
            or "/api/v1/hosts/{uuid}/uninstall"
        ),
        package_field=str(_value(db, "wapt.package_field", "package") or "package"),
        timeout_seconds=int(str(_value(db, "wapt.timeout_seconds", 30) or 30)),
    )


def get_settings(db: Session) -> WaptConfigRead:
    config = get_config(db)
    return WaptConfigRead(
        enabled=config.enabled,
        base_url=config.base_url,
        username=config.username,
        password_set=bool(config.password),
        verify_tls=config.verify_tls,
        hosts_path=config.hosts_path,
        host_detail_path=config.host_detail_path,
        fetch_details=config.fetch_details,
        packages_path=config.packages_path,
        host_packages_path=config.host_packages_path,
        install_path=config.install_path,
        uninstall_path=config.uninstall_path,
        package_field=config.package_field,
        timeout_seconds=config.timeout_seconds,
        configured=config.configured,
    )


def update_settings(
    db: Session,
    payload: WaptConfigUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> WaptConfigRead:
    if payload.enabled and not payload.base_url.strip():
        raise ValidationAppError("Renseignez l'URL du serveur WAPT pour l'activer.")
    before = get_settings(db).model_dump()
    _set_value(db, "wapt.enabled", payload.enabled)
    _set_value(db, "wapt.base_url", payload.base_url.strip().rstrip("/"))
    _set_value(db, "wapt.username", payload.username.strip())
    _set_value(db, "wapt.verify_tls", payload.verify_tls)
    _set_value(db, "wapt.hosts_path", payload.hosts_path.strip() or "/api/v1/hosts")
    _set_value(
        db,
        "wapt.host_detail_path",
        payload.host_detail_path.strip() or "/api/v1/hosts?uuid={uuid}",
    )
    _set_value(db, "wapt.fetch_details", payload.fetch_details)
    _set_value(
        db,
        "wapt.packages_path",
        payload.packages_path.strip() or "/api/v3/packages",
    )
    _set_value(
        db,
        "wapt.host_packages_path",
        payload.host_packages_path.strip()
        or "/api/v1/host_data?uuid={uuid}&field=installed_packages",
    )
    _set_value(
        db,
        "wapt.install_path",
        payload.install_path.strip() or "/api/v1/hosts/{uuid}/install",
    )
    _set_value(
        db,
        "wapt.uninstall_path",
        payload.uninstall_path.strip() or "/api/v1/hosts/{uuid}/uninstall",
    )
    _set_value(db, "wapt.package_field", payload.package_field.strip() or "package")
    _set_value(db, "wapt.timeout_seconds", payload.timeout_seconds)
    if payload.password:
        _set_value(
            db,
            "wapt.password_encrypted",
            encrypt_secret(payload.password) or "",
            is_secret=True,
            description="Mot de passe WAPT, chiffré",
        )
    write_audit(
        db,
        module="admin",
        action="wapt_settings_updated",
        actor=actor,
        entity_type="setting",
        entity_id="wapt",
        entity_label="Configuration WAPT",
        before=before,
        after={
            "base_url": payload.base_url.strip(),
            "enabled": payload.enabled,
            "verify_tls": payload.verify_tls,
            "password_changed": bool(payload.password),
        },
        request=request,
    )
    db.commit()
    return get_settings(db)


def _url(config: WaptConfig, path: str, *, uuid: str | None = None) -> str:
    rendered = path.format(uuid=uuid or "")
    if rendered.startswith("http://") or rendered.startswith("https://"):
        return rendered
    return f"{config.base_url}/{rendered.lstrip('/')}"


def _request_json(
    config: WaptConfig,
    method: str,
    path: str,
    *,
    uuid: str | None = None,
    payload: dict[str, Any] | None = None,
) -> Any:
    if not config.configured:
        raise ValidationAppError("La connexion WAPT n'est pas configurée.")
    url = _url(config, path, uuid=uuid)
    auth = (config.username, config.password) if config.username else None
    try:
        with httpx.Client(
            timeout=config.timeout_seconds,
            verify=config.verify_tls,
            follow_redirects=True,
        ) as client:
            response = client.request(
                method,
                url,
                auth=auth,
                json=payload,
                headers={"Accept": "application/json"},
            )
    except httpx.HTTPError as exc:
        raise ValidationAppError(f"Connexion WAPT impossible : {exc}") from exc
    if response.status_code >= 400:
        detail = response.text[:400].strip()
        raise ValidationAppError(
            f"Le serveur WAPT a répondu {response.status_code} : {detail}"
        )
    if not response.content:
        return {}
    try:
        return response.json()
    except ValueError:
        return {"raw": response.text}


def _extract_list(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        for key in ("result", "data", "items", "hosts", "packages", "rows"):
            value = payload.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
            if isinstance(value, dict):
                nested = _extract_list(value)
                if nested:
                    return nested
        if payload and all(isinstance(value, dict) for value in payload.values()):
            return [value for value in payload.values() if isinstance(value, dict)]
    return []


def _normalized_map(payload: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in payload.items():
        result[key.lower().replace(" ", "_").replace("-", "_")] = value
    return result


def _pick(data: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        normalized = key.lower().replace(" ", "_").replace("-", "_")
        if normalized in data and data[normalized] not in (None, ""):
            return data[normalized]
    return None


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (list, tuple)):
        return ", ".join(str(item) for item in value)
    if isinstance(value, dict):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def _as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value > 0
    text = _as_text(value).strip().lower()
    return text in {"1", "true", "ok", "yes", "online", "connected", "up", "reachable"}


def _groups(value: Any) -> str:
    if isinstance(value, list):
        return ", ".join(str(item) for item in value)
    if isinstance(value, dict):
        return ", ".join(str(key) for key in value)
    return _as_text(value)


def _normalize_host(raw: dict[str, Any], detail: dict[str, Any] | None = None) -> WaptHostRead:
    merged = {**raw, **(detail or {})}
    data = _normalized_map(merged)
    connected = _as_bool(
        _pick(data, "connected", "online", "is_connected", "joignable", "reachable")
    )
    last_seen = _as_text(
        _pick(
            data,
            "last_seen",
            "last_connection",
            "last_seen_at",
            "date_de_derniere_connexion",
            "last_seen_on",
        )
    )
    return WaptHostRead(
        uuid=_as_text(_pick(data, "uuid", "host_uuid", "id")),
        hostname=_as_text(
            _pick(data, "hostname", "machine", "computer_name", "name", "nom_machine")
        ),
        description=_as_text(
            _pick(data, "description", "dn", "dn_dans_l_ad", "comment", "comments")
        ),
        connected=connected,
        last_seen=last_seen,
        os_name=_as_text(
            _pick(data, "os_name", "os", "operating_system", "systeme_d_exploitation")
        ),
        os_version=_as_text(_pick(data, "os_version", "platform", "plateforme")),
        ip_address=_as_text(
            _pick(data, "ip_address", "main_ip", "ip", "adresse_ip", "ipaddress")
        ),
        mac_address=_as_text(
            _pick(data, "mac_address", "mac_addresses", "mac", "adresse_mac")
        ),
        serial_number=_as_text(
            _pick(
                data,
                "serial_number",
                "serialnr",
                "serial",
                "numero_de_serie",
                "serialnumber",
            )
        ),
        manufacturer=_as_text(_pick(data, "manufacturer", "brand", "manufacteur")),
        model=_as_text(_pick(data, "model", "productname", "modele")),
        last_user=_as_text(
            _pick(
                data,
                "last_user",
                "connected_users",
                "last_logged_user",
                "utilisateur",
                "dernier_utilisateur_logue",
            )
        ),
        groups=_groups(_pick(data, "groups", "groupes", "group")),
        domain=_as_text(_pick(data, "domain", "dnsdomain", "domaine")),
        wapt_version=_as_text(
            _pick(data, "wapt_version", "version_de_wapt", "version", "agent_version")
        ),
        raw=merged,
    )


def _host_external_data(host: WaptHostRead) -> dict[str, Any]:
    external = dict(host.raw)
    external.update(
        {
            "uuid": host.uuid,
            "statut": "OK" if host.connected else "Hors ligne",
            "joignable": "OK" if host.connected else "KO",
            "derniere_connexion": host.last_seen,
            "dernier_utilisateur_logue": host.last_user,
            "groupes": host.groups,
            "domaine": host.domain,
            "version_de_wapt": host.wapt_version,
            "wapt_sync_at": datetime.now(UTC).isoformat(),
        }
    )
    return external


def fetch_hosts(config: WaptConfig) -> list[WaptHostRead]:
    raw_hosts = _extract_list(_request_json(config, "GET", config.hosts_path))
    hosts: list[WaptHostRead] = []
    for raw in raw_hosts:
        detail: dict[str, Any] | None = None
        uuid = _as_text(_pick(_normalized_map(raw), "uuid", "host_uuid", "id"))
        if config.fetch_details and uuid:
            try:
                detail_payload = _request_json(
                    config, "GET", config.host_detail_path, uuid=uuid
                )
                if isinstance(detail_payload, dict):
                    detail_rows = _extract_list(detail_payload)
                    detail = detail_rows[0] if detail_rows else detail_payload
            except ValidationAppError:
                detail = None
        hosts.append(_normalize_host(raw, detail))
    return hosts


def fetch_packages(config: WaptConfig) -> list[WaptPackageRead]:
    rows = _extract_list(_request_json(config, "GET", config.packages_path))
    packages: list[WaptPackageRead] = []
    for raw in rows:
        data = _normalized_map(raw)
        name = _as_text(_pick(data, "package", "name", "id", "package_name"))
        if not name:
            continue
        packages.append(
            WaptPackageRead(
                name=name,
                version=_as_text(_pick(data, "version", "package_version")),
                description=_as_text(
                    _pick(data, "description", "description_fr", "summary", "title", "name")
                ),
                raw=raw,
            )
        )
    return sorted(packages, key=lambda item: item.name.lower())


def fetch_host_packages(config: WaptConfig, uuid: str) -> list[WaptHostPackageRead]:
    rows = _extract_list(
        _request_json(config, "GET", config.host_packages_path, uuid=uuid)
    )
    packages: list[WaptHostPackageRead] = []
    for raw in rows:
        data = _normalized_map(raw)
        name = _as_text(_pick(data, "package", "name", "id", "package_name"))
        if not name:
            continue
        packages.append(
            WaptHostPackageRead(
                name=name,
                version=_as_text(_pick(data, "version", "package_version")),
                installed=_as_text(_pick(data, "status", "etat")).lower() not in {"removed", "uninstalled", "absent"},
                raw=raw,
            )
        )
    return packages


def _category_for_host(db: Session, host: WaptHostRead) -> AssetCategory | None:
    haystack = " ".join(
        [host.hostname, host.os_name, host.description, host.model]
    ).lower()
    if "server" in haystack or host.hostname.lower().startswith(("srv", "vm-")):
        code = "server"
    elif "laptop" in haystack or "portable" in haystack:
        code = "laptop"
    else:
        code = "desktop"
    category = db.scalar(
        select(AssetCategory).where(
            AssetCategory.code == code, AssetCategory.is_active.is_(True)
        )
    )
    if category is not None:
        return category
    return db.scalar(
        select(AssetCategory).where(AssetCategory.is_active.is_(True)).limit(1)
    )


def _unique_value(
    db: Session, column, value: str, *, exclude_id: UUID | None = None  # noqa: ANN001
) -> bool:
    statement = select(Asset.id).where(column == value)
    if exclude_id:
        statement = statement.where(Asset.id != exclude_id)
    return db.scalar(statement) is None


def _find_asset(db: Session, host: WaptHostRead) -> Asset | None:
    if host.uuid:
        asset = db.scalar(select(Asset).where(Asset.external_id == host.uuid))
        if asset is not None:
            return asset
    if host.hostname:
        asset = db.scalar(
            select(Asset).where(
                func.lower(Asset.hostname) == host.hostname.lower()
            )
        )
        if asset is not None:
            return asset
    if host.serial_number:
        asset = db.scalar(
            select(Asset).where(
                func.lower(Asset.serial_number) == host.serial_number.lower()
            )
        )
        if asset is not None:
            return asset
    return None


def _apply_host(db: Session, asset: Asset, host: WaptHostRead) -> None:
    if (
        host.uuid
        and not asset.external_id
        and _unique_value(db, Asset.external_id, host.uuid, exclude_id=asset.id)
    ):
        asset.external_id = host.uuid
    if host.hostname and _unique_value(
        db, Asset.hostname, host.hostname, exclude_id=asset.id
    ):
        asset.hostname = host.hostname
    if host.serial_number and _unique_value(
        db, Asset.serial_number, host.serial_number, exclude_id=asset.id
    ):
        asset.serial_number = host.serial_number
    if host.ip_address and _unique_value(
        db, Asset.ip_address, host.ip_address, exclude_id=asset.id
    ):
        asset.ip_address = host.ip_address
    if host.mac_address and _unique_value(
        db, Asset.mac_address, host.mac_address, exclude_id=asset.id
    ):
        asset.mac_address = host.mac_address
    if host.os_name:
        asset.os_name = host.os_name
    if host.os_version:
        asset.os_version = host.os_version
    asset.external_data_json = json.dumps(_host_external_data(host), ensure_ascii=False)


def sync_inventory(
    db: Session,
    *,
    actor: User,
    request: Request | None = None,
) -> WaptSyncResponse:
    config = get_config(db)
    if not config.enabled:
        raise ValidationAppError("Activez la connexion WAPT avant de synchroniser.")
    started = time.perf_counter()
    hosts = fetch_hosts(config)
    created = 0
    updated = 0
    skipped = 0
    errors: list[str] = []
    for host in hosts:
        if not host.uuid and not host.hostname and not host.serial_number:
            skipped += 1
            continue
        try:
            with db.begin_nested():
                asset = _find_asset(db, host)
                if asset is None:
                    category = _category_for_host(db, host)
                    if category is None:
                        skipped += 1
                        continue
                    asset = Asset(
                        asset_tag=generate_asset_tag(db, category),
                        name=host.hostname or host.serial_number or "Poste WAPT",
                        category_id=category.id,
                        status="in_service",
                        condition="good",
                        is_critical=False,
                        external_id=host.uuid or None,
                    )
                    db.add(asset)
                    db.flush()
                    _apply_host(db, asset, host)
                    created += 1
                else:
                    _apply_host(db, asset, host)
                    updated += 1
        except Exception as exc:  # noqa: BLE001 - le poste est ignoré, la sync continue
            errors.append(f"{host.hostname or host.uuid}: {exc}")
            skipped += 1
    duration = round(time.perf_counter() - started, 2)
    write_audit(
        db,
        module="admin",
        action="wapt_inventory_synced",
        actor=actor,
        entity_type="wapt",
        entity_id="inventory",
        entity_label="Synchronisation WAPT",
        after={
            "total": len(hosts),
            "created": created,
            "updated": updated,
            "skipped": skipped,
            "errors": len(errors),
            "duration_seconds": duration,
        },
        request=request,
    )
    db.commit()
    return WaptSyncResponse(
        total=len(hosts),
        created=created,
        updated=updated,
        skipped=skipped,
        errors=errors[:50],
        duration_seconds=duration,
        synced_at=datetime.now(UTC),
    )


def test_connection(config: WaptConfig) -> WaptTestResponse:
    hosts = fetch_hosts(config)
    sample = [host.hostname or host.uuid for host in hosts[:5]]
    return WaptTestResponse(
        ok=True,
        message=f"Connexion WAPT réussie : {len(hosts)} poste(s) accessible(s).",
        host_count=len(hosts),
        sample_hosts=sample,
    )


def install_package(config: WaptConfig, uuid: str, package: str) -> WaptActionResponse:
    result = _request_json(
        config,
        "POST",
        config.install_path,
        uuid=uuid,
        payload={config.package_field: package},
    )
    return WaptActionResponse(
        message=f"Demande d'installation envoyée pour {package}.",
        result=result if isinstance(result, dict) else None,
    )


def uninstall_package(config: WaptConfig, uuid: str, package: str) -> WaptActionResponse:
    result = _request_json(
        config,
        "POST",
        config.uninstall_path,
        uuid=uuid,
        payload={config.package_field: package},
    )
    return WaptActionResponse(
        message=f"Demande de désinstallation envoyée pour {package}.",
        result=result if isinstance(result, dict) else None,
    )
