from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.core.pagination import PageParams, page_params, paginate_items
from app.db.session import get_db
from app.models.auth import User
from app.schemas.common import Page
from app.schemas.interventions import (
    InterventionCreate,
    InterventionRead,
    InterventionUpdate,
)
from app.services import interventions_service

router = APIRouter(prefix="/interventions", tags=["Interventions"])


@router.get("", response_model=Page[InterventionRead])
def list_interventions(
    q: str | None = Query(None, max_length=120),
    status: str | None = Query(None, max_length=30),
    ticket_id: UUID | None = None,
    asset_id: UUID | None = None,
    params: PageParams = Depends(page_params),
    _: User = Depends(require_permission("interventions.read")),
    db: Session = Depends(get_db),
) -> dict:
    items = interventions_service.list_interventions(
        db, q=q, status=status, ticket_id=ticket_id, asset_id=asset_id
    )
    return paginate_items(items, params)


@router.post("", response_model=InterventionRead, status_code=201)
def create_intervention(
    payload: InterventionCreate,
    request: Request,
    actor: User = Depends(require_permission("interventions.create")),
    db: Session = Depends(get_db),
):
    return interventions_service.create_intervention(
        db, payload, actor=actor, request=request
    )


@router.get("/{intervention_id}", response_model=InterventionRead)
def get_intervention(
    intervention_id: UUID,
    _: User = Depends(require_permission("interventions.read")),
    db: Session = Depends(get_db),
):
    return interventions_service.get_intervention_read(db, intervention_id)


@router.patch("/{intervention_id}", response_model=InterventionRead)
def update_intervention(
    intervention_id: UUID,
    payload: InterventionUpdate,
    request: Request,
    actor: User = Depends(require_permission("interventions.update")),
    db: Session = Depends(get_db),
):
    intervention = interventions_service.get_intervention(db, intervention_id)
    return interventions_service.update_intervention(
        db, intervention, payload, actor=actor, request=request
    )
