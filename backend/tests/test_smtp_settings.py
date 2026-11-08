def test_smtp_settings_are_encrypted_and_not_exposed(admin_client, csrf_headers):
    client, csrf = admin_client

    initial = client.get("/api/v1/admin/settings/smtp")
    assert initial.status_code == 200, initial.text
    assert initial.json()["password_set"] is False

    updated = client.put(
        "/api/v1/admin/settings/smtp",
        headers=csrf_headers(csrf),
        json={
            "host": "smtp.example.test",
            "port": 587,
            "username": "pilote",
            "password": "secret-smtp",
            "from_email": "pilote@example.test",
            "from_name": "SI PILOT",
            "use_tls": True,
            "use_ssl": False,
            "email_enabled": False,
        },
    )
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert body["host"] == "smtp.example.test"
    assert body["password_set"] is True
    assert "secret-smtp" not in updated.text

    invalid = client.put(
        "/api/v1/admin/settings/smtp",
        headers=csrf_headers(csrf),
        json={
            "host": "smtp.example.test",
            "port": 465,
            "username": "",
            "from_email": "pilote@example.test",
            "from_name": "SI PILOT",
            "use_tls": True,
            "use_ssl": True,
            "email_enabled": False,
        },
    )
    assert invalid.status_code == 422
