from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.core.errors import PermissionDeniedError, ValidationAppError
from app.core.permissions import has_permission
from app.db.session import get_db
from app.models.assets import Supplier
from app.models.auth import User
from app.models.commercial import CommercialDocument
from app.models.tickets import TicketCategory, TicketPriority
from app.schemas.ai import (
    AiActionExecuteResponse,
    AiActionProposal,
    AiChatRequest,
    AiChatResponse,
    AiComposeRequest,
    AiComposeResponse,
    AiConfigRead,
    AiConfigUpdate,
    AiModelsResponse,
    AiRunRead,
    AiStatusRead,
    AiTestResponse,
    AiToolInfo,
)
from app.schemas.calendar import ActionItemCreate
from app.schemas.commercial import CommercialDocumentCreate
from app.schemas.communication import CommunicationCreate, MeetingCreate
from app.schemas.suppliers import SupplierCreate
from app.schemas.tickets import TicketCreate
from app.services import (
    ai_service,
    ai_tools_service,
    calendar_service,
    commercial_service,
    communication_service,
    suppliers_service,
    tickets_service,
)

router = APIRouter(prefix="/ai", tags=["Assistant IA"])
admin_router = APIRouter(prefix="/admin/ai", tags=["Administration assistant IA"])


@router.get("/status", response_model=AiStatusRead)
def get_status(
    _: User = Depends(require_permission("ai.use")),
    db: Session = Depends(get_db),
) -> AiStatusRead:
    return ai_service.get_status(db)


@router.get("/tools", response_model=list[AiToolInfo])
def list_tools(
    actor: User = Depends(require_permission("ai.use")),
) -> list[dict[str, str]]:
    return ai_tools_service.list_tools(actor)


@router.get("/runs", response_model=list[AiRunRead])
def list_runs(
    limit: int = 20,
    actor: User = Depends(require_permission("ai.use")),
    db: Session = Depends(get_db),
) -> list[AiRunRead]:
    return ai_service.list_runs(db, actor=actor, limit=limit)


@router.post("/chat", response_model=AiChatResponse)
def chat(
    payload: AiChatRequest,
    request: Request,
    actor: User = Depends(require_permission("ai.use")),
    db: Session = Depends(get_db),
) -> AiChatResponse:
    return ai_service.chat(
        db,
        payload.messages,
        actor=actor,
        include_context=payload.include_context,
        context=payload.context,
        request=request,
    )


@router.post("/compose", response_model=AiComposeResponse)
def compose(
    payload: AiComposeRequest,
    request: Request,
    actor: User = Depends(require_permission("ai.use")),
    db: Session = Depends(get_db),
) -> AiComposeResponse:
    return ai_service.compose_text(db, payload, actor=actor, request=request)


def _ticket_category(db: Session, code: str | None):
    category = None
    if code:
        category = db.scalar(
            select(TicketCategory).where(
                TicketCategory.code == code,
                TicketCategory.is_active.is_(True),
            )
        )
    if category is None:
        category = db.scalar(
            select(TicketCategory)
            .where(TicketCategory.is_active.is_(True))
            .order_by(TicketCategory.sort_order)
        )
    if category is None:
        raise ValidationAppError("Aucune catégorie de demande active n'est configurée.")
    return category


def _ticket_priority(db: Session, code: str):
    priority = db.scalar(
        select(TicketPriority).where(
            TicketPriority.code == code,
            TicketPriority.is_active.is_(True),
        )
    )
    if priority is None:
        priority = db.scalar(
            select(TicketPriority)
            .where(TicketPriority.is_active.is_(True))
            .order_by(TicketPriority.level.desc())
        )
    if priority is None:
        raise ValidationAppError("Aucune priorité de demande active n'est configurée.")
    return priority


def _commercial_supplier_id(
    db: Session, name: str | None, actor: User, request: Request
):
    cleaned = (name or "").strip()
    if not cleaned:
        raise ValidationAppError("Renseignez le fournisseur du document.")
    existing = db.scalar(select(Supplier).where(Supplier.name.ilike(cleaned)))
    if existing is not None:
        return existing.id
    if not has_permission(actor, "suppliers.manage"):
        raise PermissionDeniedError(
            "Le fournisseur est inconnu et vous n'avez pas la permission de le créer."
        )
    supplier = suppliers_service.create_supplier(
        db,
        SupplierCreate(name=cleaned, type="Fournisseur"),
        actor=actor,
        request=request,
    )
    return supplier.id


@router.post("/actions/execute", response_model=AiActionExecuteResponse)
def execute_action(
    payload: AiActionProposal,
    request: Request,
    actor: User = Depends(require_permission("ai.use")),
    db: Session = Depends(get_db),
) -> AiActionExecuteResponse:
    if payload.type == "create_ticket":
        if not has_permission(actor, "tickets.create"):
            raise PermissionDeniedError("Vous ne pouvez pas créer de demande IT.")
        category = _ticket_category(db, payload.category)
        priority = _ticket_priority(db, payload.priority)
        ticket = tickets_service.create_ticket(
            db,
            TicketCreate(
                subject=payload.title,
                description=payload.description,
                category_id=category.id,
                priority_id=priority.id,
                source="manual",
            ),
            actor=actor,
            request=request,
        )
        return AiActionExecuteResponse(
            message=f"Demande {ticket.reference} créée : {ticket.subject}",
            link=f"/demandes?ticket={ticket.id}",
        )
    if payload.type == "create_meeting":
        if not has_permission(actor, "meetings.manage"):
            raise PermissionDeniedError("Vous ne pouvez pas créer de réunion.")
        if payload.scheduled_at is None:
            raise ValidationAppError("La date de la réunion est manquante.")
        meeting = communication_service.create_meeting(
            db,
            MeetingCreate(
                title=payload.title,
                scheduled_at=payload.scheduled_at,
                duration_minutes=payload.duration_minutes or 60,
                location=payload.location,
                agenda=payload.description,
                status="planned",
            ),
            actor=actor,
            request=request,
        )
        return AiActionExecuteResponse(
            message=f"Réunion créée : {meeting.title}",
            link=f"/communication/reunions?meeting={meeting.id}",
        )
    if payload.type == "create_communication":
        if not has_permission(actor, "communications.manage"):
            raise PermissionDeniedError("Vous ne pouvez pas créer de communication.")
        communication = communication_service.create_communication(
            db,
            CommunicationCreate(
                title=payload.title,
                body=payload.description or payload.title,
                category="information",
                audience="all",
                channel="in_app",
                status="draft",
                author_user_id=actor.id,
            ),
            actor=actor,
            request=request,
        )
        return AiActionExecuteResponse(
            message=f"Brouillon de communication créé : {communication.title}",
            link="/communication/communications",
        )

    if payload.type == "create_quote":
        if not has_permission(actor, "suppliers.manage"):
            raise PermissionDeniedError("Vous ne pouvez pas créer de devis.")
        supplier_id = _commercial_supplier_id(
            db, payload.supplier_name, actor, request
        )
        quote = commercial_service.create_document(
            db,
            CommercialDocumentCreate(
                kind="quote",
                supplier_id=supplier_id,
                reference=payload.reference or "",
                object=payload.title,
                status="draft",
                issue_date=date.today(),
                valid_until=payload.expected_date,
                amount_ht=payload.amount_ht,
                amount_ttc=payload.amount_ttc,
                vat_rate=payload.vat_rate,
                notes=payload.description,
            ),
            actor=actor,
            request=request,
        )
        return AiActionExecuteResponse(
            message=f"Devis {quote.reference} créé en brouillon.",
            link="/devis",
        )

    if payload.type == "create_purchase_order":
        if not has_permission(actor, "suppliers.manage"):
            raise PermissionDeniedError("Vous ne pouvez pas créer de bon de commande.")
        engagement = (payload.engagement_number or "").strip()
        if not engagement:
            raise ValidationAppError(
                "Le numéro d'engagement est obligatoire pour créer un bon de commande."
            )
        if payload.source_quote_reference:
            quote = db.scalar(
                select(CommercialDocument).where(
                    CommercialDocument.kind == "quote",
                    CommercialDocument.reference == payload.source_quote_reference,
                )
            )
            if quote is None:
                raise ValidationAppError(
                    "Le devis indiqué est introuvable. Précisez sa référence exacte."
                )
            order = commercial_service.convert_quote(
                db,
                quote,
                engagement_number=engagement,
                expected_date=payload.expected_date,
                notes=payload.description,
                actor=actor,
                request=request,
            )
            return AiActionExecuteResponse(
                message=(
                    f"Bon de commande {order.reference} créé depuis le devis "
                    f"{quote.reference} (engagement {order.engagement_number})."
                ),
                link="/bons-commande",
            )
        supplier_id = _commercial_supplier_id(
            db, payload.supplier_name, actor, request
        )
        order = commercial_service.create_document(
            db,
            CommercialDocumentCreate(
                kind="purchase_order",
                supplier_id=supplier_id,
                reference=payload.reference or "",
                engagement_number=engagement,
                object=payload.title,
                status="draft",
                issue_date=date.today(),
                expected_date=payload.expected_date,
                amount_ht=payload.amount_ht,
                amount_ttc=payload.amount_ttc,
                vat_rate=payload.vat_rate,
                notes=payload.description,
            ),
            actor=actor,
            request=request,
        )
        return AiActionExecuteResponse(
            message=(
                f"Bon de commande {order.reference} créé avec l'engagement "
                f"{order.engagement_number}."
            ),
            link="/bons-commande",
        )

    if not has_permission(actor, "actions.create"):
        raise PermissionDeniedError("Vous ne pouvez pas créer d'action.")
    due_at = None
    if payload.due_date:
        due_at = datetime.combine(
            payload.due_date, datetime.min.time(), tzinfo=UTC
        ).replace(hour=9)
    action = calendar_service.create_action(
        db,
        ActionItemCreate(
            title=payload.title,
            description=payload.description,
            module="ai",
            priority=payload.priority,
            due_date=due_at,
            owner_user_id=actor.id,
        ),
        actor=actor,
        request=request,
    )
    return AiActionExecuteResponse(
        message=f"Action créée : {action.title}",
        link="/calendrier?tab=actions",
    )


@admin_router.get("/config", response_model=AiConfigRead)
def get_config(
    _: User = Depends(require_permission("ai.configure")),
    db: Session = Depends(get_db),
) -> AiConfigRead:
    return ai_service.get_settings(db)


@admin_router.put("/config", response_model=AiConfigRead)
def update_config(
    payload: AiConfigUpdate,
    request: Request,
    actor: User = Depends(require_permission("ai.configure")),
    db: Session = Depends(get_db),
) -> AiConfigRead:
    return ai_service.update_settings(db, payload, actor=actor, request=request)


@admin_router.get("/models", response_model=AiModelsResponse)
def list_models(
    _: User = Depends(require_permission("ai.configure")),
    db: Session = Depends(get_db),
) -> AiModelsResponse:
    return ai_service.list_models(db)


@admin_router.post("/test", response_model=AiTestResponse)
def test_connection(
    request: Request,
    actor: User = Depends(require_permission("ai.configure")),
    db: Session = Depends(get_db),
) -> AiTestResponse:
    return ai_service.test_connection(db, actor=actor, request=request)
