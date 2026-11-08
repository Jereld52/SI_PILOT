from datetime import UTC, datetime, timedelta
from uuid import uuid4


def test_reservation_lifecycle_and_conflicts(admin_client, csrf_headers):
    client, csrf = admin_client
    suffix = uuid4().hex[:8]

    equipment = client.post(
        "/api/v1/reservations/equipments",
        headers=csrf_headers(csrf),
        json={
            "name": f"Vidéoprojecteur test {suffix}",
            "category": "video",
            "description": "Matériel de test",
            "sort_order": 10,
        },
    )
    assert equipment.status_code == 201, equipment.text
    equipment_id = equipment.json()["id"]

    start = datetime.now(UTC) + timedelta(days=2, hours=9)
    end = start + timedelta(hours=2)
    created = client.post(
        "/api/v1/reservations",
        headers=csrf_headers(csrf),
        json={
            "equipment_id": equipment_id,
            "requester_name": "Agent Test",
            "requester_email": "agent.test@forets-parcnational.fr",
            "purpose": "Réunion de service",
            "start_at": start.isoformat(),
            "end_at": end.isoformat(),
        },
    )
    assert created.status_code == 201, created.text
    reservation = created.json()
    assert reservation["status"] == "confirmed"
    assert reservation["equipment"]["name"] == f"Vidéoprojecteur test {suffix}"
    reservation_id = reservation["id"]

    availability = client.get(
        "/api/v1/reservations/availability",
        params={
            "equipment_id": equipment_id,
            "start": (start + timedelta(minutes=15)).isoformat(),
            "end": (end - timedelta(minutes=15)).isoformat(),
        },
    )
    assert availability.status_code == 200, availability.text
    assert availability.json()["available"] is False
    assert availability.json()["conflict"]["id"] == reservation_id

    availability_excluded = client.get(
        "/api/v1/reservations/availability",
        params={
            "equipment_id": equipment_id,
            "start": start.isoformat(),
            "end": end.isoformat(),
            "exclude_id": reservation_id,
        },
    )
    assert availability_excluded.status_code == 200
    assert availability_excluded.json()["available"] is True

    availability_free = client.get(
        "/api/v1/reservations/availability",
        params={
            "equipment_id": equipment_id,
            "start": (end + timedelta(hours=1)).isoformat(),
            "end": (end + timedelta(hours=2)).isoformat(),
        },
    )
    assert availability_free.status_code == 200
    assert availability_free.json()["available"] is True

    overlap = client.post(
        "/api/v1/reservations",
        headers=csrf_headers(csrf),
        json={
            "equipment_id": equipment_id,
            "requester_name": "Autre agent",
            "purpose": "Créneau concurrent",
            "start_at": (start + timedelta(minutes=30)).isoformat(),
            "end_at": (end + timedelta(minutes=30)).isoformat(),
        },
    )
    assert overlap.status_code == 409

    listed = client.get(
        "/api/v1/reservations",
        params={
            "start": (start - timedelta(days=1)).isoformat(),
            "end": (end + timedelta(days=1)).isoformat(),
        },
    )
    assert listed.status_code == 200, listed.text
    assert any(row["id"] == reservation_id for row in listed.json())

    updated = client.patch(
        f"/api/v1/reservations/{reservation_id}",
        headers=csrf_headers(csrf),
        json={
            "purpose": "Réunion reportée",
            "start_at": (start + timedelta(hours=3)).isoformat(),
            "end_at": (end + timedelta(hours=3)).isoformat(),
        },
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["purpose"] == "Réunion reportée"

    cancelled = client.delete(
        f"/api/v1/reservations/{reservation_id}", headers=csrf_headers(csrf)
    )
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["status"] == "cancelled"

    replacement = client.post(
        "/api/v1/reservations",
        headers=csrf_headers(csrf),
        json={
            "equipment_id": equipment_id,
            "requester_name": "Agent Test",
            "purpose": "Nouveau créneau",
            "start_at": start.isoformat(),
            "end_at": end.isoformat(),
        },
    )
    assert replacement.status_code == 201, replacement.text

    archived = client.delete(
        f"/api/v1/reservations/equipments/{equipment_id}", headers=csrf_headers(csrf)
    )
    assert archived.status_code == 200
    assert archived.json()["is_active"] is False

    active = client.get("/api/v1/reservations/equipments")
    assert active.status_code == 200
    assert all(row["id"] != equipment_id for row in active.json())


def test_reservation_invalid_period(admin_client, csrf_headers):
    client, csrf = admin_client
    suffix = uuid4().hex[:8]
    equipment = client.post(
        "/api/v1/reservations/equipments",
        headers=csrf_headers(csrf),
        json={"name": f"Écran test {suffix}", "category": "screen"},
    )
    assert equipment.status_code == 201, equipment.text
    start = datetime.now(UTC) + timedelta(days=1)
    response = client.post(
        "/api/v1/reservations",
        headers=csrf_headers(csrf),
        json={
            "equipment_id": equipment.json()["id"],
            "purpose": "Créneau invalide",
            "start_at": start.isoformat(),
            "end_at": (start - timedelta(hours=1)).isoformat(),
        },
    )
    assert response.status_code == 422
