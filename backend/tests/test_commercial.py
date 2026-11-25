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
    )
    assert converted.status_code == 200, converted.text
    order = converted.json()
    assert order["kind"] == "purchase_order"
    assert order["reference"].startswith("BC-")
    assert order["source_document_id"] == quote["id"]

    refreshed = client.get(f"/api/v1/commercial-documents/{quote['id']}")
    assert refreshed.status_code == 200
    assert refreshed.json()["status"] == "converted"

    cancelled = client.delete(
        f"/api/v1/commercial-documents/{order['id']}",
        headers=csrf_headers(csrf),
    )
    assert cancelled.status_code == 204, cancelled.text


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
