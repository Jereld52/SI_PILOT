import json

from app.services import ai_service


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


def test_ticket_triage(admin_client, csrf_headers, monkeypatch):
    client, csrf = admin_client
    _enable_ai(client, csrf_headers(csrf))
    meta = client.get("/api/v1/tickets/meta").json()
    category = meta["categories"][0]
    priority = meta["priorities"][0]
    created = client.post(
        "/api/v1/tickets",
        headers=csrf_headers(csrf),
        json={
            "subject": "Imprimante inaccessible",
            "description": "L'imprimante du service ne répond plus depuis ce matin.",
            "category_id": category["id"],
            "priority_id": priority["id"],
        },
    )
    assert created.status_code == 201, created.text
    ticket_id = created.json()["id"]

    def fake_complete(config, messages, max_tokens=None):  # noqa: ANN001, ARG001
        return (
            json.dumps(
                {
                    "summary": "L'imprimante du service est inaccessible.",
                    "category": "printing",
                    "priority": "high",
                    "missing_info": ["Numéro de l'imprimante"],
                    "suggested_reply": "Bonjour, nous vérifions l'imprimante.",
                    "confidence": 0.86,
                }
            ),
            None,
        )

    monkeypatch.setattr(ai_service, "_complete", fake_complete)
    response = client.post(
        f"/api/v1/tickets/{ticket_id}/ai/triage",
        headers=csrf_headers(csrf),
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["summary"].startswith("L'imprimante")
    assert body["priority_code"] == "high"
    assert body["category_code"] in {"printing", category["code"]}
    assert body["missing_info"] == ["Numéro de l'imprimante"]
    assert body["suggested_reply"]
    assert body["confidence"] == 0.86


def test_ai_creates_ticket_from_sentence(admin_client, csrf_headers, monkeypatch):
    client, csrf = admin_client
    _enable_ai(client, csrf_headers(csrf))
    meta = client.get("/api/v1/tickets/meta").json()
    category = meta["categories"][0]
    priority = meta["priorities"][0]

    def fake_complete(config, messages, max_tokens=None):  # noqa: ANN001, ARG001
        return (
            "Je prépare la demande.\n"
            "```action\n"
            + json.dumps(
                {
                    "type": "create_ticket",
                    "title": "Écran cassé sur le poste de Marie",
                    "description": "Écran fissuré, remplacement nécessaire.",
                    "priority": priority["code"],
                    "category": category["code"],
                }
            )
            + "\n```",
            None,
        )

    monkeypatch.setattr(ai_service, "_complete", fake_complete)
    chat = client.post(
        "/api/v1/ai/chat",
        headers=csrf_headers(csrf),
        json={
            "messages": [
                {
                    "role": "user",
                    "content": "Crée une demande pour le PC de Marie, écran cassé.",
                }
            ]
        },
    )
    assert chat.status_code == 200, chat.text
    action = chat.json()["actions"][0]
    assert action["type"] == "create_ticket"

    executed = client.post(
        "/api/v1/ai/actions/execute",
        headers=csrf_headers(csrf),
        json=action,
    )
    assert executed.status_code == 200, executed.text
    assert "Demande" in executed.json()["message"]


def test_document_analysis_and_integration(admin_client, csrf_headers, monkeypatch):
    client, csrf = admin_client
    _enable_ai(client, csrf_headers(csrf))

    def fake_complete(config, messages, max_tokens=None):  # noqa: ANN001, ARG001
        return (
            json.dumps(
                {
                    "document_type": "contract",
                    "title": "Contrat de maintenance réseau",
                    "supplier": "Réseau Test",
                    "reference": "CTR-2026-001",
                    "start_date": "2026-01-01",
                    "end_date": "2026-12-31",
                    "amount_ht": 1200,
                    "amount_ttc": 1440,
                    "vat_rate": 20,
                    "summary": "Contrat annuel de maintenance réseau.",
                    "suggested_targets": ["contract", "documentation"],
                    "confidence": 0.91,
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
                "contrat.txt",
                b"Contrat de maintenance reseau 2026 - 1200 EUR HT",
                "text/plain",
            )
        },
    )
    assert analyzed.status_code == 200, analyzed.text
    body = analyzed.json()
    assert body["document_type"] == "contract"
    assert body["amount_ttc"] == 1440
    assert body["token"]

    integrated = client.post(
        f"/api/v1/documents/intake/{body['token']}/integrate",
        headers=csrf_headers(csrf),
        json={
            "target": "documentation",
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
    assert integrated.json()["document_id"]
    assert "archivé" in integrated.json()["message"]
