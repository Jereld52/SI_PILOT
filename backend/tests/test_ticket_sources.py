from uuid import uuid4


def test_ticket_accepts_tchap_source(admin_client, csrf_headers):
    client, csrf = admin_client
    meta = client.get("/api/v1/tickets/meta").json()

    response = client.post(
        "/api/v1/tickets",
        headers=csrf_headers(csrf),
        json={
            "subject": f"Demande Tchap {uuid4().hex[:8]}",
            "description": "Demande reçue via Tchap.",
            "category_id": meta["categories"][0]["id"],
            "priority_id": meta["priorities"][0]["id"],
            "source": "tchap",
        },
    )

    assert response.status_code == 201, response.text
    assert response.json()["source"] == "tchap"
