import io
from uuid import uuid4

from PIL import Image


def test_supervision_maps_and_background(admin_client, csrf_headers):
    client, csrf = admin_client
    suffix = uuid4().hex[:8]

    created = client.post(
        "/api/v1/infrastructure/maps",
        headers=csrf_headers(csrf),
        json={
            "name": f"Plan étage {suffix}",
            "kind": "floor",
            "description": "Plan de test",
            "sort_order": 10,
        },
    )
    assert created.status_code == 201, created.text
    map_id = created.json()["id"]
    assert created.json()["has_background"] is False

    image = Image.new("RGB", (640, 480), "white")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    uploaded = client.post(
        f"/api/v1/infrastructure/maps/{map_id}/background",
        headers=csrf_headers(csrf),
        files={"file": ("plan.png", buffer.getvalue(), "image/png")},
    )
    assert uploaded.status_code == 200, uploaded.text
    assert uploaded.json()["has_background"] is True
    assert uploaded.json()["background_width"] == 640
    assert uploaded.json()["background_height"] == 480

    background = client.get(f"/api/v1/infrastructure/maps/{map_id}/background")
    assert background.status_code == 200
    assert background.headers["content-type"].startswith("image/png")
    assert background.content.startswith(b"\x89PNG")

    equipment = client.post(
        "/api/v1/infrastructure/equipments",
        headers=csrf_headers(csrf),
        json={
            "name": f"Serveur plan {suffix}",
            "type": "server",
            "infra_map_id": map_id,
        },
    )
    assert equipment.status_code == 201, equipment.text
    equipment_id = equipment.json()["id"]

    placed = client.patch(
        f"/api/v1/infrastructure/equipments/{equipment_id}",
        headers=csrf_headers(csrf),
        json={"infra_map_id": map_id, "map_x": 25.5, "map_y": 40.0},
    )
    assert placed.status_code == 200, placed.text
    assert placed.json()["infra_map_id"] == map_id

    overview = client.get("/api/v1/infrastructure/map")
    assert overview.status_code == 200, overview.text
    body = overview.json()
    assert any(item["id"] == map_id for item in body["maps"])
    match = next(row for row in body["equipments"] if row["id"] == equipment_id)
    assert match["infra_map_id"] == map_id
    assert match["map_x"] == 25.5

    deleted_background = client.delete(
        f"/api/v1/infrastructure/maps/{map_id}/background",
        headers=csrf_headers(csrf),
    )
    assert deleted_background.status_code == 200
    assert deleted_background.json()["has_background"] is False

    archived = client.delete(
        f"/api/v1/infrastructure/maps/{map_id}", headers=csrf_headers(csrf)
    )
    assert archived.status_code == 200
    assert archived.json()["is_active"] is False
