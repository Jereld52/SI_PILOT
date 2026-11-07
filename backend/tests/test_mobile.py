import io
import uuid

from openpyxl import Workbook


def test_mobile_line_crud(admin_client, csrf_headers):
    client, csrf = admin_client
    suffix = uuid.uuid4().hex[:6]
    line_number = f"06 11 22 33 {suffix[:2]}" if suffix[:2].isdigit() else "06 11 22 33 44"

    created = client.post(
        "/api/v1/mobile-lines",
        headers=csrf_headers(csrf),
        json={
            "line_number": line_number,
            "holder_name": "Titulaire Test",
            "role_label": "Testeur",
            "status": "Actif",
            "plan_name": "Forfait test",
        },
    )
    assert created.status_code == 201, created.text
    line = created.json()
    assert line["line_number"] == "0611223344" or line["line_number"].startswith("06112233")

    listing = client.get("/api/v1/mobile-lines", params={"q": "Titulaire Test"})
    assert listing.status_code == 200
    assert listing.json()["total"] >= 1

    updated = client.patch(
        f"/api/v1/mobile-lines/{line['id']}",
        headers=csrf_headers(csrf),
        json={"role_label": "Responsable test", "status": "Suspendu"},
    )
    assert updated.status_code == 200
    assert updated.json()["role_label"] == "Responsable test"
    assert updated.json()["status"] == "Suspendu"

    duplicate = client.post(
        "/api/v1/mobile-lines",
        headers=csrf_headers(csrf),
        json={"line_number": line["line_number"], "holder_name": "Doublon"},
    )
    assert duplicate.status_code == 409


def test_mobile_xlsx_import(admin_client, csrf_headers):
    client, csrf = admin_client
    suffix = uuid.uuid4().hex[:4]
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Lignes_Mobile"
    sheet.append(
        [
            "Référence",
            "Civilité",
            "Nom",
            "Prénom",
            "E-mail",
            "Statut Ligne",
            "Forfait",
            "Date de mise  en service",
            "Date de Fin de  Période d'Engagement",
            "PIN 1",
            "PUK 1",
        ]
    )
    sheet.append(
        [
            f"06 44 55 66 {suffix[:2]}",
            "M.",
            "Import Mobile",
            "Technicien",
            "mobile.test@pnfor.fr",
            "Actif",
            "Forfait import",
            "01/01/2026",
            "01/01/2028",
            "1234",
            "99999999",
        ]
    )
    buffer = io.BytesIO()
    workbook.save(buffer)
    buffer.seek(0)

    response = client.post(
        "/api/v1/imports/preview",
        headers=csrf_headers(csrf),
        data={"entity_type": "mobile_lines"},
        files={
            "file": (
                "lignes_mobiles.xlsx",
                buffer.getvalue(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    assert response.status_code == 200, response.text
    preview = response.json()
    assert preview["detected_format"] == "xlsx"
    assert preview["job"]["valid_rows"] == 1
    assert preview["can_apply"] is True

    applied = client.post(
        f"/api/v1/imports/{preview['job']['id']}/apply", headers=csrf_headers(csrf)
    )
    assert applied.status_code == 200, applied.text
    assert applied.json()["created"] == 1

    found = client.get("/api/v1/mobile-lines", params={"q": "Import Mobile"})
    assert found.status_code == 200
    assert found.json()["total"] == 1
    payload = found.json()["items"][0]
    assert payload["plan_name"] == "Forfait import"
    assert "pin" not in payload
    assert "puk" not in payload


def test_wapt_csv_import(admin_client, csrf_headers):
    client, csrf = admin_client
    suffix = uuid.uuid4().hex[:8]
    csv_content = (
        "Machine,Numéro de série,Système d'exploitation,Manufacteur,Modèle,Adresse IP,Adresse MAC,Statut,Joignable,DN dans l'AD,uuid,Date d'achat\n"
        f"pc-test-{suffix}.ecb.pn.local,SN-WAPT-{suffix},Windows 11 Pro,HP,EliteDesk,192.0.2.20,00:11:22:33:44:66,OK,OK,"
        f"\"CN=PC-TEST,OU=Desktops,OU=PC,OU=Computers,OU=ECB,DC=ecb,DC=pn,DC=local\",{uuid.uuid4()},01/01/2025\n"
    )
    response = client.post(
        "/api/v1/imports/preview",
        headers=csrf_headers(csrf),
        data={"entity_type": "assets"},
        files={"file": ("PC-PNfor.csv", csv_content.encode("utf-8"), "text/csv")},
    )
    assert response.status_code == 200, response.text
    preview = response.json()
    assert preview["detected_format"] == "wapt"
    assert preview["job"]["valid_rows"] == 1
    assert preview["rows"][0]["status"] == "valid"

    applied = client.post(
        f"/api/v1/imports/{preview['job']['id']}/apply", headers=csrf_headers(csrf)
    )
    assert applied.status_code == 200, applied.text
    assert applied.json()["created"] == 1

    found = client.get("/api/v1/assets", params={"q": f"pc-test-{suffix}"})
    assert found.status_code == 200
    assert found.json()["total"] == 1
    asset = found.json()["items"][0]
    assert asset["external_id"]
    assert asset["asset_tag"].startswith("PNFOR-PC-")
    assert asset["hostname"] == f"pc-test-{suffix}.ecb.pn.local"
