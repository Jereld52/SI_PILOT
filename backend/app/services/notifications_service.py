from __future__ import annotations

from uuid import UUID

from app.core.permissions import has_permission
from app.models.auth import User
from app.models.notification import Notification
from app.models.reservations import EquipmentReservation
from app.services import branding_service, email_service
from sqlalchemy import select
from sqlalchemy.orm import Session


def create_notification(
    db: Session,
    *,
    user_id: UUID,
    type: str,
    title: str,
    body: str | None = None,
    link: str | None = None,
    severity: str = "info",
    entity_type: str | None = None,
    entity_id: str | None = None,
) -> Notification:
    notification = Notification(
        user_id=user_id,
        type=type,
        severity=severity,
        title=title,
        body=body,
        link=link,
        entity_type=entity_type,
        entity_id=entity_id,
    )
    db.add(notification)
    db.flush()
    return notification


def _format_period(reservation: EquipmentReservation) -> str:
    return (
        f"{reservation.start_at:%d/%m/%Y %H:%M} → "
        f"{reservation.end_at:%d/%m/%Y %H:%M}"
    )


def notify_reservation(
    db: Session,
    reservation: EquipmentReservation,
    *,
    event: str,
) -> None:
    equipment_name = reservation.equipment.name
    requester = reservation.requester_name or reservation.requester_email or "Demandeur non précisé"
    labels = {
        "created": "Nouvelle réservation",
        "updated": "Réservation modifiée",
        "cancelled": "Réservation annulée",
        "unavailability": "Matériel indisponible",
        "checkout": "Matériel sorti",
        "return": "Matériel retourné",
    }
    action_label = labels.get(event, "Réservation")
    title = f"{action_label} — {equipment_name}"
    body = (
        f"{equipment_name}\n"
        f"{_format_period(reservation)}\n"
        f"Demandeur : {requester}\n"
        f"Motif : {reservation.purpose}"
    )

    recipients: dict[UUID, User] = {}
    if reservation.requester_agent and reservation.requester_agent.user_id:
        requester_user = db.get(User, reservation.requester_agent.user_id)
        if requester_user and requester_user.is_active:
            recipients[requester_user.id] = requester_user
    for user in db.scalars(select(User).where(User.is_active.is_(True))).all():
        if has_permission(user, "reservations.manage"):
            recipients[user.id] = user

    for user in recipients.values():
        create_notification(
            db,
            user_id=user.id,
            type="reservation",
            severity="warning" if event == "unavailability" else "info",
            title=title,
            body=body,
            link="/reservations",
            entity_type="equipment_reservation",
            entity_id=str(reservation.id),
        )

    emails: set[str] = set()
    if reservation.requester_email:
        emails.add(reservation.requester_email)
    emails.update(user.email for user in recipients.values() if user.email)
    app_name = branding_service.get_branding(db).app_name
    for email in emails:
        email_service.send_email(
            db,
            email,
            f"[{app_name}] {title}",
            f"{body}\n\nConsultez le planning : /reservations",
        )
