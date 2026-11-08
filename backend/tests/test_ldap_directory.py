def test_ldap_config_exposes_directory_settings(admin_client):
    client, _ = admin_client
    response = client.get("/api/v1/ldap/config")
    assert response.status_code == 200
    body = response.json()
    assert "users_base_dn" in body
    assert "groups_base_dn" in body
    assert "write_enabled" in body
    assert "upn_suffix" in body


def test_ldap_write_mode_requires_service_account(admin_client, csrf_headers):
    client, csrf = admin_client
    current = client.get("/api/v1/ldap/config").json()
    response = client.put(
        "/api/v1/ldap/config",
        headers=csrf_headers(csrf),
        json={
            "enabled": current["enabled"],
            "url": current["url"],
            "base_dn": current["base_dn"],
            "bind_dn": "",
            "user_filter": current["user_filter"],
            "tls_verify": current["tls_verify"],
            "users_base_dn": current["users_base_dn"],
            "groups_base_dn": current["groups_base_dn"],
            "write_enabled": True,
            "upn_suffix": current["upn_suffix"],
        },
    )
    assert response.status_code == 422, response.text
