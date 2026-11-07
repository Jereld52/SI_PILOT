from uuid import UUID, uuid4

from app.db.session import SessionLocal
from app.models.assets import Asset
from sqlalchemy import select


def test_asset_detail_qr_and_exports(admin_client, csrf_headers):
    client, csrf = admin_client
    categories = client.get("/api/v1/asset-categories").json()
    category = next(item for item in categories if item["code"] == "desktop")
    suffix = uuid4().hex[:8]
    created = client.post(
        "/api/v1/assets",
        headers=csrf_headers(csrf),
        json={
            "name": f"Poste export {suffix}",
            "category_id": category["id"],
            "serial_number": f"SN-EXPORT-{suffix}",
            "hostname": f"pc-export-{suffix}",
            "status": "in_service",
        },
    )
    assert created.status_code == 201, created.text
    asset_id = created.json()["id"]

    detail = client.get(f"/api/v1/assets/{asset_id}")
    assert detail.status_code == 200
    assert detail.json()["asset_tag"] == created.json()["asset_tag"]

    with SessionLocal() as db:
        token = db.scalar(select(Asset.qr_token).where(Asset.id == UUID(asset_id)))
    assert token

    by_qr = client.get(f"/api/v1/assets/by-qr/{token}")
    assert by_qr.status_code == 200
    assert by_qr.json()["id"] == asset_id

    qr = client.get(f"/api/v1/assets/{asset_id}/qr")
    assert qr.status_code == 200
    assert qr.headers["content-type"].startswith("image/png")
    assert qr.content.startswith(b"\x89PNG")

    xlsx = client.get("/api/v1/exports/assets", params={"format": "xlsx"})
    assert xlsx.status_code == 200
    assert "spreadsheetml" in xlsx.headers["content-type"]
    assert xlsx.content.startswith(b"PK")

    pdf = client.get("/api/v1/exports/assets", params={"format": "pdf"})
    assert pdf.status_code == 200
    assert pdf.headers["content-type"] == "application/pdf"
    assert pdf.content.startswith(b"%PDF")

    mobile_xlsx = client.get("/api/v1/exports/mobile-lines", params={"format": "xlsx"})
    assert mobile_xlsx.status_code == 200
    assert mobile_xlsx.content.startswith(b"PK")
