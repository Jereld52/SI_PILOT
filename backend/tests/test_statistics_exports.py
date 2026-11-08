import io
from datetime import date
from uuid import uuid4

from openpyxl import load_workbook


def _create_ticket(client, csrf_headers, csrf):
    meta = client.get("/api/v1/tickets/meta").json()
    category = meta["categories"][0]
    priority = next(item for item in meta["priorities"] if item["code"] == "medium")
    suffix = uuid4().hex[:8]
    response = client.post(
        "/api/v1/tickets",
        headers=csrf_headers(csrf),
        json={
            "subject": f"Ticket statistiques {suffix}",
            "description": "Ticket de test pour les statistiques.",
            "category_id": category["id"],
            "priority_id": priority["id"],
            "source": "phone",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_statistics_overview_and_exports(admin_client, csrf_headers):
    client, csrf = admin_client
    ticket = _create_ticket(client, csrf_headers, csrf)
    today = date.today()
    start = today.replace(day=1).isoformat()
    end = today.isoformat()

    overview = client.get(
        "/api/v1/statistics/overview",
        params={"start": start, "end": end, "granularity": "day"},
    )
    assert overview.status_code == 200, overview.text
    body = overview.json()
    assert body["granularity"] == "day"
    assert len(body["kpis"]) >= 8
    assert len(body["ticket_periods"]) >= 1
    assert any(kpi["key"] == "tickets_created" for kpi in body["kpis"])

    xlsx = client.get(
        "/api/v1/exports/tickets",
        params={
            "format": "xlsx",
            "start": start,
            "end": end,
            "granularity": "day",
        },
    )
    assert xlsx.status_code == 200, xlsx.text
    assert xlsx.content.startswith(b"PK")
    workbook = load_workbook(io.BytesIO(xlsx.content), read_only=True)
    assert {"Synthèse", "Tickets", "Par statut", "Par priorité"}.issubset(
        set(workbook.sheetnames)
    )
    tickets_sheet = workbook["Tickets"]
    values = list(tickets_sheet.iter_rows(min_row=2, values_only=True))
    assert any(row[0] == ticket["reference"] for row in values)
    workbook.close()

    pdf = client.get(
        "/api/v1/exports/tickets",
        params={
            "format": "pdf",
            "start": start,
            "end": end,
            "granularity": "month",
        },
    )
    assert pdf.status_code == 200
    assert pdf.content.startswith(b"%PDF")

    stats_xlsx = client.get(
        "/api/v1/exports/statistics",
        params={
            "format": "xlsx",
            "start": start,
            "end": end,
            "granularity": "month",
        },
    )
    assert stats_xlsx.status_code == 200, stats_xlsx.text
    workbook = load_workbook(io.BytesIO(stats_xlsx.content), read_only=True)
    assert {"Synthèse", "Tickets", "Interventions", "Parc statut"}.issubset(
        set(workbook.sheetnames)
    )
    workbook.close()

    stats_pdf = client.get(
        "/api/v1/exports/statistics",
        params={
            "format": "pdf",
            "start": start,
            "end": end,
            "granularity": "year",
        },
    )
    assert stats_pdf.status_code == 200
    assert stats_pdf.content.startswith(b"%PDF")
