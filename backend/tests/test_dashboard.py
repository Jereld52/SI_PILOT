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
    plan = body["plan"]
    assert plan["date"]
    assert isinstance(plan["items"], list)
    assert isinstance(plan["suggestions"], list)
    assert plan["summary"]["conflicts"] >= 0
    assert plan["summary"]["busy_minutes"] >= 0
    assert plan["summary"]["free_minutes"] >= 0
    for item in plan["items"]:
        assert item["kind"] in {
            "meeting",
            "intervention",
            "reservation",
            "event",
            "action",
            "ticket",
        }
        assert item["title"]
        assert item["href"]
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



def test_dashboard_today_ignores_past_event_without_end(admin_client):
    from datetime import UTC, datetime, timedelta

    from app.db.session import SessionLocal
    from app.models.calendar import CalendarEvent

    client, _ = admin_client
    with SessionLocal() as db:
        event = CalendarEvent(
            title="Vieux CA de test",
            event_type="meeting",
            start_at=datetime.now(UTC) - timedelta(days=5),
            end_at=None,
            all_day=False,
            status="planned",
            priority="medium",
        )
        db.add(event)
        db.commit()
        db.refresh(event)
        event_id = event.id

    response = client.get("/api/v1/dashboard/today")
    assert response.status_code == 200, response.text
    items = response.json()["plan"]["items"]
    assert all(item["id"] != f"event-{event_id}" for item in items)

    with SessionLocal() as db:
        row = db.get(CalendarEvent, event_id)
        if row is not None:
            db.delete(row)
            db.commit()
