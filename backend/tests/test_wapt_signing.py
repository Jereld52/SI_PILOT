import json
from base64 import b64decode
from datetime import UTC, datetime, timedelta

import pytest
from app.core.errors import ValidationAppError
from app.services import wapt_service
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.x509.oid import NameOID


def _signing_material(tmp_path):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = issuer = x509.Name(
        [x509.NameAttribute(NameOID.COMMON_NAME, "SI PILOT test")]
    )
    now = datetime.now(UTC)
    certificate = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(days=1))
        .not_valid_after(now + timedelta(days=30))
        .sign(key, hashes.SHA256())
    )
    key_path = tmp_path / "key.pem"
    cert_path = tmp_path / "key.crt"
    key_path.write_bytes(
        key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.BestAvailableEncryption(b"secret"),
        )
    )
    cert_path.write_bytes(certificate.public_bytes(serialization.Encoding.PEM))
    return key_path, cert_path, certificate


def _config(key_path, cert_path):
    return wapt_service.WaptConfig(
        enabled=True,
        base_url="https://wapt.example.test",
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
        signing_key_path=str(key_path),
        signing_cert_path=str(cert_path),
        signing_key_password="secret",
        package_field="package",
        timeout_seconds=30,
    )


def test_signed_claim_is_verifiable(tmp_path):
    key_path, cert_path, certificate = _signing_material(tmp_path)
    config = _config(key_path, cert_path)
    private_key, loaded_cert = wapt_service._load_signing_material(config)

    claim = wapt_service._sign_claim(
        private_key,
        loaded_cert,
        {
            "uuid": "HOST-UUID",
            "action": "trigger_install_packages",
            "packages": ["demo-package"],
            "force": False,
            "notify_server": True,
        },
    )

    assert claim["action"] == "trigger_install_packages"
    assert claim["signer"] == certificate.fingerprint(hashes.SHA256()).hex()
    assert "signer_certificate" in claim
    assert claim["signed_attributes"][:5] == [
        "uuid",
        "action",
        "packages",
        "force",
        "notify_server",
    ]

    attributes = claim["signed_attributes"]
    reclaim = {att: claim.get(att) for att in attributes if att != "signature"}
    serialized = json.dumps(reclaim, sort_keys=True, separators=(",", ":")).encode(
        "utf-8"
    )
    certificate.public_key().verify(
        b64decode(claim["signature"]),
        serialized,
        padding.PKCS1v15(),
        hashes.SHA256(),
    )


def test_install_package_uses_signed_trigger_action(monkeypatch, tmp_path):
    key_path, cert_path, _ = _signing_material(tmp_path)
    config = _config(key_path, cert_path)
    captured = {}

    def fake_trigger(config, claims):  # noqa: ANN001, ARG001
        captured["claims"] = claims
        return {"success": True}

    monkeypatch.setattr(wapt_service, "_trigger_signed_actions", fake_trigger)
    result = wapt_service.install_package(config, "HOST-UUID", "demo-package")

    assert "signée" in result.message
    claim = captured["claims"][0]
    assert claim["action"] == "trigger_install_packages"
    assert claim["packages"] == ["demo-package"]
    assert claim["notify_server"] is True

    captured.clear()
    wapt_service.uninstall_package(config, "HOST-UUID", "demo-package")
    claim = captured["claims"][0]
    assert claim["action"] == "trigger_remove_packages"


def test_install_without_signing_configuration_is_explicit():
    config = wapt_service.WaptConfig(
        enabled=True,
        base_url="https://wapt.example.test",
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
    with pytest.raises(ValidationAppError) as exc:
        wapt_service.install_package(config, "HOST-UUID", "demo-package")
    assert "signature WAPT" in exc.value.detail
