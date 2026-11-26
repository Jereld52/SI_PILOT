import json
import uuid

from app.services import ai_service


def _supplier(client, csrf_headers, csrf):
    suffix = uuid.uuid4().hex[:8]
    created = client.post(
        "/api/v1/suppliers",
        headers=csrf_headers(csrf),
        json={"name": f"Fournisseur devis {suffix}"},
    )
    assert created.status_code == 201, created.text
    return created.json()


def _enable_ai(client, csrf_headers):
    response = client.put(
        "/api/v1/admin/ai/config",
        headers=csrf_headers,
        json={
            "enabled": True,
            "provider": "openai",
            "base_url": "https://api.example.test/v1",
            "model": "gpt-test",
            "api_key": "sk-test-secret",
        },
    )
    assert response.status_code == 200, response.text


def test_quote_and_purchase_order_lifecycle(admin_client, csrf_headers):
    client, csrf = admin_client
    supplier = _supplier(client, csrf_headers, csrf)
    created = client.post(
        "/api/v1/commercial-documents",
        headers=csrf_headers(csrf),
        json={
            "kind": "quote",
            "supplier_id": supplier["id"],
            "object": "Renouvellement de postes",
            "status": "sent",
            "amount_ht": 1000,
            "vat_rate": 20,
        },
    )
    assert created.status_code == 201, created.text
    quote = created.json()
    assert quote["kind"] == "quote"
    assert quote["reference"].startswith("DEV-")
    assert quote["amount_ttc"] == 1200.0

    listed = client.get("/api/v1/commercial-documents", params={"kind": "quote"})
    assert listed.status_code == 200
    assert any(item["id"] == quote["id"] for item in listed.json())

    converted = client.post(
        f"/api/v1/commercial-documents/{quote['id']}/convert",
        headers=csrf_headers(csrf),
        json={"engagement_number": "ENG-2026-0042"},
    )
    assert converted.status_code == 200, converted.text
    order = converted.json()
    assert order["kind"] == "purchase_order"
    assert order["reference"].startswith("BC-")
    assert order["engagement_number"] == "ENG-2026-0042"
    assert order["source_document_id"] == quote["id"]

    refreshed = client.get(f"/api/v1/commercial-documents/{quote['id']}")
    assert refreshed.status_code == 200
    assert refreshed.json()["status"] == "converted"

    cancelled = client.delete(
        f"/api/v1/commercial-documents/{order['id']}",
        headers=csrf_headers(csrf),
    )
    assert cancelled.status_code == 204, cancelled.text


def test_purchase_order_requires_engagement(admin_client, csrf_headers):
    client, csrf = admin_client
    supplier = _supplier(client, csrf_headers, csrf)

    missing = client.post(
        "/api/v1/commercial-documents",
        headers=csrf_headers(csrf),
        json={
            "kind": "purchase_order",
            "supplier_id": supplier["id"],
            "object": "Commande sans engagement",
            "status": "draft",
        },
    )
    assert missing.status_code == 422, missing.text

    created = client.post(
        "/api/v1/commercial-documents",
        headers=csrf_headers(csrf),
        json={
            "kind": "purchase_order",
            "supplier_id": supplier["id"],
            "object": "Commande avec engagement",
            "engagement_number": "ENG-2026-0099",
            "status": "draft",
            "amount_ht": 500,
            "vat_rate": 20,
        },
    )
    assert created.status_code == 201, created.text
    order = created.json()
    assert order["engagement_number"] == "ENG-2026-0099"

    duplicate = client.post(
        "/api/v1/commercial-documents",
        headers=csrf_headers(csrf),
        json={
            "kind": "purchase_order",
            "supplier_id": supplier["id"],
            "object": "Doublon engagement",
            "engagement_number": "ENG-2026-0099",
        },
    )
    assert duplicate.status_code == 409, duplicate.text


def test_commercial_statistics_and_export(admin_client, csrf_headers):
    client, csrf = admin_client
    supplier = _supplier(client, csrf_headers, csrf)
    created = client.post(
        "/api/v1/commercial-documents",
        headers=csrf_headers(csrf),
        json={
            "kind": "purchase_order",
            "supplier_id": supplier["id"],
            "object": "Statistiques achats",
            "engagement_number": f"ENG-STATS-{uuid.uuid4().hex[:6]}",
            "status": "sent",
            "amount_ht": 1000,
            "vat_rate": 20,
        },
    )
    assert created.status_code == 201, created.text
    order = created.json()

    stats = client.get("/api/v1/statistics/commercial")
    assert stats.status_code == 200, stats.text
    body = stats.json()
    assert any(document["id"] == order["id"] for document in body["documents"])
    assert any(kpi["key"] == "commercial_orders" for kpi in body["order_kpis"])
    assert all(
        kpi["key"] not in {"commercial_orders", "commercial_engaged_total"}
        for kpi in body["quote_kpis"]
    )
    assert body["quotes_by_status"] is not None
    assert body["orders_by_status"] is not None
    assert body["quotes_by_supplier"] is not None
    assert body["orders_by_supplier"] is not None

    filtered = client.get(
        "/api/v1/statistics/commercial",
        params={"supplier_id": supplier["id"], "with_engagement": True},
    )
    assert filtered.status_code == 200, filtered.text
    assert all(
        document["supplier"] == supplier["name"]
        for document in filtered.json()["documents"]
    )

    export = client.get(
        "/api/v1/exports/commercial-documents",
        params={"format": "xlsx", "supplier_id": supplier["id"]},
    )
    assert export.status_code == 200, export.text
    assert export.headers["content-type"].startswith(
        "application/vnd.openxmlformats"
    )


def test_ai_creates_quote_and_purchase_order(admin_client, csrf_headers):
    client, csrf = admin_client
    _enable_ai(client, csrf_headers(csrf))
    supplier = _supplier(client, csrf_headers, csrf)

    quote = client.post(
        "/api/v1/ai/actions/execute",
        headers=csrf_headers(csrf),
        json={
            "type": "create_quote",
            "title": "Devis IA postes",
            "description": "Devis proposé par l'assistant.",
            "supplier_name": supplier["name"],
            "amount_ht": 2000,
            "vat_rate": 20,
        },
    )
    assert quote.status_code == 200, quote.text
    assert quote.json()["link"] == "/devis"

    missing = client.post(
        "/api/v1/ai/actions/execute",
        headers=csrf_headers(csrf),
        json={
            "type": "create_purchase_order",
            "title": "Commande IA sans engagement",
            "supplier_name": supplier["name"],
        },
    )
    assert missing.status_code == 422, missing.text

    order = client.post(
        "/api/v1/ai/actions/execute",
        headers=csrf_headers(csrf),
        json={
            "type": "create_purchase_order",
            "title": "Commande IA",
            "supplier_name": supplier["name"],
            "engagement_number": "ENG-IA-2026-01",
            "amount_ht": 3000,
            "vat_rate": 20,
        },
    )
    assert order.status_code == 200, order.text
    assert order.json()["link"] == "/bons-commande"
    assert "ENG-IA-2026-01" in order.json()["message"]


def test_import_purchase_order_requires_engagement(
    admin_client, csrf_headers, monkeypatch
):
    client, csrf = admin_client
    _enable_ai(client, csrf_headers(csrf))
    supplier = _supplier(client, csrf_headers, csrf)

    def fake_complete(config, messages, max_tokens=None):  # noqa: ANN001, ARG001
        return (
            json.dumps(
                {
                    "document_type": "purchase_order",
                    "title": "Bon de commande postes",
                    "supplier": supplier["name"],
                    "reference": "BC-IMPORT-001",
                    "engagement_number": "ENG-IMPORT-77",
                    "start_date": "2026-11-01",
                    "end_date": "2026-12-15",
                    "amount_ht": 4000,
                    "amount_ttc": 4800,
                    "vat_rate": 20,
                    "summary": "Bon de commande pour quatre postes.",
                    "suggested_targets": ["purchase_order", "documentation"],
                    "confidence": 0.9,
                    "warnings": [],
                }
            ),
            None,
        )

    monkeypatch.setattr(ai_service, "_complete", fake_complete)
    analyzed = client.post(
        "/api/v1/documents/analyze",
        headers=csrf_headers(csrf),
        files={"file": ("bc.txt", b"Bon de commande 4000 EUR HT", "text/plain")},
    )
    assert analyzed.status_code == 200, analyzed.text
    body = analyzed.json()
    assert body["engagement_number"] == "ENG-IMPORT-77"

    payload = {
        "target": "purchase_order",
        "title": body["title"],
        "document_type": body["document_type"],
        "supplier": body["supplier"],
        "reference": body["reference"],
        "engagement_number": None,
        "start_date": body["start_date"],
        "end_date": body["end_date"],
        "amount_ht": body["amount_ht"],
        "amount_ttc": body["amount_ttc"],
        "vat_rate": body["vat_rate"],
        "summary": body["summary"],
    }
    missing = client.post(
        f"/api/v1/documents/intake/{body['token']}/integrate",
        headers=csrf_headers(csrf),
        json=payload,
    )
    assert missing.status_code == 422, missing.text

    payload["engagement_number"] = body["engagement_number"]
    integrated = client.post(
        f"/api/v1/documents/intake/{body['token']}/integrate",
        headers=csrf_headers(csrf),
        json=payload,
    )
    assert integrated.status_code == 200, integrated.text
    assert integrated.json()["link"] == "/bons-commande"

    listed = client.get(
        "/api/v1/commercial-documents", params={"kind": "purchase_order"}
    )
    assert listed.status_code == 200
    assert any(
        item["reference"] == "BC-IMPORT-001"
        and item["engagement_number"] == "ENG-IMPORT-77"
        for item in listed.json()
    )


def test_import_quote_document(admin_client, csrf_headers, monkeypatch):
    client, csrf = admin_client
    _enable_ai(client, csrf_headers(csrf))
    supplier = _supplier(client, csrf_headers, csrf)

    def fake_complete(config, messages, max_tokens=None):  # noqa: ANN001, ARG001
        return (
            json.dumps(
                {
                    "document_type": "quote",
                    "title": "Devis postes portables",
                    "supplier": supplier["name"],
                    "reference": "DEV-IMPORT-001",
                    "start_date": "2026-11-01",
                    "end_date": "2026-12-01",
                    "amount_ht": 5000,
                    "amount_ttc": 6000,
                    "vat_rate": 20,
                    "summary": "Devis pour cinq postes portables.",
                    "suggested_targets": ["quote", "documentation"],
                    "confidence": 0.9,
                    "warnings": [],
                }
            ),
            None,
        )

    monkeypatch.setattr(ai_service, "_complete", fake_complete)
    analyzed = client.post(
        "/api/v1/documents/analyze",
        headers=csrf_headers(csrf),
        files={
            "file": (
                "devis.txt",
                b"Devis postes portables 5000 EUR HT",
                "text/plain",
            )
        },
    )
    assert analyzed.status_code == 200, analyzed.text
    body = analyzed.json()
    integrated = client.post(
        f"/api/v1/documents/intake/{body['token']}/integrate",
        headers=csrf_headers(csrf),
        json={
            "target": "quote",
            "title": body["title"],
            "document_type": body["document_type"],
            "supplier": body["supplier"],
            "reference": body["reference"],
            "start_date": body["start_date"],
            "end_date": body["end_date"],
            "amount_ht": body["amount_ht"],
            "amount_ttc": body["amount_ttc"],
            "vat_rate": body["vat_rate"],
            "summary": body["summary"],
        },
    )
    assert integrated.status_code == 200, integrated.text
    payload = integrated.json()
    assert payload["link"] == "/devis"
    assert payload["document_id"]

    listed = client.get("/api/v1/commercial-documents", params={"kind": "quote"})
    assert listed.status_code == 200
    assert any(item["reference"] == "DEV-IMPORT-001" for item in listed.json())
