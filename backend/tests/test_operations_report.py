def test_operations_report_endpoint(admin_client):
    client, _ = admin_client

    response = client.get("/api/v1/exports/operations")
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF")
    assert "attachment" in response.headers["content-disposition"]

    explicit = client.get(
        "/api/v1/exports/operations",
        params={"start": "2026-11-01", "end": "2026-11-30"},
    )
    assert explicit.status_code == 200, explicit.text
    assert explicit.content.startswith(b"%PDF")
    assert "rapport-exploitation-2026-11.pdf" in explicit.headers["content-disposition"]
