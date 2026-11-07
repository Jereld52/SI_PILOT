from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.db.session import get_db
from app.models.auth import User
from app.schemas.contracts import (
    ContractCategoryRead,
    ContractCreate,
    ContractRead,
    ContractUpdate,
)
from app.services import contracts_service

router = APIRouter(prefix="/contracts", tags=["Contrats"])


@router.get("/meta", response_model=list[ContractCategoryRead])
def contract_categories(
    _: User = Depends(require_permission("contracts.read")),
    db: Session = Depends(get_db),
):
    return contracts_service.list_categories(db)


@router.get("", response_model=list[ContractRead])
def list_contracts(
    q: str | None = Query(None, max_length=120),
    status: str | None = Query(None, max_length=30),
    category_id: UUID | None = None,
    supplier_id: UUID | None = None,
    expiring: int | None = Query(None, ge=0, le=730),
    _: User = Depends(require_permission("contracts.read")),
    db: Session = Depends(get_db),
):
    return contracts_service.list_contracts(
        db,
        q=q,
        status=status,
        category_id=category_id,
        supplier_id=supplier_id,
        expiring_days=expiring,
    )


@router.post("", response_model=ContractRead, status_code=201)
def create_contract(
    payload: ContractCreate,
    request: Request,
    actor: User = Depends(require_permission("contracts.create")),
    db: Session = Depends(get_db),
):
    return contracts_service.create_contract(db, payload, actor=actor, request=request)


@router.get("/{contract_id}", response_model=ContractRead)
def get_contract(
    contract_id: UUID,
    _: User = Depends(require_permission("contracts.read")),
    db: Session = Depends(get_db),
):
    return contracts_service.get_contract_read(db, contract_id)


@router.patch("/{contract_id}", response_model=ContractRead)
def update_contract(
    contract_id: UUID,
    payload: ContractUpdate,
    request: Request,
    actor: User = Depends(require_permission("contracts.update")),
    db: Session = Depends(get_db),
):
    contract = contracts_service.get_contract(db, contract_id)
    return contracts_service.update_contract(
        db, contract, payload, actor=actor, request=request
    )


@router.delete("/{contract_id}", response_model=ContractRead)
def terminate_contract(
    contract_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("contracts.delete")),
    db: Session = Depends(get_db),
):
    contract = contracts_service.get_contract(db, contract_id)
    return contracts_service.terminate_contract(db, contract, actor=actor, request=request)
