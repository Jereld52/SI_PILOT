import io
from uuid import uuid4

from PIL import Image


def _png_bytes(width: int = 240, height: int = 120) -> bytes:
    image = Image.new("RGBA", (width, height), (119, 43, 47, 255))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def test_branding_is_public_and_customizable(admin_client, csrf_headers):
    client, csrf = admin_client
    suffix = uuid4().hex[:8]

    initial = client.get("/api/v1/branding")
    assert initial.status_code == 200, initial.text
    original = initial.json()
    assert original["app_name"] == "SI PILOT"

    updated = client.put(
        "/api/v1/admin/branding",
        headers=csrf_headers(csrf),
        json={
            "app_name": "SI PILOT",
            "organization_name": f"Structure {suffix}",
            "tagline": "Pilotage du système d'information",
            "description": "Description de test.",
            "support_email": "support@example.org",
            "primary_color": "#1a4d6d",
        },
    )
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert body["organization_name"] == f"Structure {suffix}"
    assert body["primary_color"] == "#1a4d6d"
    assert body["support_email"] == "support@example.org"

    public = client.get("/api/v1/branding")
    assert public.status_code == 200
    assert public.json()["organization_name"] == f"Structure {suffix}"

    invalid = client.put(
        "/api/v1/admin/branding",
        headers=csrf_headers(csrf),
        json={
            "app_name": "SI PILOT",
            "organization_name": "Structure",
            "primary_color": "rouge",
        },
    )
    assert invalid.status_code == 422, invalid.text

    uploaded = client.post(
        "/api/v1/admin/branding/logo",
        headers=csrf_headers(csrf),
        files={"file": ("logo.png", _png_bytes(), "image/png")},
    )
    assert uploaded.status_code == 200, uploaded.text
    logo = uploaded.json()
    assert logo["logo_custom"] is True
    assert "/api/v1/branding/logo" in logo["logo_url"]

    served = client.get("/api/v1/branding/logo")
    assert served.status_code == 200
    assert served.headers["content-type"].startswith("image/png")
    assert served.content.startswith(b"\x89PNG")

    export = client.get("/api/v1/exports/assets?format=pdf")
    assert export.status_code == 200, export.text
    assert export.content.startswith(b"%PDF")
    assert b"/Subtype /Image" in export.content

    removed = client.delete(
        "/api/v1/admin/branding/logo", headers=csrf_headers(csrf)
    )
    assert removed.status_code == 200, removed.text
    assert removed.json()["logo_custom"] is False

    restored = client.put(
        "/api/v1/admin/branding",
        headers=csrf_headers(csrf),
        json={
            "app_name": original["app_name"],
            "organization_name": original["organization_name"],
            "tagline": original["tagline"],
            "description": original["description"],
            "support_email": original["support_email"],
            "primary_color": original["primary_color"],
        },
    )
    assert restored.status_code == 200, restored.text
