from uuid import uuid4


def test_stock_item_lifecycle(admin_client, csrf_headers):
    client, csrf = admin_client
    suffix = uuid4().hex[:8]

    created = client.post(
        "/api/v1/stock/items",
        headers=csrf_headers(csrf),
        json={
            "name": f"Clavier {suffix}",
            "category": "keyboard",
            "brand": "Logitech",
            "model": "K120",
            "unit": "pièce",
            "initial_quantity": 5,
            "min_quantity": 2,
            "unit_price": 25.5,
        },
    )
    assert created.status_code == 201, created.text
    item = created.json()
    assert item["reference"].startswith("STK-")
    assert item["quantity"] == 5
    assert item["is_low"] is False
    assert item["stock_value"] == 127.5
    item_id = item["id"]

    outbound = client.post(
        f"/api/v1/stock/items/{item_id}/movements",
        headers=csrf_headers(csrf),
        json={"direction": "out", "quantity": 3, "reason": "Affectation agent"},
    )
    assert outbound.status_code == 201, outbound.text
    assert outbound.json()["quantity"] == 2
    assert outbound.json()["is_low"] is True

    blocked = client.post(
        f"/api/v1/stock/items/{item_id}/movements",
        headers=csrf_headers(csrf),
        json={"direction": "out", "quantity": 10, "reason": "Test stock insuffisant"},
    )
    assert blocked.status_code == 422

    adjustment = client.post(
        f"/api/v1/stock/items/{item_id}/movements",
        headers=csrf_headers(csrf),
        json={"direction": "adjustment", "quantity": 10, "reason": "Inventaire"},
    )
    assert adjustment.status_code == 201, adjustment.text
    assert adjustment.json()["quantity"] == 10
    assert adjustment.json()["is_low"] is False
    assert len(adjustment.json()["movements"]) == 3

    updated = client.patch(
        f"/api/v1/stock/items/{item_id}",
        headers=csrf_headers(csrf),
        json={"min_quantity": 20, "unit_price": 30},
    )
    assert updated.status_code == 200
    assert updated.json()["is_low"] is True
    assert updated.json()["stock_value"] == 300.0

    overview = client.get("/api/v1/stock/overview")
    assert overview.status_code == 200
    body = overview.json()
    assert body["total_items"] >= 1
    assert body["low_stock_count"] >= 1
    assert any(category["category"] == "keyboard" for category in body["categories"])

    listed = client.get("/api/v1/stock/items", params={"low_only": True})
    assert listed.status_code == 200
    assert any(row["id"] == item_id for row in listed.json())

    archived = client.delete(
        f"/api/v1/stock/items/{item_id}", headers=csrf_headers(csrf)
    )
    assert archived.status_code == 200
    assert archived.json()["status"] == "archived"

    after_archive = client.get("/api/v1/stock/items", params={"q": suffix})
    assert after_archive.status_code == 200
    assert all(row["id"] != item_id for row in after_archive.json())
