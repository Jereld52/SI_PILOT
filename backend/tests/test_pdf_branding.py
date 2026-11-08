from uuid import uuid4


def test_pdf_exports_include_branding_and_title(admin_client, csrf_headers):
    client, csrf = admin_client
    suffix = uuid4().hex[:8]
    categories = client.get("/api/v1/asset-categories").json()
    category = next(item for item in categories if item["code"] == "desktop")
    asset = client.post(
        "/api/v1/assets",
        headers=csrf_headers(csrf),
        json={
            "name": f"Poste PDF {suffix}",
            "category_id": category["id"],
            "serial_number": f"SN-PDF-{suffix}",
            "hostname": f"pc-pdf-{suffix}",
            "status": "in_service",
        },
    )
    assert asset.status_code == 201, asset.text

    endpoints = [
        "/api/v1/exports/assets?format=pdf",
        "/api/v1/exports/mobile-lines?format=pdf",
        "/api/v1/exports/infrastructure?format=pdf",
        "/api/v1/exports/rgpd?format=pdf",
        "/api/v1/exports/statistics?format=pdf",
        "/api/v1/exports/custom?dataset=assets&format=pdf",
    ]
    for endpoint in endpoints:
        response = client.get(endpoint)
        assert response.status_code == 200, (endpoint, response.text)
        assert response.content.startswith(b"%PDF"), endpoint
        assert b"/Subtype /Image" in response.content, endpoint
        assert b"/Title" in response.content, endpoint
