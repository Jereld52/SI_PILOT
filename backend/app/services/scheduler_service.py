from __future__ import annotations

import json
import threading
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any

from app.core.config import settings as app_settings
from app.core.errors import ValidationAppError
from app.db.base import utcnow
from app.db.session import SessionLocal
from app.models.auth import Role, User
from app.models.automation import SchedulerRun
from app.models.infrastructure import MonitoringCheck, MonitoringResult
from app.schemas.scheduler import SchedulerConfigRead, SchedulerConfigUpdate, SchedulerRunRead
from app.services import (
    backup_service,
    branding_service,
    dashboard_service,
    email_service,
    monitoring_runner,
    notifications_service,
    settings_service,
    veeam_service,
)
from app.services.audit_service import write_audit
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from fastapi import Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

JOB_LABELS = {
    "checks": "Contrôles automatiques",
    "veeam": "Vérification Veeam",
    "backup": "Sauvegarde SI PILOT",
    "digest": "Digest quotidien",
    "report": "Rapport mensuel",
}
JOBS = tuple(JOB_LABELS)

_SCHEDULER: BackgroundScheduler | None = None
_LOCK = threading.Lock()
_CHECK_LOCK = threading.Lock()
_BACKUP_LOCK = threading.Lock()


@dataclass(frozen=True)
class SchedulerConfig:
    enabled: bool
    checks_interval_seconds: int
    veeam_enabled: bool
    veeam_hour: int
    veeam_minute: int
    veeam_stale_hours: int
    backup_enabled: bool
    backup_frequency: str
    backup_weekday: int
    backup_hour: int
    backup_minute: int
    backup_retention_days: int
    backup_keep_min: int
    digest_enabled: bool
    digest_hour: int
    digest_minute: int
    digest_emails: str
    report_enabled: bool
    report_day: int
    report_hour: int
    report_minute: int
    report_emails: str

    @property
    def digest_recipients(self) -> list[str]:
        raw = self.digest_emails.replace(";", ",").replace("\n", ",")
        return [item.strip() for item in raw.split(",") if item.strip() and "@" in item]

    @property
    def report_recipients(self) -> list[str]:
        raw = self.report_emails.replace(";", ",").replace("\n", ",")
        return [item.strip() for item in raw.split(",") if item.strip() and "@" in item]


def _value(db: Session, key: str, default: object) -> object:
    return settings_service.get_value(db, key, default)


def get_config(db: Session) -> SchedulerConfig:
    return SchedulerConfig(
        enabled=bool(_value(db, "scheduler.enabled", False)),
        checks_interval_seconds=int(str(_value(db, "scheduler.checks_interval_seconds", 60))),
        veeam_enabled=bool(_value(db, "scheduler.veeam_enabled", True)),
        veeam_hour=int(str(_value(db, "scheduler.veeam_hour", 6))),
        veeam_minute=int(str(_value(db, "scheduler.veeam_minute", 0))),
        veeam_stale_hours=int(str(_value(db, "scheduler.veeam_stale_hours", 48))),
        backup_enabled=bool(_value(db, "scheduler.backup_enabled", True)),
        backup_frequency=str(_value(db, "scheduler.backup_frequency", "daily")),
        backup_weekday=int(str(_value(db, "scheduler.backup_weekday", 0))),
        backup_hour=int(str(_value(db, "scheduler.backup_hour", 2))),
        backup_minute=int(str(_value(db, "scheduler.backup_minute", 0))),
        backup_retention_days=int(str(_value(db, "scheduler.backup_retention_days", 30))),
        backup_keep_min=int(str(_value(db, "scheduler.backup_keep_min", 3))),
        digest_enabled=bool(_value(db, "scheduler.digest_enabled", True)),
        digest_hour=int(str(_value(db, "scheduler.digest_hour", 7))),
        digest_minute=int(str(_value(db, "scheduler.digest_minute", 30))),
        digest_emails=str(_value(db, "scheduler.digest_emails", "") or ""),
        report_enabled=bool(_value(db, "scheduler.report_enabled", True)),
        report_day=int(str(_value(db, "scheduler.report_day", 1))),
        report_hour=int(str(_value(db, "scheduler.report_hour", 8))),
        report_minute=int(str(_value(db, "scheduler.report_minute", 0))),
        report_emails=str(_value(db, "scheduler.report_emails", "") or ""),
    )


def get_settings(db: Session) -> SchedulerConfigRead:
    config = get_config(db)
    smtp = email_service.get_settings(db)
    return SchedulerConfigRead(
        enabled=config.enabled,
        checks_interval_seconds=config.checks_interval_seconds,
        veeam_enabled=config.veeam_enabled,
        veeam_hour=config.veeam_hour,
        veeam_minute=config.veeam_minute,
        veeam_stale_hours=config.veeam_stale_hours,
        backup_enabled=config.backup_enabled,
        backup_frequency=config.backup_frequency,  # type: ignore[arg-type]
        backup_weekday=config.backup_weekday,
        backup_hour=config.backup_hour,
        backup_minute=config.backup_minute,
        backup_retention_days=config.backup_retention_days,
        backup_keep_min=config.backup_keep_min,
        digest_enabled=config.digest_enabled,
        digest_hour=config.digest_hour,
        digest_minute=config.digest_minute,
        digest_emails=config.digest_emails,
        report_enabled=config.report_enabled,
        report_day=config.report_day,
        report_hour=config.report_hour,
        report_minute=config.report_minute,
        report_emails=config.report_emails,
        smtp_configured=bool(smtp.configured and smtp.email_enabled),
    )


def update_settings(
    db: Session,
    payload: SchedulerConfigUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> SchedulerConfigRead:
    before = get_settings(db).model_dump()
    values = payload.model_dump()
    for key, value in values.items():
        settings_service.set_value(db, f"scheduler.{key}", value, category="scheduler")
    write_audit(
        db,
        module="admin",
        action="scheduler_settings_updated",
        actor=actor,
        entity_type="setting",
        entity_id="scheduler",
        entity_label="Veille et planification",
        before=before,
        after=payload.model_dump(),
        request=request,
    )
    db.commit()
    reconfigure(db)
    return get_settings(db)


def _as_aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return _as_aware(parsed)


def run_read(run: SchedulerRun) -> SchedulerRunRead:
    details: dict[str, Any] | None = None
    if run.details_json:
        try:
            parsed = json.loads(run.details_json)
            details = parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            details = None
    return SchedulerRunRead(
        id=str(run.id),
        job=run.job,
        trigger=run.trigger,
        started_at=run.started_at,
        finished_at=run.finished_at,
        status=run.status,
        summary=run.summary,
        details=details,
        duration_ms=run.duration_ms,
    )


def list_runs(db: Session, *, limit: int = 30) -> list[SchedulerRunRead]:
    rows = db.scalars(
        select(SchedulerRun).order_by(SchedulerRun.started_at.desc()).limit(limit)
    ).all()
    return [run_read(row) for row in rows]


def _start_run(db: Session, job: str, trigger: str) -> SchedulerRun:
    run = SchedulerRun(job=job, trigger=trigger, started_at=utcnow(), status="running")
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def _finish_run(
    db: Session,
    run: SchedulerRun,
    *,
    status: str,
    summary: str,
    details: dict[str, Any] | None = None,
) -> SchedulerRun:
    run.status = status
    run.summary = summary[:2000]
    run.finished_at = utcnow()
    started_at = _as_aware(run.started_at) or run.finished_at
    run.duration_ms = max(
        int((run.finished_at - started_at).total_seconds() * 1000), 0
    )
    if details is not None:
        run.details_json = json.dumps(details, ensure_ascii=False, default=str)[:20000]
    db.commit()
    db.refresh(run)
    return run


def _admin_users(db: Session) -> list[User]:
    return list(
        db.scalars(
            select(User)
            .join(Role, User.role_id == Role.id)
            .where(Role.code == "admin", User.is_active.is_(True))
        ).all()
    )


def _notify_admins(
    db: Session,
    *,
    title: str,
    body: str,
    severity: str,
    link: str | None = None,
) -> None:
    users = _admin_users(db)
    for user in users:
        notifications_service.create_notification(
            db,
            user_id=user.id,
            type="monitoring",
            title=title,
            body=body,
            severity=severity,
            link=link,
        )
    if users:
        db.commit()


def _due_checks(db: Session, *, force: bool) -> list[MonitoringCheck]:
    checks = db.scalars(
        select(MonitoringCheck)
        .where(
            MonitoringCheck.is_enabled.is_(True),
            MonitoringCheck.authorized_at.is_not(None),
        )
        .order_by(MonitoringCheck.infra_id)
    ).all()
    now = utcnow()
    due: list[MonitoringCheck] = []
    for check in checks:
        last = db.scalar(
            select(func.max(MonitoringResult.checked_at)).where(
                MonitoringResult.check_id == check.id
            )
        )
        last_at = _as_aware(last)
        if (
            not force
            and last_at is not None
            and now - last_at < timedelta(seconds=check.interval_seconds)
        ):
            continue
        due.append(check)
    return due


def _run_checks(
    db: Session,
    checks: list[MonitoringCheck],
    *,
    trigger: str,
) -> SchedulerRun:
    run = _start_run(db, "checks", trigger)
    rows: list[dict[str, Any]] = []
    up = down = unknown = 0
    try:
        for check in checks:
            previous = db.scalar(
                select(MonitoringResult)
                .where(MonitoringResult.check_id == check.id)
                .order_by(MonitoringResult.checked_at.desc())
                .limit(1)
            )
            try:
                outcome = monitoring_runner.execute(check)
            except Exception as exc:  # noqa: BLE001 - un contrôle ne doit pas bloquer les autres
                outcome = monitoring_runner.CheckOutcome(
                    "unknown", None, f"Erreur du contrôle : {exc}"
                )
            db.add(
                MonitoringResult(
                    check_id=check.id,
                    checked_at=utcnow(),
                    status=outcome.status,
                    latency_ms=outcome.latency_ms,
                    message=outcome.message[:2000],
                )
            )
            db.commit()
            if outcome.status == "up":
                up += 1
            elif outcome.status == "down":
                down += 1
            else:
                unknown += 1
            if previous is not None and previous.status != outcome.status:
                label = check.infra_name or str(check.infra_id)
                if outcome.status == "down":
                    _notify_admins(
                        db,
                        title=f"Contrôle en échec : {label}",
                        body=f"{check.check_type.upper()} — {outcome.message}",
                        severity="warning",
                        link="/infrastructure",
                    )
                elif previous.status == "down" and outcome.status == "up":
                    _notify_admins(
                        db,
                        title=f"Contrôle rétabli : {label}",
                        body=f"{check.check_type.upper()} — {outcome.message}",
                        severity="success",
                        link="/infrastructure",
                    )
            rows.append(
                {
                    "check_id": str(check.id),
                    "infrastructure": check.infra_name,
                    "type": check.check_type,
                    "status": outcome.status,
                    "latency_ms": outcome.latency_ms,
                    "message": outcome.message,
                }
            )
    except Exception:
        _finish_run(
            db,
            run,
            status="error",
            summary="Erreur pendant l'exécution des contrôles.",
            details={"checks": rows},
        )
        raise
    status = "warning" if down else "success"
    summary = (
        f"{len(rows)} contrôle(s) exécuté(s) : {up} OK, {down} en échec, "
        f"{unknown} inconnu(s)."
    )
    return _finish_run(
        db,
        run,
        status=status,
        summary=summary,
        details={"checks": rows},
    )


def run_due_checks(db: Session | None = None) -> SchedulerRun | None:
    if not _CHECK_LOCK.acquire(blocking=False):
        return None
    owns_session = db is None
    session = db or SessionLocal()
    try:
        checks = _due_checks(session, force=False)
        if not checks:
            return None
        return _run_checks(session, checks, trigger="schedule")
    except Exception:  # noqa: BLE001 - le thread du planificateur ne doit pas mourir
        session.rollback()
        raise
    finally:
        if owns_session:
            session.close()
        _CHECK_LOCK.release()


def veeam_alerts(
    db: Session, config: SchedulerConfig
) -> tuple[Any, list[dict[str, str]]]:
    overview = veeam_service.get_overview(db, force=True)
    alerts: list[dict[str, str]] = []
    now = utcnow()
    for job in overview.jobs:
        if job.disabled:
            continue
        result = job.last_result.lower()
        if result == "failed":
            alerts.append(
                {
                    "severity": "danger",
                    "title": job.name,
                    "detail": job.last_message or "Dernier job en échec.",
                }
            )
        elif result == "warning":
            alerts.append(
                {
                    "severity": "warning",
                    "title": job.name,
                    "detail": job.last_message or "Dernier job en avertissement.",
                }
            )
        last = _parse_dt(job.last_session_at)
        if job.last_session_at is None or (
            last is not None
            and now - last > timedelta(hours=config.veeam_stale_hours)
        ):
            alerts.append(
                {
                    "severity": "warning",
                    "title": f"{job.name} — sauvegarde ancienne",
                    "detail": (
                        "Aucune session enregistrée."
                        if job.last_session_at is None
                        else f"Dernière session : {job.last_session_at}."
                    ),
                }
            )
    for repository in overview.repositories:
        if repository.free_percent is None:
            continue
        if repository.free_percent < 10:
            alerts.append(
                {
                    "severity": "danger",
                    "title": f"Dépôt {repository.name}",
                    "detail": f"Espace libre critique : {repository.free_percent} %.",
                }
            )
        elif repository.free_percent < 15:
            alerts.append(
                {
                    "severity": "warning",
                    "title": f"Dépôt {repository.name}",
                    "detail": f"Espace libre faible : {repository.free_percent} %.",
                }
            )
    for note in overview.notes:
        alerts.append({"severity": "info", "title": "Veeam", "detail": note})
    return overview, alerts


def _run_veeam(db: Session, config: SchedulerConfig) -> tuple[str, str, dict[str, Any]]:
    try:
        overview, alerts = veeam_alerts(db, config)
    except ValidationAppError as exc:
        return "skipped", f"Veeam non disponible : {exc}", {}
    except Exception as exc:  # noqa: BLE001 - l'erreur est enregistrée dans le journal
        return "error", f"Vérification Veeam impossible : {exc}", {}
    status = "warning" if alerts else "success"
    summary = (
        f"{len(alerts)} alerte(s) Veeam."
        if alerts
        else "Sauvegardes Veeam conformes."
    )
    details = {
        "alerts": alerts,
        "jobs": len(overview.jobs),
        "repositories": len(overview.repositories),
        "generated_at": overview.generated_at.isoformat(),
    }
    return status, summary, details


def _run_backup(db: Session, config: SchedulerConfig) -> tuple[str, str, dict[str, Any]]:
    if not _BACKUP_LOCK.acquire(blocking=False):
        return "skipped", "Une sauvegarde SI PILOT est déjà en cours.", {}
    try:
        archive = backup_service.create_full_archive(db, include_uploads=True)
        deleted = backup_service.prune_backups(
            retention_days=config.backup_retention_days,
            keep_min=config.backup_keep_min,
        )
    finally:
        _BACKUP_LOCK.release()
    size_mb = round(archive.stat().st_size / (1024 * 1024), 1)
    summary = f"Archive {archive.name} créée ({size_mb} Mo)."
    if deleted:
        summary += f" {len(deleted)} ancienne(s) sauvegarde(s) supprimée(s)."
    return (
        "success",
        summary,
        {
            "archive": str(archive),
            "size_mb": size_mb,
            "deleted": deleted,
        },
    )


def checks_snapshot(db: Session) -> dict[str, Any]:
    checks = db.scalars(
        select(MonitoringCheck)
        .where(
            MonitoringCheck.is_enabled.is_(True),
            MonitoringCheck.authorized_at.is_not(None),
        )
        .order_by(MonitoringCheck.infra_id)
    ).all()
    down: list[dict[str, Any]] = []
    up = 0
    unknown = 0
    for check in checks:
        last = db.scalar(
            select(MonitoringResult)
            .where(MonitoringResult.check_id == check.id)
            .order_by(MonitoringResult.checked_at.desc())
            .limit(1)
        )
        if last is None:
            continue
        if last.status == "up":
            up += 1
        elif last.status == "down":
            down.append(
                {
                    "infrastructure": check.infra_name,
                    "type": check.check_type,
                    "message": last.message,
                    "checked_at": last.checked_at.isoformat(),
                }
            )
        else:
            unknown += 1
    return {"up": up, "down": down, "unknown": unknown, "total": len(checks)}


def _digest_body(db: Session, config: SchedulerConfig) -> dict[str, Any]:
    checks = checks_snapshot(db)
    try:
        _, veeam_alerts = veeam_alerts(db, config)
        veeam_note = (
            f"{len(veeam_alerts)} alerte(s)."
            if veeam_alerts
            else "Aucune alerte."
        )
    except Exception as exc:  # noqa: BLE001
        veeam_alerts = []
        veeam_note = f"Indisponible : {exc}"
    backup = backup_service.status(db)
    dashboard_alerts = dashboard_service.get_alerts(db).items[:10]
    return {
        "checks": checks,
        "veeam_alerts": veeam_alerts,
        "veeam_note": veeam_note,
        "backup": backup,
        "alerts": [
            {
                "severity": item.severity,
                "title": item.title,
                "detail": item.detail,
            }
            for item in dashboard_alerts
        ],
    }


def _format_backup_line(backup: Any) -> str:
    last_at = _as_aware(backup.last_backup_at)
    if last_at is None:
        return "Aucune sauvegarde SI PILOT enregistrée."
    age = utcnow() - last_at
    hours = int(age.total_seconds() // 3600) if age else 0
    size = f"{round((backup.last_backup_size or 0) / (1024 * 1024), 1)} Mo"
    return (
        f"Dernière archive : {backup.last_backup_name} ({size}), "
        f"il y a {hours} h."
    )


def _digest_text(data: dict[str, Any]) -> str:
    now = datetime.now(UTC)
    lines = [
        f"SI PILOT — Veille du {now:%d/%m/%Y}",
        "",
        "CONTRÔLES AUTOMATIQUES",
        (
            f"{data['checks']['up']} OK, {len(data['checks']['down'])} en échec, "
            f"{data['checks']['unknown']} inconnu(s) sur {data['checks']['total']} contrôle(s)."
        ),
    ]
    for item in data["checks"]["down"]:
        lines.append(
            f"- {item['infrastructure'] or 'Équipement'} [{item['type']}] : {item['message']}"
        )
    lines.extend(["", "SAUVEGARDES VEEAM", data["veeam_note"]])
    for item in data["veeam_alerts"][:10]:
        lines.append(f"- {item['title']} : {item['detail']}")
    lines.extend(["", "SAUVEGARDE SI PILOT", _format_backup_line(data["backup"])])
    lines.extend(["", "ALERTES DU TABLEAU DE BORD"])
    if data["alerts"]:
        for item in data["alerts"]:
            lines.append(f"- [{item['severity']}] {item['title']} — {item['detail']}")
    else:
        lines.append("- Aucune alerte.")
    lines.extend(
        [
            "",
            "Ce message est généré automatiquement par SI PILOT.",
            "Ouvrir l'application : /",
        ]
    )
    return "\n".join(lines)


def _run_digest(
    db: Session, config: SchedulerConfig
) -> tuple[str, str, dict[str, Any]]:
    smtp = email_service.get_settings(db)
    if not (smtp.configured and smtp.email_enabled):
        return "skipped", "SMTP non configuré ou envoi désactivé.", {}
    recipients = config.digest_recipients
    if not recipients:
        recipients = [user.email for user in _admin_users(db) if user.email]
    if not recipients:
        return "skipped", "Aucun destinataire pour le digest.", {}
    data = _digest_body(db, config)
    subject = f"[SI PILOT] Veille du {datetime.now(UTC):%d/%m/%Y}"
    body = _digest_text(data)
    sent = 0
    failed: list[str] = []
    for recipient in recipients:
        if email_service.send_email(db, recipient, subject, body):
            sent += 1
        else:
            failed.append(recipient)
    db.commit()
    status = "success" if sent and not failed else "warning" if sent else "error"
    summary = f"Digest envoyé à {sent} destinataire(s)."
    if failed:
        summary += f" Échec pour : {', '.join(failed)}."
    return status, summary, {"recipients": recipients, "sent": sent, "failed": failed}


def _run_report(
    db: Session, config: SchedulerConfig
) -> tuple[str, str, dict[str, Any]]:
    smtp = email_service.get_settings(db)
    if not (smtp.configured and smtp.email_enabled):
        return "skipped", "SMTP non configuré ou envoi désactivé.", {}
    recipients = config.report_recipients or config.digest_recipients
    if not recipients:
        recipients = [user.email for user in _admin_users(db) if user.email]
    if not recipients:
        return "skipped", "Aucun destinataire pour le rapport mensuel.", {}

    today = date.today()
    previous_end = today.replace(day=1) - timedelta(days=1)
    start = previous_end.replace(day=1)
    from app.exports import operations as operations_export

    content = operations_export.operations_report_pdf(
        db,
        start=start,
        end=previous_end,
        branding=branding_service.get_pdf_branding(db),
    )
    filename = f"rapport-exploitation-{start.strftime('%Y-%m')}.pdf"
    subject = f"[SI PILOT] Rapport d'exploitation — {start.strftime('%m/%Y')}"
    body = (
        f"Bonjour,\n\nVeuillez trouver ci-joint le rapport d'exploitation de "
        f"{start.strftime('%m/%Y')}.\n\n"
        "Il regroupe les indicateurs du parc et du support, les interventions, "
        "la sécurité, la supervision, les sauvegardes, les contrats, les projets "
        "et le budget.\n\n"
        "Ce message est généré automatiquement par SI PILOT."
    )
    sent = 0
    failed: list[str] = []
    for recipient in recipients:
        if email_service.send_email(
            db,
            recipient,
            subject,
            body,
            attachments=[(filename, content, "application/pdf")],
        ):
            sent += 1
        else:
            failed.append(recipient)
    db.commit()
    status = "success" if sent and not failed else "warning" if sent else "error"
    summary = f"Rapport mensuel envoyé à {sent} destinataire(s)."
    if failed:
        summary += f" Échec pour : {', '.join(failed)}."
    return (
        status,
        summary,
        {
            "period": f"{start.isoformat()} → {previous_end.isoformat()}",
            "filename": filename,
            "size_bytes": len(content),
            "recipients": recipients,
            "sent": sent,
            "failed": failed,
        },
    )


def execute_job(
    db: Session,
    job: str,
    *,
    trigger: str = "manual",
    force: bool = False,
) -> SchedulerRun:
    if job not in JOBS:
        raise ValidationAppError("Tâche de veille inconnue.")
    config = get_config(db)
    if job == "checks":
        if not _CHECK_LOCK.acquire(blocking=False):
            run = _start_run(db, job, trigger)
            return _finish_run(
                db,
                run,
                status="skipped",
                summary="Une exécution des contrôles est déjà en cours.",
            )
        try:
            checks = _due_checks(db, force=force)
            if not checks:
                run = _start_run(db, job, trigger)
                return _finish_run(
                    db,
                    run,
                    status="success",
                    summary="Aucun contrôle à exécuter.",
                )
            return _run_checks(db, checks, trigger=trigger)
        finally:
            _CHECK_LOCK.release()

    run = _start_run(db, job, trigger)
    try:
        if job == "veeam":
            status, summary, details = _run_veeam(db, config)
        elif job == "backup":
            status, summary, details = _run_backup(db, config)
        elif job == "digest":
            status, summary, details = _run_digest(db, config)
        else:
            status, summary, details = _run_report(db, config)
    except Exception as exc:  # noqa: BLE001 - l'erreur est conservée dans le journal
        _finish_run(
            db,
            run,
            status="error",
            summary=f"{JOB_LABELS[job]} en erreur : {exc}",
        )
        return run
    return _finish_run(db, run, status=status, summary=summary, details=details)


def _scheduled_job(job: str) -> None:
    session = SessionLocal()
    try:
        execute_job(session, job, trigger="schedule")
    except Exception:  # noqa: BLE001 - le thread du planificateur doit rester actif
        session.rollback()
    finally:
        session.close()


def _scheduled_checks() -> None:
    session = SessionLocal()
    try:
        run_due_checks(session)
    except Exception:  # noqa: BLE001
        session.rollback()
    finally:
        session.close()


def _create_scheduler() -> BackgroundScheduler:
    return BackgroundScheduler(
        job_defaults={
            "coalesce": True,
            "max_instances": 1,
            "misfire_grace_time": 300,
        }
    )


def stop() -> None:
    global _SCHEDULER
    with _LOCK:
        if _SCHEDULER is not None and _SCHEDULER.running:
            _SCHEDULER.shutdown(wait=False)
        _SCHEDULER = None


def reconfigure(db: Session | None = None) -> None:
    if app_settings.app_env == "test":
        return
    global _SCHEDULER
    owns_session = db is None
    session = db or SessionLocal()
    try:
        config = get_config(session)
    except Exception:  # noqa: BLE001 - au démarrage la base peut être indisponible
        if owns_session:
            session.close()
        return
    finally:
        if owns_session:
            session.close()

    with _LOCK:
        if not config.enabled:
            if _SCHEDULER is not None and _SCHEDULER.running:
                _SCHEDULER.shutdown(wait=False)
            _SCHEDULER = None
            return
        if _SCHEDULER is None:
            _SCHEDULER = _create_scheduler()
        scheduler = _SCHEDULER
        scheduler.remove_all_jobs()
        scheduler.add_job(
            _scheduled_checks,
            IntervalTrigger(seconds=config.checks_interval_seconds),
            id="checks",
            replace_existing=True,
        )
        if config.veeam_enabled:
            scheduler.add_job(
                _scheduled_job,
                CronTrigger(hour=config.veeam_hour, minute=config.veeam_minute),
                args=["veeam"],
                id="veeam",
                replace_existing=True,
            )
        if config.backup_enabled:
            kwargs: dict[str, Any] = {
                "hour": config.backup_hour,
                "minute": config.backup_minute,
            }
            if config.backup_frequency == "weekly":
                kwargs["day_of_week"] = config.backup_weekday
            scheduler.add_job(
                _scheduled_job,
                CronTrigger(**kwargs),
                args=["backup"],
                id="backup",
                replace_existing=True,
            )
        if config.digest_enabled:
            scheduler.add_job(
                _scheduled_job,
                CronTrigger(hour=config.digest_hour, minute=config.digest_minute),
                args=["digest"],
                id="digest",
                replace_existing=True,
            )
        if config.report_enabled:
            scheduler.add_job(
                _scheduled_job,
                CronTrigger(
                    day=config.report_day,
                    hour=config.report_hour,
                    minute=config.report_minute,
                ),
                args=["report"],
                id="report",
                replace_existing=True,
            )
        if not scheduler.running:
            scheduler.start()
