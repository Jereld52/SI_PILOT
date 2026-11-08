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
            "mobile.test@forets-parcnational.fr",
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
    assert payload["has_secrets"] is True
    assert "pin" not in payload
    assert "puk" not in payload

    secrets = client.get(f"/api/v1/mobile-lines/{payload['id']}/secrets")
    assert secrets.status_code == 200
    assert secrets.json()["pin_1"] == "1234"
    assert secrets.json()["puk_1"] == "99999999"
    assert secrets.headers.get("cache-control") == "no-store"

    audit = client.get("/api/v1/audit-logs", params={"action": "mobile_line_secrets_viewed"})
    assert audit.status_code == 200
    assert audit.json()["total"] >= 1

    updated = client.put(
        f"/api/v1/mobile-lines/{payload['id']}/secrets",
        headers=csrf_headers(csrf),
        json={"pin_1": "5678", "pin_2": "8765", "puk_1": "11112222", "puk_2": "33334444"},
    )
    assert updated.status_code == 200, updated.text
    secrets_after = client.get(f"/api/v1/mobile-lines/{payload['id']}/secrets")
    assert secrets_after.json()["pin_1"] == "5678"
    assert secrets_after.json()["puk_2"] == "33334444"


def test_technician_cannot_read_mobile_secrets(admin_client, csrf_headers):
    client, csrf = admin_client
    suffix = uuid.uuid4().hex[:6]
    created = client.post(
        "/api/v1/mobile-lines",
        headers=csrf_headers(csrf),
        json={
            "line_number": f"07 11 22 33 {suffix[:2]}" if suffix[:2].isdigit() else "07 11 22 33 55",
            "holder_name": "Secret Test",
            "pin_1": "1234",
        },
    )
    assert created.status_code == 201, created.text
    line_id = created.json()["id"]

    email = f"tech.mobile.{suffix}@forets-parcnational.fr"
    roles = client.get("/api/v1/admin/roles").json()
    technician_role = next(role for role in roles if role["code"] == "technician")
    user = client.post(
        "/api/v1/admin/users",
        headers=csrf_headers(csrf),
        json={
            "email": email,
            "password": "TechMobile2026!",
            "first_name": "Tech",
            "last_name": "Mobile",
            "role_id": technician_role["id"],
            "data_scope": "service",
            "is_active": True,
        },
    )
    assert user.status_code == 201
    login = client.post("/api/v1/auth/login", json={"email": email, "password": "TechMobile2026!"})
    assert login.status_code == 200
    assert client.get("/api/v1/mobile-lines").status_code == 200
    denied = client.get(f"/api/v1/mobile-lines/{line_id}/secrets")
    assert denied.status_code == 403


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

    detail = client.get(f"/api/v1/assets/{asset['id']}")
    assert detail.status_code == 200
    assert detail.json()["wapt_status"] == "OK"
    assert detail.json()["external_data"]["machine"] == f"pc-test-{suffix}.ecb.pn.local"
