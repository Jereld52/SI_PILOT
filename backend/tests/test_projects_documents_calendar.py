from datetime import UTC, datetime, timedelta
from uuid import uuid4


def test_project_detail_and_subitems(admin_client, csrf_headers):
    client, csrf = admin_client
    suffix = uuid4().hex[:8]

    project = client.post(
        "/api/v1/projects",
        headers=csrf_headers(csrf),
        json={
            "code": f"PRJ-{suffix}",
            "name": f"Projet {suffix}",
            "status": "in_progress",
            "priority": "high",
            "planned_budget": 15000,
        },
    )
    assert project.status_code == 201, project.text
    project_body = project.json()
    project_id = project_body["id"]

    duplicate = client.post(
        "/api/v1/projects",
        headers=csrf_headers(csrf),
        json={"code": f"PRJ-{suffix}", "name": "Doublon"},
    )
    assert duplicate.status_code == 409

    milestone = client.post(
        f"/api/v1/projects/{project_id}/milestones",
        headers=csrf_headers(csrf),
        json={"name": "Cadrage", "status": "done"},
    )
    assert milestone.status_code == 201, milestone.text
    milestone_id = milestone.json()["milestones"][0]["id"]

    task = client.post(
        f"/api/v1/projects/{project_id}/tasks",
        headers=csrf_headers(csrf),
        json={
            "title": "Rédiger le cahier des charges",
            "milestone_id": milestone_id,
            "status": "todo",
        },
    )
    assert task.status_code == 201, task.text
    task_id = task.json()["tasks"][0]["id"]

    completed = client.patch(
        f"/api/v1/projects/tasks/{task_id}",
        headers=csrf_headers(csrf),
        json={"status": "done"},
    )
    assert completed.status_code == 200
    assert completed.json()["progress_percent"] == 100

    risk = client.post(
        f"/api/v1/projects/{project_id}/risks",
        headers=csrf_headers(csrf),
        json={"description": "Retard fournisseur", "probability": 4, "impact": 3},
    )
    assert risk.status_code == 201
    assert risk.json()["risks"][0]["score"] == 12

    decision = client.post(
        f"/api/v1/projects/{project_id}/decisions",
        headers=csrf_headers(csrf),
        json={"title": "Choix de la solution", "decision_date": "2026-11-01"},
    )
    assert decision.status_code == 201

    detail = client.get(f"/api/v1/projects/{project_id}")
    assert detail.status_code == 200
    assert len(detail.json()["milestones"]) == 1
    assert len(detail.json()["tasks"]) == 1
    assert len(detail.json()["risks"]) == 1
    assert len(detail.json()["decisions"]) == 1

    archived = client.delete(f"/api/v1/projects/{project_id}", headers=csrf_headers(csrf))
    assert archived.status_code == 200
    assert archived.json()["status"] == "cancelled"


def test_document_metadata_upload_download_and_archive(admin_client, csrf_headers):
    client, csrf = admin_client
    suffix = uuid4().hex[:8]

    categories = client.get("/api/v1/documents/meta")
    assert categories.status_code == 200
    category = categories.json()[0]

    document = client.post(
        "/api/v1/documents",
        headers=csrf_headers(csrf),
        json={
            "title": f"Procédure {suffix}",
            "doc_type": "procedure",
            "category_id": category["id"],
            "description": "Procédure de test.",
            "tags": ["sécurité", f"test-{suffix}"],
        },
    )
    assert document.status_code == 201, document.text
    document_body = document.json()
    assert set(document_body["tags"]) == {"sécurité", f"test-{suffix}"}

    upload = client.post(
        f"/api/v1/documents/{document_body['id']}/versions",
        headers=csrf_headers(csrf),
        data={"changelog": "Version initiale"},
        files={"file": ("procedure.txt", b"Contenu de la procedure", "text/plain")},
    )
    assert upload.status_code == 201, upload.text
    uploaded = upload.json()
    assert uploaded["version_count"] == 1
    version = uploaded["current_version"]
    assert version["filename"] == "procedure.txt"
    assert version["size_bytes"] == len(b"Contenu de la procedure")

    download = client.get(f"/api/v1/documents/versions/{version['id']}/download")
    assert download.status_code == 200
    assert download.content == b"Contenu de la procedure"

    listed = client.get("/api/v1/documents", params={"q": suffix})
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    updated = client.patch(
        f"/api/v1/documents/{document_body['id']}",
        headers=csrf_headers(csrf),
        json={"status": "draft", "tags": ["mis à jour"]},
    )
    assert updated.status_code == 200
    assert updated.json()["tags"] == ["mis à jour"]

    archived = client.delete(
        f"/api/v1/documents/{document_body['id']}", headers=csrf_headers(csrf)
    )
    assert archived.status_code == 200
    assert archived.json()["status"] == "archived"


def test_calendar_events_and_actions(admin_client, csrf_headers):
    client, csrf = admin_client
    suffix = uuid4().hex[:8]
    start = datetime.now(UTC) + timedelta(days=2)
    end = start + timedelta(hours=2)

    event = client.post(
        "/api/v1/calendar/events",
        headers=csrf_headers(csrf),
        json={
            "title": f"Maintenance {suffix}",
            "event_type": "maintenance",
            "start_at": start.isoformat(),
            "end_at": end.isoformat(),
            "location": "Site principal",
        },
    )
    assert event.status_code == 201, event.text
    event_id = event.json()["id"]

    events = client.get(
        "/api/v1/calendar/events",
        params={
            "start_from": (start - timedelta(days=1)).isoformat(),
            "start_to": (start + timedelta(days=1)).isoformat(),
        },
    )
    assert events.status_code == 200
    assert any(item["id"] == event_id for item in events.json())

    updated_event = client.patch(
        f"/api/v1/calendar/events/{event_id}",
        headers=csrf_headers(csrf),
        json={"status": "done"},
    )
    assert updated_event.status_code == 200
    assert updated_event.json()["status"] == "done"

    action = client.post(
        "/api/v1/calendar/actions",
        headers=csrf_headers(csrf),
        json={
            "title": f"Relancer {suffix}",
            "priority": "high",
            "due_date": (datetime.now(UTC) - timedelta(days=1)).isoformat(),
        },
    )
    assert action.status_code == 201, action.text
    action_id = action.json()["id"]

    done = client.patch(
        f"/api/v1/calendar/actions/{action_id}",
        headers=csrf_headers(csrf),
        json={"status": "done"},
    )
    assert done.status_code == 200
    assert done.json()["completed_at"] is not None

    overview = client.get("/api/v1/calendar/overview")
    assert overview.status_code == 200
    assert "open_actions" in overview.json()

    deleted = client.delete(
        f"/api/v1/calendar/events/{event_id}", headers=csrf_headers(csrf)
    )
    assert deleted.status_code == 204
