from uuid import uuid4


def test_admin_user_crud(admin_client, csrf_headers):
    client, csrf = admin_client
    suffix = uuid4().hex[:8]
    email = f"test.{suffix}@example.org"

    response = client.post(
        "/api/v1/admin/users",
        headers=csrf_headers(csrf),
        json={
            "email": email,
            "password": "TestUser2026!",
            "first_name": "Test",
            "last_name": "Utilisateur",
            "role_id": client.get("/api/v1/admin/roles").json()[1]["id"],
            "data_scope": "own",
            "is_active": True,
        },
    )
    assert response.status_code == 201, response.text
    user_id = response.json()["id"]

    response = client.get("/api/v1/admin/users", params={"q": email})
    assert response.status_code == 200
    assert response.json()["total"] == 1

    response = client.patch(
        f"/api/v1/admin/users/{user_id}",
        headers=csrf_headers(csrf),
        json={"is_active": False},
    )
    assert response.status_code == 200
    assert response.json()["is_active"] is False

    response = client.patch(
        f"/api/v1/admin/users/{user_id}",
        headers=csrf_headers(csrf),
        json={"is_active": True},
    )
    assert response.status_code == 200
    assert response.json()["is_active"] is True


def test_admin_cannot_deactivate_self(admin_client, csrf_headers):
    client, csrf = admin_client
    me = client.get("/api/v1/auth/me").json()["user"]
    response = client.patch(
        f"/api/v1/admin/users/{me['id']}",
        headers=csrf_headers(csrf),
        json={"is_active": False},
    )
    assert response.status_code == 409


def test_roles_and_permissions(admin_client):
    client, _ = admin_client
    roles = client.get("/api/v1/admin/roles")
    assert roles.status_code == 200
    assert len(roles.json()) == 6
    assert {role["code"] for role in roles.json()} >= {"admin", "dpo", "technician"}
    permissions = client.get("/api/v1/admin/permissions")
    assert permissions.status_code == 200
    assert len(permissions.json()) == 112
