from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.api.deps import require_any_permission, require_permission
from app.db.session import get_db
from app.models.auth import User
from app.schemas.suppliers import SupplierCreate, SupplierRead, SupplierUpdate
from app.services import suppliers_service

router = APIRouter(prefix="/suppliers", tags=["Fournisseurs"])

READ_PERMISSIONS = ("suppliers.read", "assets.read", "licenses.read")


@router.get("", response_model=list[SupplierRead])
def list_suppliers(
    q: str | None = Query(None, max_length=120),
    include_inactive: bool = False,
    _: User = Depends(require_any_permission(*READ_PERMISSIONS)),
    db: Session = Depends(get_db),
):
    return suppliers_service.list_suppliers(db, q=q, include_inactive=include_inactive)


@router.get("/{supplier_id}", response_model=SupplierRead)
def get_supplier(
    supplier_id: UUID,
    _: User = Depends(require_any_permission(*READ_PERMISSIONS)),
    db: Session = Depends(get_db),
):
    return suppliers_service.get_supplier_read(db, supplier_id)


@router.post("", response_model=SupplierRead, status_code=201)
def create_supplier(
    payload: SupplierCreate,
    request: Request,
    actor: User = Depends(require_permission("suppliers.manage")),
    db: Session = Depends(get_db),
):
    return suppliers_service.create_supplier(db, payload, actor=actor, request=request)


@router.patch("/{supplier_id}", response_model=SupplierRead)
def update_supplier(
    supplier_id: UUID,
    payload: SupplierUpdate,
    request: Request,
    actor: User = Depends(require_permission("suppliers.manage")),
    db: Session = Depends(get_db),
):
    supplier = suppliers_service.get_supplier(db, supplier_id)
    return suppliers_service.update_supplier(
        db, supplier, payload, actor=actor, request=request
    )
