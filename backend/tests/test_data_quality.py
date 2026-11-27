import uuid


def test_data_quality_detects_asset_without_location(admin_client, csrf_headers):
    client, csrf = admin_client
    categories = client.get("/api/v1/asset-categories")
    assert categories.status_code == 200, categories.text
    desktop = next(item for item in categories.json() if item["code"] == "desktop")

    suffix = uuid.uuid4().hex[:8]
    created = client.post(
        "/api/v1/assets",
        headers=csrf_headers(csrf),
        json={
            "name": f"Poste qualite {suffix}",
            "category_id": desktop["id"],
            "status": "in_service",
        },
    )
    assert created.status_code == 201, created.text
    asset = created.json()

    response = client.get("/api/v1/data-quality/overview")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] >= 1
    assert isinstance(body["sections"], list)

    location_section = next(
        (section for section in body["sections"] if section["key"] == "asset_location"),
        None,
    )
    assert location_section is not None
    assert any(
        item["entity_id"] == asset["id"] for item in location_section["items"]
    )
    assert any(
        item["action_label"] == "Compléter"
        for item in location_section["items"]
        if item["entity_id"] == asset["id"]
    )



def test_data_quality_detects_document_without_version(admin_client, csrf_headers):
    client, csrf = admin_client
    suffix = uuid.uuid4().hex[:8]
    created = client.post(
        "/api/v1/documents",
        headers=csrf_headers(csrf),
        json={
            "title": f"Procedure qualite {suffix}",
            "doc_type": "procedure",
            "description": "Document de test sans version.",
            "status": "draft",
        },
    )
    assert created.status_code == 201, created.text
    document = created.json()

    response = client.get("/api/v1/data-quality/overview")
    assert response.status_code == 200, response.text
    section = next(
        (
            item
            for item in response.json()["sections"]
            if item["key"] == "document_without_version"
        ),
        None,
    )
    assert section is not None
    assert any(item["entity_id"] == document["id"] for item in section["items"])

    archived = client.delete(
        f"/api/v1/documents/{document['id']}",
        headers=csrf_headers(csrf),
    )
    assert archived.status_code == 200, archived.text
