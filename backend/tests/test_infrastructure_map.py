from uuid import uuid4


def test_infrastructure_map_overview(admin_client, csrf_headers):
    client, csrf = admin_client
    suffix = uuid4().hex[:8]

    first = client.post(
        "/api/v1/infrastructure/equipments",
        headers=csrf_headers(csrf),
        json={
            "name": f"Serveur carte {suffix}",
            "type": "server",
            "criticality": "critical",
            "status": "active",
        },
    )
    assert first.status_code == 201, first.text
    first_id = first.json()["id"]

    second = client.post(
        "/api/v1/infrastructure/equipments",
        headers=csrf_headers(csrf),
        json={
            "name": f"Switch carte {suffix}",
            "type": "switch",
            "criticality": "high",
            "status": "maintenance",
        },
    )
    assert second.status_code == 201, second.text
    second_id = second.json()["id"]

    positioned = client.patch(
        f"/api/v1/infrastructure/equipments/{first_id}",
        headers=csrf_headers(csrf),
        json={"map_x": 24.5, "map_y": 62.0},
    )
    assert positioned.status_code == 200, positioned.text
    assert positioned.json()["map_x"] == 24.5
    assert positioned.json()["map_y"] == 62.0

    dependency = client.post(
        "/api/v1/infrastructure/dependencies",
        headers=csrf_headers(csrf),
        json={
            "source_id": first_id,
            "target_id": second_id,
            "dependency_type": "network",
            "description": "Lien carte",
        },
    )
    assert dependency.status_code == 201, dependency.text

    check = client.post(
        "/api/v1/infrastructure/checks",
        headers=csrf_headers(csrf),
        json={
            "infra_id": first_id,
            "check_type": "ping",
            "interval_seconds": 300,
            "is_enabled": False,
        },
    )
    assert check.status_code == 201, check.text

    response = client.get("/api/v1/infrastructure/map")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["summary"]["equipments_total"] >= 2
    assert body["summary"]["placed"] >= 1
    assert body["summary"]["unplaced"] >= 1
    assert body["summary"]["critical"] >= 1
    assert body["summary"]["maintenance"] >= 1
    assert body["summary"]["checks_total"] >= 1
    equipment = next(row for row in body["equipments"] if row["id"] == first_id)
    assert equipment["map_x"] == 24.5
    assert equipment["map_y"] == 62.0
    assert any(row["id"] == dependency.json()["id"] for row in body["dependencies"])
    assert any(row["id"] == check.json()["id"] for row in body["checks"])
    assert isinstance(body["locations"], list)
