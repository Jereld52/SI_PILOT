from datetime import date, timedelta
from uuid import uuid4


def test_security_incidents_actions_and_overview(admin_client, csrf_headers):
    client, csrf = admin_client
    suffix = uuid4().hex[:8]

    incident = client.post(
        "/api/v1/security/incidents",
        headers=csrf_headers(csrf),
        json={
            "title": f"Hameçonnage {suffix}",
            "description": "Message suspect signalé.",
            "severity": "high",
            "category": "phishing",
            "status": "open",
        },
    )
    assert incident.status_code == 201, incident.text
    incident_body = incident.json()
    assert incident_body["reference"].startswith("INC-")

    action = client.post(
        "/api/v1/security/actions",
        headers=csrf_headers(csrf),
        json={
            "title": f"Sensibiliser {suffix}",
            "priority": "high",
            "status": "todo",
            "due_date": (date.today() - timedelta(days=2)).isoformat(),
            "incident_id": incident_body["id"],
        },
    )
    assert action.status_code == 201, action.text
    action_body = action.json()
    assert action_body["incident_reference"] == incident_body["reference"]

    done = client.patch(
        f"/api/v1/security/actions/{action_body['id']}",
        headers=csrf_headers(csrf),
        json={"status": "done", "evidence": "Session réalisée."},
    )
    assert done.status_code == 200
    assert done.json()["completed_at"] is not None

    closed = client.delete(
        f"/api/v1/security/incidents/{incident_body['id']}", headers=csrf_headers(csrf)
    )
    assert closed.status_code == 200
    assert closed.json()["status"] == "closed"

    overview = client.get("/api/v1/security/overview")
    assert overview.status_code == 200
    assert "open_incidents" in overview.json()


def test_security_vulnerabilities_backups_certificates_audits(admin_client, csrf_headers):
    client, csrf = admin_client
    suffix = uuid4().hex[:8]

    vulnerability = client.post(
        "/api/v1/security/vulnerabilities",
        headers=csrf_headers(csrf),
        json={
            "title": f"Correctif {suffix}",
            "cve_id": f"CVE-2026-{suffix[:4]}",
            "cvss_score": 9.1,
            "severity": "critical",
            "status": "open",
        },
    )
    assert vulnerability.status_code == 201, vulnerability.text
    vulnerability_body = vulnerability.json()
    assert vulnerability_body["cvss_score"] == 9.1

    resolved = client.patch(
        f"/api/v1/security/vulnerabilities/{vulnerability_body['id']}",
        headers=csrf_headers(csrf),
        json={"status": "resolved", "remediation": "Correctif appliqué."},
    )
    assert resolved.status_code == 200
    assert resolved.json()["resolved_at"] is not None

    backup = client.post(
        "/api/v1/security/backups",
        headers=csrf_headers(csrf),
        json={
            "scope": f"Serveurs {suffix}",
            "backup_type": "full",
            "status": "success",
            "size_bytes": 104857600,
            "duration_minutes": 35,
            "restore_status": "success",
            "restore_tested_at": date.today().isoformat(),
        },
    )
    assert backup.status_code == 201, backup.text

    certificate = client.post(
        "/api/v1/security/certificates",
        headers=csrf_headers(csrf),
        json={
            "common_name": f"*.{suffix}.example.org",
            "issuer": "Autorité interne",
            "valid_from": date.today().isoformat(),
            "valid_to": (date.today() + timedelta(days=60)).isoformat(),
        },
    )
    assert certificate.status_code == 201, certificate.text
    assert certificate.json()["days_to_expiry"] == 60
    assert certificate.json()["alert_level"] == "warning"

    audit = client.post(
        "/api/v1/security/audits",
        headers=csrf_headers(csrf),
        json={
            "title": f"Audit {suffix}",
            "auditor": "Prestataire",
            "type": "externe",
            "status": "planned",
        },
    )
    assert audit.status_code == 201, audit.text

    updated_audit = client.patch(
        f"/api/v1/security/audits/{audit.json()['id']}",
        headers=csrf_headers(csrf),
        json={"status": "done", "findings": "Aucun écart majeur."},
    )
    assert updated_audit.status_code == 200
    assert updated_audit.json()["status"] == "done"

    overview = client.get("/api/v1/security/overview")
    assert overview.status_code == 200
    assert overview.json()["last_backup_status"] == "success"
    assert overview.json()["expiring_certificates"] >= 1

    deleted = client.delete(
        f"/api/v1/security/vulnerabilities/{vulnerability_body['id']}",
        headers=csrf_headers(csrf),
    )
    assert deleted.status_code == 204
