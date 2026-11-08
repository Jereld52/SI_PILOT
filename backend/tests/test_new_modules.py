from uuid import uuid4


def test_suppliers_licenses_and_stock(admin_client, csrf_headers):
    client, csrf = admin_client
    suffix = uuid4().hex[:8]

    supplier = client.post(
        "/api/v1/suppliers",
        headers=csrf_headers(csrf),
        json={
            "name": f"Fournisseur {suffix}",
            "type": "Matériel",
            "email": f"contact-{suffix}@example.fr",
            "contacts": [
                {"name": "Contact test", "role": "Commercial", "is_primary": True}
            ],
        },
    )
    assert supplier.status_code == 201, supplier.text
    supplier_body = supplier.json()
    assert supplier_body["name"] == f"Fournisseur {suffix}"
    assert len(supplier_body["contacts"]) == 1

    duplicate = client.post(
        "/api/v1/suppliers",
        headers=csrf_headers(csrf),
        json={"name": f"Fournisseur {suffix}"},
    )
    assert duplicate.status_code == 409

    updated = client.patch(
        f"/api/v1/suppliers/{supplier_body['id']}",
        headers=csrf_headers(csrf),
        json={"phone": "0102030405"},
    )
    assert updated.status_code == 200
    assert updated.json()["phone"] == "0102030405"

    listed = client.get("/api/v1/suppliers", params={"q": suffix})
    assert listed.status_code == 200
    assert any(item["id"] == supplier_body["id"] for item in listed.json())

    license_row = client.post(
        "/api/v1/licenses",
        headers=csrf_headers(csrf),
        json={
            "name": f"Licence {suffix}",
            "vendor": f"Fournisseur {suffix}",
            "license_type": "abonnement",
            "seats": 10,
            "seats_used": 4,
            "annual_cost": 1200,
        },
    )
    assert license_row.status_code == 201, license_row.text
    assert license_row.json()["seats"] == 10
    assert license_row.json()["annual_cost"] == 1200.0

    invalid_license = client.post(
        "/api/v1/licenses",
        headers=csrf_headers(csrf),
        json={"name": f"Licence invalide {suffix}", "seats": 2, "seats_used": 5},
    )
    assert invalid_license.status_code == 422

    categories = client.get("/api/v1/asset-categories").json()
    category = next(item for item in categories if item["code"] == "desktop")
    asset = client.post(
        "/api/v1/assets",
        headers=csrf_headers(csrf),
        json={
            "name": f"Poste stock {suffix}",
            "category_id": category["id"],
            "serial_number": f"SN-STOCK-{suffix}",
        },
    )
    assert asset.status_code == 201, asset.text
    asset_id = asset.json()["id"]

    movement = client.post(
        "/api/v1/stock/movements",
        headers=csrf_headers(csrf),
        json={
            "asset_id": asset_id,
            "direction": "in",
            "quantity": 1,
            "reason": "Réception",
        },
    )
    assert movement.status_code == 201, movement.text
    assert movement.json()["direction"] == "in"
    assert movement.json()["asset"]["id"] == asset_id

    summary = client.get("/api/v1/stock/summary")
    assert summary.status_code == 200
    assert any(item["category_id"] == category["id"] for item in summary.json())


def test_ticket_lifecycle(admin_client, csrf_headers):
    client, csrf = admin_client
    meta = client.get("/api/v1/tickets/meta")
    assert meta.status_code == 200
    body = meta.json()
    category = body["categories"][0]
    priority = next(item for item in body["priorities"] if item["code"] == "high")
    status_resolved = next(item for item in body["statuses"] if item["code"] == "resolved")
    suffix = uuid4().hex[:8]

    created = client.post(
        "/api/v1/tickets",
        headers=csrf_headers(csrf),
        json={
            "subject": f"Demande {suffix}",
            "description": "Test de cycle de vie.",
            "category_id": category["id"],
            "priority_id": priority["id"],
            "source": "direct",
        },
    )
    assert created.status_code == 201, created.text
    ticket = created.json()
    assert ticket["reference"].startswith("DEM-")
    assert ticket["status"]["code"] == "new"
    assert ticket["source"] == "direct"
    assert ticket["due_at"] is not None

    assignees = client.get("/api/v1/tickets/assignees")
    assert assignees.status_code == 200
    assert len(assignees.json()) >= 1
    assignee = assignees.json()[0]

    assigned = client.post(
        f"/api/v1/tickets/{ticket['id']}/assign",
        headers=csrf_headers(csrf),
        json={"assignee_user_id": assignee["id"]},
    )
    assert assigned.status_code == 200
    assert assigned.json()["assignee"]["id"] == assignee["id"]

    comment = client.post(
        f"/api/v1/tickets/{ticket['id']}/comments",
        headers=csrf_headers(csrf),
        json={"body": "Prise en charge.", "is_internal": False},
    )
    assert comment.status_code == 201
    assert len(comment.json()["comments"]) == 1

    time_entry = client.post(
        f"/api/v1/tickets/{ticket['id']}/time-entries",
        headers=csrf_headers(csrf),
        json={"minutes": 30, "comment": "Diagnostic"},
    )
    assert time_entry.status_code == 201
    assert time_entry.json()["time_spent_minutes"] == 30

    transitioned = client.post(
        f"/api/v1/tickets/{ticket['id']}/transition",
        headers=csrf_headers(csrf),
        json={"status_id": status_resolved["id"], "resolution": "Résolu en test."},
    )
    assert transitioned.status_code == 200
    assert transitioned.json()["status"]["code"] == "resolved"
    assert transitioned.json()["resolved_at"] is not None

    detail = client.get(f"/api/v1/tickets/{ticket['id']}")
    assert detail.status_code == 200
    assert len(detail.json()["history"]) >= 3


def test_interventions(admin_client, csrf_headers):
    client, csrf = admin_client
    suffix = uuid4().hex[:8]
    created = client.post(
        "/api/v1/interventions",
        headers=csrf_headers(csrf),
        json={
            "title": f"Intervention {suffix}",
            "type": "preventive",
            "status": "planned",
        },
    )
    assert created.status_code == 201, created.text
    intervention = created.json()
    assert intervention["reference"].startswith("INT-")

    updated = client.patch(
        f"/api/v1/interventions/{intervention['id']}",
        headers=csrf_headers(csrf),
        json={"status": "done", "report": "Contrôle effectué.", "duration_minutes": 45},
    )
    assert updated.status_code == 200
    assert updated.json()["status"] == "done"
    assert updated.json()["ended_at"] is not None

    listed = client.get("/api/v1/interventions", params={"q": suffix})
    assert listed.status_code == 200
    assert listed.json()["total"] == 1


def test_rgpd_register_and_requests(admin_client, csrf_headers):
    client, csrf = admin_client
    suffix = uuid4().hex[:8]

    activity = client.post(
        "/api/v1/rgpd/processing-activities",
        headers=csrf_headers(csrf),
        json={
            "name": f"Traitement {suffix}",
            "purpose": "Gestion des agents",
            "legal_basis": "Mission d'intérêt public",
            "status": "active",
            "next_review_at": "2027-01-15",
        },
    )
    assert activity.status_code == 201, activity.text
    activity_body = activity.json()
    assert activity_body["reference"].startswith("RGPD-")
    assert activity_body["status"] == "active"

    collection = client.post(
        "/api/v1/rgpd/collections",
        headers=csrf_headers(csrf),
        json={
            "name": f"Collecte {suffix}",
            "collection_type": "form",
            "processing_activity_id": activity_body["id"],
            "subjects_count": 12,
        },
    )
    assert collection.status_code == 201, collection.text
    assert collection.json()["processing_activity"]["id"] == activity_body["id"]

    dpo_request = client.post(
        "/api/v1/rgpd/requests",
        headers=csrf_headers(csrf),
        json={
            "subject": f"Question DPO {suffix}",
            "requester_name": "Agent Test",
            "requester_type": "agent",
            "status": "new",
        },
    )
    assert dpo_request.status_code == 201, dpo_request.text
    assert dpo_request.json()["reference"].startswith("DPO-")
    dpo_id = dpo_request.json()["id"]

    answered = client.patch(
        f"/api/v1/rgpd/requests/{dpo_id}",
        headers=csrf_headers(csrf),
        json={"status": "closed", "response": "Réponse apportée."},
    )
    assert answered.status_code == 200
    assert answered.json()["closed_at"] is not None

    rights = client.post(
        "/api/v1/rgpd/rights-requests",
        headers=csrf_headers(csrf),
        json={
            "request_type": "access",
            "requester_name": "Usager Test",
            "processing_activity_id": activity_body["id"],
        },
    )
    assert rights.status_code == 201, rights.text
    assert rights.json()["due_date"] is not None

    breach = client.post(
        "/api/v1/rgpd/breaches",
        headers=csrf_headers(csrf),
        json={
            "description": f"Violation {suffix}",
            "severity": "high",
            "affected_count": 3,
        },
    )
    assert breach.status_code == 201, breach.text
    assert breach.json()["reference"].startswith("VIO-")

    overview = client.get("/api/v1/rgpd/overview")
    assert overview.status_code == 200
    overview_body = overview.json()
    assert overview_body["processing_total"] >= 1
    assert overview_body["open_breaches"] >= 1
    assert len(overview_body["deadlines"]) >= 1
