from uuid import uuid4


def test_infrastructure_inventory_and_monitoring(admin_client, csrf_headers):
    client, csrf = admin_client
    suffix = uuid4().hex[:8]

    server = client.post(
        "/api/v1/infrastructure/equipments",
        headers=csrf_headers(csrf),
        json={
            "name": f"Serveur {suffix}",
            "type": "server",
            "ip_address": f"10.20.{int(suffix[:2], 16)}.{int(suffix[2:4], 16)}",
            "role": "Contrôleur de domaine",
            "criticality": "critical",
            "status": "active",
        },
    )
    assert server.status_code == 201, server.text
    server_body = server.json()

    duplicate_ip = client.post(
        "/api/v1/infrastructure/equipments",
        headers=csrf_headers(csrf),
        json={
            "name": f"Doublon {suffix}",
            "type": "server",
            "ip_address": server_body["ip_address"],
        },
    )
    assert duplicate_ip.status_code == 409

    switch = client.post(
        "/api/v1/infrastructure/equipments",
        headers=csrf_headers(csrf),
        json={"name": f"Switch {suffix}", "type": "switch", "criticality": "high"},
    )
    assert switch.status_code == 201, switch.text

    dependency = client.post(
        "/api/v1/infrastructure/dependencies",
        headers=csrf_headers(csrf),
        json={
            "source_id": server_body["id"],
            "target_id": switch.json()["id"],
            "dependency_type": "network",
            "description": "Lien 10 Gb",
        },
    )
    assert dependency.status_code == 201, dependency.text
    assert dependency.json()["source_name"] == server_body["name"]

    duplicate_dependency = client.post(
        "/api/v1/infrastructure/dependencies",
        headers=csrf_headers(csrf),
        json={
            "source_id": server_body["id"],
            "target_id": switch.json()["id"],
            "dependency_type": "network",
        },
    )
    assert duplicate_dependency.status_code == 409

    check = client.post(
        "/api/v1/infrastructure/checks",
        headers=csrf_headers(csrf),
        json={
            "infra_id": server_body["id"],
            "check_type": "ping",
            "interval_seconds": 120,
            "is_enabled": False,
        },
    )
    assert check.status_code == 201, check.text
    check_body = check.json()
    assert check_body["authorized_at"] is None

    blocked_enable = client.patch(
        f"/api/v1/infrastructure/checks/{check_body['id']}",
        headers=csrf_headers(csrf),
        json={"is_enabled": True},
    )
    assert blocked_enable.status_code == 422

    authorized = client.post(
        f"/api/v1/infrastructure/checks/{check_body['id']}/authorize",
        headers=csrf_headers(csrf),
    )
    assert authorized.status_code == 200
    assert authorized.json()["authorized_at"] is not None

    enabled = client.patch(
        f"/api/v1/infrastructure/checks/{check_body['id']}",
        headers=csrf_headers(csrf),
        json={"is_enabled": True},
    )
    assert enabled.status_code == 200
    assert enabled.json()["is_enabled"] is True

    result = client.post(
        f"/api/v1/infrastructure/checks/{check_body['id']}/results",
        headers=csrf_headers(csrf),
        json={"status": "up", "latency_ms": 12, "message": "Réponse correcte"},
    )
    assert result.status_code == 201, result.text

    results = client.get(f"/api/v1/infrastructure/checks/{check_body['id']}/results")
    assert results.status_code == 200
    assert len(results.json()) == 1
    assert results.json()[0]["status"] == "up"

    refreshed = client.get(f"/api/v1/infrastructure/equipments/{server_body['id']}")
    assert refreshed.json()["last_check_at"] is not None

    listed = client.get("/api/v1/infrastructure/equipments", params={"q": suffix})
    assert listed.status_code == 200
    assert len(listed.json()) == 2

    deleted_dependency = client.delete(
        f"/api/v1/infrastructure/dependencies/{dependency.json()['id']}",
        headers=csrf_headers(csrf),
    )
    assert deleted_dependency.status_code == 204

    deleted_check = client.delete(
        f"/api/v1/infrastructure/checks/{check_body['id']}",
        headers=csrf_headers(csrf),
    )
    assert deleted_check.status_code == 204

    archived = client.delete(
        f"/api/v1/infrastructure/equipments/{server_body['id']}",
        headers=csrf_headers(csrf),
    )
    assert archived.status_code == 200
    assert archived.json()["status"] == "retired"
