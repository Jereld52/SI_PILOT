from datetime import UTC, datetime, timedelta
from uuid import uuid4


def _create_equipment(client, csrf_headers, csrf, name: str) -> str:
    response = client.post(
        "/api/v1/reservations/equipments",
        headers=csrf_headers(csrf),
        json={"name": name, "category": "video"},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def test_recurring_unavailability_checkout_and_ics(admin_client, csrf_headers):
    client, csrf = admin_client
    suffix = uuid4().hex[:8]
    equipment_id = _create_equipment(client, csrf_headers, csrf, f"Projecteur avancé {suffix}")
    start = datetime(2027, 3, 2, 9, 0, tzinfo=UTC)

    recurring = client.post(
        "/api/v1/reservations",
        headers=csrf_headers(csrf),
        json={
            "equipment_id": equipment_id,
            "requester_name": "Agent Récurrent",
            "purpose": "Atelier hebdomadaire",
            "start_at": start.isoformat(),
            "end_at": (start + timedelta(hours=2)).isoformat(),
            "recurrence": "weekly",
            "recurrence_until": "2027-03-16",
        },
    )
    assert recurring.status_code == 201, recurring.text
    assert recurring.json()["kind"] == "reservation"
    reservation_id = recurring.json()["id"]

    listed = client.get(
        "/api/v1/reservations",
        params={
            "start": "2027-03-01T00:00:00Z",
            "end": "2027-03-31T23:59:59Z",
        },
    )
    assert listed.status_code == 200
    assert (
        len(
            [
                row
                for row in listed.json()
                if row["equipment_id"] == equipment_id
                and row["purpose"] == "Atelier hebdomadaire"
            ]
        )
        == 3
    )

    checked_out = client.post(
        f"/api/v1/reservations/{reservation_id}/checkout",
        headers=csrf_headers(csrf),
    )
    assert checked_out.status_code == 200, checked_out.text
    assert checked_out.json()["status"] == "checked_out"

    returned = client.post(
        f"/api/v1/reservations/{reservation_id}/return",
        headers=csrf_headers(csrf),
    )
    assert returned.status_code == 200, returned.text
    assert returned.json()["status"] == "returned"
    assert returned.json()["returned_at"]

    unavailability = client.post(
        "/api/v1/reservations",
        headers=csrf_headers(csrf),
        json={
            "equipment_id": equipment_id,
            "purpose": "Maintenance annuelle",
            "start_at": "2027-04-05T08:00:00Z",
            "end_at": "2027-04-05T18:00:00Z",
            "kind": "unavailability",
        },
    )
    assert unavailability.status_code == 201, unavailability.text
    assert unavailability.json()["status"] == "blocked"
    assert unavailability.json()["kind"] == "unavailability"

    ics = client.get("/api/v1/reservations/export.ics")
    assert ics.status_code == 200, ics.text
    assert ics.headers["content-type"].startswith("text/calendar")
    assert "BEGIN:VCALENDAR" in ics.text
    assert "Atelier hebdomadaire" in ics.text or "Reservation" in ics.text

    qr = client.get(f"/api/v1/reservations/equipments/{equipment_id}/qr")
    assert qr.status_code == 200
    assert qr.headers["content-type"].startswith("image/png")
    assert qr.content.startswith(b"\x89PNG")


def test_recurring_reservation_requires_until(admin_client, csrf_headers):
    client, csrf = admin_client
    suffix = uuid4().hex[:8]
    equipment_id = _create_equipment(client, csrf_headers, csrf, f"Écran récurrent {suffix}")
    start = datetime(2027, 5, 4, 9, 0, tzinfo=UTC)
    response = client.post(
        "/api/v1/reservations",
        headers=csrf_headers(csrf),
        json={
            "equipment_id": equipment_id,
            "purpose": "Série sans fin",
            "start_at": start.isoformat(),
            "end_at": (start + timedelta(hours=1)).isoformat(),
            "recurrence": "weekly",
        },
    )
    assert response.status_code == 422
