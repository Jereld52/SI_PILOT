import uuid


def _desktop_category(client):
    response = client.get("/api/v1/asset-categories")
    assert response.status_code == 200, response.text
    return next(item for item in response.json() if item["code"] == "desktop")


def test_asset_naming_settings_and_generation(admin_client, csrf_headers):
    client, csrf = admin_client
    category = _desktop_category(client)

    initial = client.get("/api/v1/admin/settings/asset-naming")
    assert initial.status_code == 200, initial.text
    assert "preview" in initial.json()

    updated = client.put(
        "/api/v1/admin/settings/asset-naming",
        headers=csrf_headers(csrf),
        json={
            "enabled": True,
            "scheme": "prefix_seq",
            "prefix": "TST",
            "sequence_mode": "global",
            "sequence_length": 3,
            "template": "{PREFIX}-{SEQ:4}",
        },
    )
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert body["enabled"] is True
    assert body["preview"].startswith("TST-")

    preview = client.get(
        "/api/v1/assets/next-tag", params={"category_id": category["id"]}
    )
    assert preview.status_code == 200, preview.text
    assert preview.json()["tag"].startswith("TST-")

    suffix = uuid.uuid4().hex[:8]
    created = client.post(
        "/api/v1/assets",
        headers=csrf_headers(csrf),
        json={
            "name": f"Poste nommage {suffix}",
            "category_id": category["id"],
            "status": "in_stock",
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["asset_tag"].startswith("TST-")

    invalid = client.put(
        "/api/v1/admin/settings/asset-naming",
        headers=csrf_headers(csrf),
        json={
            "enabled": True,
            "scheme": "custom",
            "prefix": "TST",
            "sequence_mode": "year",
            "sequence_length": 4,
            "template": "SANS-COMPTEUR",
        },
    )
    assert invalid.status_code == 422, invalid.text

    restored = client.put(
        "/api/v1/admin/settings/asset-naming",
        headers=csrf_headers(csrf),
        json={
            "enabled": False,
            "scheme": "prefix_seq",
            "prefix": "TST",
            "sequence_mode": "year",
            "sequence_length": 4,
            "template": "{PREFIX}-{SEQ:4}",
        },
    )
    assert restored.status_code == 200, restored.text
