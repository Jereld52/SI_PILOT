from uuid import uuid4


def test_mobile_line_create_update_delete(admin_client, csrf_headers):
    client, csrf = admin_client
    suffix = uuid4().hex[:8]
    line_number = f"07{suffix[:8]}"
    created = client.post(
        "/api/v1/mobile-lines",
        headers=csrf_headers(csrf),
        json={
            "line_number": line_number,
            "holder_name": "Agent Mobile",
            "plan_name": "Forfait test",
            "status": "Actif",
        },
    )
    assert created.status_code == 201, created.text
    line_id = created.json()["id"]

    updated = client.patch(
        f"/api/v1/mobile-lines/{line_id}",
        headers=csrf_headers(csrf),
        json={"holder_name": "Agent Mobile Modifié", "plan_name": "Forfait modifié"},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["holder_name"] == "Agent Mobile Modifié"

    deleted = client.delete(
        f"/api/v1/mobile-lines/{line_id}", headers=csrf_headers(csrf)
    )
    assert deleted.status_code == 204, deleted.text

    listed = client.get("/api/v1/mobile-lines", params={"q": line_number})
    assert listed.status_code == 200
    assert all(row["id"] != line_id for row in listed.json()["items"])
