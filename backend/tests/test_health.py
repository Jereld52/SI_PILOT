def test_live(client):
    response = client.get("/api/v1/health/live")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_ready(client):
    response = client.get("/api/v1/health/ready")
    assert response.status_code == 200
    assert response.json()["database"] == "ok"


def test_version(client):
    response = client.get("/api/v1/version")
    assert response.status_code == 200
    assert response.json()["name"] == "SI PILOT"
