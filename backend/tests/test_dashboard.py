def test_dashboard_summary(admin_client):
    client, _ = admin_client
    response = client.get("/api/v1/dashboard/summary")
    assert response.status_code == 200
    assert len(response.json()["kpis"]) == 13


def test_dashboard_today(admin_client):
    client, _ = admin_client
    response = client.get("/api/v1/dashboard/today")
    assert response.status_code == 200, response.text
    body = response.json()
    assert isinstance(body["total"], int)
    assert isinstance(body["urgent"], int)
    assert isinstance(body["sections"], list)
    for section in body["sections"]:
        assert section["key"]
        assert section["label"]
        for item in section["items"]:
            assert item["title"]
            assert item["href"]
            assert item["severity"] in {"danger", "warning", "info", "success"}


def test_dashboard_cockpit(admin_client):
    client, _ = admin_client
    response = client.get("/api/v1/dashboard/cockpit")
    assert response.status_code == 200
    body = response.json()
    assert len(body["modules"]) >= 8
    assert {module["key"] for module in body["modules"]} >= {
        "assets",
        "tickets",
        "contracts",
        "budget",
        "projects",
        "security",
        "rgpd",
        "calendar",
    }
    assert isinstance(body["deadlines"], list)


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
