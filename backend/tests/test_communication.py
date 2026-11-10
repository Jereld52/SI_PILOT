from datetime import UTC, datetime, timedelta
from uuid import uuid4


def _iso(hours: int = 24) -> str:
    return (datetime.now(UTC) + timedelta(hours=hours)).isoformat()


def test_communication_lifecycle(admin_client, csrf_headers):
    client, csrf = admin_client
    suffix = uuid4().hex[:8]

    created = client.post(
        "/api/v1/communication/communications",
        headers=csrf_headers(csrf),
        json={
            "title": f"Maintenance {suffix}",
            "body": "Intervention planifiée sur le serveur de fichiers.",
            "category": "maintenance",
            "audience": "all",
            "channel": "in_app",
        },
    )
    assert created.status_code == 201, created.text
    communication = created.json()
    assert communication["status"] == "draft"
    assert communication["recipient_count"] >= 1

    listed = client.get("/api/v1/communication/communications")
    assert listed.status_code == 200, listed.text
    assert any(item["id"] == communication["id"] for item in listed.json())

    published = client.post(
        f"/api/v1/communication/communications/{communication['id']}/publish",
        headers=csrf_headers(csrf),
    )
    assert published.status_code == 200, published.text
    assert published.json()["status"] == "published"
    assert published.json()["published_at"] is not None

    marked = client.post(
        f"/api/v1/communication/communications/{communication['id']}/read",
        headers=csrf_headers(csrf),
    )
    assert marked.status_code == 200, marked.text
    assert marked.json()["is_read"] is True
    assert marked.json()["read_count"] >= 1

    notifications = client.get("/api/v1/notifications?page_size=100")
    assert notifications.status_code == 200, notifications.text
    assert any(
        item["title"] == f"Maintenance {suffix}"
        for item in notifications.json()["items"]
    )


def test_meeting_and_training_lifecycle(admin_client, csrf_headers):
    client, csrf = admin_client
    suffix = uuid4().hex[:8]
    assignees = client.get("/api/v1/tickets/assignees").json()
    participant_id = assignees[0]["id"]

    meeting = client.post(
        "/api/v1/communication/meetings",
        headers=csrf_headers(csrf),
        json={
            "title": f"Point équipe {suffix}",
            "meeting_type": "team",
            "scheduled_at": _iso(),
            "duration_minutes": 45,
            "participant_user_ids": [participant_id],
        },
    )
    assert meeting.status_code == 201, meeting.text
    meeting_body = meeting.json()
    assert meeting_body["participant_user_ids"] == [participant_id]

    meetings = client.get("/api/v1/communication/meetings?q=Point équipe")
    assert meetings.status_code == 200, meetings.text
    assert any(item["id"] == meeting_body["id"] for item in meetings.json())

    point = client.post(
        "/api/v1/communication/points",
        headers=csrf_headers(csrf),
        json={
            "meeting_id": meeting_body["id"],
            "title": f"Point budget {suffix}",
            "priority": "high",
            "status": "open",
        },
    )
    assert point.status_code == 201, point.text
    point_body = point.json()
    assert point_body["meeting_title"] == meeting_body["title"]

    mine = client.get("/api/v1/communication/points?mine=true")
    assert mine.status_code == 200, mine.text
    assert any(item["id"] == point_body["id"] for item in mine.json())

    updated_point = client.patch(
        f"/api/v1/communication/points/{point_body['id']}",
        headers=csrf_headers(csrf),
        json={"status": "done"},
    )
    assert updated_point.status_code == 200, updated_point.text
    assert updated_point.json()["status"] == "done"

    training = client.post(
        "/api/v1/communication/trainings",
        headers=csrf_headers(csrf),
        json={
            "title": f"Formation sécurité {suffix}",
            "provider": "ANSSI",
            "start_date": "2026-12-01",
            "duration_hours": 7,
            "mandatory": True,
            "status": "planned",
        },
    )
    assert training.status_code == 201, training.text
    assert training.json()["mandatory"] is True

    trainings = client.get("/api/v1/communication/trainings?mandatory=true")
    assert trainings.status_code == 200, trainings.text
    assert any(item["id"] == training.json()["id"] for item in trainings.json())

    deleted = client.delete(
        f"/api/v1/communication/meetings/{meeting_body['id']}",
        headers=csrf_headers(csrf),
    )
    assert deleted.status_code == 204, deleted.text
