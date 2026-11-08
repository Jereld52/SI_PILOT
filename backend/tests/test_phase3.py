from uuid import uuid4

import pytest


def ensure_referentials(client, csrf, csrf_headers):
    services = client.get("/api/v1/services").json()
    service = next((item for item in services if item["code"] == "DSI"), None)
    if service is None:
        response = client.post(
            "/api/v1/services",
            headers=csrf_headers(csrf),
            json={"code": "DSI", "name": "Direction des systèmes d'information"},
        )
        assert response.status_code == 201, response.text
        service = response.json()

    locations = client.get("/api/v1/locations").json()
    location = next((item for item in locations if item["code"] == "SIEGE"), None)
    if location is None:
        response = client.post(
            "/api/v1/locations",
            headers=csrf_headers(csrf),
            json={"code": "SIEGE", "name": "Siège du Parc", "city": "Arc-en-Barrois"},
        )
        assert response.status_code == 201, response.text
        location = response.json()

    agents = client.get("/api/v1/agents", params={"q": "jean.test@forets-parcnational.fr"}).json()
    if agents["total"] == 0:
        response = client.post(
            "/api/v1/agents",
            headers=csrf_headers(csrf),
            json={
                "first_name": "Jean",
                "last_name": "Test",
                "email_pro": "jean.test@forets-parcnational.fr",
                "service_id": service["id"],
                "location_id": location["id"],
                "function_label": "Technicien",
                "status": "active",
            },
        )
        assert response.status_code == 201, response.text
        agent = response.json()
    else:
        agent = agents["items"][0]

    return service, location, agent


@pytest.fixture
def base_data(admin_client, csrf_headers):
    client, csrf = admin_client
    service, location, agent = ensure_referentials(client, csrf, csrf_headers)
    return {
        "client": client,
        "csrf": csrf,
        "headers": csrf_headers(csrf),
        "service": service,
        "location": location,
        "agent": agent,
    }


def test_referentials_and_custom_asset_naming(base_data):
    client = base_data["client"]
    headers = base_data["headers"]
    categories = client.get("/api/v1/asset-categories").json()
    desktop = next(item for item in categories if item["code"] == "desktop")
    response = client.patch(
        f"/api/v1/asset-categories/{desktop['id']}",
        headers=headers,
        json={
            "tag_prefix": "PC",
            "tag_template": "PNFOR-PC-{YEAR}-{SEQ:3}",
            "tag_sequence_mode": "year",
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["tag_template"] == "PNFOR-PC-{YEAR}-{SEQ:3}"

    preview = client.get("/api/v1/assets/next-tag", params={"category_id": desktop["id"]})
    assert preview.status_code == 200
    assert preview.json()["tag"].startswith("PNFOR-PC-")
    assert preview.json()["prefix"] == "PC"

    suffix = uuid4().hex[:8]
    response = client.post(
        "/api/v1/assets",
        headers=headers,
        json={
            "name": f"Poste test {suffix}",
            "category_id": desktop["id"],
            "assigned_agent_id": base_data["agent"]["id"],
            "serial_number": f"SN-PC-{suffix}",
            "status": "in_service",
            "condition": "good",
        },
    )
    assert response.status_code == 201, response.text
    asset = response.json()
    assert asset["asset_tag"].startswith("PNFOR-PC-")
    assert asset["assigned_agent"]["email_pro"] == "jean.test@forets-parcnational.fr"

    history = client.get(f"/api/v1/assets/{asset['id']}/history")
    assert history.status_code == 200
    assert len(history.json()) == 1
    assert history.json()[0]["agent_name"] == "Jean Test"


def test_agent_csv_import(base_data):
    client = base_data["client"]
    headers = base_data["headers"]
    suffix = uuid4().hex[:8]
    email = f"import.agent.{suffix}@forets-parcnational.fr"
    csv_content = (
        "nom;prenom;email_pro;telephone;service_code;fonction;site_code;login;date_arrivee;date_depart;statut;notes\n"
        f"Import;Agent;{email};0102030405;DSI;Technicien;SIEGE;import.{suffix};01/01/2026;;active;Test import\n"
    )
    response = client.post(
        "/api/v1/imports/preview",
        headers=headers,
        data={"entity_type": "agents"},
        files={"file": ("agents.csv", csv_content.encode("utf-8"), "text/csv")},
    )
    assert response.status_code == 200, response.text
    preview = response.json()
    assert preview["job"]["valid_rows"] == 1
    assert preview["can_apply"] is True

    applied = client.post(f"/api/v1/imports/{preview['job']['id']}/apply", headers=headers)
    assert applied.status_code == 200, applied.text
    assert applied.json()["created"] == 1

    found = client.get("/api/v1/agents", params={"q": email})
    assert found.status_code == 200
    assert found.json()["total"] == 1


def test_asset_csv_import_and_duplicate(base_data):
    client = base_data["client"]
    headers = base_data["headers"]
    suffix = uuid4().hex[:8]
    serial = f"SN-IMP-{suffix}"
    csv_content = (
        "nom;numero_inventaire;categorie_code;marque;modele;numero_serie;mac;ip;nom_machine;os;version_os;date_achat;date_mise_en_service;fin_garantie;prix;agent_email;service_code;site_code;etat;commentaires\n"
        f"Imprimante {suffix};;printer;HP;LaserJet;{serial};;;PRINT-{suffix};Windows;1;01/01/2025;15/01/2025;01/01/2028;250,00;jean.test@forets-parcnational.fr;DSI;SIEGE;in_stock;Test import\n"
    )
    response = client.post(
        "/api/v1/imports/preview",
        headers=headers,
        data={"entity_type": "assets"},
        files={"file": ("assets.csv", csv_content.encode("utf-8"), "text/csv")},
    )
    assert response.status_code == 200, response.text
    preview = response.json()
    assert preview["job"]["valid_rows"] == 1
    assert preview["rows"][0]["status"] == "valid"

    applied = client.post(f"/api/v1/imports/{preview['job']['id']}/apply", headers=headers)
    assert applied.status_code == 200, applied.text
    assert applied.json()["created"] == 1

    found = client.get("/api/v1/assets", params={"q": f"Imprimante {suffix}"})
    assert found.status_code == 200
    assert found.json()["total"] == 1
    assert found.json()["items"][0]["asset_tag"].startswith("PNFOR-IMP-")

    duplicate = client.post(
        "/api/v1/imports/preview",
        headers=headers,
        data={"entity_type": "assets"},
        files={"file": ("assets.csv", csv_content.encode("utf-8"), "text/csv")},
    )
    assert duplicate.status_code == 200
    assert duplicate.json()["job"]["duplicate_rows"] == 1
    assert duplicate.json()["rows"][0]["status"] == "duplicate"


def test_technician_cannot_manage_referentials_or_import(admin_client, csrf_headers):
    client, csrf = admin_client
    suffix = uuid4().hex[:8]
    email = f"tech.phase3.{suffix}@forets-parcnational.fr"
    roles = client.get("/api/v1/admin/roles").json()
    technician_role = next(role for role in roles if role["code"] == "technician")
    created = client.post(
        "/api/v1/admin/users",
        headers=csrf_headers(csrf),
        json={
            "email": email,
            "password": "TechPhase3_2026!",
            "first_name": "Tech",
            "last_name": "Phase3",
            "role_id": technician_role["id"],
            "data_scope": "service",
            "is_active": True,
        },
    )
    assert created.status_code == 201

    login = client.post("/api/v1/auth/login", json={"email": email, "password": "TechPhase3_2026!"})
    assert login.status_code == 200
    tech_headers = {"X-CSRF-Token": login.json()["csrf_token"]}

    denied = client.post(
        "/api/v1/services",
        headers=tech_headers,
        json={"code": "TECH", "name": "Interdit"},
    )
    assert denied.status_code == 403

    denied_import = client.post(
        "/api/v1/imports/preview",
        headers=tech_headers,
        data={"entity_type": "agents"},
        files={"file": ("agents.csv", b"nom;prenom;email_pro\n", "text/csv")},
    )
    assert denied_import.status_code == 403
