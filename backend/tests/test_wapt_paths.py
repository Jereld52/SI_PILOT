from app.services import wapt_service


def _config() -> wapt_service.WaptConfig:
    return wapt_service.WaptConfig(
        enabled=True,
        base_url="http://wapt",
        username="admin",
        password="secret",
        verify_tls=False,
        hosts_path="/api/v1/hosts",
        host_detail_path="/api/v1/hosts?uuid={uuid}",
        fetch_details=False,
        packages_path="/api/v3/packages",
        host_packages_path="/api/v1/host_data?uuid={uuid}&field=installed_packages",
        install_path="/api/v1/hosts/{uuid}/install",
        uninstall_path="/api/v1/hosts/{uuid}/uninstall",
        trigger_action_path="/api/v3/trigger_host_action",
        signing_key_path="",
        signing_cert_path="",
        signing_key_password="",
        package_field="package",
        timeout_seconds=30,
    )


def test_wapt_package_catalog_parses_v3_payload(monkeypatch):
    monkeypatch.setattr(
        wapt_service,
        "_request_json",
        lambda *args, **kwargs: {
            "success": True,
            "result": [
                {"package": "demo-package", "version": "1.2", "description": "Demo"},
                {"package": "other-package", "version": "2.0", "description_fr": "Autre"},
            ],
        },
    )
    packages = wapt_service.fetch_packages(_config())
    assert [package.name for package in packages] == ["demo-package", "other-package"]
    assert packages[1].description == "Autre"


def test_wapt_host_packages_parse_host_data_payload(monkeypatch):
    monkeypatch.setattr(
        wapt_service,
        "_request_json",
        lambda *args, **kwargs: {
            "success": True,
            "result": [
                {
                    "package": "demo-package",
                    "version": "1.2",
                    "install_status": "OK",
                }
            ],
        },
    )
    packages = wapt_service.fetch_host_packages(_config(), "HOST-UUID")
    assert len(packages) == 1
    assert packages[0].name == "demo-package"
    assert packages[0].installed is True


def test_wapt_default_paths_are_compatible_with_wapt_24(admin_client):
    client, _ = admin_client
    response = client.get("/api/v1/admin/wapt/config")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["packages_path"] == "/api/v3/packages"
    assert "host_data" in body["host_packages_path"]
    assert body["fetch_details"] is False
