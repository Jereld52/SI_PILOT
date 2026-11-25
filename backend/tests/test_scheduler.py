import socket
from datetime import UTC, datetime
from types import SimpleNamespace

from app.db.base import utcnow
from app.db.session import SessionLocal
from app.models.infrastructure import InfraEquipment, MonitoringCheck, MonitoringResult
from app.schemas.dashboard import DashboardAlerts
from app.schemas.mail import SmtpSettingsRead
from app.schemas.veeam import VeeamJobRead, VeeamOverview, VeeamRepositoryRead
from app.services import (
    email_service,
    monitoring_runner,
    scheduler_service,
    settings_service,
    veeam_service,
)
from sqlalchemy import func, select

CONFIG_PAYLOAD = {
    "enabled": True,
    "checks_interval_seconds": 60,
    "veeam_enabled": True,
    "veeam_hour": 6,
    "veeam_minute": 0,
    "veeam_stale_hours": 48,
    "backup_enabled": True,
    "backup_frequency": "daily",
    "backup_weekday": 0,
    "backup_hour": 2,
    "backup_minute": 0,
    "backup_retention_days": 30,
    "backup_keep_min": 3,
    "digest_enabled": True,
    "digest_hour": 7,
    "digest_minute": 30,
    "digest_emails": "",
}


def test_scheduler_config_and_checks_run(admin_client, csrf_headers, monkeypatch):
    client, csrf = admin_client

    initial = client.get("/api/v1/admin/scheduler/config")
    assert initial.status_code == 200, initial.text
    assert "enabled" in initial.json()

    updated = client.put(
        "/api/v1/admin/scheduler/config",
        headers=csrf_headers(csrf),
        json=CONFIG_PAYLOAD,
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["enabled"] is True
    assert updated.json()["digest_emails"] == ""

    with SessionLocal() as db:
        equipment = InfraEquipment(
            name="SRV-SCHEDULER-TEST",
            type="server",
            ip_address="192.0.2.240",
            criticality="medium",
            status="active",
        )
        db.add(equipment)
        db.flush()
        check = MonitoringCheck(
            infra_id=equipment.id,
            check_type="ping",
            config_json=None,
            interval_seconds=60,
            is_enabled=True,
            requires_authorization=True,
            authorized_at=utcnow(),
        )
        db.add(check)
        db.commit()
        check_id = check.id
        equipment_id = equipment.id

    monkeypatch.setattr(
        monitoring_runner,
        "execute",
        lambda check: monitoring_runner.CheckOutcome("up", 12, "Ping OK"),
    )

    response = client.post(
        "/api/v1/admin/scheduler/run/checks", headers=csrf_headers(csrf)
    )
    assert response.status_code == 200, response.text
    run = response.json()["run"]
    assert run["job"] == "checks"
    assert run["status"] == "success"
    assert run["details"]["checks"][0]["status"] == "up"

    with SessionLocal() as db:
        count = db.scalar(
            select(func.count())
            .select_from(MonitoringResult)
            .where(MonitoringResult.check_id == check_id)
        )
        assert count == 1
    runs = client.get("/api/v1/admin/scheduler/runs")
    assert runs.status_code == 200
    assert any(item["job"] == "checks" for item in runs.json())

    with SessionLocal() as db:
        db.delete(db.get(MonitoringCheck, check_id))
        db.delete(db.get(InfraEquipment, equipment_id))
        db.commit()

    client.put(
        "/api/v1/admin/scheduler/config",
        headers=csrf_headers(csrf),
        json={**CONFIG_PAYLOAD, "enabled": False},
    )


def test_scheduler_veeam_run(admin_client, csrf_headers, monkeypatch):
    client, csrf = admin_client
    overview = VeeamOverview(
        generated_at=datetime.now(UTC),
        summary={"jobs": 1, "failed_jobs": 1},
        jobs=[
            VeeamJobRead(
                id="job-1",
                name="Sauvegarde serveurs",
                type="Backup",
                last_result="Failed",
                last_session_at="2026-11-24T20:00:00+00:00",
                last_message="Accès au dépôt refusé",
            )
        ],
        sessions=[],
        repositories=[
            VeeamRepositoryRead(
                id="repo-1",
                name="Dépôt principal",
                free_percent=8.0,
            )
        ],
        notes=[],
    )
    monkeypatch.setattr(veeam_service, "get_overview", lambda db, force=False: overview)

    response = client.post(
        "/api/v1/admin/scheduler/run/veeam", headers=csrf_headers(csrf)
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["run"]["status"] == "warning"
    assert len(body["run"]["details"]["alerts"]) >= 2


def test_scheduler_backup_run(admin_client, csrf_headers, monkeypatch, tmp_path):
    client, csrf = admin_client
    archive = tmp_path / "si-pilot-full-test.zip"
    archive.write_bytes(b"fake archive")
    monkeypatch.setattr(
        scheduler_service.backup_service,
        "create_full_archive",
        lambda db, include_uploads=True: archive,
    )
    monkeypatch.setattr(
        scheduler_service.backup_service,
        "prune_backups",
        lambda retention_days, keep_min=3: [],
    )

    response = client.post(
        "/api/v1/admin/scheduler/run/backup", headers=csrf_headers(csrf)
    )
    assert response.status_code == 200, response.text
    run = response.json()["run"]
    assert run["status"] == "success"
    assert run["details"]["archive"] == str(archive)


def test_scheduler_digest_run(admin_client, csrf_headers, monkeypatch):
    client, csrf = admin_client
    sent: list[str] = []
    monkeypatch.setattr(
        email_service,
        "get_settings",
        lambda db: SmtpSettingsRead(
            host="smtp.example.org",
            from_email="si-pilot@example.org",
            email_enabled=True,
            configured=True,
            password_set=True,
        ),
    )
    monkeypatch.setattr(
        scheduler_service,
        "veeam_alerts",
        lambda db, config: (None, []),
    )
    monkeypatch.setattr(
        scheduler_service.dashboard_service,
        "get_alerts",
        lambda db: DashboardAlerts(items=[], generated_at=datetime.now(UTC)),
    )

    def fake_send(db, to_email, subject, body, force=False):
        sent.append(to_email)
        return True

    monkeypatch.setattr(email_service, "send_email", fake_send)

    updated = client.put(
        "/api/v1/admin/scheduler/config",
        headers=csrf_headers(csrf),
        json={
            **CONFIG_PAYLOAD,
            "digest_emails": "veille@example.org, direction@example.org",
        },
    )
    assert updated.status_code == 200, updated.text

    response = client.post(
        "/api/v1/admin/scheduler/run/digest", headers=csrf_headers(csrf)
    )
    assert response.status_code == 200, response.text
    run = response.json()["run"]
    assert run["status"] == "success"
    assert sent == ["veille@example.org", "direction@example.org"]

    client.put(
        "/api/v1/admin/scheduler/config",
        headers=csrf_headers(csrf),
        json={**CONFIG_PAYLOAD, "enabled": False},
    )


def test_scheduler_report_run(admin_client, csrf_headers, monkeypatch):
    client, csrf = admin_client
    sent: list[tuple[str, str, list[tuple[str, bytes, str]] | None]] = []
    monkeypatch.setattr(
        email_service,
        "get_settings",
        lambda db: SmtpSettingsRead(
            host="smtp.example.org",
            from_email="si-pilot@example.org",
            email_enabled=True,
            configured=True,
            password_set=True,
        ),
    )

    def fake_send(db, to_email, subject, body, force=False, attachments=None):
        sent.append((to_email, subject, attachments))
        return True

    monkeypatch.setattr(email_service, "send_email", fake_send)

    updated = client.put(
        "/api/v1/admin/scheduler/config",
        headers=csrf_headers(csrf),
        json={
            **CONFIG_PAYLOAD,
            "report_enabled": True,
            "report_day": 1,
            "report_hour": 8,
            "report_minute": 0,
            "report_emails": "rapport@example.org",
        },
    )
    assert updated.status_code == 200, updated.text

    response = client.post(
        "/api/v1/admin/scheduler/run/report", headers=csrf_headers(csrf)
    )
    assert response.status_code == 200, response.text
    run = response.json()["run"]
    assert run["status"] == "success"
    assert len(sent) == 1
    recipient, subject, attachments = sent[0]
    assert recipient == "rapport@example.org"
    assert "Rapport d'exploitation" in subject
    assert attachments is not None
    assert attachments[0][0].endswith(".pdf")
    assert attachments[0][1].startswith(b"%PDF")

    client.put(
        "/api/v1/admin/scheduler/config",
        headers=csrf_headers(csrf),
        json={**CONFIG_PAYLOAD, "enabled": False},
    )


def test_scheduler_registers_jobs(monkeypatch):
    monkeypatch.setattr(
        scheduler_service, "app_settings", SimpleNamespace(app_env="production")
    )
    with SessionLocal() as db:
        settings_service.set_value(db, "scheduler.enabled", True, category="scheduler")
        db.commit()
        scheduler_service.reconfigure(db)
        scheduler = scheduler_service._SCHEDULER
        assert scheduler is not None
        assert {job.id for job in scheduler.get_jobs()} == {
            "checks",
            "veeam",
            "backup",
            "digest",
            "report",
        }
        scheduler_service.stop()
        settings_service.set_value(db, "scheduler.enabled", False, category="scheduler")
        db.commit()


def test_monitoring_runner_tcp_and_oid():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
        server.bind(("127.0.0.1", 0))
        server.listen(1)
        port = server.getsockname()[1]
        check = SimpleNamespace(
            check_type="tcp",
            config_json=f'{{"port": {port}}}',
            infra=SimpleNamespace(ip_address="127.0.0.1"),
        )
        outcome = monitoring_runner.execute(check)  # type: ignore[arg-type]
    assert outcome.status == "up"
    assert outcome.latency_ms is not None

    assert monitoring_runner._encode_oid("1.3.6.1.2.1.1.3.0").hex() == (
        "2b06010201010300"
    )

    unsupported = SimpleNamespace(
        check_type="agent",
        config_json=None,
        infra=SimpleNamespace(ip_address="127.0.0.1"),
    )
    result = monitoring_runner.execute(unsupported)  # type: ignore[arg-type]
    assert result.status == "unknown"
