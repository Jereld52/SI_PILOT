from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from app.core.errors import NotFoundError, ValidationAppError
from app.core.permissions import has_permission
from app.models.auth import Role, User
from app.models.communication import (
    Communication,
    CommunicationReceipt,
    Meeting,
    MeetingPoint,
    Training,
)
from app.models.organization import Agent, Service
from app.schemas.agents import AgentRef
from app.schemas.communication import (
    CommunicationCreate,
    CommunicationRead,
    CommunicationRoleRef,
    CommunicationUpdate,
    MeetingCreate,
    MeetingPointCreate,
    MeetingPointRead,
    MeetingPointUpdate,
    MeetingRead,
    MeetingUpdate,
    TrainingCreate,
    TrainingRead,
    TrainingUpdate,
)
from app.schemas.referentials import ServiceRef
from app.schemas.tickets import TicketUserRef
from app.services import branding_service, email_service, notifications_service
from app.services.audit_service import write_audit
from fastapi import Request
from sqlalchemy import or_, select
from sqlalchemy.orm import Session


def _require(db: Session, model, entity_id: UUID, message: str):  # noqa: ANN001
    row = db.get(model, entity_id)
    if row is None:
        raise NotFoundError(message)
    return row


def _user_ref(user: User | None) -> TicketUserRef | None:
    return TicketUserRef.model_validate(user) if user else None


def _users_by_ids(db: Session, ids: list[UUID]) -> list[User]:
    if not ids:
        return []
    rows = db.scalars(select(User).where(User.id.in_(ids))).all()
    by_id = {row.id: row for row in rows}
    return [by_id[item] for item in ids if item in by_id]


def _agents_by_ids(db: Session, ids: list[UUID]) -> list[Agent]:
    if not ids:
        return []
    rows = db.scalars(select(Agent).where(Agent.id.in_(ids))).all()
    by_id = {row.id: row for row in rows}
    return [by_id[item] for item in ids if item in by_id]


def _audience_label(db: Session, communication: Communication) -> str:
    if communication.audience == "service":
        service = (
            db.get(Service, communication.audience_service_id)
            if communication.audience_service_id
            else None
        )
        return service.name if service else "Service non précisé"
    if communication.audience == "role":
        role = (
            db.get(Role, communication.audience_role_id)
            if communication.audience_role_id
            else None
        )
        return role.name if role else "Rôle non précisé"
    if communication.audience == "users":
        count = len(communication.audience_user_ids)
        return f"{count} utilisateur(s) sélectionné(s)"
    return "Tous les utilisateurs"


def _recipients(db: Session, communication: Communication) -> list[User]:
    active = User.is_active.is_(True)
    if communication.audience == "service" and communication.audience_service_id:
        return list(
            db.scalars(
                select(User)
                .join(Agent, Agent.user_id == User.id)
                .where(active, Agent.service_id == communication.audience_service_id)
                .order_by(User.last_name, User.first_name)
            ).all()
        )
    if communication.audience == "role" and communication.audience_role_id:
        return list(
            db.scalars(
                select(User)
                .where(active, User.role_id == communication.audience_role_id)
                .order_by(User.last_name, User.first_name)
            ).all()
        )
    if communication.audience == "users" and communication.audience_user_ids:
        return _users_by_ids(db, communication.audience_user_ids)
    return list(
        db.scalars(
            select(User)
            .where(active)
            .order_by(User.last_name, User.first_name)
        ).all()
    )


def _communication_read(
    db: Session, communication: Communication, current_user: User
) -> CommunicationRead:
    audience_users = _users_by_ids(db, communication.audience_user_ids)
    return CommunicationRead(
        id=communication.id,
        title=communication.title,
        body=communication.body,
        category=communication.category,
        audience=communication.audience,
        audience_service_id=communication.audience_service_id,
        audience_service=(
            ServiceRef.model_validate(communication.audience_service)
            if communication.audience_service
            else None
        ),
        audience_role_id=communication.audience_role_id,
        audience_role=(
            CommunicationRoleRef.model_validate(communication.audience_role)
            if communication.audience_role
            else None
        ),
        audience_user_ids=communication.audience_user_ids,
        audience_users=[TicketUserRef.model_validate(user) for user in audience_users],
        audience_label=_audience_label(db, communication),
        channel=communication.channel,
        status=communication.status,
        is_pinned=communication.is_pinned,
        scheduled_at=communication.scheduled_at,
        published_at=communication.published_at,
        expires_at=communication.expires_at,
        author_user_id=communication.author_user_id,
        author=_user_ref(communication.author),
        read_count=len(communication.receipts),
        recipient_count=len(_recipients(db, communication)),
        is_read=any(
            receipt.user_id == current_user.id for receipt in communication.receipts
        ),
        created_at=communication.created_at,
        updated_at=communication.updated_at,
    )


def _validate_communication_target(db: Session, payload) -> None:  # noqa: ANN001
    if payload.audience == "service":
        if not payload.audience_service_id:
            raise ValidationAppError("Sélectionnez le service destinataire.")
        _require(db, Service, payload.audience_service_id, "Service introuvable.")
    if payload.audience == "role":
        if not payload.audience_role_id:
            raise ValidationAppError("Sélectionnez le rôle destinataire.")
        _require(db, Role, payload.audience_role_id, "Rôle introuvable.")
    if payload.audience == "users":
        if not payload.audience_user_ids:
            raise ValidationAppError("Sélectionnez au moins un utilisateur.")
        _users_by_ids(db, payload.audience_user_ids)
    if payload.author_user_id:
        _require(db, User, payload.author_user_id, "Auteur introuvable.")


def list_communications(
    db: Session,
    *,
    current_user: User,
    q: str | None = None,
    status: str | None = None,
    category: str | None = None,
) -> list[CommunicationRead]:
    statement = select(Communication)
    if not has_permission(current_user, "communications.manage"):
        now = datetime.now(UTC)
        statement = statement.where(
            Communication.status == "published",
            or_(Communication.expires_at.is_(None), Communication.expires_at > now),
        )
    if status:
        statement = statement.where(Communication.status == status)
    if category:
        statement = statement.where(Communication.category == category)
    if q:
        pattern = f"%{q.strip()}%"
        statement = statement.where(
            or_(Communication.title.ilike(pattern), Communication.body.ilike(pattern))
        )
    rows = db.scalars(
        statement.order_by(
            Communication.is_pinned.desc(),
            Communication.published_at.desc().nullslast(),
            Communication.scheduled_at.desc().nullslast(),
            Communication.created_at.desc(),
        )
    ).all()
    return [_communication_read(db, row, current_user) for row in rows]


def get_communication(db: Session, communication_id: UUID) -> Communication:
    return _require(db, Communication, communication_id, "Communication introuvable.")


def get_communication_read(
    db: Session, communication_id: UUID, current_user: User
) -> CommunicationRead:
    communication = get_communication(db, communication_id)
    if (
        not has_permission(current_user, "communications.manage")
        and communication.status != "published"
    ):
        raise NotFoundError("Communication introuvable.")
    return _communication_read(db, communication, current_user)


def create_communication(
    db: Session,
    payload: CommunicationCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> CommunicationRead:
    _validate_communication_target(db, payload)
    data = payload.model_dump(exclude={"audience_user_ids", "author_user_id"})
    communication = Communication(
        **data,
        audience_user_ids=payload.audience_user_ids,
        author_user_id=payload.author_user_id or actor.id,
        created_by_id=actor.id,
        updated_by_id=actor.id,
    )
    db.add(communication)
    db.flush()
    if communication.status == "published" and not has_permission(
        actor, "communications.publish"
    ):
        raise ValidationAppError("Vous n'avez pas la permission de publier.")
    write_audit(
        db,
        module="communication",
        action="communication_created",
        actor=actor,
        entity_type="communication",
        entity_id=str(communication.id),
        entity_label=communication.title,
        after={"title": communication.title, "status": communication.status},
        request=request,
    )
    db.commit()
    db.refresh(communication)
    if communication.status == "published" and communication.published_at is None:
        return publish_communication(db, communication, actor=actor, request=request)
    return _communication_read(db, communication, actor)


def update_communication(
    db: Session,
    communication: Communication,
    payload: CommunicationUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> CommunicationRead:
    already_published = communication.published_at is not None
    data = payload.model_dump(exclude_unset=True, exclude={"audience_user_ids"})
    for key, value in data.items():
        setattr(communication, key, value)
    if payload.audience_user_ids is not None:
        communication.audience_user_ids = payload.audience_user_ids
    _validate_communication_target(db, communication)
    if (
        communication.status == "published"
        and not already_published
        and not has_permission(actor, "communications.publish")
    ):
        raise ValidationAppError("Vous n'avez pas la permission de publier.")
    communication.updated_by_id = actor.id
    write_audit(
        db,
        module="communication",
        action="communication_updated",
        actor=actor,
        entity_type="communication",
        entity_id=str(communication.id),
        entity_label=communication.title,
        after={"title": communication.title, "status": communication.status},
        request=request,
    )
    db.commit()
    db.refresh(communication)
    if communication.status == "published" and not already_published:
        return publish_communication(db, communication, actor=actor, request=request)
    return _communication_read(db, communication, actor)


def archive_communication(
    db: Session,
    communication: Communication,
    *,
    actor: User,
    request: Request | None = None,
) -> CommunicationRead:
    communication.status = "archived"
    communication.updated_by_id = actor.id
    write_audit(
        db,
        module="communication",
        action="communication_archived",
        actor=actor,
        entity_type="communication",
        entity_id=str(communication.id),
        entity_label=communication.title,
        request=request,
    )
    db.commit()
    db.refresh(communication)
    return _communication_read(db, communication, actor)


def publish_communication(
    db: Session,
    communication: Communication,
    *,
    actor: User,
    request: Request | None = None,
) -> CommunicationRead:
    if communication.status == "archived":
        raise ValidationAppError("Une communication archivée ne peut pas être publiée.")
    if communication.published_at is not None:
        communication.status = "published"
        communication.updated_by_id = actor.id
        db.commit()
        db.refresh(communication)
        return _communication_read(db, communication, actor)
    communication.status = "published"
    communication.published_at = datetime.now(UTC)
    communication.updated_by_id = actor.id
    recipients = _recipients(db, communication)
    app_name = branding_service.get_branding(db).app_name
    for user in recipients:
        notifications_service.create_notification(
            db,
            user_id=user.id,
            type="communication",
            severity="info",
            title=communication.title,
            body=communication.body[:500],
            link="/communication/communications",
            entity_type="communication",
            entity_id=str(communication.id),
        )
        if communication.channel in {"email", "both"} and user.email:
            email_service.send_email(
                db,
                user.email,
                f"[{app_name}] {communication.title}",
                communication.body,
            )
    write_audit(
        db,
        module="communication",
        action="communication_published",
        actor=actor,
        entity_type="communication",
        entity_id=str(communication.id),
        entity_label=communication.title,
        after={"recipients": len(recipients), "channel": communication.channel},
        request=request,
    )
    db.commit()
    db.refresh(communication)
    return _communication_read(db, communication, actor)


def mark_communication_read(
    db: Session, communication: Communication, *, actor: User
) -> CommunicationRead:
    existing = db.scalar(
        select(CommunicationReceipt).where(
            CommunicationReceipt.communication_id == communication.id,
            CommunicationReceipt.user_id == actor.id,
        )
    )
    if existing is None:
        db.add(
            CommunicationReceipt(
                communication_id=communication.id,
                user_id=actor.id,
                read_at=datetime.now(UTC),
            )
        )
        db.commit()
        db.refresh(communication)
    return _communication_read(db, communication, actor)


# --- Réunions -----------------------------------------------------------------


def _meeting_read(db: Session, meeting: Meeting) -> MeetingRead:
    participants = _users_by_ids(db, meeting.participant_user_ids)
    return MeetingRead(
        id=meeting.id,
        title=meeting.title,
        meeting_type=meeting.meeting_type,
        scheduled_at=meeting.scheduled_at,
        duration_minutes=meeting.duration_minutes,
        location=meeting.location,
        visio_url=meeting.visio_url,
        organizer_user_id=meeting.organizer_user_id,
        organizer=_user_ref(meeting.organizer),
        participant_user_ids=meeting.participant_user_ids,
        participants=[TicketUserRef.model_validate(user) for user in participants],
        agenda=meeting.agenda,
        notes=meeting.notes,
        decisions=meeting.decisions,
        status=meeting.status,
        open_point_count=sum(1 for point in meeting.points if point.status != "done"),
        created_at=meeting.created_at,
        updated_at=meeting.updated_at,
    )


def list_meetings(
    db: Session,
    *,
    q: str | None = None,
    meeting_type: str | None = None,
    status: str | None = None,
) -> list[MeetingRead]:
    statement = select(Meeting)
    if meeting_type:
        statement = statement.where(Meeting.meeting_type == meeting_type)
    if status:
        statement = statement.where(Meeting.status == status)
    if q:
        pattern = f"%{q.strip()}%"
        statement = statement.where(
            or_(
                Meeting.title.ilike(pattern),
                Meeting.agenda.ilike(pattern),
                Meeting.notes.ilike(pattern),
            )
        )
    rows = db.scalars(
        statement.order_by(Meeting.scheduled_at.desc(), Meeting.title)
    ).all()
    return [_meeting_read(db, row) for row in rows]


def get_meeting(db: Session, meeting_id: UUID) -> Meeting:
    return _require(db, Meeting, meeting_id, "Réunion introuvable.")


def get_meeting_read(db: Session, meeting_id: UUID) -> MeetingRead:
    return _meeting_read(db, get_meeting(db, meeting_id))


def _validate_meeting(db: Session, payload) -> None:  # noqa: ANN001
    if payload.organizer_user_id:
        _require(db, User, payload.organizer_user_id, "Organisateur introuvable.")
    for user_id in payload.participant_user_ids:
        _require(db, User, user_id, "Participant introuvable.")


def create_meeting(
    db: Session,
    payload: MeetingCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> MeetingRead:
    _validate_meeting(db, payload)
    data = payload.model_dump(exclude={"participant_user_ids", "organizer_user_id"})
    meeting = Meeting(
        **data,
        participant_user_ids=payload.participant_user_ids,
        organizer_user_id=payload.organizer_user_id or actor.id,
        created_by_id=actor.id,
        updated_by_id=actor.id,
    )
    db.add(meeting)
    db.flush()
    write_audit(
        db,
        module="communication",
        action="meeting_created",
        actor=actor,
        entity_type="meeting",
        entity_id=str(meeting.id),
        entity_label=meeting.title,
        after={"scheduled_at": meeting.scheduled_at.isoformat(), "type": meeting.meeting_type},
        request=request,
    )
    db.commit()
    db.refresh(meeting)
    return _meeting_read(db, meeting)


def update_meeting(
    db: Session,
    meeting: Meeting,
    payload: MeetingUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> MeetingRead:
    data = payload.model_dump(exclude_unset=True, exclude={"participant_user_ids"})
    for key, value in data.items():
        setattr(meeting, key, value)
    if payload.participant_user_ids is not None:
        meeting.participant_user_ids = payload.participant_user_ids
    _validate_meeting(db, meeting)
    meeting.updated_by_id = actor.id
    write_audit(
        db,
        module="communication",
        action="meeting_updated",
        actor=actor,
        entity_type="meeting",
        entity_id=str(meeting.id),
        entity_label=meeting.title,
        request=request,
    )
    db.commit()
    db.refresh(meeting)
    return _meeting_read(db, meeting)


def delete_meeting(
    db: Session,
    meeting: Meeting,
    *,
    actor: User,
    request: Request | None = None,
) -> None:
    write_audit(
        db,
        module="communication",
        action="meeting_deleted",
        actor=actor,
        entity_type="meeting",
        entity_id=str(meeting.id),
        entity_label=meeting.title,
        request=request,
    )
    db.delete(meeting)
    db.commit()


# --- Points de suivi ----------------------------------------------------------


def _point_read(db: Session, point: MeetingPoint) -> MeetingPointRead:
    return MeetingPointRead(
        id=point.id,
        meeting_id=point.meeting_id,
        meeting_title=point.meeting.title if point.meeting else None,
        title=point.title,
        description=point.description,
        status=point.status,
        priority=point.priority,
        due_date=point.due_date,
        next_review_at=point.next_review_at,
        last_discussed_at=point.last_discussed_at,
        owner_user_id=point.owner_user_id,
        owner=_user_ref(point.owner),
        notes=point.notes,
        created_at=point.created_at,
        updated_at=point.updated_at,
    )


def list_meeting_points(
    db: Session,
    *,
    current_user: User,
    q: str | None = None,
    status: str | None = None,
    mine: bool = False,
) -> list[MeetingPointRead]:
    statement = select(MeetingPoint)
    if status:
        statement = statement.where(MeetingPoint.status == status)
    if mine:
        statement = statement.where(MeetingPoint.owner_user_id == current_user.id)
    if q:
        pattern = f"%{q.strip()}%"
        statement = statement.where(
            or_(MeetingPoint.title.ilike(pattern), MeetingPoint.description.ilike(pattern))
        )
    rows = db.scalars(
        statement.order_by(
            MeetingPoint.status,
            MeetingPoint.due_date.asc().nullslast(),
            MeetingPoint.created_at.desc(),
        )
    ).all()
    return [_point_read(db, row) for row in rows]


def get_meeting_point(db: Session, point_id: UUID) -> MeetingPoint:
    return _require(db, MeetingPoint, point_id, "Point de suivi introuvable.")


def _validate_point(db: Session, payload) -> None:  # noqa: ANN001
    if payload.meeting_id:
        _require(db, Meeting, payload.meeting_id, "Réunion introuvable.")
    if payload.owner_user_id:
        _require(db, User, payload.owner_user_id, "Responsable introuvable.")


def create_meeting_point(
    db: Session,
    payload: MeetingPointCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> MeetingPointRead:
    _validate_point(db, payload)
    point = MeetingPoint(
        **payload.model_dump(exclude={"owner_user_id"}),
        owner_user_id=payload.owner_user_id or actor.id,
        created_by_id=actor.id,
        updated_by_id=actor.id,
    )
    db.add(point)
    db.flush()
    write_audit(
        db,
        module="communication",
        action="meeting_point_created",
        actor=actor,
        entity_type="meeting_point",
        entity_id=str(point.id),
        entity_label=point.title,
        request=request,
    )
    db.commit()
    db.refresh(point)
    return _point_read(db, point)


def update_meeting_point(
    db: Session,
    point: MeetingPoint,
    payload: MeetingPointUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> MeetingPointRead:
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(point, key, value)
    _validate_point(db, point)
    point.updated_by_id = actor.id
    write_audit(
        db,
        module="communication",
        action="meeting_point_updated",
        actor=actor,
        entity_type="meeting_point",
        entity_id=str(point.id),
        entity_label=point.title,
        after={"status": point.status},
        request=request,
    )
    db.commit()
    db.refresh(point)
    return _point_read(db, point)


def delete_meeting_point(
    db: Session,
    point: MeetingPoint,
    *,
    actor: User,
    request: Request | None = None,
) -> None:
    write_audit(
        db,
        module="communication",
        action="meeting_point_deleted",
        actor=actor,
        entity_type="meeting_point",
        entity_id=str(point.id),
        entity_label=point.title,
        request=request,
    )
    db.delete(point)
    db.commit()


# --- Formations ---------------------------------------------------------------


def _training_read(db: Session, training: Training) -> TrainingRead:
    participants = _agents_by_ids(db, training.participant_agent_ids)
    return TrainingRead(
        id=training.id,
        title=training.title,
        provider=training.provider,
        description=training.description,
        category=training.category,
        start_date=training.start_date,
        end_date=training.end_date,
        duration_hours=(
            float(training.duration_hours) if training.duration_hours is not None else None
        ),
        location=training.location,
        mandatory=training.mandatory,
        cost=float(training.cost) if training.cost is not None else None,
        status=training.status,
        capacity=training.capacity,
        participant_agent_ids=training.participant_agent_ids,
        participants=[AgentRef.model_validate(agent) for agent in participants],
        notes=training.notes,
        created_at=training.created_at,
        updated_at=training.updated_at,
    )


def list_trainings(
    db: Session,
    *,
    q: str | None = None,
    status: str | None = None,
    mandatory: bool | None = None,
) -> list[TrainingRead]:
    statement = select(Training)
    if status:
        statement = statement.where(Training.status == status)
    if mandatory is not None:
        statement = statement.where(Training.mandatory.is_(mandatory))
    if q:
        pattern = f"%{q.strip()}%"
        statement = statement.where(
            or_(
                Training.title.ilike(pattern),
                Training.provider.ilike(pattern),
                Training.description.ilike(pattern),
            )
        )
    rows = db.scalars(
        statement.order_by(Training.start_date.desc().nullslast(), Training.title)
    ).all()
    return [_training_read(db, row) for row in rows]


def get_training(db: Session, training_id: UUID) -> Training:
    return _require(db, Training, training_id, "Formation introuvable.")


def get_training_read(db: Session, training_id: UUID) -> TrainingRead:
    return _training_read(db, get_training(db, training_id))


def create_training(
    db: Session,
    payload: TrainingCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> TrainingRead:
    _agents_by_ids(db, payload.participant_agent_ids)
    data = payload.model_dump(exclude={"participant_agent_ids"})
    training = Training(
        **data,
        participant_agent_ids=payload.participant_agent_ids,
        created_by_id=actor.id,
        updated_by_id=actor.id,
    )
    db.add(training)
    db.flush()
    write_audit(
        db,
        module="communication",
        action="training_created",
        actor=actor,
        entity_type="training",
        entity_id=str(training.id),
        entity_label=training.title,
        request=request,
    )
    db.commit()
    db.refresh(training)
    return _training_read(db, training)


def update_training(
    db: Session,
    training: Training,
    payload: TrainingUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> TrainingRead:
    data = payload.model_dump(exclude_unset=True, exclude={"participant_agent_ids"})
    for key, value in data.items():
        setattr(training, key, value)
    if payload.participant_agent_ids is not None:
        training.participant_agent_ids = payload.participant_agent_ids
    _agents_by_ids(db, training.participant_agent_ids)
    training.updated_by_id = actor.id
    write_audit(
        db,
        module="communication",
        action="training_updated",
        actor=actor,
        entity_type="training",
        entity_id=str(training.id),
        entity_label=training.title,
        after={"status": training.status},
        request=request,
    )
    db.commit()
    db.refresh(training)
    return _training_read(db, training)


def delete_training(
    db: Session,
    training: Training,
    *,
    actor: User,
    request: Request | None = None,
) -> None:
    write_audit(
        db,
        module="communication",
        action="training_deleted",
        actor=actor,
        entity_type="training",
        entity_id=str(training.id),
        entity_label=training.title,
        request=request,
    )
    db.delete(training)
    db.commit()
