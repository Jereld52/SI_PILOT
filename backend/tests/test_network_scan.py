import pytest
from app.core.errors import ValidationAppError
from app.db.session import SessionLocal
from app.services import ai_tools_service, network_scan_service


def test_network_scan_rejects_public_and_large_ranges():
    with pytest.raises(ValidationAppError, match="privées"):
        network_scan_service.parse_network("8.8.8.8/32")
    with pytest.raises(ValidationAppError, match="1024"):
        network_scan_service.parse_network("10.0.0.0/8")
    with pytest.raises(ValidationAppError, match="sous-réseau"):
        network_scan_service.parse_network("pas une adresse")


def test_network_scan_detects_and_compares_hosts(monkeypatch):
    monkeypatch.setattr(
        network_scan_service,
        "_probe_ports",
        lambda ip: [445, 3389] if ip == "192.168.50.2" else [],
    )
    monkeypatch.setattr(
        network_scan_service,
        "_arp_table",
        lambda: {"192.168.50.2": "AA:BB:CC:DD:EE:FF"},
    )
    monkeypatch.setattr(network_scan_service, "_resolve_name", lambda ip: "SRV-TEST")

    with SessionLocal() as db:
        result = network_scan_service.scan(db, "192.168.50.0/29")

    assert result.cidr == "192.168.50.0/29"
    assert result.scanned_addresses == 6
    assert len(result.hosts) == 1
    host = result.hosts[0]
    assert host.ip_address == "192.168.50.2"
    assert host.hostname == "SRV-TEST"
    assert host.mac_address == "AA:BB:CC:DD:EE:FF"
    assert host.open_ports == [445, 3389]
    assert host.suggested_type == "server"
    assert result.new_hosts == 1


def test_network_scan_endpoint(admin_client, csrf_headers, monkeypatch):
    client, csrf = admin_client
    monkeypatch.setattr(
        network_scan_service,
        "_probe_ports",
        lambda ip: [80] if ip == "192.168.60.2" else [],
    )
    monkeypatch.setattr(
        network_scan_service, "_arp_table", lambda: {"192.168.60.2": "AA:BB:CC:DD:EE:01"}
    )
    monkeypatch.setattr(network_scan_service, "_resolve_name", lambda ip: None)

    response = client.post(
        "/api/v1/infrastructure/network-scan",
        headers=csrf_headers(csrf),
        json={"cidr": "192.168.60.0/29"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["cidr"] == "192.168.60.0/29"
    assert len(body["hosts"]) == 1
    assert body["hosts"][0]["ip_address"] == "192.168.60.2"
    assert body["hosts"][0]["open_ports"] == [80]


def test_network_scan_rejects_public_range(admin_client, csrf_headers):
    client, csrf = admin_client
    response = client.post(
        "/api/v1/infrastructure/network-scan",
        headers=csrf_headers(csrf),
        json={"cidr": "8.8.8.0/24"},
    )
    assert response.status_code == 422
    assert "privées" in response.json()["detail"]


def test_network_discovery_tool_requires_cidr(admin_user):
    with SessionLocal() as db:
        result = ai_tools_service.network_discovery(db, admin_user, query="scanne le réseau")
    assert result["count"] == 0
    assert "Précisez un sous-réseau" in result["note"]
