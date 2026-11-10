def test_module_settings_lifecycle(admin_client, csrf_headers):
    client, csrf = admin_client

    initial = client.get("/api/v1/admin/modules")
    assert initial.status_code == 200, initial.text
    body = initial.json()
    assert body["disabled"] == []
    assert len(body["modules"]) >= 20
    assert all(module["enabled"] for module in body["modules"])

    updated = client.put(
        "/api/v1/admin/modules",
        headers=csrf_headers(csrf),
        json={"disabled": ["budget", "rgpd"]},
    )
    assert updated.status_code == 200, updated.text
    assert set(updated.json()["disabled"]) == {"budget", "rgpd"}
    disabled = {
        module["key"] for module in updated.json()["modules"] if not module["enabled"]
    }
    assert disabled == {"budget", "rgpd"}

    status = client.get("/api/v1/modules/status")
    assert status.status_code == 200, status.text
    assert set(status.json()["disabled"]) == {"budget", "rgpd"}

    restored = client.put(
        "/api/v1/admin/modules",
        headers=csrf_headers(csrf),
        json={"disabled": []},
    )
    assert restored.status_code == 200, restored.text
    assert restored.json()["disabled"] == []


def test_module_settings_reject_unknown_key(admin_client, csrf_headers):
    client, csrf = admin_client
    response = client.put(
        "/api/v1/admin/modules",
        headers=csrf_headers(csrf),
        json={"disabled": ["module-inconnu"]},
    )
    assert response.status_code == 422
    assert "inconnu" in response.json()["detail"].lower()
