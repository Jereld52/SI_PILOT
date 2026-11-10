import json

from app.db.session import SessionLocal
from app.models.setting import Setting


def test_backup_status_and_config_export(admin_client):
    client, _ = admin_client
    status = client.get("/api/v1/admin/backup/status")
    assert status.status_code == 200, status.text
    body = status.json()
    assert body["database_name"] == ""
    assert body["dialect"] == "sqlite"
    assert body["backup_directory"]

    exported = client.get("/api/v1/admin/backup/config")
    assert exported.status_code == 200, exported.text
    payload = json.loads(exported.content.decode("utf-8"))
    assert payload["format"] == "si-pilot-config"
    assert payload["secrets_mode"] == "encrypted"
    assert any(item["key"] == "app.name" for item in payload["settings"])


def test_config_import_restores_settings(admin_client, csrf_headers):
    client, csrf = admin_client
    exported = client.get("/api/v1/admin/backup/config")
    payload = json.loads(exported.content.decode("utf-8"))
    original = next(item for item in payload["settings"] if item["key"] == "app.name")

    with SessionLocal() as db:
        row = db.get(Setting, "app.name")
        assert row is not None
        row.value_json = json.dumps("Nom modifié pour le test")
        db.commit()

    imported = client.post(
        "/api/v1/admin/backup/config",
        headers=csrf_headers(csrf),
        files={
            "file": (
                "config.json",
                json.dumps(payload).encode("utf-8"),
                "application/json",
            )
        },
    )
    assert imported.status_code == 200, imported.text
    assert imported.json()["imported"] > 0

    with SessionLocal() as db:
        row = db.get(Setting, "app.name")
        assert row is not None
        assert row.value_json == original["value_json"]


def test_config_import_rejects_invalid_file(admin_client, csrf_headers):
    client, csrf = admin_client
    response = client.post(
        "/api/v1/admin/backup/config",
        headers=csrf_headers(csrf),
        files={"file": ("config.json", b"not-json", "application/json")},
    )
    assert response.status_code == 422
    assert "illisible" in response.json()["detail"]


def test_restore_requires_confirmation(admin_client, csrf_headers):
    client, csrf = admin_client
    response = client.post(
        "/api/v1/admin/backup/restore",
        headers=csrf_headers(csrf),
        data={"confirmation": "OUI"},
        files={"file": ("backup.dump", b"PGDMP-test", "application/octet-stream")},
    )
    assert response.status_code == 422
    assert "RESTAURER" in response.json()["detail"]


def test_full_backup_requires_postgresql(admin_client):
    client, _ = admin_client
    response = client.get("/api/v1/admin/backup/full")
    assert response.status_code == 422
    assert "PostgreSQL" in response.json()["detail"]
