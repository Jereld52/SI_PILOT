from uuid import uuid4


def test_technician_is_limited(admin_client, csrf_headers, client):
    admin, csrf = admin_client
    suffix = uuid4().hex[:8]
    email = f"tech.{suffix}@forets-parcnational.fr"
    roles = admin.get("/api/v1/admin/roles").json()
    technician_role = next(role for role in roles if role["code"] == "technician")
    response = admin.post(
        "/api/v1/admin/users",
        headers=csrf_headers(csrf),
        json={
            "email": email,
            "password": "TechUser2026!",
            "first_name": "Tech",
            "last_name": "Test",
            "role_id": technician_role["id"],
            "data_scope": "service",
            "is_active": True,
        },
    )
    assert response.status_code == 201

    login = client.post("/api/v1/auth/login", json={"email": email, "password": "TechUser2026!"})
    assert login.status_code == 200
    assert client.get("/api/v1/admin/users").status_code == 403
    assert client.get("/api/v1/audit-logs").status_code == 403
    assert client.get("/api/v1/dashboard/summary").status_code == 200


def test_unauthenticated_is_rejected(client):
    client.cookies.clear()
    response = client.get("/api/v1/dashboard/summary")
    assert response.status_code == 401
