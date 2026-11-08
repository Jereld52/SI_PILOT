from uuid import uuid4


def test_search_links_target_existing_pages(admin_client, csrf_headers):
    client, csrf = admin_client
    suffix = uuid4().hex[:8]
    categories = client.get("/api/v1/asset-categories").json()
    category = next(item for item in categories if item["code"] == "desktop")
    asset = client.post(
        "/api/v1/assets",
        headers=csrf_headers(csrf),
        json={
            "name": f"Poste recherche {suffix}",
            "category_id": category["id"],
            "serial_number": f"SN-SEARCH-{suffix}",
            "hostname": f"pc-search-{suffix}",
            "status": "in_service",
        },
    )
    assert asset.status_code == 201, asset.text
    asset_tag = asset.json()["asset_tag"]

    found = client.get("/api/v1/search", params={"q": asset_tag})
    assert found.status_code == 200, found.text
    results = found.json()["results"]
    match = next(item for item in results if item["type"] == "asset")
    assert match["link"].startswith("/parc?q=")

    agent = client.post(
        "/api/v1/agents",
        headers=csrf_headers(csrf),
        json={
            "first_name": "Recherche",
            "last_name": f"Agent{suffix}",
            "email_pro": f"recherche.{suffix}@forets-parcnational.fr",
            "status": "active",
        },
    )
    assert agent.status_code == 201, agent.text
    email = agent.json()["email_pro"]
    found_agent = client.get("/api/v1/search", params={"q": email})
    assert found_agent.status_code == 200
    agent_match = next(
        item for item in found_agent.json()["results"] if item["type"] == "agent"
    )
    assert agent_match["link"].startswith("/agents?q=")

    for result in results:
        assert not result["link"].startswith("/parc/")

    line_number = f"06{suffix[:8]}"
    mobile = client.post(
        "/api/v1/mobile-lines",
        headers=csrf_headers(csrf),
        json={
            "line_number": line_number,
            "holder_name": f"Mobile Recherche {suffix}",
            "status": "Actif",
        },
    )
    assert mobile.status_code == 201, mobile.text
    found_mobile = client.get(
        "/api/v1/search", params={"q": mobile.json()["holder_name"]}
    )
    assert found_mobile.status_code == 200
    mobile_match = next(
        item for item in found_mobile.json()["results"] if item["type"] == "mobile_line"
    )
    assert mobile_match["link"].startswith("/telephonie?q=")

    empty = client.get("/api/v1/search", params={"q": "zzzz-introuvable-xyz"})
    assert empty.status_code == 200, empty.text
