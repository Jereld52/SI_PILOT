from uuid import uuid4


def test_network_share_crud_and_volume_check(admin_client, csrf_headers, tmp_path):
    client, csrf = admin_client
    suffix = uuid4().hex[:8]
    created = client.post(
        "/api/v1/network-shares",
        headers=csrf_headers(csrf),
        json={
            "name": f"Partage test {suffix}",
            "unc_path": str(tmp_path),
            "warning_percent": 99,
            "critical_percent": 0,
            "responsible": "Équipe informatique",
            "is_active": True,
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    share_id = body["id"]
    assert body["last_status"] == "unknown"

    checked = client.post(
        f"/api/v1/network-shares/{share_id}/check", headers=csrf_headers(csrf)
    )
    assert checked.status_code == 200, checked.text
    checked_body = checked.json()
    assert checked_body["last_status"] == "warning"
    assert checked_body["last_total_bytes"] and checked_body["last_total_bytes"] > 0
    assert checked_body["last_free_bytes"] is not None

    overview = client.get("/api/v1/network-shares/overview")
    assert overview.status_code == 200
    assert overview.json()["summary"]["total"] >= 1
    assert any(item["id"] == share_id for item in overview.json()["alerts"])

    updated = client.patch(
        f"/api/v1/network-shares/{share_id}",
        headers=csrf_headers(csrf),
        json={"name": f"Partage modifié {suffix}", "warning_percent": 95, "critical_percent": 90},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["name"] == f"Partage modifié {suffix}"

    archived = client.delete(
        f"/api/v1/network-shares/{share_id}", headers=csrf_headers(csrf)
    )
    assert archived.status_code == 200
    assert archived.json()["is_active"] is False

    active = client.get("/api/v1/network-shares")
    assert all(item["id"] != share_id for item in active.json())
    inactive = client.get("/api/v1/network-shares?include_inactive=true")
    assert any(item["id"] == share_id for item in inactive.json())


def test_network_share_rejects_invalid_thresholds(admin_client, csrf_headers, tmp_path):
    client, csrf = admin_client
    response = client.post(
        "/api/v1/network-shares",
        headers=csrf_headers(csrf),
        json={
            "name": "Seuils invalides",
            "unc_path": str(tmp_path),
            "warning_percent": 10,
            "critical_percent": 20,
        },
    )
    assert response.status_code == 422, response.text
