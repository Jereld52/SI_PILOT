from datetime import date, timedelta
from uuid import uuid4


def test_contract_lifecycle(admin_client, csrf_headers):
    client, csrf = admin_client
    suffix = uuid4().hex[:8]
    supplier = client.post(
        "/api/v1/suppliers",
        headers=csrf_headers(csrf),
        json={"name": f"Prestataire contrat {suffix}"},
    )
    assert supplier.status_code == 201, supplier.text

    end_date = (date.today() + timedelta(days=45)).isoformat()
    created = client.post(
        "/api/v1/contracts",
        headers=csrf_headers(csrf),
        json={
            "supplier_id": supplier.json()["id"],
            "reference": f"CTR-{suffix}",
            "object": f"Maintenance {suffix}",
            "start_date": date.today().isoformat(),
            "end_date": end_date,
            "amount_ht": 10000,
            "annual_cost": 12000,
            "notice_days": 60,
            "auto_renew": True,
        },
    )
    assert created.status_code == 201, created.text
    contract = created.json()
    assert contract["reference"] == f"CTR-{suffix}"
    assert contract["days_to_end"] == 45
    assert contract["alert_level"] == "warning"
    assert contract["renewal_deadline"] is not None

    duplicate = client.post(
        "/api/v1/contracts",
        headers=csrf_headers(csrf),
        json={
            "supplier_id": supplier.json()["id"],
            "reference": f"CTR-{suffix}",
            "object": "Doublon",
        },
    )
    assert duplicate.status_code == 409

    expiring = client.get("/api/v1/contracts", params={"expiring": 90})
    assert expiring.status_code == 200
    assert any(item["id"] == contract["id"] for item in expiring.json())

    updated = client.patch(
        f"/api/v1/contracts/{contract['id']}",
        headers=csrf_headers(csrf),
        json={"annual_cost": 13500, "status": "expiring"},
    )
    assert updated.status_code == 200
    assert updated.json()["annual_cost"] == 13500.0
    assert updated.json()["status"] == "expiring"

    terminated = client.delete(
        f"/api/v1/contracts/{contract['id']}", headers=csrf_headers(csrf)
    )
    assert terminated.status_code == 200
    assert terminated.json()["status"] == "terminated"


def test_budget_lifecycle(admin_client, csrf_headers):
    client, csrf = admin_client
    suffix = uuid4().hex[:8]
    year = 2080 + int(suffix[:2], 16) % 10
    categories = client.get("/api/v1/budget-categories")
    assert categories.status_code == 200
    category = categories.json()[0]

    supplier = client.post(
        "/api/v1/suppliers",
        headers=csrf_headers(csrf),
        json={"name": f"Fournisseur budget {suffix}"},
    )
    assert supplier.status_code == 201, supplier.text

    budget = client.post(
        "/api/v1/budgets",
        headers=csrf_headers(csrf),
        json={"year": year, "name": f"Budget {suffix}"},
    )
    assert budget.status_code == 201, budget.text
    budget_id = budget.json()["id"]

    duplicate = client.post(
        "/api/v1/budgets",
        headers=csrf_headers(csrf),
        json={"year": year, "name": "Doublon"},
    )
    assert duplicate.status_code == 409

    line = client.post(
        f"/api/v1/budgets/{budget_id}/lines",
        headers=csrf_headers(csrf),
        json={
            "category_id": category["id"],
            "label": f"Ligne {suffix}",
            "planned_amount": 5000,
            "voted_amount": 4800,
        },
    )
    assert line.status_code == 201, line.text
    line_id = line.json()["lines"][0]["id"]

    commitment = client.post(
        f"/api/v1/budgets/{budget_id}/commitments",
        headers=csrf_headers(csrf),
        json={
            "budget_line_id": line_id,
            "object": f"Commande {suffix}",
            "amount_ht": 1200,
            "status": "ordered",
            "supplier_id": supplier.json()["id"],
        },
    )
    assert commitment.status_code == 201, commitment.text
    commitment_id = commitment.json()["commitments"][0]["id"]

    invoice = client.post(
        f"/api/v1/budgets/{budget_id}/invoices",
        headers=csrf_headers(csrf),
        json={
            "budget_line_id": line_id,
            "commitment_id": commitment_id,
            "invoice_number": f"FAC-{suffix}",
            "amount_ht": 1200,
            "status": "validated",
        },
    )
    assert invoice.status_code == 201, invoice.text

    detail = client.get(f"/api/v1/budgets/{budget_id}")
    assert detail.status_code == 200
    body = detail.json()
    assert body["planned_total"] == 5000.0
    assert body["voted_total"] == 4800.0
    assert body["committed_total"] == 1200.0
    assert body["invoiced_total"] == 1200.0
    assert body["available_total"] == 3600.0
    assert body["lines"][0]["available_amount"] == 3600.0

    blocked_delete = client.delete(
        f"/api/v1/budget-lines/{line_id}", headers=csrf_headers(csrf)
    )
    assert blocked_delete.status_code == 409

    validated = client.post(
        f"/api/v1/budgets/{budget_id}/validate", headers=csrf_headers(csrf)
    )
    assert validated.status_code == 200
    assert validated.json()["status"] == "voted"

    second_validation = client.post(
        f"/api/v1/budgets/{budget_id}/validate", headers=csrf_headers(csrf)
    )
    assert second_validation.status_code == 422
