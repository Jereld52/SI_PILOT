from uuid import uuid4


def test_administrator_usage_smoke(admin_client, csrf_headers):
    client, csrf = admin_client
    suffix = uuid4().hex[:8]

    endpoints = [
        "/api/v1/auth/me",
        "/api/v1/dashboard/summary",
        "/api/v1/dashboard/cockpit",
        "/api/v1/dashboard/charts",
        "/api/v1/dashboard/alerts",
        "/api/v1/dashboard/activity",
        "/api/v1/dashboard/tiles",
        "/api/v1/agents?page=1&page_size=5",
        "/api/v1/assets?page=1&page_size=5",
        "/api/v1/mobile-lines?page=1&page_size=5",
        "/api/v1/infrastructure/equipments",
        "/api/v1/infrastructure/map",
        "/api/v1/infrastructure/dependencies",
        "/api/v1/infrastructure/checks",
        "/api/v1/stock/overview",
        "/api/v1/stock/items",
        "/api/v1/reservations/equipments",
        "/api/v1/reservations",
        "/api/v1/tickets?page=1&page_size=5",
        "/api/v1/tickets/meta",
        "/api/v1/tickets/assignees",
        "/api/v1/rgpd/overview",
        "/api/v1/rgpd/processing-activities",
        "/api/v1/rgpd/collections",
        "/api/v1/rgpd/requests",
        "/api/v1/rgpd/rights-requests",
        "/api/v1/rgpd/breaches",
        "/api/v1/contracts",
        "/api/v1/contracts/meta",
        "/api/v1/budgets",
        "/api/v1/budget-categories",
        "/api/v1/projects",
        "/api/v1/security/overview",
        "/api/v1/security/incidents",
        "/api/v1/security/actions",
        "/api/v1/security/vulnerabilities",
        "/api/v1/security/backups",
        "/api/v1/security/certificates",
        "/api/v1/security/audits",
        "/api/v1/documents",
        "/api/v1/documents/meta",
        "/api/v1/calendar/overview",
        "/api/v1/calendar/events",
        "/api/v1/calendar/actions",
        "/api/v1/notifications?page_size=5",
        "/api/v1/notifications/unread-count",
        "/api/v1/admin/roles",
        "/api/v1/admin/permissions",
        "/api/v1/admin/users?page=1&page_size=5",
        "/api/v1/admin/settings",
        "/api/v1/admin/settings/smtp",
        "/api/v1/admin/wapt/config",
        "/api/v1/search?q=test&limit=3",
        "/api/v1/statistics/overview?start=2026-01-01&end=2026-12-31&granularity=month",
        "/api/v1/exports/custom/catalog",
    ]
    for endpoint in endpoints:
        response = client.get(endpoint)
        assert response.status_code == 200, (endpoint, response.status_code, response.text)

    agent = client.post(
        "/api/v1/agents",
        headers=csrf_headers(csrf),
        json={
            "first_name": "Admin",
            "last_name": f"Smoke{suffix}",
            "email_pro": f"admin.smoke.{suffix}@forets-parcnational.fr",
            "status": "active",
        },
    )
    assert agent.status_code == 201, agent.text

    mobile = client.post(
        "/api/v1/mobile-lines",
        headers=csrf_headers(csrf),
        json={
            "line_number": f"06{suffix[:8]}",
            "holder_name": "Ligne smoke",
            "status": "Actif",
        },
    )
    assert mobile.status_code == 201, mobile.text
    mobile_id = mobile.json()["id"]
    updated = client.patch(
        f"/api/v1/mobile-lines/{mobile_id}",
        headers=csrf_headers(csrf),
        json={"holder_name": "Ligne smoke modifiée"},
    )
    assert updated.status_code == 200, updated.text
    deleted = client.delete(
        f"/api/v1/mobile-lines/{mobile_id}", headers=csrf_headers(csrf)
    )
    assert deleted.status_code == 204, deleted.text

    equipment = client.post(
        "/api/v1/reservations/equipments",
        headers=csrf_headers(csrf),
        json={"name": f"Matériel smoke {suffix}", "category": "other"},
    )
    assert equipment.status_code == 201, equipment.text
    reservation = client.post(
        "/api/v1/reservations",
        headers=csrf_headers(csrf),
        json={
            "equipment_id": equipment.json()["id"],
            "requester_name": "Admin Smoke",
            "purpose": "Test administrateur",
            "start_at": "2027-06-01T09:00:00Z",
            "end_at": "2027-06-01T10:00:00Z",
        },
    )
    assert reservation.status_code == 201, reservation.text
    availability = client.get(
        "/api/v1/reservations/availability",
        params={
            "equipment_id": equipment.json()["id"],
            "start": "2027-06-01T09:30:00Z",
            "end": "2027-06-01T10:30:00Z",
        },
    )
    assert availability.status_code == 200
    assert availability.json()["available"] is False

    exported = client.get("/api/v1/exports/rgpd", params={"format": "pdf"})
    assert exported.status_code == 200
    assert exported.content.startswith(b"%PDF")
