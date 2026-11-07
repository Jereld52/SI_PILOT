def test_settings_list_and_update(admin_client, csrf_headers):
    client, csrf = admin_client
    response = client.get("/api/v1/admin/settings")
    assert response.status_code == 200
    assert len(response.json()) >= 13

    response = client.put(
        "/api/v1/admin/settings/dashboard.renewal_threshold",
        headers=csrf_headers(csrf),
        json={"value": 75},
    )
    assert response.status_code == 200
    assert response.json()["value"] == 75


def test_audit_contains_events(admin_client):
    client, _ = admin_client
    response = client.get("/api/v1/audit-logs", params={"page_size": 5})
    assert response.status_code == 200
    assert response.json()["total"] > 0
    summary = client.get("/api/v1/audit-logs/summary")
    assert summary.status_code == 200
    assert summary.json()["total"] > 0
