def test_dashboard_summary(admin_client):
    client, _ = admin_client
    response = client.get("/api/v1/dashboard/summary")
    assert response.status_code == 200
    assert len(response.json()["kpis"]) == 13


def test_dashboard_charts(admin_client):
    client, _ = admin_client
    response = client.get("/api/v1/dashboard/charts")
    assert response.status_code == 200
    assert isinstance(response.json()["series"], list)


def test_dashboard_alerts_and_activity(admin_client):
    client, _ = admin_client
    assert client.get("/api/v1/dashboard/alerts").status_code == 200
    assert client.get("/api/v1/dashboard/activity").status_code == 200


def test_search(admin_client):
    client, _ = admin_client
    response = client.get("/api/v1/search", params={"q": "admin"})
    assert response.status_code == 200
    assert response.json()["total"] >= 1
