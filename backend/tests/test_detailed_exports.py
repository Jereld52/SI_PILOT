import io
from uuid import uuid4

from openpyxl import load_workbook


def _sheet_headers(workbook, name: str) -> list[str]:
    sheet = workbook[name]
    headers = next(sheet.iter_rows(min_row=1, max_row=1, values_only=True))
    return [str(value) for value in headers if value is not None]


def test_assets_detailed_export(admin_client, csrf_headers):
    client, csrf = admin_client
    categories = client.get("/api/v1/asset-categories").json()
    category = next(item for item in categories if item["code"] == "desktop")
    suffix = uuid4().hex[:8]
    created = client.post(
        "/api/v1/assets",
        headers=csrf_headers(csrf),
        json={
            "name": f"Poste détaillé {suffix}",
            "category_id": category["id"],
            "serial_number": f"SN-DETAIL-{suffix}",
            "hostname": f"pc-detail-{suffix}",
            "status": "in_service",
        },
    )
    assert created.status_code == 201, created.text
    asset_tag = created.json()["asset_tag"]

    response = client.get("/api/v1/exports/assets", params={"format": "xlsx"})
    assert response.status_code == 200, response.text
    workbook = load_workbook(io.BytesIO(response.content), read_only=True)
    assert {"Parc détaillé", "Affectations", "Synthèse"}.issubset(set(workbook.sheetnames))
    headers = _sheet_headers(workbook, "Parc détaillé")
    for expected in (
        "N° inventaire",
        "ID externe",
        "Version système",
        "E-mail agent",
        "Mise en service",
        "WAPT dernier utilisateur",
        "Commentaires",
    ):
        assert expected in headers
    rows = list(workbook["Parc détaillé"].iter_rows(min_row=2, values_only=True))
    assert any(row[0] == asset_tag for row in rows)
    workbook.close()


def test_mobile_detailed_export_excludes_secrets(admin_client):
    client, _ = admin_client
    suffix = uuid4().hex[:8]
    response = client.get("/api/v1/exports/mobile-lines", params={"format": "xlsx"})
    assert response.status_code == 200, response.text
    workbook = load_workbook(io.BytesIO(response.content), read_only=True)
    assert {"Lignes mobiles détaillées", "Synthèse"}.issubset(set(workbook.sheetnames))
    headers = _sheet_headers(workbook, "Lignes mobiles détaillées")
    for expected in (
        "SIREN",
        "Société",
        "N° titulaire",
        "Date de portabilité",
        "RIO",
        "EID",
        "N° CSIM",
        "Codes PIN/PUK disponibles",
        "Master access ID",
        "Company ID",
    ):
        assert expected in headers
    assert not {"PIN 1", "PIN 2", "PUK 1", "PUK 2"}.intersection(headers)
    assert all(suffix not in str(header) for header in headers)
    workbook.close()

    pdf = client.get("/api/v1/exports/mobile-lines", params={"format": "pdf"})
    assert pdf.status_code == 200
    assert pdf.content.startswith(b"%PDF")


def test_infrastructure_detailed_export(admin_client, csrf_headers):
    client, csrf = admin_client
    suffix = uuid4().hex[:8]
    created = client.post(
        "/api/v1/infrastructure/equipments",
        headers=csrf_headers(csrf),
        json={
            "name": f"Serveur export {suffix}",
            "type": "server",
            "role": "Supervision",
            "os_name": "Debian",
            "os_version": "12",
            "criticality": "high",
            "status": "active",
        },
    )
    assert created.status_code == 201, created.text
    equipment_id = created.json()["id"]

    second = client.post(
        "/api/v1/infrastructure/equipments",
        headers=csrf_headers(csrf),
        json={"name": f"Switch export {suffix}", "type": "switch"},
    )
    assert second.status_code == 201, second.text

    dependency = client.post(
        "/api/v1/infrastructure/dependencies",
        headers=csrf_headers(csrf),
        json={
            "source_id": equipment_id,
            "target_id": second.json()["id"],
            "dependency_type": "network",
            "description": "Lien de test",
        },
    )
    assert dependency.status_code == 201, dependency.text

    check = client.post(
        "/api/v1/infrastructure/checks",
        headers=csrf_headers(csrf),
        json={
            "infra_id": equipment_id,
            "check_type": "ping",
            "interval_seconds": 300,
            "is_enabled": False,
        },
    )
    assert check.status_code == 201, check.text

    response = client.get("/api/v1/exports/infrastructure", params={"format": "xlsx"})
    assert response.status_code == 200, response.text
    workbook = load_workbook(io.BytesIO(response.content), read_only=True)
    assert {"Équipements", "Dépendances", "Supervision", "Synthèse"}.issubset(
        set(workbook.sheetnames)
    )
    headers = _sheet_headers(workbook, "Équipements")
    for expected in (
        "Nom",
        "Inventaire lié",
        "Adresse IP",
        "Adresse MAC",
        "Responsable",
        "Équipement parent",
        "Coordonnée X",
        "Notes / configuration",
    ):
        assert expected in headers
    rows = list(workbook["Équipements"].iter_rows(min_row=2, values_only=True))
    assert any(row[0] == f"Serveur export {suffix}" for row in rows)
    dependency_rows = list(
        workbook["Dépendances"].iter_rows(min_row=2, values_only=True)
    )
    assert any(
        row[0] == f"Serveur export {suffix}" and row[1] == f"Switch export {suffix}"
        for row in dependency_rows
    )
    workbook.close()

    pdf = client.get("/api/v1/exports/infrastructure", params={"format": "pdf"})
    assert pdf.status_code == 200
    assert pdf.headers["content-type"] == "application/pdf"
    assert pdf.content.startswith(b"%PDF")
