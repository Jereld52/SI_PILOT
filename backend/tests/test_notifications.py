from uuid import UUID

from app.db.session import SessionLocal
from app.models.notification import Notification


def test_notifications_flow(admin_client, csrf_headers):
    client, csrf = admin_client
    me = client.get("/api/v1/auth/me").json()["user"]
    with SessionLocal() as db:
        notification = Notification(
            user_id=UUID(me["id"]),
            type="test",
            severity="info",
            title="Notification de test",
            body="Vérification du flux de notifications.",
        )
        db.add(notification)
        db.commit()

    response = client.get("/api/v1/notifications", params={"unread_only": True})
    assert response.status_code == 200
    assert response.json()["total"] >= 1
    item = response.json()["items"][0]

    response = client.patch(
        f"/api/v1/notifications/{item['id']}/read", headers=csrf_headers(csrf)
    )
    assert response.status_code == 200
    assert response.json()["read_at"] is not None
