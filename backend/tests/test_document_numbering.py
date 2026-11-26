import re
from datetime import date


def _create_ticket(client, csrf, csrf_headers):
    meta = client.get("/api/v1/tickets/meta")
    assert meta.status_code == 200, meta.text
    body = meta.json()
    payload = {
        "subject": "Demande de test numérotation",
        "description": "Vérification du format de référence.",
        "category_id": body["categories"][0]["id"],
        "priority_id": body["priorities"][0]["id"],
        "source": "direct",
    }
    response = client.post(
        "/api/v1/tickets", headers=csrf_headers(csrf), json=payload
    )
    assert response.status_code == 201, response.text
    return response.json()["reference"]


def test_document_numbering_settings(admin_client, csrf_headers):
    client, csrf = admin_client
    year = date.today().year
    short_year = f"{year % 100:02d}"

    initial = client.get("/api/v1/admin/settings/document-numbering")
    assert initial.status_code == 200, initial.text
    assert initial.json()["scheme"] == "short_year"
    assert initial.json()["preview"] == f"DEM-{short_year}-0001"

    full = client.put(
        "/api/v1/admin/settings/document-numbering",
        headers=csrf_headers(csrf),
        json={"scheme": "full_year", "sequence_length": 3},
    )
    assert full.status_code == 200, full.text
    assert full.json()["preview"] == f"DEM-{year}-001"
    reference = _create_ticket(client, csrf, csrf_headers)
    assert re.fullmatch(rf"DEM-{year}-\d{{3}}", reference), reference

    short = client.put(
        "/api/v1/admin/settings/document-numbering",
        headers=csrf_headers(csrf),
        json={"scheme": "short_year", "sequence_length": 4},
    )
    assert short.status_code == 200, short.text
    reference = _create_ticket(client, csrf, csrf_headers)
    assert re.fullmatch(rf"DEM-{short_year}-\d{{4}}", reference), reference

    simple = client.put(
        "/api/v1/admin/settings/document-numbering",
        headers=csrf_headers(csrf),
        json={"scheme": "simple", "sequence_length": 2},
    )
    assert simple.status_code == 200, simple.text
    assert simple.json()["preview"] == "DEM-01"
    reference = _create_ticket(client, csrf, csrf_headers)
    assert re.fullmatch(r"DEM-\d{2,}", reference), reference
    assert str(year) not in reference

    restored = client.put(
        "/api/v1/admin/settings/document-numbering",
        headers=csrf_headers(csrf),
        json={"scheme": "short_year", "sequence_length": 4},
    )
    assert restored.status_code == 200, restored.text
