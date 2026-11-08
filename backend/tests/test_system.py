def test_diagnostics_requires_admin_and_returns_checks(admin_client):
    client, _ = admin_client
    response = client.get("/api/v1/admin/diagnostics")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["application"]["name"]
    assert body["database"]["status"] == "ok"
    assert "migration_current" in body["database"]
    assert body["database"]["migration_head"]
    assert isinstance(body["security"]["checks"], list)
    assert body["security"]["checks"]
    assert "counts" in body
    assert "warnings" in body


def test_about_returns_version_and_migration(admin_client):
    client, _ = admin_client
    response = client.get("/api/v1/admin/about")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["version"]
    assert body["migration_head"]
    if body["migration_current"] is not None:
        assert body["migration_current"] == body["migration_head"]
    assert body["update_steps"]


def test_diagnostics_requires_permission(client):
    response = client.get("/api/v1/admin/diagnostics")
    assert response.status_code == 401
