from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.db.session import get_db
from app.models.auth import User
from app.schemas.reservations import (
    EquipmentReservationCreate,
    EquipmentReservationRead,
    EquipmentReservationUpdate,
    ReservableEquipmentCreate,
    ReservableEquipmentRead,
    ReservableEquipmentUpdate,
)
from app.services import reservations_service

router = APIRouter(prefix="/reservations", tags=["Réservations"])


@router.get("/equipments", response_model=list[ReservableEquipmentRead])
def list_equipments(
    include_inactive: bool = False,
    _: User = Depends(require_permission("reservations.read")),
    db: Session = Depends(get_db),
):
    return reservations_service.list_equipments(db, include_inactive=include_inactive)


@router.post("/equipments", response_model=ReservableEquipmentRead, status_code=201)
def create_equipment(
    payload: ReservableEquipmentCreate,
    request: Request,
    actor: User = Depends(require_permission("reservations.manage")),
    db: Session = Depends(get_db),
):
    return reservations_service.create_equipment(
        db, payload, actor=actor, request=request
    )


@router.patch("/equipments/{equipment_id}", response_model=ReservableEquipmentRead)
def update_equipment(
    equipment_id: UUID,
    payload: ReservableEquipmentUpdate,
    request: Request,
    actor: User = Depends(require_permission("reservations.manage")),
    db: Session = Depends(get_db),
):
    row = reservations_service.get_equipment(db, equipment_id)
    return reservations_service.update_equipment(
        db, row, payload, actor=actor, request=request
    )


@router.delete("/equipments/{equipment_id}", response_model=ReservableEquipmentRead)
def archive_equipment(
    equipment_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("reservations.manage")),
    db: Session = Depends(get_db),
):
    row = reservations_service.get_equipment(db, equipment_id)
    return reservations_service.archive_equipment(
        db, row, actor=actor, request=request
    )


@router.get("", response_model=list[EquipmentReservationRead])
def list_reservations(
    start: datetime | None = None,
    end: datetime | None = None,
    equipment_id: UUID | None = None,
    include_cancelled: bool = False,
    _: User = Depends(require_permission("reservations.read")),
    db: Session = Depends(get_db),
):
    return reservations_service.list_reservations(
        db,
        start=start,
        end=end,
        equipment_id=equipment_id,
        include_cancelled=include_cancelled,
    )


@router.post("", response_model=EquipmentReservationRead, status_code=201)
def create_reservation(
    payload: EquipmentReservationCreate,
    request: Request,
    actor: User = Depends(require_permission("reservations.create")),
    db: Session = Depends(get_db),
):
    return reservations_service.create_reservation(
        db, payload, actor=actor, request=request
    )


@router.get("/{reservation_id}", response_model=EquipmentReservationRead)
def get_reservation(
    reservation_id: UUID,
    _: User = Depends(require_permission("reservations.read")),
    db: Session = Depends(get_db),
):
    row = reservations_service.get_reservation(db, reservation_id)
    return reservations_service.reservation_read(row)


@router.patch("/{reservation_id}", response_model=EquipmentReservationRead)
def update_reservation(
    reservation_id: UUID,
    payload: EquipmentReservationUpdate,
    request: Request,
    actor: User = Depends(require_permission("reservations.update")),
    db: Session = Depends(get_db),
):
    row = reservations_service.get_reservation(db, reservation_id)
    return reservations_service.update_reservation(
        db, row, payload, actor=actor, request=request
    )


@router.delete("/{reservation_id}", response_model=EquipmentReservationRead)
def cancel_reservation(
    reservation_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("reservations.update")),
    db: Session = Depends(get_db),
):
    row = reservations_service.get_reservation(db, reservation_id)
    return reservations_service.cancel_reservation(
        db, row, actor=actor, request=request
    )
