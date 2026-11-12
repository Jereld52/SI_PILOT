from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import httpx
from app.core.crypto import decrypt_secret, encrypt_secret
from app.core.errors import ValidationAppError
from app.models.auth import User
from app.models.setting import Setting
from app.schemas.veeam import (
    VeeamConfigRead,
    VeeamConfigUpdate,
    VeeamJobRead,
    VeeamOverview,
    VeeamRepositoryRead,
    VeeamSessionRead,
    VeeamTestResponse,
)
from app.services.audit_service import write_audit
from fastapi import Request
from sqlalchemy.orm import Session

CACHE_SECONDS = 60
_TOKEN_CACHE: dict[str, tuple[str, float]] = {}
_OVERVIEW_CACHE: dict[str, tuple[float, VeeamOverview]] = {}


@dataclass(frozen=True)
class VeeamConfig:
    enabled: bool
    base_url: str
    username: str
    password: str
    api_version: str
    verify_tls: bool
    timeout_seconds: int

    @property
    def configured(self) -> bool:
        return bool(self.base_url and self.username and self.password)


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
            category="veeam",
            is_secret=is_secret,
            description=description,
        )
        db.add(setting)
    setting.value_json = json.dumps(value, ensure_ascii=False)
    setting.is_secret = is_secret


def get_config(db: Session) -> VeeamConfig:
    encrypted = str(_value(db, "veeam.password_encrypted", "") or "")
    return VeeamConfig(
        enabled=bool(_value(db, "veeam.enabled", False)),
        base_url=str(_value(db, "veeam.base_url", "") or "").rstrip("/"),
        username=str(_value(db, "veeam.username", "") or ""),
        password=(decrypt_secret(encrypted) or "") if encrypted else "",
        api_version=str(_value(db, "veeam.api_version", "1.2-rev1") or "1.2-rev1"),
        verify_tls=bool(_value(db, "veeam.verify_tls", True)),
        timeout_seconds=int(str(_value(db, "veeam.timeout_seconds", 30) or 30)),
    )


def get_settings(db: Session) -> VeeamConfigRead:
    config = get_config(db)
    return VeeamConfigRead(
        enabled=config.enabled,
        base_url=config.base_url,
        username=config.username,
        api_version=config.api_version,
        verify_tls=config.verify_tls,
        timeout_seconds=config.timeout_seconds,
        password_set=bool(config.password),
        configured=config.configured,
    )


def update_settings(
    db: Session,
    payload: VeeamConfigUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> VeeamConfigRead:
    existing_password = str(_value(db, "veeam.password_encrypted", "") or "")
    if payload.enabled and not payload.base_url.strip():
        raise ValidationAppError("Renseignez l'URL de l'API Veeam pour l'activer.")
    if payload.enabled and not payload.username.strip():
        raise ValidationAppError("Renseignez l'identifiant du compte de service Veeam.")
    if payload.enabled and not payload.password and not existing_password:
        raise ValidationAppError("Renseignez le mot de passe du compte de service Veeam.")
    before = get_settings(db).model_dump()
    _set_value(db, "veeam.enabled", payload.enabled)
    _set_value(db, "veeam.base_url", payload.base_url.strip().rstrip("/"))
    _set_value(db, "veeam.username", payload.username.strip())
    _set_value(db, "veeam.api_version", payload.api_version.strip() or "1.2-rev1")
    _set_value(db, "veeam.verify_tls", payload.verify_tls)
    _set_value(db, "veeam.timeout_seconds", payload.timeout_seconds)
    if payload.password:
        _set_value(
            db,
            "veeam.password_encrypted",
            encrypt_secret(payload.password) or "",
            is_secret=True,
            description="Mot de passe Veeam, chiffré",
        )
    _OVERVIEW_CACHE.clear()
    _TOKEN_CACHE.clear()
    write_audit(
        db,
        module="admin",
        action="veeam_settings_updated",
        actor=actor,
        entity_type="setting",
        entity_id="veeam",
        entity_label="Configuration Veeam",
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


def _cache_key(config: VeeamConfig) -> str:
    material = f"{config.base_url}|{config.username}|{config.api_version}|{config.password}"
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def _invalidate(config: VeeamConfig) -> None:
    key = _cache_key(config)
    _TOKEN_CACHE.pop(key, None)
    _OVERVIEW_CACHE.pop(key, None)


def _token(config: VeeamConfig) -> str:
    if not config.configured:
        raise ValidationAppError(
            "La connexion Veeam n'est pas configurée. Renseignez l'URL, le compte et le mot de passe."
        )
    key = _cache_key(config)
    cached = _TOKEN_CACHE.get(key)
    if cached and cached[1] > time.time():
        return cached[0]
    try:
        with httpx.Client(
            timeout=config.timeout_seconds, verify=config.verify_tls, follow_redirects=True
        ) as client:
            response = client.post(
                f"{config.base_url}/api/oauth2/token",
                data={
                    "grant_type": "password",
                    "username": config.username,
                    "password": config.password,
                },
                headers={
                    "x-api-version": config.api_version,
                    "Accept": "application/json",
                },
            )
    except httpx.HTTPError as exc:
        raise ValidationAppError(f"Connexion Veeam impossible : {exc}") from exc
    if response.status_code >= 400:
        raise ValidationAppError(
            f"Authentification Veeam refusée ({response.status_code}) : "
            f"{response.text[:300].strip()}"
        )
    try:
        data = response.json()
    except ValueError as exc:
        raise ValidationAppError("Veeam a renvoyé une réponse non JSON.") from exc
    token = str(data.get("access_token") or "")
    if not token:
        raise ValidationAppError("Veeam n'a pas renvoyé de jeton d'accès.")
    expires_in = int(data.get("expires_in") or 900)
    _TOKEN_CACHE[key] = (token, time.time() + max(expires_in - 60, 30))
    return token


def _request(
    config: VeeamConfig,
    path: str,
    *,
    params: dict[str, Any] | None = None,
) -> Any:
    token = _token(config)
    headers = {
        "Authorization": f"Bearer {token}",
        "x-api-version": config.api_version,
        "Accept": "application/json",
    }
    try:
        with httpx.Client(
            timeout=config.timeout_seconds, verify=config.verify_tls, follow_redirects=True
        ) as client:
            response = client.get(f"{config.base_url}{path}", params=params, headers=headers)
            if response.status_code == 401:
                _invalidate(config)
                token = _token(config)
                headers["Authorization"] = f"Bearer {token}"
                response = client.get(f"{config.base_url}{path}", params=params, headers=headers)
    except httpx.HTTPError as exc:
        raise ValidationAppError(f"Connexion Veeam impossible : {exc}") from exc
    if response.status_code >= 400:
        raise ValidationAppError(
            f"Veeam a répondu {response.status_code} sur {path} : {response.text[:300].strip()}"
        )
    if not response.content:
        return {}
    try:
        return response.json()
    except ValueError as exc:
        raise ValidationAppError("Veeam a renvoyé une réponse non JSON.") from exc


def _list(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        data = payload.get("data")
        if isinstance(data, list):
            return [item for item in data if isinstance(item, dict)]
        for key in ("items", "result", "sessions", "jobs", "repositories"):
            value = payload.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
    return []


def _int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(float(str(value)))
    except (TypeError, ValueError):
        return None


def _parse_dt(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def _duration(start: Any, end: Any) -> int | None:
    start_dt = _parse_dt(start)
    end_dt = _parse_dt(end)
    if start_dt and end_dt:
        return max(int((end_dt - start_dt).total_seconds()), 0)
    return None


def _session_result(raw: dict[str, Any]) -> tuple[str, str | None]:
    result = raw.get("result")
    if isinstance(result, dict):
        value = result.get("result") or result.get("status") or ""
        message = result.get("message")
        return str(value), str(message) if message else None
    if result:
        return str(result), None
    state = raw.get("state")
    return str(state or ""), None


def _job_read(raw: dict[str, Any]) -> VeeamJobRead:
    job_id = str(raw.get("id") or "")
    return VeeamJobRead(
        id=job_id,
        name=str(raw.get("name") or raw.get("description") or job_id),
        type=str(raw.get("type") or raw.get("jobType") or ""),
        disabled=bool(raw.get("isDisabled") or raw.get("disabled") or False),
    )


def _session_read(raw: dict[str, Any], job_names: dict[str, str]) -> VeeamSessionRead:
    result, message = _session_result(raw)
    job_id = str(raw.get("jobId") or "")
    return VeeamSessionRead(
        id=str(raw.get("id") or ""),
        name=str(raw.get("name") or ""),
        job_id=job_id,
        job_name=job_names.get(job_id, ""),
        session_type=str(raw.get("sessionType") or ""),
        state=str(raw.get("state") or ""),
        result=result,
        message=message,
        creation_time=raw.get("creationTime"),
        end_time=raw.get("endTime"),
        duration_seconds=_duration(raw.get("creationTime"), raw.get("endTime")),
        progress_percent=_int(raw.get("progressPercent")),
    )


def fetch_jobs(config: VeeamConfig) -> list[VeeamJobRead]:
    payload = _request(config, "/api/v1/jobs", params={"limit": 200})
    return sorted(
        (_job_read(raw) for raw in _list(payload)),
        key=lambda job: job.name.lower(),
    )


def fetch_sessions(
    config: VeeamConfig, job_names: dict[str, str] | None = None
) -> list[VeeamSessionRead]:
    payload = _request(
        config,
        "/api/v1/sessions",
        params={"limit": 200, "orderColumn": "CreationTime", "orderAsc": "false"},
    )
    names = job_names or {}
    return [_session_read(raw, names) for raw in _list(payload)]


def fetch_repositories(config: VeeamConfig) -> list[VeeamRepositoryRead]:
    payload = _request(
        config,
        "/api/v1/backupInfrastructure/repositories",
        params={"limit": 100},
    )
    states: dict[str, dict[str, Any]] = {}
    try:
        state_payload = _request(config, "/api/v1/backupInfrastructure/repositories/states")
        states = {str(item.get("id") or ""): item for item in _list(state_payload)}
    except ValidationAppError:
        states = {}
    repositories: list[VeeamRepositoryRead] = []
    for raw in _list(payload):
        repo_id = str(raw.get("id") or "")
        state = states.get(repo_id, {})
        capacity = _int(state.get("capacity") or raw.get("capacity"))
        free = _int(state.get("freeSpace") or raw.get("freeSpace"))
        used = _int(state.get("usedSpace") or raw.get("usedSpace"))
        free_percent = round(free / capacity * 100, 1) if capacity and free is not None else None
        repositories.append(
            VeeamRepositoryRead(
                id=repo_id,
                name=str(raw.get("name") or raw.get("description") or repo_id),
                type=str(raw.get("type") or ""),
                host=str(raw.get("host") or ""),
                path=str(raw.get("path") or ""),
                state=str(state.get("state") or raw.get("state") or ""),
                capacity_bytes=capacity,
                free_bytes=free,
                used_bytes=used,
                free_percent=free_percent,
            )
        )
    return sorted(repositories, key=lambda repo: repo.name.lower())


def _overview(config: VeeamConfig) -> VeeamOverview:
    jobs = fetch_jobs(config)
    job_names = {job.id: job.name for job in jobs}
    sessions = fetch_sessions(config, job_names)
    notes: list[str] = []
    try:
        repositories = fetch_repositories(config)
    except ValidationAppError as exc:
        repositories = []
        notes.append(f"Dépôts non lisibles : {exc}")
    sessions_sorted = sorted(
        sessions,
        key=lambda session: session.creation_time or "",
        reverse=True,
    )
    latest: dict[str, VeeamSessionRead] = {}
    for session in sessions_sorted:
        if session.job_id and session.job_id not in latest:
            latest[session.job_id] = session
    jobs_with_status: list[VeeamJobRead] = []
    for job in jobs:
        last = latest.get(job.id)
        jobs_with_status.append(
            job.model_copy(
                update={
                    "last_result": last.result if last else "",
                    "last_session_at": last.creation_time if last else None,
                    "last_duration_seconds": last.duration_seconds if last else None,
                    "last_message": last.message if last else None,
                }
            )
        )
    failed = sum(1 for job in jobs_with_status if job.last_result.lower() == "failed")
    warnings = sum(1 for job in jobs_with_status if job.last_result.lower() == "warning")
    success = sum(1 for job in jobs_with_status if job.last_result.lower() == "success")
    failed_sessions = sum(1 for session in sessions if session.result.lower() == "failed")
    summary: dict[str, int | float | str | None] = {
        "jobs": len(jobs),
        "failed_jobs": failed,
        "warning_jobs": warnings,
        "success_jobs": success,
        "sessions": len(sessions),
        "failed_sessions": failed_sessions,
        "repositories": len(repositories),
        "last_session_at": sessions_sorted[0].creation_time if sessions_sorted else None,
    }
    return VeeamOverview(
        generated_at=datetime.now(UTC),
        summary=summary,
        jobs=jobs_with_status,
        sessions=sessions_sorted[:25],
        repositories=repositories,
        notes=notes,
    )


def get_overview(db: Session, *, force: bool = False) -> VeeamOverview:
    config = get_config(db)
    if not config.enabled:
        raise ValidationAppError("La connexion Veeam est désactivée.")
    if not config.configured:
        raise ValidationAppError(
            "La connexion Veeam n'est pas configurée. Renseignez l'URL, le compte et le mot de passe."
        )
    key = _cache_key(config)
    cached = _OVERVIEW_CACHE.get(key)
    if cached and not force and cached[0] > time.time():
        return cached[1]
    overview = _overview(config)
    _OVERVIEW_CACHE[key] = (time.time() + CACHE_SECONDS, overview)
    return overview


def test_connection(
    db: Session, *, actor: User, request: Request | None = None
) -> VeeamTestResponse:
    config = get_config(db)
    if not config.enabled:
        raise ValidationAppError("Activez la connexion Veeam avant de tester.")
    jobs = fetch_jobs(config)
    _OVERVIEW_CACHE.clear()
    write_audit(
        db,
        module="admin",
        action="veeam_connection_tested",
        actor=actor,
        entity_type="veeam",
        entity_id="connection",
        entity_label=config.base_url,
        after={"jobs": len(jobs)},
        request=request,
    )
    db.commit()
    return VeeamTestResponse(
        ok=True,
        message=f"Connexion Veeam réussie : {len(jobs)} job(s) accessible(s).",
        job_count=len(jobs),
    )
