from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.errors import NotFoundError
from app.core.pagination import PageParams, page_params, paginate
from app.db.session import get_db
from app.models.auth import User
from app.models.notification import Notification
from app.schemas.common import Page
from app.schemas.notification import NotificationCount, NotificationRead

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("", response_model=Page[NotificationRead])
def list_notifications(
    unread_only: bool = False,
    params: PageParams = Depends(page_params),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    statement = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        statement = statement.where(Notification.read_at.is_(None))
    statement = statement.order_by(Notification.created_at.desc())
    return paginate(db, statement, params)


@router.get("/unread-count", response_model=NotificationCount)
def unread_count(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> NotificationCount:
    total = db.scalar(
        select(func.count()).select_from(Notification).where(Notification.user_id == user.id)
    ) or 0
    unread = db.scalar(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user.id, Notification.read_at.is_(None))
    ) or 0
    return NotificationCount(unread=unread, total=total)


@router.patch("/{notification_id}/read", response_model=NotificationRead)
def mark_read(
    notification_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Notification:
    notification = db.scalar(
        select(Notification).where(
            Notification.id == notification_id, Notification.user_id == user.id
        )
    )
    if notification is None:
        raise NotFoundError("Notification introuvable.")
    if notification.read_at is None:
        notification.read_at = datetime.now(UTC)
        db.commit()
        db.refresh(notification)
    return notification


@router.post("/read-all")
def mark_all_read(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    now = datetime.now(UTC)
    notifications = db.scalars(
        select(Notification).where(
            Notification.user_id == user.id, Notification.read_at.is_(None)
        )
    ).all()
    for notification in notifications:
        notification.read_at = now
    db.commit()
    return {"updated": len(notifications)}
