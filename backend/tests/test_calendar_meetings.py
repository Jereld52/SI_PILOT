def test_calendar_lists_events_overlapping_range(admin_client, csrf_headers):
    client, csrf = admin_client
    created = client.post(
        "/api/v1/calendar/events",
        headers=csrf_headers(csrf),
        json={
            "title": "Événement sur plusieurs jours",
            "event_type": "maintenance",
            "start_at": "2026-11-28T09:00:00+00:00",
            "end_at": "2026-12-02T18:00:00+00:00",
            "all_day": False,
        },
    )
    assert created.status_code == 201, created.text
    event_id = created.json()["id"]

    listed = client.get(
        "/api/v1/calendar/events",
        params={
            "start_from": "2026-12-01T00:00:00+00:00",
            "start_to": "2026-12-05T00:00:00+00:00",
        },
    )
    assert listed.status_code == 200, listed.text
    assert any(item["id"] == event_id for item in listed.json())

    deleted = client.delete(
        f"/api/v1/calendar/events/{event_id}", headers=csrf_headers(csrf)
    )
    assert deleted.status_code == 204, deleted.text


def test_calendar_meetings_are_listed(admin_client, csrf_headers):
    client, csrf = admin_client

    created = client.post(
        "/api/v1/communication/meetings",
        headers=csrf_headers(csrf),
        json={
            "title": "Réunion calendrier test",
            "meeting_type": "team",
            "scheduled_at": "2026-12-15T10:00:00+00:00",
            "duration_minutes": 90,
            "location": "Salle A",
            "status": "planned",
        },
    )
    assert created.status_code == 201, created.text
    meeting_id = created.json()["id"]

    listed = client.get(
        "/api/v1/calendar/meetings",
        params={
            "start_from": "2026-12-15T00:00:00+00:00",
            "start_to": "2026-12-16T00:00:00+00:00",
        },
    )
    assert listed.status_code == 200, listed.text
    match = next((item for item in listed.json() if item["id"] == meeting_id), None)
    assert match is not None
    assert match["title"] == "Réunion calendrier test"
    assert match["meeting_type"] == "team"
    assert match["end_at"].startswith("2026-12-15T11:30")

    outside = client.get(
        "/api/v1/calendar/meetings",
        params={
            "start_from": "2026-12-20T00:00:00+00:00",
            "start_to": "2026-12-21T00:00:00+00:00",
        },
    )
    assert outside.status_code == 200
    assert all(item["id"] != meeting_id for item in outside.json())

    deleted = client.delete(
        f"/api/v1/communication/meetings/{meeting_id}", headers=csrf_headers(csrf)
    )
    assert deleted.status_code == 204, deleted.text
