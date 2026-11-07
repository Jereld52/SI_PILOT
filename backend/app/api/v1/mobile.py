from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.core.pagination import PageParams, page_params, paginate_items
from app.db.session import get_db
from app.models.auth import User
from app.models.mobile import MobileLine
from app.schemas.common import Page
from app.schemas.mobile import MobileLineCreate, MobileLineRead, MobileLineUpdate
from app.services import mobile_service

router = APIRouter(prefix="/mobile-lines", tags=["Téléphonie mobile"])


@router.get("/meta")
def mobile_meta(
    _: User = Depends(require_permission("mobile_lines.read")),
    db: Session = Depends(get_db),
):
    statuses = sorted(
        {line.status for line in db.scalars(select(MobileLine)).all() if line.status}
    )
    plans = sorted(
        {line.plan_name for line in db.scalars(select(MobileLine)).all() if line.plan_name}
    )
    return {"statuses": statuses, "plans": plans}


@router.get("", response_model=Page[MobileLineRead])
def list_mobile_lines(
    q: str | None = Query(None, max_length=120),
    status: str | None = Query(None, max_length=30),
    plan: str | None = Query(None, max_length=180),
    secondary: bool | None = None,
    params: PageParams = Depends(page_params),
    _: User = Depends(require_permission("mobile_lines.read")),
    db: Session = Depends(get_db),
) -> dict:
    items = mobile_service.list_mobile_lines(
        db, q=q, status=status, plan=plan, secondary=secondary
    )
    return paginate_items(items, params)


@router.post("", response_model=MobileLineRead, status_code=201)
def create_mobile_line(
    payload: MobileLineCreate,
    request: Request,
    actor: User = Depends(require_permission("mobile_lines.create")),
    db: Session = Depends(get_db),
):
    return mobile_service.create_mobile_line(db, payload, actor=actor, request=request)


@router.get("/{line_id}", response_model=MobileLineRead)
def get_mobile_line(
    line_id: UUID,
    _: User = Depends(require_permission("mobile_lines.read")),
    db: Session = Depends(get_db),
):
    return mobile_service.get_mobile_line(db, line_id)


@router.patch("/{line_id}", response_model=MobileLineRead)
def update_mobile_line(
    line_id: UUID,
    payload: MobileLineUpdate,
    request: Request,
    actor: User = Depends(require_permission("mobile_lines.update")),
    db: Session = Depends(get_db),
):
    line = mobile_service.get_mobile_line(db, line_id)
    return mobile_service.update_mobile_line(db, line, payload, actor=actor, request=request)
