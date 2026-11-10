from datetime import UTC, datetime
from uuid import UUID, uuid4

from app.db.session import SessionLocal
from app.models.assets import AssetSoftware
from app.services import wapt_service


def test_parse_host_packages_marks_updates_and_ignores_pending_installs():
    rows = [
        {
            "package": "demo-update",
            "version": "1.0",
            "install_status": "NEED-UPGRADE",
        },
        {
            "package": "demo-update",
            "version": "2.0",
            "install_status": "NEED-INSTALL",
        },
        {
            "package": "demo-ready",
            "version": "3.0",
            "install_status": "OK",
        },
        {
            "package": "demo-removed",
            "version": "4.0",
            "install_status": "removed",
        },
    ]
    catalog = {"demo-update": "2.0", "demo-ready": "3.0", "demo-removed": "4.0"}

    packages = wapt_service._parse_host_packages(rows, catalog)

    assert [item.name for item in packages] == ["demo-ready", "demo-update"]
    update = next(item for item in packages if item.name == "demo-update")
    assert update.update_available is True
    assert update.available_version == "2.0"
    ready = next(item for item in packages if item.name == "demo-ready")
    assert ready.update_available is False
    assert ready.available_version == ""


def test_wapt_software_overview_and_alert(admin_client, csrf_headers):
    client, csrf = admin_client
    suffix = uuid4().hex[:8]
    package_name = f"demo-software-{suffix}"
    categories = client.get("/api/v1/asset-categories").json()
    desktop = next(item for item in categories if item["code"] == "desktop")

    created = client.post(
        "/api/v1/assets",
        headers=csrf_headers(csrf),
        json={
            "name": f"Poste WAPT {suffix}",
            "external_id": str(uuid4()),
            "category_id": desktop["id"],
            "status": "in_service",
        },
    )
    assert created.status_code == 201, created.text
    asset_id = created.json()["id"]

    with SessionLocal() as db:
        db.add(
            AssetSoftware(
                asset_id=UUID(asset_id),
                package_name=package_name,
                package_version="1.0",
                install_status="need-upgrade",
                update_available=True,
                available_version="2.0",
                source="wapt",
                synced_at=datetime.now(UTC),
            )
        )
        db.commit()

    overview = client.get("/api/v1/wapt/overview")
    assert overview.status_code == 200, overview.text
    body = overview.json()
    item = next(entry for entry in body["items"] if entry["name"] == package_name)
    assert item["update_count"] == 1
    assert item["available_version"] == "2.0"
    assert item["hosts"][0]["asset_id"] == asset_id

    asset_software = client.get(f"/api/v1/wapt/assets/{asset_id}/software")
    assert asset_software.status_code == 200, asset_software.text
    packages = asset_software.json()["packages"]
    assert packages[0]["name"] == package_name
    assert packages[0]["update_available"] is True

    alerts = client.get("/api/v1/dashboard/alerts")
    assert alerts.status_code == 200, alerts.text
    assert any(
        entry["title"] == package_name and entry["category"] == "software"
        for entry in alerts.json()["items"]
    )

    listed = client.get("/api/v1/wapt/assets")
    assert listed.status_code == 200, listed.text
    assert any(entry["id"] == asset_id for entry in listed.json())
