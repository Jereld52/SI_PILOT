from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.db.session import get_db
from app.models.auth import User
from app.schemas.communication import (
    CommunicationCreate,
    CommunicationRead,
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
from app.services import communication_service

router = APIRouter(prefix="/communication", tags=["Communication"])


@router.get("/communications", response_model=list[CommunicationRead])
def list_communications(
    q: str | None = Query(None, max_length=120),
    status: str | None = Query(None, max_length=20),
    category: str | None = Query(None, max_length=40),
    actor: User = Depends(require_permission("communications.read")),
    db: Session = Depends(get_db),
):
    return communication_service.list_communications(
        db, current_user=actor, q=q, status=status, category=category
    )


@router.post("/communications", response_model=CommunicationRead, status_code=201)
def create_communication(
    payload: CommunicationCreate,
    request: Request,
    actor: User = Depends(require_permission("communications.manage")),
    db: Session = Depends(get_db),
):
    return communication_service.create_communication(
        db, payload, actor=actor, request=request
    )


@router.get("/communications/{communication_id}", response_model=CommunicationRead)
def get_communication(
    communication_id: UUID,
    actor: User = Depends(require_permission("communications.read")),
    db: Session = Depends(get_db),
):
    return communication_service.get_communication_read(db, communication_id, actor)


@router.patch("/communications/{communication_id}", response_model=CommunicationRead)
def update_communication(
    communication_id: UUID,
    payload: CommunicationUpdate,
    request: Request,
    actor: User = Depends(require_permission("communications.manage")),
    db: Session = Depends(get_db),
):
    communication = communication_service.get_communication(db, communication_id)
    return communication_service.update_communication(
        db, communication, payload, actor=actor, request=request
    )


@router.delete("/communications/{communication_id}", response_model=CommunicationRead)
def archive_communication(
    communication_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("communications.manage")),
    db: Session = Depends(get_db),
):
    communication = communication_service.get_communication(db, communication_id)
    return communication_service.archive_communication(
        db, communication, actor=actor, request=request
    )


@router.post(
    "/communications/{communication_id}/publish", response_model=CommunicationRead
)
def publish_communication(
    communication_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("communications.publish")),
    db: Session = Depends(get_db),
):
    communication = communication_service.get_communication(db, communication_id)
    return communication_service.publish_communication(
        db, communication, actor=actor, request=request
    )


@router.post(
    "/communications/{communication_id}/read", response_model=CommunicationRead
)
def mark_communication_read(
    communication_id: UUID,
    actor: User = Depends(require_permission("communications.read")),
    db: Session = Depends(get_db),
):
    communication = communication_service.get_communication(db, communication_id)
    return communication_service.mark_communication_read(
        db, communication, actor=actor
    )


# --- Réunions -----------------------------------------------------------------


@router.get("/meetings", response_model=list[MeetingRead])
def list_meetings(
    q: str | None = Query(None, max_length=120),
    meeting_type: str | None = Query(None, max_length=30),
    status: str | None = Query(None, max_length=20),
    _: User = Depends(require_permission("meetings.read")),
    db: Session = Depends(get_db),
):
    return communication_service.list_meetings(
        db, q=q, meeting_type=meeting_type, status=status
    )


@router.post("/meetings", response_model=MeetingRead, status_code=201)
def create_meeting(
    payload: MeetingCreate,
    request: Request,
    actor: User = Depends(require_permission("meetings.manage")),
    db: Session = Depends(get_db),
):
    return communication_service.create_meeting(
        db, payload, actor=actor, request=request
    )


@router.get("/meetings/{meeting_id}", response_model=MeetingRead)
def get_meeting(
    meeting_id: UUID,
    _: User = Depends(require_permission("meetings.read")),
    db: Session = Depends(get_db),
):
    return communication_service.get_meeting_read(db, meeting_id)


@router.patch("/meetings/{meeting_id}", response_model=MeetingRead)
def update_meeting(
    meeting_id: UUID,
    payload: MeetingUpdate,
    request: Request,
    actor: User = Depends(require_permission("meetings.manage")),
    db: Session = Depends(get_db),
):
    meeting = communication_service.get_meeting(db, meeting_id)
    return communication_service.update_meeting(
        db, meeting, payload, actor=actor, request=request
    )


@router.delete("/meetings/{meeting_id}", status_code=204)
def delete_meeting(
    meeting_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("meetings.manage")),
    db: Session = Depends(get_db),
):
    meeting = communication_service.get_meeting(db, meeting_id)
    communication_service.delete_meeting(db, meeting, actor=actor, request=request)


# --- Points de suivi ----------------------------------------------------------


@router.get("/points", response_model=list[MeetingPointRead])
def list_points(
    q: str | None = Query(None, max_length=120),
    status: str | None = Query(None, max_length=20),
    mine: bool = False,
    actor: User = Depends(require_permission("manager_points.read")),
    db: Session = Depends(get_db),
):
    return communication_service.list_meeting_points(
        db, current_user=actor, q=q, status=status, mine=mine
    )


@router.post("/points", response_model=MeetingPointRead, status_code=201)
def create_point(
    payload: MeetingPointCreate,
    request: Request,
    actor: User = Depends(require_permission("manager_points.manage")),
    db: Session = Depends(get_db),
):
    return communication_service.create_meeting_point(
        db, payload, actor=actor, request=request
    )


@router.patch("/points/{point_id}", response_model=MeetingPointRead)
def update_point(
    point_id: UUID,
    payload: MeetingPointUpdate,
    request: Request,
    actor: User = Depends(require_permission("manager_points.manage")),
    db: Session = Depends(get_db),
):
    point = communication_service.get_meeting_point(db, point_id)
    return communication_service.update_meeting_point(
        db, point, payload, actor=actor, request=request
    )


@router.delete("/points/{point_id}", status_code=204)
def delete_point(
    point_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("manager_points.manage")),
    db: Session = Depends(get_db),
):
    point = communication_service.get_meeting_point(db, point_id)
    communication_service.delete_meeting_point(db, point, actor=actor, request=request)


# --- Formations ---------------------------------------------------------------


@router.get("/trainings", response_model=list[TrainingRead])
def list_trainings(
    q: str | None = Query(None, max_length=120),
    status: str | None = Query(None, max_length=20),
    mandatory: bool | None = None,
    _: User = Depends(require_permission("trainings.read")),
    db: Session = Depends(get_db),
):
    return communication_service.list_trainings(
        db, q=q, status=status, mandatory=mandatory
    )


@router.post("/trainings", response_model=TrainingRead, status_code=201)
def create_training(
    payload: TrainingCreate,
    request: Request,
    actor: User = Depends(require_permission("trainings.manage")),
    db: Session = Depends(get_db),
):
    return communication_service.create_training(
        db, payload, actor=actor, request=request
    )


@router.get("/trainings/{training_id}", response_model=TrainingRead)
def get_training(
    training_id: UUID,
    _: User = Depends(require_permission("trainings.read")),
    db: Session = Depends(get_db),
):
    return communication_service.get_training_read(db, training_id)


@router.patch("/trainings/{training_id}", response_model=TrainingRead)
def update_training(
    training_id: UUID,
    payload: TrainingUpdate,
    request: Request,
    actor: User = Depends(require_permission("trainings.manage")),
    db: Session = Depends(get_db),
):
    training = communication_service.get_training(db, training_id)
    return communication_service.update_training(
        db, training, payload, actor=actor, request=request
    )


@router.delete("/trainings/{training_id}", status_code=204)
def delete_training(
    training_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("trainings.manage")),
    db: Session = Depends(get_db),
):
    training = communication_service.get_training(db, training_id)
    communication_service.delete_training(db, training, actor=actor, request=request)
