import io
from uuid import uuid4

from openpyxl import load_workbook


def _headers(workbook, name: str) -> list[str]:
    sheet = workbook[name]
    values = next(sheet.iter_rows(min_row=1, max_row=1, values_only=True))
    return [str(value) for value in values if value is not None]


def _column_values(workbook, name: str, index: int = 0) -> list:
    sheet = workbook[name]
    return [row[index] for row in sheet.iter_rows(min_row=2, values_only=True)]


def test_rgpd_register_and_dossier_exports(admin_client, csrf_headers):
    client, csrf = admin_client
    suffix = uuid4().hex[:8].upper()

    activity = client.post(
        "/api/v1/rgpd/processing-activities",
        headers=csrf_headers(csrf),
        json={
            "name": f"Gestion des agents {suffix}",
            "purpose": "Gestion administrative des agents du parc.",
            "legal_basis": "Mission d'intérêt public",
            "data_categories": "Identité, coordonnées professionnelles, fonction",
            "data_subjects": "Agents du Parc national de forêts",
            "recipients": "Service informatique, direction",
            "retention_period": "5 ans après le départ",
            "security_measures": "Accès restreint par permission, journal d'audit",
            "status": "active",
        },
    )
    assert activity.status_code == 201, activity.text
    activity_body = activity.json()

    collection = client.post(
        "/api/v1/rgpd/collections",
        headers=csrf_headers(csrf),
        json={
            "name": f"Annuaire agents {suffix}",
            "collection_type": "contact_list",
            "purpose": "Annuaire professionnel interne.",
            "processing_activity_id": activity_body["id"],
            "data_categories": "Nom, prénom, e-mail, téléphone, service",
            "subjects_count": 42,
            "status": "active",
        },
    )
    assert collection.status_code == 201, collection.text

    rights = client.post(
        "/api/v1/rgpd/rights-requests",
        headers=csrf_headers(csrf),
        json={
            "request_type": "access",
            "requester_name": f"Agent Demandeur {suffix}",
            "processing_activity_id": activity_body["id"],
            "status": "new",
        },
    )
    assert rights.status_code == 201, rights.text
    rights_body = rights.json()

    register = client.get("/api/v1/exports/rgpd", params={"format": "xlsx"})
    assert register.status_code == 200, register.text
    workbook = load_workbook(io.BytesIO(register.content), read_only=True)
    assert {
        "Registre des traitements",
        "Données collectées",
        "Demandes DPO",
        "Droits des personnes",
        "Violations",
        "Synthèse",
    }.issubset(set(workbook.sheetnames))
    activity_headers = _headers(workbook, "Registre des traitements")
    for expected in (
        "Référence",
        "Finalité",
        "Base légale",
        "Catégories de données",
        "Personnes concernées",
        "Destinataires",
        "Durée de conservation",
        "Mesures de sécurité",
        "Notes DPO",
    ):
        assert expected in activity_headers
    assert activity_body["name"] in _column_values(workbook, "Registre des traitements", 1)
    assert f"Annuaire agents {suffix}" in _column_values(
        workbook, "Données collectées", 0
    )
    assert rights_body["reference"] in _column_values(
        workbook, "Droits des personnes", 0
    )
    workbook.close()

    register_pdf = client.get("/api/v1/exports/rgpd", params={"format": "pdf"})
    assert register_pdf.status_code == 200
    assert register_pdf.content.startswith(b"%PDF")

    dossier = client.get(
        f"/api/v1/exports/rgpd/rights-requests/{rights_body['id']}",
        params={"format": "xlsx"},
    )
    assert dossier.status_code == 200, dossier.text
    workbook = load_workbook(io.BytesIO(dossier.content), read_only=True)
    assert {"Demande", "Traitement lié", "Données collectées", "Synthèse"}.issubset(
        set(workbook.sheetnames)
    )
    assert rights_body["reference"] in _column_values(workbook, "Demande", 1)
    assert activity_body["name"] in _column_values(workbook, "Traitement lié", 1)
    assert f"Annuaire agents {suffix}" in _column_values(
        workbook, "Données collectées", 0
    )
    workbook.close()

    dossier_pdf = client.get(
        f"/api/v1/exports/rgpd/rights-requests/{rights_body['id']}",
        params={"format": "pdf"},
    )
    assert dossier_pdf.status_code == 200
    assert dossier_pdf.content.startswith(b"%PDF")


def test_agent_personal_data_export(admin_client, csrf_headers):
    client, csrf = admin_client
    suffix = uuid4().hex[:8]
    email = f"rgpd.export.{suffix}@forets-parcnational.fr"
    agent = client.post(
        "/api/v1/agents",
        headers=csrf_headers(csrf),
        json={
            "first_name": "Camille",
            "last_name": f"Export{suffix}",
            "email_pro": email,
            "function_label": "Chargée de mission",
            "status": "active",
        },
    )
    assert agent.status_code == 201, agent.text
    agent_body = agent.json()

    response = client.get(
        f"/api/v1/exports/rgpd/agents/{agent_body['id']}", params={"format": "xlsx"}
    )
    assert response.status_code == 200, response.text
    workbook = load_workbook(io.BytesIO(response.content), read_only=True)
    assert {
        "Identité",
        "Comptes et accès",
        "Matériel affecté",
        "Historique des affectations",
        "Lignes mobiles",
        "Tickets",
        "Mouvements de stock",
        "Synthèse",
    }.issubset(set(workbook.sheetnames))
    assert email in _column_values(workbook, "Identité", 1)
    identity_headers = _headers(workbook, "Identité")
    assert "Champ" in identity_headers
    assert "Valeur" in identity_headers
    workbook.close()

    pdf = client.get(
        f"/api/v1/exports/rgpd/agents/{agent_body['id']}", params={"format": "pdf"}
    )
    assert pdf.status_code == 200
    assert pdf.headers["content-type"] == "application/pdf"
    assert pdf.content.startswith(b"%PDF")
