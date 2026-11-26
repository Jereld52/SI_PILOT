import json
import uuid

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


def test_document_intake_history_and_ocr_settings(admin_client, csrf_headers, monkeypatch):
    client, csrf = admin_client
    _enable_ai(client, csrf_headers(csrf))
    batch_id = f"batch-{uuid.uuid4().hex[:10]}"
    title = f"Contrat historique {uuid.uuid4().hex[:6]}"

    def fake_complete(config, messages, max_tokens=None):  # noqa: ANN001, ARG001
        return (
            json.dumps(
                {
                    "document_type": "contract",
                    "title": title,
                    "supplier": "Fournisseur historique",
                    "reference": "CTR-HIST-001",
                    "engagement_number": None,
                    "start_date": "2026-01-01",
                    "end_date": "2026-12-31",
                    "amount_ht": 1000,
                    "amount_ttc": 1200,
                    "vat_rate": 20,
                    "summary": "Contrat de test pour l'historique.",
                    "suggested_targets": ["documentation", "contract"],
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
        data={"batch_id": batch_id},
        files={"file": ("contrat.txt", b"Contrat 1000 EUR HT", "text/plain")},
    )
    assert analyzed.status_code == 200, analyzed.text
    body = analyzed.json()
    assert body["ocr_used"] is False

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

    history = client.get(
        "/api/v1/documents/intake/history", params={"q": title}
    )
    assert history.status_code == 200, history.text
    page = history.json()
    assert page["total"] >= 1
    item = next(row for row in page["items"] if row["title"] == title)
    assert item["batch_id"] == batch_id
    assert item["status"] == "integrated"
    assert item["target"] == "documentation"
    assert item["ocr_used"] is False
    assert item["link"] == "/documentation"

    ocr = client.get("/api/v1/admin/settings/ocr")
    assert ocr.status_code == 200, ocr.text
    assert "available" in ocr.json()

    updated = client.put(
        "/api/v1/admin/settings/ocr",
        headers=csrf_headers(csrf),
        json={
            "enabled": True,
            "tesseract_command": "",
            "language": "fra+eng",
            "max_pages": 10,
            "dpi": 200,
            "tessdata_dir": "",
        },
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["language"] == "fra+eng"
