from __future__ import annotations

from datetime import date, timedelta
from uuid import UUID

from app.core.errors import NotFoundError
from app.db.base import utcnow
from app.models.auth import User
from app.models.rgpd import (
    DataBreach,
    DataCollection,
    DpoRequest,
    ProcessingActivity,
    RightsRequest,
)
from app.schemas.rgpd import (
    DataBreachCreate,
    DataBreachRead,
    DataBreachUpdate,
    DataCollectionCreate,
    DataCollectionRead,
    DataCollectionUpdate,
    DpoRequestCreate,
    DpoRequestRead,
    DpoRequestUpdate,
    ProcessingActivityCreate,
    ProcessingActivityRead,
    ProcessingActivityUpdate,
    RgpdDeadline,
    RgpdOverview,
    RightsRequestCreate,
    RightsRequestRead,
    RightsRequestUpdate,
)
from app.services.audit_service import write_audit
from app.services.reference_service import next_reference
from fastapi import Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session


def _require(db: Session, model, entity_id: UUID, message: str):
    row = db.get(model, entity_id)
    if row is None:
        raise NotFoundError(message)
    return row


def _validate_owner(db: Session, owner_user_id: UUID | None) -> None:
    if owner_user_id and db.get(User, owner_user_id) is None:
        raise NotFoundError("Responsable introuvable.")


def _validate_activity(db: Session, activity_id: UUID | None) -> None:
    if activity_id and db.get(ProcessingActivity, activity_id) is None:
        raise NotFoundError("Traitement RGPD introuvable.")


def get_processing_activity(db: Session, activity_id: UUID) -> ProcessingActivity:
    return _require(db, ProcessingActivity, activity_id, "Traitement RGPD introuvable.")


def get_collection(db: Session, collection_id: UUID) -> DataCollection:
    return _require(db, DataCollection, collection_id, "Collecte RGPD introuvable.")


def get_dpo_request(db: Session, request_id: UUID) -> DpoRequest:
    return _require(db, DpoRequest, request_id, "Demande DPO introuvable.")


def get_rights_request(db: Session, rights_id: UUID) -> RightsRequest:
    return _require(db, RightsRequest, rights_id, "Demande de droits introuvable.")


def get_breach(db: Session, breach_id: UUID) -> DataBreach:
    return _require(db, DataBreach, breach_id, "Violation introuvable.")


# --- Registre des traitements -------------------------------------------------


def list_processing_activities(
    db: Session, *, q: str | None = None, status: str | None = None
) -> list[ProcessingActivityRead]:
    statement = select(ProcessingActivity)
    if status:
        statement = statement.where(ProcessingActivity.status == status)
    if q:
        pattern = f"%{q.strip()}%"
        statement = statement.where(
            or_(
                ProcessingActivity.reference.ilike(pattern),
                ProcessingActivity.name.ilike(pattern),
                ProcessingActivity.purpose.ilike(pattern),
                ProcessingActivity.legal_basis.ilike(pattern),
            )
        )
    rows = db.scalars(
        statement.order_by(ProcessingActivity.next_review_at.nullslast(), ProcessingActivity.name)
    ).all()
    return [ProcessingActivityRead.model_validate(row) for row in rows]


def create_processing_activity(
    db: Session,
    payload: ProcessingActivityCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> ProcessingActivityRead:
    _validate_owner(db, payload.owner_user_id)
    data = payload.model_dump(exclude={"reference"})
    activity = ProcessingActivity(
        **data,
        reference=payload.reference or next_reference(db, key="rgpd_activity", prefix="RGPD"),
    )
    db.add(activity)
    db.flush()
    write_audit(
        db,
        module="rgpd",
        action="processing_activity_created",
        actor=actor,
        entity_type="processing_activity",
        entity_id=str(activity.id),
        entity_label=f"{activity.reference} — {activity.name}",
        after={"status": activity.status},
        request=request,
    )
    db.commit()
    db.refresh(activity)
    return ProcessingActivityRead.model_validate(activity)


def update_processing_activity(
    db: Session,
    activity: ProcessingActivity,
    payload: ProcessingActivityUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> ProcessingActivityRead:
    data = payload.model_dump(exclude_unset=True)
    if "owner_user_id" in data:
        _validate_owner(db, data["owner_user_id"])
    before = {"status": activity.status, "name": activity.name}
    for field, value in data.items():
        setattr(activity, field, value)
    write_audit(
        db,
        module="rgpd",
        action="processing_activity_updated",
        actor=actor,
        entity_type="processing_activity",
        entity_id=str(activity.id),
        entity_label=f"{activity.reference} — {activity.name}",
        before=before,
        after={"status": activity.status, "name": activity.name},
        request=request,
    )
    db.commit()
    db.refresh(activity)
    return ProcessingActivityRead.model_validate(activity)


def archive_processing_activity(
    db: Session, activity: ProcessingActivity, *, actor: User, request: Request | None = None
) -> ProcessingActivityRead:
    activity.status = "archived"
    write_audit(
        db,
        module="rgpd",
        action="processing_activity_archived",
        actor=actor,
        entity_type="processing_activity",
        entity_id=str(activity.id),
        entity_label=activity.name,
        after={"status": "archived"},
        request=request,
    )
    db.commit()
    db.refresh(activity)
    return ProcessingActivityRead.model_validate(activity)


# --- Registre des collectes ---------------------------------------------------


def list_collections(
    db: Session,
    *,
    q: str | None = None,
    status: str | None = None,
    processing_activity_id: UUID | None = None,
) -> list[DataCollectionRead]:
    statement = select(DataCollection)
    if status:
        statement = statement.where(DataCollection.status == status)
    if processing_activity_id:
        statement = statement.where(DataCollection.processing_activity_id == processing_activity_id)
    if q:
        pattern = f"%{q.strip()}%"
        statement = statement.where(
            or_(
                DataCollection.name.ilike(pattern),
                DataCollection.purpose.ilike(pattern),
                DataCollection.data_categories.ilike(pattern),
            )
        )
    rows = db.scalars(
        statement.order_by(DataCollection.retention_end.nullslast(), DataCollection.name)
    ).all()
    return [DataCollectionRead.model_validate(row) for row in rows]


def create_collection(
    db: Session,
    payload: DataCollectionCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> DataCollectionRead:
    _validate_activity(db, payload.processing_activity_id)
    row = DataCollection(**payload.model_dump())
    db.add(row)
    db.flush()
    write_audit(
        db,
        module="rgpd",
        action="collection_created",
        actor=actor,
        entity_type="data_collection",
        entity_id=str(row.id),
        entity_label=row.name,
        after={"type": row.collection_type, "status": row.status},
        request=request,
    )
    db.commit()
    db.refresh(row)
    return DataCollectionRead.model_validate(row)


def update_collection(
    db: Session,
    row: DataCollection,
    payload: DataCollectionUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> DataCollectionRead:
    data = payload.model_dump(exclude_unset=True)
    if "processing_activity_id" in data:
        _validate_activity(db, data["processing_activity_id"])
    for field, value in data.items():
        setattr(row, field, value)
    write_audit(
        db,
        module="rgpd",
        action="collection_updated",
        actor=actor,
        entity_type="data_collection",
        entity_id=str(row.id),
        entity_label=row.name,
        after={"status": row.status},
        request=request,
    )
    db.commit()
    db.refresh(row)
    return DataCollectionRead.model_validate(row)


def archive_collection(
    db: Session, row: DataCollection, *, actor: User, request: Request | None = None
) -> DataCollectionRead:
    row.status = "archived"
    write_audit(
        db,
        module="rgpd",
        action="collection_archived",
        actor=actor,
        entity_type="data_collection",
        entity_id=str(row.id),
        entity_label=row.name,
        after={"status": "archived"},
        request=request,
    )
    db.commit()
    db.refresh(row)
    return DataCollectionRead.model_validate(row)


# --- Demandes DPO -------------------------------------------------------------


def list_dpo_requests(
    db: Session, *, q: str | None = None, status: str | None = None
) -> list[DpoRequestRead]:
    statement = select(DpoRequest)
    if status:
        statement = statement.where(DpoRequest.status == status)
    if q:
        pattern = f"%{q.strip()}%"
        statement = statement.where(
            or_(
                DpoRequest.reference.ilike(pattern),
                DpoRequest.subject.ilike(pattern),
                DpoRequest.requester_name.ilike(pattern),
            )
        )
    rows = db.scalars(
        statement.order_by(DpoRequest.due_date.nullslast(), DpoRequest.created_at.desc())
    ).all()
    return [DpoRequestRead.model_validate(row) for row in rows]


def create_dpo_request(
    db: Session,
    payload: DpoRequestCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> DpoRequestRead:
    row = DpoRequest(
        **payload.model_dump(),
        reference=next_reference(db, key="dpo_request", prefix="DPO"),
        created_by_id=actor.id,
    )
    db.add(row)
    db.flush()
    write_audit(
        db,
        module="rgpd",
        action="dpo_request_created",
        actor=actor,
        entity_type="dpo_request",
        entity_id=str(row.id),
        entity_label=f"{row.reference} — {row.subject}",
        after={"status": row.status},
        request=request,
    )
    db.commit()
    db.refresh(row)
    return DpoRequestRead.model_validate(row)


def update_dpo_request(
    db: Session,
    row: DpoRequest,
    payload: DpoRequestUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> DpoRequestRead:
    data = payload.model_dump(exclude_unset=True)
    before = {"status": row.status}
    for field, value in data.items():
        setattr(row, field, value)
    if row.status == "closed" and row.closed_at is None:
        row.closed_at = utcnow()
    if row.status != "closed":
        row.closed_at = None
    write_audit(
        db,
        module="rgpd",
        action="dpo_request_updated",
        actor=actor,
        entity_type="dpo_request",
        entity_id=str(row.id),
        entity_label=f"{row.reference} — {row.subject}",
        before=before,
        after={"status": row.status},
        request=request,
    )
    db.commit()
    db.refresh(row)
    return DpoRequestRead.model_validate(row)


# --- Droits des personnes -----------------------------------------------------


def list_rights_requests(
    db: Session,
    *,
    q: str | None = None,
    status: str | None = None,
    request_type: str | None = None,
) -> list[RightsRequestRead]:
    statement = select(RightsRequest)
    if status:
        statement = statement.where(RightsRequest.status == status)
    if request_type:
        statement = statement.where(RightsRequest.request_type == request_type)
    if q:
        pattern = f"%{q.strip()}%"
        statement = statement.where(
            or_(
                RightsRequest.reference.ilike(pattern),
                RightsRequest.requester_name.ilike(pattern),
            )
        )
    rows = db.scalars(
        statement.order_by(RightsRequest.due_date.nullslast(), RightsRequest.created_at.desc())
    ).all()
    return [RightsRequestRead.model_validate(row) for row in rows]


def create_rights_request(
    db: Session,
    payload: RightsRequestCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> RightsRequestRead:
    _validate_activity(db, payload.processing_activity_id)
    received_at = payload.received_at or date.today()
    due_date = payload.due_date or received_at + timedelta(days=30)
    row = RightsRequest(
        **payload.model_dump(exclude={"received_at", "due_date"}),
        reference=next_reference(db, key="rights_request", prefix="DRT"),
        received_at=received_at,
        due_date=due_date,
    )
    db.add(row)
    db.flush()
    write_audit(
        db,
        module="rgpd",
        action="rights_request_created",
        actor=actor,
        entity_type="rights_request",
        entity_id=str(row.id),
        entity_label=f"{row.reference} — {row.request_type}",
        after={"status": row.status},
        request=request,
    )
    db.commit()
    db.refresh(row)
    return RightsRequestRead.model_validate(row)


def update_rights_request(
    db: Session,
    row: RightsRequest,
    payload: RightsRequestUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> RightsRequestRead:
    data = payload.model_dump(exclude_unset=True)
    if "processing_activity_id" in data:
        _validate_activity(db, data["processing_activity_id"])
    before = {"status": row.status}
    for field, value in data.items():
        setattr(row, field, value)
    if row.status == "closed" and row.closed_at is None:
        row.closed_at = utcnow()
    if row.status != "closed":
        row.closed_at = None
    write_audit(
        db,
        module="rgpd",
        action="rights_request_updated",
        actor=actor,
        entity_type="rights_request",
        entity_id=str(row.id),
        entity_label=f"{row.reference} — {row.request_type}",
        before=before,
        after={"status": row.status},
        request=request,
    )
    db.commit()
    db.refresh(row)
    return RightsRequestRead.model_validate(row)


# --- Violations de données ----------------------------------------------------


def list_breaches(
    db: Session, *, q: str | None = None, status: str | None = None, severity: str | None = None
) -> list[DataBreachRead]:
    statement = select(DataBreach)
    if status:
        statement = statement.where(DataBreach.status == status)
    if severity:
        statement = statement.where(DataBreach.severity == severity)
    if q:
        pattern = f"%{q.strip()}%"
        statement = statement.where(
            or_(DataBreach.reference.ilike(pattern), DataBreach.description.ilike(pattern))
        )
    rows = db.scalars(statement.order_by(DataBreach.discovered_at.desc().nullslast())).all()
    return [DataBreachRead.model_validate(row) for row in rows]


def create_breach(
    db: Session,
    payload: DataBreachCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> DataBreachRead:
    row = DataBreach(
        **payload.model_dump(),
        reference=next_reference(db, key="data_breach", prefix="VIO"),
    )
    db.add(row)
    db.flush()
    write_audit(
        db,
        module="rgpd",
        action="breach_created",
        actor=actor,
        entity_type="data_breach",
        entity_id=str(row.id),
        entity_label=f"{row.reference} — {row.severity}",
        after={"status": row.status},
        request=request,
    )
    db.commit()
    db.refresh(row)
    return DataBreachRead.model_validate(row)


def update_breach(
    db: Session,
    row: DataBreach,
    payload: DataBreachUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> DataBreachRead:
    data = payload.model_dump(exclude_unset=True)
    before = {"status": row.status, "severity": row.severity}
    for field, value in data.items():
        setattr(row, field, value)
    write_audit(
        db,
        module="rgpd",
        action="breach_updated",
        actor=actor,
        entity_type="data_breach",
        entity_id=str(row.id),
        entity_label=f"{row.reference} — {row.severity}",
        before=before,
        after={"status": row.status, "severity": row.severity},
        request=request,
    )
    db.commit()
    db.refresh(row)
    return DataBreachRead.model_validate(row)


def overview(db: Session) -> RgpdOverview:
    today = date.today()
    horizon = today + timedelta(days=30)
    processing_total = db.scalar(select(func.count()).select_from(ProcessingActivity)) or 0
    processing_active = (
        db.scalar(
            select(func.count())
            .select_from(ProcessingActivity)
            .where(ProcessingActivity.status == "active")
        )
        or 0
    )
    collections_total = (
        db.scalar(
            select(func.count())
            .select_from(DataCollection)
            .where(DataCollection.status == "active")
        )
        or 0
    )
    open_requests = (
        db.scalar(
            select(func.count())
            .select_from(DpoRequest)
            .where(DpoRequest.status.in_(("new", "in_progress")))
        )
        or 0
    )
    open_rights = (
        db.scalar(
            select(func.count())
            .select_from(RightsRequest)
            .where(RightsRequest.status.in_(("new", "in_progress")))
        )
        or 0
    )
    open_breaches = (
        db.scalar(
            select(func.count()).select_from(DataBreach).where(DataBreach.status == "open")
        )
        or 0
    )
    reviews_due = (
        db.scalar(
            select(func.count())
            .select_from(ProcessingActivity)
            .where(
                ProcessingActivity.status == "active",
                ProcessingActivity.next_review_at.is_not(None),
                ProcessingActivity.next_review_at <= horizon,
            )
        )
        or 0
    )

    deadlines: list[RgpdDeadline] = []
    for activity in db.scalars(
        select(ProcessingActivity).where(
            ProcessingActivity.status == "active",
            ProcessingActivity.next_review_at.is_not(None),
            ProcessingActivity.next_review_at <= horizon,
        )
    ).all():
        deadlines.append(
            RgpdDeadline(
                id=activity.id,
                kind="review",
                label=f"Revue du traitement {activity.reference} — {activity.name}",
                due_date=activity.next_review_at,
                status=activity.status,
                link="/rgpd?tab=traitements",
            )
        )
    for request_row in db.scalars(
        select(DpoRequest).where(
            DpoRequest.status.in_(("new", "in_progress")), DpoRequest.due_date.is_not(None)
        )
    ).all():
        deadlines.append(
            RgpdDeadline(
                id=request_row.id,
                kind="dpo_request",
                label=f"Demande DPO {request_row.reference} — {request_row.subject}",
                due_date=request_row.due_date,
                status=request_row.status,
                link="/rgpd?tab=demandes",
            )
        )
    for rights_row in db.scalars(
        select(RightsRequest).where(
            RightsRequest.status.in_(("new", "in_progress")), RightsRequest.due_date.is_not(None)
        )
    ).all():
        deadlines.append(
            RgpdDeadline(
                id=rights_row.id,
                kind="rights",
                label=f"Droit {rights_row.reference} — {rights_row.request_type}",
                due_date=rights_row.due_date,
                status=rights_row.status,
                link="/rgpd?tab=droits",
            )
        )
    deadlines.sort(key=lambda item: item.due_date or date.max)
    return RgpdOverview(
        processing_total=processing_total,
        processing_active=processing_active,
        collections_total=collections_total,
        open_requests=open_requests,
        open_rights=open_rights,
        open_breaches=open_breaches,
        reviews_due=reviews_due,
        deadlines=deadlines[:12],
    )
