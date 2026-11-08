from uuid import uuid4

from app.schemas.wapt import WaptActionResponse, WaptHostRead
from app.services import wapt_service


def test_wapt_config_and_sync(admin_client, csrf_headers, monkeypatch):
    client, csrf = admin_client
    suffix = uuid4().hex[:8]
    host_uuid = str(uuid4())
    hostname = f"wapt-poste-{suffix}"

    initial = client.get("/api/v1/admin/wapt/config")
    assert initial.status_code == 200, initial.text

    updated = client.put(
        "/api/v1/admin/wapt/config",
        headers=csrf_headers(csrf),
        json={
            "enabled": True,
            "base_url": "https://wapt.example.test",
            "username": "wapt-admin",
            "password": "secret-wapt",
            "verify_tls": False,
            "hosts_path": "/api/v1/hosts",
            "host_detail_path": "/api/v1/hosts/{uuid}",
            "fetch_details": False,
            "packages_path": "/api/v1/packages",
            "host_packages_path": "/api/v1/hosts/{uuid}/packages",
            "install_path": "/api/v1/hosts/{uuid}/install",
            "uninstall_path": "/api/v1/hosts/{uuid}/uninstall",
            "package_field": "package",
            "timeout_seconds": 15,
        },
    )
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert body["configured"] is True
    assert body["password_set"] is True
    assert "secret-wapt" not in updated.text

    def fake_hosts(config):  # noqa: ANN001, ARG001
        return [
            WaptHostRead(
                uuid=host_uuid,
                hostname=hostname,
                connected=True,
                last_seen="2026-11-08T10:00:00Z",
                os_name="Windows",
                os_version="11",
                ip_address="192.0.2.42",
                serial_number=f"SN-{suffix}",
                manufacturer="Dell",
                model="Latitude",
                last_user="agent.test",
                raw={
                    "uuid": host_uuid,
                    "hostname": hostname,
                    "connected": True,
                },
            )
        ]

    monkeypatch.setattr(wapt_service, "fetch_hosts", fake_hosts)
    synced = client.post("/api/v1/admin/wapt/sync", headers=csrf_headers(csrf))
    assert synced.status_code == 200, synced.text
    result = synced.json()
    assert result["total"] == 1
    assert result["created"] == 1
    assert result["updated"] == 0

    assets = client.get("/api/v1/assets", params={"q": hostname})
    assert assets.status_code == 200
    matches = [row for row in assets.json()["items"] if row["hostname"] == hostname]
    assert len(matches) == 1
    asset_id = matches[0]["id"]
    detail = client.get(f"/api/v1/assets/{asset_id}")
    assert detail.status_code == 200
    assert detail.json()["external_id"] == host_uuid
    assert detail.json()["wapt_reachable"] == "OK"
    assert detail.json()["external_data"]["uuid"] == host_uuid

    def fake_install(config, uuid, package):  # noqa: ANN001, ARG001
        return WaptActionResponse(message=f"Installation demandée : {package}")

    monkeypatch.setattr(wapt_service, "install_package", fake_install)
    installed = client.post(
        f"/api/v1/admin/wapt/hosts/{host_uuid}/install",
        headers=csrf_headers(csrf),
        json={"package": "tis-firefox"},
    )
    assert installed.status_code == 200, installed.text
    assert "tis-firefox" in installed.json()["message"]
