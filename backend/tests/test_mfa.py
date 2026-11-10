import pyotp
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.auth import Role, User
from sqlalchemy import select

EMAIL = "mfa.test@example.org"
PASSWORD = "MfaTest2026!"


def _create_user() -> None:
    with SessionLocal() as db:
        existing = db.scalar(select(User).where(User.email == EMAIL))
        if existing is not None:
            existing.mfa_enabled = False
            existing.mfa_secret_encrypted = None
            db.commit()
            return
        role = db.scalar(select(Role).where(Role.code == "reader"))
        assert role is not None
        db.add(
            User(
                email=EMAIL,
                password_hash=hash_password(PASSWORD),
                first_name="MFA",
                last_name="Test",
                role_id=role.id,
                data_scope="own",
                is_active=True,
                must_change_password=False,
            )
        )
        db.commit()


def _login(client, email: str = EMAIL, password: str = PASSWORD):
    return client.post(
        "/api/v1/auth/login", json={"email": email, "password": password}
    )


def test_mfa_totp_lifecycle(client):
    _create_user()
    first = _login(client)
    assert first.status_code == 200, first.text
    assert first.json()["mfa_required"] is False
    csrf = first.json()["csrf_token"]
    headers = {"X-CSRF-Token": csrf}

    status = client.get("/api/v1/auth/mfa")
    assert status.status_code == 200
    assert status.json() == {"enabled": False, "configured": False}

    setup = client.post("/api/v1/auth/mfa/setup", headers=headers)
    assert setup.status_code == 200, setup.text
    setup_body = setup.json()
    assert setup_body["qr_code_data_url"].startswith("data:image/png;base64,")
    secret = setup_body["secret"]
    assert "otpauth://totp/" in setup_body["provisioning_uri"]

    enabled = client.post(
        "/api/v1/auth/mfa/enable",
        headers=headers,
        json={"code": pyotp.TOTP(secret).now()},
    )
    assert enabled.status_code == 200, enabled.text
    recovery_codes = enabled.json()["recovery_codes"]
    assert len(recovery_codes) == 10

    logout = client.post("/api/v1/auth/logout", headers=headers)
    assert logout.status_code == 204

    second = _login(client)
    assert second.status_code == 200, second.text
    challenge = second.json()
    assert challenge["mfa_required"] is True
    assert challenge["challenge_token"]
    assert challenge["user"] is None

    bad = client.post(
        "/api/v1/auth/mfa/verify",
        json={"challenge_token": challenge["challenge_token"], "code": "000000"},
    )
    assert bad.status_code == 401

    verified = client.post(
        "/api/v1/auth/mfa/verify",
        json={
            "challenge_token": challenge["challenge_token"],
            "code": pyotp.TOTP(secret).now(),
        },
    )
    assert verified.status_code == 200, verified.text
    assert verified.json()["user"]["email"] == EMAIL
    mfa_csrf = verified.json()["csrf_token"]
    mfa_headers = {"X-CSRF-Token": mfa_csrf}

    client.post("/api/v1/auth/logout", headers=mfa_headers)

    third = _login(client)
    assert third.status_code == 200
    third_challenge = third.json()["challenge_token"]
    recovery = client.post(
        "/api/v1/auth/mfa/verify",
        json={"challenge_token": third_challenge, "code": recovery_codes[0]},
    )
    assert recovery.status_code == 200, recovery.text
    recovery_csrf = recovery.json()["csrf_token"]

    disabled = client.post(
        "/api/v1/auth/mfa/disable",
        headers={"X-CSRF-Token": recovery_csrf},
        json={
            "password": PASSWORD,
            "code": pyotp.TOTP(secret).now(),
        },
    )
    assert disabled.status_code == 200, disabled.text

    after = client.get("/api/v1/auth/mfa")
    assert after.status_code == 200
    assert after.json()["enabled"] is False

    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == EMAIL))
        assert user is not None
        assert user.mfa_enabled is False
        assert user.mfa_secret_encrypted is None


def test_mfa_wrong_password_blocks_disable(client):
    _create_user()
    login = _login(client)
    assert login.status_code == 200
    headers = {"X-CSRF-Token": login.json()["csrf_token"]}
    response = client.post(
        "/api/v1/auth/mfa/disable",
        headers=headers,
        json={"password": "MauvaisMotDePasse1!", "code": "123456"},
    )
    assert response.status_code == 401
    assert "Mot de passe" in response.json()["detail"]
