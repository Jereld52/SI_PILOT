from uuid import uuid4


def _preview(client, csrf_headers, csrf, entity_type, filename, content):
    return client.post(
        "/api/v1/imports/preview",
        headers=csrf_headers(csrf),
        data={"entity_type": entity_type},
        files={"file": (filename, content.encode("utf-8"), "text/csv")},
    )


def test_import_suppliers_licenses_and_rdm(admin_client, csrf_headers):
    client, csrf = admin_client
    suffix = uuid4().hex[:8]

    suppliers_csv = (
        "nom;type;siret;contact;email;telephone;adresse;site_web;notes;actif\n"
        f"Fournisseur Import {suffix};Matériel;12345678900000;Contact Test;"
        f"contact-{suffix}@example.fr;0102030405;1 rue de Test;https://example.fr;;oui\n"
    )
    preview = _preview(
        client, csrf_headers, csrf, "suppliers", "fournisseurs.csv", suppliers_csv
    )
    assert preview.status_code == 200, preview.text
    assert preview.json()["job"]["valid_rows"] == 1
    applied = client.post(
        f"/api/v1/imports/{preview.json()['job']['id']}/apply",
        headers=csrf_headers(csrf),
    )
    assert applied.status_code == 200, applied.text
    assert applied.json()["created"] == 1
    suppliers = client.get("/api/v1/suppliers", params={"q": suffix})
    assert any(item["name"] == f"Fournisseur Import {suffix}" for item in suppliers.json())

    licenses_csv = (
        "nom;editeur;type;sieges;sieges_utilises;date_debut;date_fin;cout_annuel;notes;actif\n"
        f"Licence Import {suffix};Éditeur Test;abonnement;10;4;01/01/2026;31/12/2026;"
        "1200.00;;oui\n"
    )
    preview = _preview(
        client, csrf_headers, csrf, "licenses", "licences.csv", licenses_csv
    )
    assert preview.status_code == 200, preview.text
    assert preview.json()["job"]["valid_rows"] == 1
    applied = client.post(
        f"/api/v1/imports/{preview.json()['job']['id']}/apply",
        headers=csrf_headers(csrf),
    )
    assert applied.status_code == 200, applied.text
    licenses = client.get("/api/v1/licenses", params={"q": suffix})
    assert any(item["name"] == f"Licence Import {suffix}" for item in licenses.json())

    rdm_csv = (
        "Name;Host;IP;OS;Group;Description;Credential\n"
        f"SRV-RDM-{suffix};rdm-{suffix}.pnfor.fr;192.0.2.77;Windows Server 2022;"
        "Serveurs/Production;Serveur de test RDM;secret-a-ne-pas-importer\n"
    )
    preview = _preview(client, csrf_headers, csrf, "rdm", "rdm.csv", rdm_csv)
    assert preview.status_code == 200, preview.text
    assert preview.json()["detected_format"] == "rdm"
    assert preview.json()["job"]["valid_rows"] == 1
    applied = client.post(
        f"/api/v1/imports/{preview.json()['job']['id']}/apply",
        headers=csrf_headers(csrf),
    )
    assert applied.status_code == 200, applied.text
    equipments = client.get(
        "/api/v1/infrastructure/equipments", params={"q": f"SRV-RDM-{suffix}"}
    )
    assert equipments.status_code == 200
    assert len(equipments.json()) == 1
    assert equipments.json()[0]["ip_address"] == "192.0.2.77"
    assert equipments.json()[0]["role"] == "Serveurs/Production"


def test_ldap_configuration_is_masked(admin_client, csrf_headers):
    client, csrf = admin_client
    config = client.get("/api/v1/ldap/config")
    assert config.status_code == 200
    assert config.json()["bind_password_set"] in (True, False)
    assert "bind_password" not in config.json()

    invalid = client.put(
        "/api/v1/ldap/config",
        headers=csrf_headers(csrf),
        json={"enabled": False, "url": "https://not-ldap.example.fr"},
    )
    assert invalid.status_code == 422

    updated = client.put(
        "/api/v1/ldap/config",
        headers=csrf_headers(csrf),
        json={
            "enabled": False,
            "url": "ldap://127.0.0.1:1",
            "base_dn": "DC=pnfor,DC=local",
            "bind_dn": "CN=svc-si,OU=Services,DC=pnfor,DC=local",
            "bind_password": "mot-de-passe-test",
            "user_filter": "(objectClass=user)",
            "tls_verify": False,
        },
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["bind_password_set"] is True
    assert updated.json()["url"] == "ldap://127.0.0.1:1"

    listed = client.get("/api/v1/admin/settings")
    assert listed.status_code == 200
    secret = next(
        item for item in listed.json() if item["key"] == "ldap.bind_password_encrypted"
    )
    assert secret["value"] == "********"

    blocked = client.put(
        "/api/v1/admin/settings/ldap.bind_password_encrypted",
        headers=csrf_headers(csrf),
        json={"value": "clair"},
    )
    assert blocked.status_code == 422

    failed = client.post("/api/v1/ldap/test", headers=csrf_headers(csrf))
    assert failed.status_code == 422
