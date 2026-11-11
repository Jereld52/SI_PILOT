from uuid import uuid4


def test_onboarding_lifecycle(admin_client, csrf_headers):
    client, csrf = admin_client
    suffix = uuid4().hex[:8]

    templates = client.get("/api/v1/onboarding/templates")
    assert templates.status_code == 200, templates.text
    onboarding = next(
        template for template in templates.json() if template["type"] == "onboarding"
    )
    assert len(onboarding["items"]) >= 5

    agent = client.post(
        "/api/v1/agents",
        headers=csrf_headers(csrf),
        json={
            "first_name": "Marie",
            "last_name": f"Test {suffix}",
            "email_pro": f"marie.{suffix}@example.org",
            "arrival_date": "2026-12-01",
            "status": "arriving",
        },
    )
    assert agent.status_code == 201, agent.text
    agent_id = agent.json()["id"]

    run = client.post(
        "/api/v1/onboarding/runs",
        headers=csrf_headers(csrf),
        json={
            "agent_id": agent_id,
            "type": "onboarding",
            "template_id": onboarding["id"],
            "due_date": "2026-12-01",
            "notes": "Arrivée préparée par le test.",
        },
    )
    assert run.status_code == 201, run.text
    body = run.json()
    assert body["status"] == "in_progress"
    assert body["required_total"] >= 5
    assert body["progress_percent"] == 0
    assert len(body["items"]) == body["total_items"]

    duplicate = client.post(
        "/api/v1/onboarding/runs",
        headers=csrf_headers(csrf),
        json={"agent_id": agent_id, "type": "onboarding"},
    )
    assert duplicate.status_code == 409

    first_item = body["items"][0]
    toggled = client.post(
        f"/api/v1/onboarding/runs/{body['id']}/items/{first_item['id']}",
        headers=csrf_headers(csrf),
        json={"is_done": True, "notes": "Fait."},
    )
    assert toggled.status_code == 200, toggled.text
    assert toggled.json()["items"][0]["is_done"] is True
    assert toggled.json()["progress_percent"] > 0

    current = toggled.json()
    for item in current["items"]:
        if not item["is_done"]:
            current = client.post(
                f"/api/v1/onboarding/runs/{current['id']}/items/{item['id']}",
                headers=csrf_headers(csrf),
                json={"is_done": True},
            ).json()
    assert current["status"] == "completed"
    assert current["progress_percent"] == 100
    assert current["completed_at"] is not None

    timeline = client.get(f"/api/v1/onboarding/agents/{agent_id}/timeline")
    assert timeline.status_code == 200, timeline.text
    assert timeline.json()["runs"][0]["id"] == body["id"]

    briefing = client.get("/api/v1/onboarding/briefing")
    assert briefing.status_code == 200, briefing.text
    payload = briefing.json()
    assert "upcoming_arrivals" in payload["counts"]
    assert "in_progress" in payload["counts"]
    assert isinstance(payload["items"], list)


def test_onboarding_create_without_template(admin_client, csrf_headers):
    client, csrf = admin_client
    suffix = uuid4().hex[:8]
    agent = client.post(
        "/api/v1/agents",
        headers=csrf_headers(csrf),
        json={
            "first_name": "Paul",
            "last_name": f"Départ {suffix}",
            "email_pro": f"paul.{suffix}@example.org",
            "departure_date": "2026-12-15",
            "status": "active",
        },
    )
    assert agent.status_code == 201, agent.text
    response = client.post(
        "/api/v1/onboarding/runs",
        headers=csrf_headers(csrf),
        json={"agent_id": agent.json()["id"], "type": "offboarding"},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["type"] == "offboarding"
    assert body["due_date"] == "2026-12-15"
    assert body["template_name"]
