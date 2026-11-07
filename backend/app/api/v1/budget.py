from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.db.session import get_db
from app.models.auth import User
from app.schemas.budget import (
    BudgetCategoryRead,
    BudgetCommitmentCreate,
    BudgetCommitmentUpdate,
    BudgetCreate,
    BudgetDetailRead,
    BudgetInvoiceCreate,
    BudgetInvoiceUpdate,
    BudgetLineCreate,
    BudgetLineUpdate,
    BudgetRead,
    BudgetUpdate,
)
from app.services import budget_service

router = APIRouter(tags=["Budget"])


@router.get("/budget-categories", response_model=list[BudgetCategoryRead])
def budget_categories(
    _: User = Depends(require_permission("budget.read")),
    db: Session = Depends(get_db),
):
    return budget_service.list_categories(db)


@router.get("/budgets", response_model=list[BudgetRead])
def list_budgets(
    _: User = Depends(require_permission("budget.read")),
    db: Session = Depends(get_db),
):
    return budget_service.list_budgets(db)


@router.post("/budgets", response_model=BudgetRead, status_code=201)
def create_budget(
    payload: BudgetCreate,
    request: Request,
    actor: User = Depends(require_permission("budget.create")),
    db: Session = Depends(get_db),
):
    return budget_service.create_budget(db, payload, actor=actor, request=request)


@router.get("/budgets/{budget_id}", response_model=BudgetDetailRead)
def get_budget(
    budget_id: UUID,
    _: User = Depends(require_permission("budget.read")),
    db: Session = Depends(get_db),
):
    return budget_service.get_budget_detail(db, budget_id)


@router.patch("/budgets/{budget_id}", response_model=BudgetRead)
def update_budget(
    budget_id: UUID,
    payload: BudgetUpdate,
    request: Request,
    actor: User = Depends(require_permission("budget.update")),
    db: Session = Depends(get_db),
):
    budget = budget_service.get_budget(db, budget_id)
    return budget_service.update_budget(db, budget, payload, actor=actor, request=request)


@router.post("/budgets/{budget_id}/validate", response_model=BudgetRead)
def validate_budget(
    budget_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("budget.validate")),
    db: Session = Depends(get_db),
):
    budget = budget_service.get_budget(db, budget_id)
    return budget_service.validate_budget(db, budget, actor=actor, request=request)


@router.post("/budgets/{budget_id}/lines", response_model=BudgetDetailRead, status_code=201)
def create_line(
    budget_id: UUID,
    payload: BudgetLineCreate,
    request: Request,
    actor: User = Depends(require_permission("budget.update")),
    db: Session = Depends(get_db),
):
    budget = budget_service.get_budget(db, budget_id)
    return budget_service.create_line(db, budget, payload, actor=actor, request=request)


@router.patch("/budget-lines/{line_id}", response_model=BudgetDetailRead)
def update_line(
    line_id: UUID,
    payload: BudgetLineUpdate,
    request: Request,
    actor: User = Depends(require_permission("budget.update")),
    db: Session = Depends(get_db),
):
    line = budget_service.get_line(db, line_id)
    return budget_service.update_line(db, line, payload, actor=actor, request=request)


@router.delete("/budget-lines/{line_id}", response_model=BudgetDetailRead)
def delete_line(
    line_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("budget.update")),
    db: Session = Depends(get_db),
):
    line = budget_service.get_line(db, line_id)
    return budget_service.delete_line(db, line, actor=actor, request=request)


@router.post(
    "/budgets/{budget_id}/commitments",
    response_model=BudgetDetailRead,
    status_code=201,
)
def create_commitment(
    budget_id: UUID,
    payload: BudgetCommitmentCreate,
    request: Request,
    actor: User = Depends(require_permission("budget.update")),
    db: Session = Depends(get_db),
):
    budget = budget_service.get_budget(db, budget_id)
    return budget_service.create_commitment(db, budget, payload, actor=actor, request=request)


@router.patch("/budget-commitments/{commitment_id}", response_model=BudgetDetailRead)
def update_commitment(
    commitment_id: UUID,
    payload: BudgetCommitmentUpdate,
    request: Request,
    actor: User = Depends(require_permission("budget.update")),
    db: Session = Depends(get_db),
):
    commitment = budget_service.get_commitment(db, commitment_id)
    return budget_service.update_commitment(
        db, commitment, payload, actor=actor, request=request
    )


@router.delete("/budget-commitments/{commitment_id}", response_model=BudgetDetailRead)
def delete_commitment(
    commitment_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("budget.update")),
    db: Session = Depends(get_db),
):
    commitment = budget_service.get_commitment(db, commitment_id)
    return budget_service.delete_commitment(db, commitment, actor=actor, request=request)


@router.post(
    "/budgets/{budget_id}/invoices",
    response_model=BudgetDetailRead,
    status_code=201,
)
def create_invoice(
    budget_id: UUID,
    payload: BudgetInvoiceCreate,
    request: Request,
    actor: User = Depends(require_permission("budget.update")),
    db: Session = Depends(get_db),
):
    budget = budget_service.get_budget(db, budget_id)
    return budget_service.create_invoice(db, budget, payload, actor=actor, request=request)


@router.patch("/budget-invoices/{invoice_id}", response_model=BudgetDetailRead)
def update_invoice(
    invoice_id: UUID,
    payload: BudgetInvoiceUpdate,
    request: Request,
    actor: User = Depends(require_permission("budget.update")),
    db: Session = Depends(get_db),
):
    invoice = budget_service.get_invoice(db, invoice_id)
    return budget_service.update_invoice(db, invoice, payload, actor=actor, request=request)


@router.delete("/budget-invoices/{invoice_id}", response_model=BudgetDetailRead)
def delete_invoice(
    invoice_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("budget.update")),
    db: Session = Depends(get_db),
):
    invoice = budget_service.get_invoice(db, invoice_id)
    return budget_service.delete_invoice(db, invoice, actor=actor, request=request)
