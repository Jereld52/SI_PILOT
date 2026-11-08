def test_dashboard_tiles_preferences(admin_client, csrf_headers):
    client, csrf = admin_client
    initial = client.get("/api/v1/dashboard/tiles")
    assert initial.status_code == 200, initial.text

    updated = client.put(
        "/api/v1/dashboard/tiles",
        headers=csrf_headers(csrf),
        json={"tiles": ["assets", "tickets", "stock"]},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["tiles"] == ["assets", "tickets", "stock"]

    reloaded = client.get("/api/v1/dashboard/tiles")
    assert reloaded.status_code == 200
    assert reloaded.json()["tiles"] == ["assets", "tickets", "stock"]
