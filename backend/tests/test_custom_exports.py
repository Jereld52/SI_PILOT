import io
from uuid import uuid4

from openpyxl import load_workbook


def _headers(workbook) -> list[str]:
    values = next(workbook["Export"].iter_rows(min_row=1, max_row=1, values_only=True))
    return [str(value) for value in values if value is not None]


def test_custom_export_catalog(admin_client):
    client, _ = admin_client
    response = client.get("/api/v1/exports/custom/catalog")
    assert response.status_code == 200, response.text
    datasets = {item["key"]: item for item in response.json()}
    for key in (
        "assets",
        "mobile_lines",
        "infrastructure",
        "stock",
        "suppliers",
        "licenses",
        "contracts",
        "projects",
        "security_incidents",
        "rgpd_processing",
        "tickets",
    ):
        assert key in datasets, key
    asset_columns = {column["key"]: column for column in datasets["assets"]["columns"]}
    assert asset_columns["asset_tag"]["default"] is True
    assert asset_columns["wapt_last_user"]["default"] is False
    mobile_columns = {column["key"] for column in datasets["mobile_lines"]["columns"]}
    assert "has_secrets" in mobile_columns
    assert "pin_1_encrypted" not in mobile_columns
    assert "puk_1_encrypted" not in mobile_columns


def test_custom_assets_export_with_selected_columns(admin_client, csrf_headers):
    client, csrf = admin_client
    categories = client.get("/api/v1/asset-categories").json()
    category = next(item for item in categories if item["code"] == "desktop")
    suffix = uuid4().hex[:8]
    created = client.post(
        "/api/v1/assets",
        headers=csrf_headers(csrf),
        json={
            "name": f"Poste sur mesure {suffix}",
            "category_id": category["id"],
            "serial_number": f"SN-CUSTOM-{suffix}",
            "hostname": f"pc-custom-{suffix}",
            "status": "in_service",
        },
    )
    assert created.status_code == 201, created.text
    asset_tag = created.json()["asset_tag"]

    response = client.get(
        "/api/v1/exports/custom",
        params={
            "dataset": "assets",
            "columns": "asset_tag,name,status",
            "format": "xlsx",
        },
    )
    assert response.status_code == 200, response.text
    workbook = load_workbook(io.BytesIO(response.content), read_only=True)
    assert workbook.sheetnames == ["Export"]
    assert _headers(workbook) == ["N° inventaire", "Nom", "État"]
    rows = list(workbook["Export"].iter_rows(min_row=2, values_only=True))
    assert any(row[0] == asset_tag for row in rows)
    assert all(len(row) == 3 for row in rows)
    workbook.close()

    filtered = client.get(
        "/api/v1/exports/custom",
        params={
            "dataset": "assets",
            "columns": "asset_tag,name",
            "q": suffix,
            "format": "xlsx",
        },
    )
    assert filtered.status_code == 200, filtered.text
    workbook = load_workbook(io.BytesIO(filtered.content), read_only=True)
    rows = list(workbook["Export"].iter_rows(min_row=2, values_only=True))
    assert len(rows) == 1
    assert rows[0][0] == asset_tag
    workbook.close()

    pdf = client.get(
        "/api/v1/exports/custom",
        params={
            "dataset": "assets",
            "columns": "asset_tag,name,status",
            "format": "pdf",
        },
    )
    assert pdf.status_code == 200
    assert pdf.headers["content-type"] == "application/pdf"
    assert pdf.content.startswith(b"%PDF")


def test_custom_export_unknown_dataset(admin_client):
    client, _ = admin_client
    response = client.get(
        "/api/v1/exports/custom",
        params={"dataset": "unknown", "format": "xlsx"},
    )
    assert response.status_code == 422


def test_custom_export_covers_every_dataset(admin_client):
    client, _ = admin_client
    catalog = client.get("/api/v1/exports/custom/catalog")
    assert catalog.status_code == 200
    for dataset in catalog.json():
        response = client.get(
            "/api/v1/exports/custom",
            params={"dataset": dataset["key"], "format": "xlsx"},
        )
        assert response.status_code == 200, (dataset["key"], response.text)
        assert response.content.startswith(b"PK")

