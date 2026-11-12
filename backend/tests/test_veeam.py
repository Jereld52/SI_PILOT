from app.schemas.veeam import (
    VeeamJobRead,
    VeeamRepositoryRead,
    VeeamSessionRead,
)
from app.services import veeam_service


def _sample_data():
    jobs = [
        VeeamJobRead(id="job-1", name="Sauvegarde serveurs", type="Backup"),
        VeeamJobRead(id="job-2", name="Sauvegarde fichiers", type="Backup"),
    ]
    sessions = [
        VeeamSessionRead(
            id="session-1",
            name="Sauvegarde serveurs",
            job_id="job-1",
            job_name="Sauvegarde serveurs",
            session_type="BackupJob",
            state="Stopped",
            result="Success",
            creation_time="2026-11-11T20:00:00+00:00",
            end_time="2026-11-11T20:25:00+00:00",
            duration_seconds=1500,
        ),
        VeeamSessionRead(
            id="session-2",
            name="Sauvegarde fichiers",
            job_id="job-2",
            job_name="Sauvegarde fichiers",
            session_type="BackupJob",
            state="Stopped",
            result="Failed",
            message="Accès au dépôt refusé",
            creation_time="2026-11-11T21:00:00+00:00",
            end_time="2026-11-11T21:02:00+00:00",
            duration_seconds=120,
        ),
    ]
    repositories = [
        VeeamRepositoryRead(
            id="repo-1",
            name="Dépôt principal",
            type="Windows",
            capacity_bytes=1000,
            free_bytes=100,
            free_percent=10.0,
        )
    ]
    return jobs, sessions, repositories


def test_veeam_settings_and_overview(admin_client, csrf_headers, monkeypatch):
    client, csrf = admin_client

    initial = client.get("/api/v1/admin/veeam/config")
    assert initial.status_code == 200, initial.text
    assert initial.json()["configured"] is False

    disabled = client.get("/api/v1/veeam/overview")
    assert disabled.status_code == 422
    assert "désactivée" in disabled.json()["detail"]

    missing_password = client.put(
        "/api/v1/admin/veeam/config",
        headers=csrf_headers(csrf),
        json={
            "enabled": True,
            "base_url": "https://veeam.example.org:9419",
            "username": "svc-sipilot",
        },
    )
    assert missing_password.status_code == 422

    saved = client.put(
        "/api/v1/admin/veeam/config",
        headers=csrf_headers(csrf),
        json={
            "enabled": True,
            "base_url": "https://veeam.example.org:9419",
            "username": "svc-sipilot",
            "password": "Secret2026!",
            "api_version": "1.2-rev1",
            "verify_tls": False,
            "timeout_seconds": 15,
        },
    )
    assert saved.status_code == 200, saved.text
    body = saved.json()
    assert body["enabled"] is True
    assert body["configured"] is True
    assert body["password_set"] is True
    assert "password" not in body

    jobs, sessions, repositories = _sample_data()
    monkeypatch.setattr(veeam_service, "fetch_jobs", lambda config: jobs)
    monkeypatch.setattr(veeam_service, "fetch_sessions", lambda config, job_names=None: sessions)
    monkeypatch.setattr(veeam_service, "fetch_repositories", lambda config: repositories)
    veeam_service._OVERVIEW_CACHE.clear()

    overview = client.get("/api/v1/veeam/overview")
    assert overview.status_code == 200, overview.text
    payload = overview.json()
    assert payload["summary"]["jobs"] == 2
    assert payload["summary"]["failed_jobs"] == 1
    assert payload["summary"]["repositories"] == 1
    assert payload["jobs"][0]["last_result"] in {"Success", "Failed"}
    assert payload["repositories"][0]["free_percent"] == 10.0

    tested = client.post("/api/v1/admin/veeam/test", headers=csrf_headers(csrf))
    assert tested.status_code == 200, tested.text
    assert tested.json()["job_count"] == 2

    reset = client.put(
        "/api/v1/admin/veeam/config",
        headers=csrf_headers(csrf),
        json={
            "enabled": False,
            "base_url": "",
            "username": "",
            "api_version": "1.2-rev1",
            "verify_tls": True,
            "timeout_seconds": 30,
        },
    )
    assert reset.status_code == 200, reset.text
    assert reset.json()["enabled"] is False
