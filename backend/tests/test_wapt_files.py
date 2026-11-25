from datetime import UTC, datetime, timedelta

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID


def _pair(common_name: str) -> tuple[bytes, bytes]:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    now = datetime.now(UTC)
    certificate = (
        x509.CertificateBuilder()
        .subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, common_name)]))
        .issuer_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, common_name)]))
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(days=1))
        .not_valid_after(now + timedelta(days=30))
        .sign(key, hashes.SHA256())
    )
    key_bytes = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    cert_bytes = certificate.public_bytes(serialization.Encoding.PEM)
    return key_bytes, cert_bytes


def test_wapt_signing_file_import(admin_client, csrf_headers):
    client, csrf = admin_client
    key_bytes, cert_bytes = _pair("SI PILOT import test")

    uploaded = client.post(
        "/api/v1/admin/wapt/signing-files",
        headers=csrf_headers(csrf),
        files={
            "key": ("key.pem", key_bytes, "application/x-pem-file"),
            "cert": ("key.crt", cert_bytes, "application/x-x509-ca-cert"),
        },
    )
    assert uploaded.status_code == 200, uploaded.text
    body = uploaded.json()
    assert body["signing_files_uploaded"] is True
    assert body["signing_key_filename"] == "key.pem"
    assert body["signing_cert_filename"] == "key.crt"
    assert body["signing_key_path"]
    assert body["signing_cert_path"]

    tested = client.post("/api/v1/admin/wapt/signing-test", headers=csrf_headers(csrf))
    assert tested.status_code == 200, tested.text
    assert tested.json()["ok"] is True

    _, other_cert = _pair("Autre certificat")
    mismatch = client.post(
        "/api/v1/admin/wapt/signing-files",
        headers=csrf_headers(csrf),
        files={"cert": ("other.crt", other_cert, "application/x-x509-ca-cert")},
    )
    assert mismatch.status_code == 422
    assert "correspondent pas" in mismatch.json()["detail"]

    removed = client.delete("/api/v1/admin/wapt/signing-files", headers=csrf_headers(csrf))
    assert removed.status_code == 200, removed.text
    assert removed.json()["signing_files_uploaded"] is False
    assert removed.json()["signing_key_path"] == ""
