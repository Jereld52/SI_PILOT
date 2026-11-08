from uuid import uuid4

from tests.conftest import ADMIN_EMAIL


def test_login_and_me(admin_client):
    client, _ = admin_client
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 200
    payload = response.json()
    assert payload["user"]["email"] == ADMIN_EMAIL
    assert "admin.users.manage" in payload["permissions"]


def test_wrong_password(client, admin_user):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": ADMIN_EMAIL, "password": "mauvais-mot-de-passe"},
    )
    assert response.status_code == 401
    assert response.json()["code"] == "AUTHENTICATION_REQUIRED"


def test_logout_revokes_session(admin_client):
    client, csrf = admin_client
    response = client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": csrf})
    assert response.status_code == 204
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 401


def test_mutation_without_csrf_is_rejected(admin_client):
    client, _ = admin_client
    response = client.patch("/api/v1/admin/users/00000000-0000-0000-0000-000000000000", json={})
    assert response.status_code == 403
    assert response.json()["code"] == "CSRF_INVALID"


def test_change_password_and_session_revocation(admin_client, csrf_headers):
    client, admin_csrf = admin_client
    suffix = uuid4().hex[:8]
    email = f"password.{suffix}@example.org"
    roles = client.get("/api/v1/admin/roles").json()
    reader_role = next(role for role in roles if role["code"] == "reader")

    created = client.post(
        "/api/v1/admin/users",
        headers=csrf_headers(admin_csrf),
        json={
            "email": email,
            "password": "InitialPassword2026!",
            "first_name": "Password",
            "last_name": "Test",
            "role_id": reader_role["id"],
            "data_scope": "all",
            "is_active": True,
        },
    )
    assert created.status_code == 201

    assert client.post("/api/v1/auth/logout", headers=csrf_headers(admin_csrf)).status_code == 204

    login = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "InitialPassword2026!"},
    )
    assert login.status_code == 200
    user_csrf = login.json()["csrf_token"]

    changed = client.post(
        "/api/v1/auth/change-password",
        headers=csrf_headers(user_csrf),
        json={
            "current_password": "InitialPassword2026!",
            "new_password": "NouveauPassword2026!",
        },
    )
    assert changed.status_code == 200
    assert client.post("/api/v1/auth/logout", headers=csrf_headers(user_csrf)).status_code == 204

    old_login = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "InitialPassword2026!"},
    )
    assert old_login.status_code == 401

    new_login = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "NouveauPassword2026!"},
    )
    assert new_login.status_code == 200
