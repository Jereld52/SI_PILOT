from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.db.session import get_db
from app.models.auth import User
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
    RgpdOverview,
    RightsRequestCreate,
    RightsRequestRead,
    RightsRequestUpdate,
)
from app.services import rgpd_service

router = APIRouter(prefix="/rgpd", tags=["RGPD"])


@router.get("/overview", response_model=RgpdOverview)
def overview(
    _: User = Depends(require_permission("rgpd.read")),
    db: Session = Depends(get_db),
):
    return rgpd_service.overview(db)


# --- Traitements -------------------------------------------------------------


@router.get("/processing-activities", response_model=list[ProcessingActivityRead])
def list_processing_activities(
    q: str | None = Query(None, max_length=120),
    status: str | None = Query(None, max_length=20),
    _: User = Depends(require_permission("rgpd.read")),
    db: Session = Depends(get_db),
):
    return rgpd_service.list_processing_activities(db, q=q, status=status)


@router.post("/processing-activities", response_model=ProcessingActivityRead, status_code=201)
def create_processing_activity(
    payload: ProcessingActivityCreate,
    request: Request,
    actor: User = Depends(require_permission("rgpd.create")),
    db: Session = Depends(get_db),
):
    return rgpd_service.create_processing_activity(
        db, payload, actor=actor, request=request
    )


@router.patch("/processing-activities/{activity_id}", response_model=ProcessingActivityRead)
def update_processing_activity(
    activity_id: UUID,
    payload: ProcessingActivityUpdate,
    request: Request,
    actor: User = Depends(require_permission("rgpd.update")),
    db: Session = Depends(get_db),
):
    activity = rgpd_service.get_processing_activity(db, activity_id)
    return rgpd_service.update_processing_activity(
        db, activity, payload, actor=actor, request=request
    )


@router.delete("/processing-activities/{activity_id}", response_model=ProcessingActivityRead)
def archive_processing_activity(
    activity_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("rgpd.delete")),
    db: Session = Depends(get_db),
):
    activity = rgpd_service.get_processing_activity(db, activity_id)
    return rgpd_service.archive_processing_activity(
        db, activity, actor=actor, request=request
    )


# --- Collectes ---------------------------------------------------------------


@router.get("/collections", response_model=list[DataCollectionRead])
def list_collections(
    q: str | None = Query(None, max_length=120),
    status: str | None = Query(None, max_length=20),
    processing_activity_id: UUID | None = None,
    _: User = Depends(require_permission("rgpd.read")),
    db: Session = Depends(get_db),
):
    return rgpd_service.list_collections(
        db, q=q, status=status, processing_activity_id=processing_activity_id
    )


@router.post("/collections", response_model=DataCollectionRead, status_code=201)
def create_collection(
    payload: DataCollectionCreate,
    request: Request,
    actor: User = Depends(require_permission("rgpd.create")),
    db: Session = Depends(get_db),
):
    return rgpd_service.create_collection(db, payload, actor=actor, request=request)


@router.patch("/collections/{collection_id}", response_model=DataCollectionRead)
def update_collection(
    collection_id: UUID,
    payload: DataCollectionUpdate,
    request: Request,
    actor: User = Depends(require_permission("rgpd.update")),
    db: Session = Depends(get_db),
):
    row = rgpd_service.get_collection(db, collection_id)
    return rgpd_service.update_collection(db, row, payload, actor=actor, request=request)


@router.delete("/collections/{collection_id}", response_model=DataCollectionRead)
def archive_collection(
    collection_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("rgpd.delete")),
    db: Session = Depends(get_db),
):
    row = rgpd_service.get_collection(db, collection_id)
    return rgpd_service.archive_collection(db, row, actor=actor, request=request)


# --- Demandes DPO ------------------------------------------------------------


@router.get("/requests", response_model=list[DpoRequestRead])
def list_dpo_requests(
    q: str | None = Query(None, max_length=120),
    status: str | None = Query(None, max_length=20),
    _: User = Depends(require_permission("rgpd.read")),
    db: Session = Depends(get_db),
):
    return rgpd_service.list_dpo_requests(db, q=q, status=status)


@router.post("/requests", response_model=DpoRequestRead, status_code=201)
def create_dpo_request(
    payload: DpoRequestCreate,
    request: Request,
    actor: User = Depends(require_permission("rgpd.create")),
    db: Session = Depends(get_db),
):
    return rgpd_service.create_dpo_request(db, payload, actor=actor, request=request)


@router.patch("/requests/{request_id}", response_model=DpoRequestRead)
def update_dpo_request(
    request_id: UUID,
    payload: DpoRequestUpdate,
    request: Request,
    actor: User = Depends(require_permission("rgpd.requests")),
    db: Session = Depends(get_db),
):
    row = rgpd_service.get_dpo_request(db, request_id)
    return rgpd_service.update_dpo_request(db, row, payload, actor=actor, request=request)


# --- Droits des personnes ----------------------------------------------------


@router.get("/rights-requests", response_model=list[RightsRequestRead])
def list_rights_requests(
    q: str | None = Query(None, max_length=120),
    status: str | None = Query(None, max_length=20),
    request_type: str | None = Query(None, max_length=30),
    _: User = Depends(require_permission("rgpd.read")),
    db: Session = Depends(get_db),
):
    return rgpd_service.list_rights_requests(
        db, q=q, status=status, request_type=request_type
    )


@router.post("/rights-requests", response_model=RightsRequestRead, status_code=201)
def create_rights_request(
    payload: RightsRequestCreate,
    request: Request,
    actor: User = Depends(require_permission("rgpd.create")),
    db: Session = Depends(get_db),
):
    return rgpd_service.create_rights_request(db, payload, actor=actor, request=request)


@router.patch("/rights-requests/{rights_id}", response_model=RightsRequestRead)
def update_rights_request(
    rights_id: UUID,
    payload: RightsRequestUpdate,
    request: Request,
    actor: User = Depends(require_permission("rgpd.requests")),
    db: Session = Depends(get_db),
):
    row = rgpd_service.get_rights_request(db, rights_id)
    return rgpd_service.update_rights_request(
        db, row, payload, actor=actor, request=request
    )


# --- Violations --------------------------------------------------------------


@router.get("/breaches", response_model=list[DataBreachRead])
def list_breaches(
    q: str | None = Query(None, max_length=120),
    status: str | None = Query(None, max_length=20),
    severity: str | None = Query(None, max_length=20),
    _: User = Depends(require_permission("rgpd.read")),
    db: Session = Depends(get_db),
):
    return rgpd_service.list_breaches(db, q=q, status=status, severity=severity)


@router.post("/breaches", response_model=DataBreachRead, status_code=201)
def create_breach(
    payload: DataBreachCreate,
    request: Request,
    actor: User = Depends(require_permission("rgpd.create")),
    db: Session = Depends(get_db),
):
    return rgpd_service.create_breach(db, payload, actor=actor, request=request)


@router.patch("/breaches/{breach_id}", response_model=DataBreachRead)
def update_breach(
    breach_id: UUID,
    payload: DataBreachUpdate,
    request: Request,
    actor: User = Depends(require_permission("rgpd.requests")),
    db: Session = Depends(get_db),
):
    row = rgpd_service.get_breach(db, breach_id)
    return rgpd_service.update_breach(db, row, payload, actor=actor, request=request)
