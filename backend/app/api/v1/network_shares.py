from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.db.session import get_db
from app.models.auth import User
from app.schemas.network import (
    NetworkShareCreate,
    NetworkShareOverview,
    NetworkShareRead,
    NetworkShareUpdate,
)
from app.services import network_shares_service

router = APIRouter(prefix="/network-shares", tags=["Partages réseau"])


@router.get("", response_model=list[NetworkShareRead])
def list_shares(
    include_inactive: bool = False,
    _: User = Depends(require_permission("infrastructure.read")),
    db: Session = Depends(get_db),
) -> list[NetworkShareRead]:
    return network_shares_service.list_shares(db, include_inactive=include_inactive)


@router.get("/overview", response_model=NetworkShareOverview)
def overview(
    _: User = Depends(require_permission("infrastructure.read")),
    db: Session = Depends(get_db),
) -> NetworkShareOverview:
    return network_shares_service.overview(db)


@router.post("/check-all", response_model=list[NetworkShareRead])
def check_all(
    request: Request,
    actor: User = Depends(require_permission("infrastructure.update")),
    db: Session = Depends(get_db),
) -> list[NetworkShareRead]:
    return network_shares_service.check_all(db, actor=actor, request=request)


@router.post("", response_model=NetworkShareRead, status_code=201)
def create_share(
    payload: NetworkShareCreate,
    request: Request,
    actor: User = Depends(require_permission("infrastructure.update")),
    db: Session = Depends(get_db),
) -> NetworkShareRead:
    return network_shares_service.create_share(
        db, payload, actor=actor, request=request
    )


@router.patch("/{share_id}", response_model=NetworkShareRead)
def update_share(
    share_id: UUID,
    payload: NetworkShareUpdate,
    request: Request,
    actor: User = Depends(require_permission("infrastructure.update")),
    db: Session = Depends(get_db),
) -> NetworkShareRead:
    row = network_shares_service.get_share(db, share_id)
    return network_shares_service.update_share(
        db, row, payload, actor=actor, request=request
    )


@router.delete("/{share_id}", response_model=NetworkShareRead)
def archive_share(
    share_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("infrastructure.update")),
    db: Session = Depends(get_db),
) -> NetworkShareRead:
    row = network_shares_service.get_share(db, share_id)
    return network_shares_service.archive_share(
        db, row, actor=actor, request=request
    )


@router.post("/{share_id}/check", response_model=NetworkShareRead)
def check_share(
    share_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("infrastructure.update")),
    db: Session = Depends(get_db),
) -> NetworkShareRead:
    row = network_shares_service.get_share(db, share_id)
    return network_shares_service.check_share(db, row, actor=actor, request=request)
