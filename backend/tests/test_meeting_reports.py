def test_interpark_meeting_and_report(admin_client, csrf_headers):
    client, csrf = admin_client

    created = client.post(
        "/api/v1/communication/meetings",
        headers=csrf_headers(csrf),
        json={
            "title": "Réunion interparcs OFB",
            "meeting_type": "interpark",
            "scheduled_at": "2026-12-10T09:30:00+00:00",
            "duration_minutes": 120,
            "location": "Visioconférence",
            "external_organizations": ["OFB", "Parc national des Écrins"],
            "external_participants": ["Jean Dupont — OFB"],
            "agenda": "1. Suivi des actions\n2. Coordination des données",
            "notes": "Échanges sur la synchronisation des inventaires.",
            "decisions": "Constituer un groupe de travail technique.",
            "status": "done",
        },
    )
    assert created.status_code == 201, created.text
    meeting = created.json()
    meeting_id = meeting["id"]
    assert meeting["meeting_type"] == "interpark"
    assert meeting["external_organizations"] == ["OFB", "Parc national des Écrins"]
    assert meeting["external_participants"] == ["Jean Dupont — OFB"]

    point = client.post(
        "/api/v1/communication/points",
        headers=csrf_headers(csrf),
        json={
            "meeting_id": meeting_id,
            "title": "Partager le calendrier des inventaires",
            "status": "open",
            "priority": "high",
        },
    )
    assert point.status_code == 201, point.text
    point_id = point.json()["id"]

    pdf = client.get(f"/api/v1/communication/meetings/{meeting_id}/report")
    assert pdf.status_code == 200, pdf.text
    assert pdf.headers["content-type"] == "application/pdf"
    assert pdf.content.startswith(b"%PDF")
    assert "attachment" in pdf.headers["content-disposition"]

    markdown = client.get(
        f"/api/v1/communication/meetings/{meeting_id}/report", params={"format": "md"}
    )
    assert markdown.status_code == 200, markdown.text
    assert "Réunion interparcs OFB" in markdown.text
    assert "OFB" in markdown.text
    assert "Partager le calendrier des inventaires" in markdown.text
    assert "groupe de travail technique" in markdown.text

    deleted_point = client.delete(
        f"/api/v1/communication/points/{point_id}", headers=csrf_headers(csrf)
    )
    assert deleted_point.status_code == 204, deleted_point.text
    deleted_meeting = client.delete(
        f"/api/v1/communication/meetings/{meeting_id}", headers=csrf_headers(csrf)
    )
    assert deleted_meeting.status_code == 204, deleted_meeting.text
