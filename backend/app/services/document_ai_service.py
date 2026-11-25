from __future__ import annotations

import json
import re
import time
from datetime import UTC, date, datetime
from io import BytesIO
from pathlib import Path
from typing import Any, Literal
from uuid import UUID, uuid4

from app.core.config import settings
from app.core.errors import NotFoundError, PermissionDeniedError, ValidationAppError
from app.core.permissions import has_permission
from app.models.assets import Supplier
from app.models.auth import User
from app.models.budget import BudgetLine
from app.schemas.budget import BudgetInvoiceCreate
from app.schemas.commercial import CommercialDocumentCreate
from app.schemas.contracts import ContractCreate
from app.schemas.document_ai import (
    DocumentAnalysisRead,
    DocumentIntegrationRead,
    DocumentIntegrationRequest,
)
from app.schemas.documents import DocumentCreate
from app.schemas.licenses import LicenseCreate
from app.schemas.suppliers import SupplierCreate
from app.services import (
    ai_service,
    budget_service,
    commercial_service,
    contracts_service,
    documents_service,
    licenses_service,
    suppliers_service,
)
from fastapi import Request, UploadFile
from pypdf import PdfReader
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.datastructures import Headers

BACKEND_ROOT = Path(__file__).resolve().parents[2]
INTAKE_DIR_NAME = "intake"
MAX_TEXT_CHARS = 24_000


def _intake_root() -> Path:
    configured = Path(settings.upload_dir)
    base = configured if configured.is_absolute() else BACKEND_ROOT / configured
    root = base / INTAKE_DIR_NAME
    root.mkdir(parents=True, exist_ok=True)
    cutoff = time.time() - 48 * 3600
    for entry in root.iterdir():
        if entry.is_dir():
            try:
                if entry.stat().st_mtime < cutoff:
                    for item in entry.iterdir():
                        item.unlink(missing_ok=True)
                    entry.rmdir()
            except OSError:
                continue
    return root


def _extract_text(content: bytes, filename: str, mime_type: str) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix == ".pdf" or mime_type == "application/pdf":
        try:
            reader = PdfReader(BytesIO(content))
            parts: list[str] = []
            for page in reader.pages[:20]:
                parts.append(page.extract_text() or "")
            text = "\n".join(parts).strip()
        except Exception as exc:  # noqa: BLE001 - message explicite
            raise ValidationAppError(f"Lecture du PDF impossible : {exc}") from exc
        if not text:
            raise ValidationAppError(
                "Ce PDF ne contient pas de texte exploitable. Les documents scannés "
                "doivent d'abord être passés par un OCR."
            )
        return text[:MAX_TEXT_CHARS]
    try:
        return content.decode("utf-8")[:MAX_TEXT_CHARS]
    except UnicodeDecodeError:
        try:
            return content.decode("latin-1")[:MAX_TEXT_CHARS]
        except UnicodeDecodeError as exc:
            raise ValidationAppError(
                "Format non pris en charge. Utilisez un PDF ou un fichier texte."
            ) from exc


def _extract_json(text: str) -> dict[str, Any]:
    cleaned = re.sub(r"^```(?:json)?\s*", "", text.strip())
    cleaned = re.sub(r"\s*```$", "", cleaned)
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start < 0 or end <= start:
        raise ValidationAppError("La réponse de l'IA n'est pas un objet JSON exploitable.")
    try:
        payload = json.loads(cleaned[start : end + 1])
    except json.JSONDecodeError as exc:
        raise ValidationAppError("La réponse de l'IA n'est pas un JSON valide.") from exc
    if not isinstance(payload, dict):
        raise ValidationAppError("La réponse de l'IA n'est pas un objet JSON exploitable.")
    return payload


def _date(value: Any) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _number(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return round(float(str(value).replace(",", ".").replace(" ", "")), 2)
    except (TypeError, ValueError):
        return None


def _suggested_targets(kind: str, raw: Any) -> list[str]:
    defaults = {
        "contract": ["contract", "documentation"],
        "quote": ["quote", "documentation"],
        "purchase_order": ["purchase_order", "documentation"],
        "invoice": ["invoice", "documentation"],
        "license": ["license", "documentation"],
        "other": ["documentation"],
    }
    allowed = {
        "documentation",
        "quote",
        "purchase_order",
        "contract",
        "license",
        "invoice",
    }
    values = [str(item) for item in raw] if isinstance(raw, list) else []
    result = [item for item in values if item in allowed]
    for item in defaults.get(kind, ["documentation"]):
        if item not in result:
            result.append(item)
    return result


def analyze(
    db: Session,
    *,
    content: bytes,
    filename: str,
    mime_type: str,
    actor: User,
) -> DocumentAnalysisRead:
    max_bytes = settings.max_upload_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise ValidationAppError(
            f"Le fichier dépasse la taille maximale de {settings.max_upload_mb} Mo."
        )
    if not content:
        raise ValidationAppError("Le fichier est vide.")
    text = _extract_text(content, filename, mime_type)
    config = ai_service.get_config(db)
    if not config.enabled or not config.ready:
        raise ValidationAppError(
            "L'assistant IA doit être activé et configuré pour analyser un document."
        )
    system = (
        "Tu analyses un document administratif ou informatique pour SI PILOT. "
        "Réponds UNIQUEMENT avec un objet JSON, sans texte autour. Champs attendus : "
        '"document_type" (contract, quote, purchase_order, invoice, license ou other), '
        '"title", "supplier", "reference", "engagement_number", '
        '"start_date" (AAAA-MM-JJ ou null), '
        '"end_date", "amount_ht" (nombre ou null), "amount_ttc", "vat_rate", '
        '"summary" (2 à 4 phrases), "suggested_targets" (documentation, quote, '
        'purchase_order, contract, license, invoice), "confidence" (0 à 1), "warnings" (liste). '
        "N'invente pas de montant, de date ou de référence. Si une information est "
        "absente, mets null. Le document peut être un contrat, un devis, une facture, "
        "une licence logicielle ou un autre document."
    )
    started = time.perf_counter()
    try:
        answer, _ = ai_service._complete(
            config,
            [
                {"role": "system", "content": system},
                {
                    "role": "user",
                    "content": f"Nom du fichier : {filename}\n\nContenu :\n{text}",
                },
            ],
        )
    except Exception:
        ai_service._record_run(
            db,
            actor=actor,
            request_summary=f"Analyse document {filename}",
            include_context=False,
            status="error",
            duration_ms=round((time.perf_counter() - started) * 1000),
            feature_code="document_intake",
            error_code="AI_ERROR",
        )
        raise
    payload = _extract_json(answer)
    kind = str(payload.get("document_type") or "other").lower()
    if kind not in {
        "contract",
        "quote",
        "purchase_order",
        "invoice",
        "license",
        "other",
    }:
        kind = "other"
    warnings = payload.get("warnings")
    warning_list = (
        [str(item).strip() for item in warnings if str(item).strip()]
        if isinstance(warnings, list)
        else []
    )
    try:
        confidence = float(payload.get("confidence") or 0)
    except (TypeError, ValueError):
        confidence = 0.0
    confidence = min(max(confidence, 0.0), 1.0)
    token = uuid4().hex
    token_dir = _intake_root() / token
    token_dir.mkdir(parents=True, exist_ok=True)
    (token_dir / "original.bin").write_bytes(content)
    (token_dir / "meta.json").write_text(
        json.dumps(
            {
                "created_by": str(actor.id),
                "filename": Path(filename).name or "document",
                "mime_type": mime_type or "application/octet-stream",
                "created_at": datetime.now(UTC).isoformat(),
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    ai_service._record_run(
        db,
        actor=actor,
        request_summary=f"Analyse document {filename}",
        include_context=False,
        status="success",
        duration_ms=round((time.perf_counter() - started) * 1000),
        feature_code="document_intake",
        response_text=str(payload.get("title") or filename),
        http_status=200,
    )
    return DocumentAnalysisRead(
        token=token,
        filename=Path(filename).name or "document",
        document_type=kind,  # type: ignore[arg-type]
        title=str(payload.get("title") or Path(filename).stem or "Document importé"),
        supplier=str(payload.get("supplier") or "").strip() or None,
        reference=str(payload.get("reference") or "").strip() or None,
        engagement_number=str(payload.get("engagement_number") or "").strip() or None,
        start_date=_date(payload.get("start_date")),
        end_date=_date(payload.get("end_date")),
        amount_ht=_number(payload.get("amount_ht")),
        amount_ttc=_number(payload.get("amount_ttc")),
        vat_rate=_number(payload.get("vat_rate")),
        summary=str(payload.get("summary") or "").strip(),
        suggested_targets=_suggested_targets(kind, payload.get("suggested_targets")),  # type: ignore[arg-type]
        confidence=confidence,
        warnings=warning_list,
        text_excerpt=text[:1200],
    )


def _archive_document(
    db: Session,
    *,
    token_dir: Path,
    payload: DocumentIntegrationRequest,
    actor: User,
    request: Request | None,
    extra_tags: list[str] | None = None,
) -> UUID:
    meta = json.loads((token_dir / "meta.json").read_text(encoding="utf-8"))
    content = (token_dir / "original.bin").read_bytes()
    filename = str(meta.get("filename") or "document")
    mime_type = str(meta.get("mime_type") or "application/octet-stream")
    tags: list[str] = [str(payload.document_type)]
    if payload.supplier:
        tags.append(payload.supplier)
    tags.extend(extra_tags or [])
    created = documents_service.create_document(
        db,
        DocumentCreate(
            title=payload.title,
            doc_type=payload.document_type,
            description=payload.summary,
            visibility="all",
            status="published",
            tags=list(dict.fromkeys(tags)),
        ),
        actor=actor,
        request=request,
    )
    document = documents_service.get_document(db, created.id)
    upload = UploadFile(
        file=BytesIO(content),
        size=len(content),
        filename=filename,
        headers=Headers({"content-type": mime_type}),
    )
    documents_service.save_version(
        db,
        document,
        upload,
        changelog="Import et analyse IA",
        actor=actor,
        request=request,
    )
    return created.id


def _supplier_id(
    db: Session, name: str | None, actor: User, request: Request | None
) -> UUID | None:
    cleaned = (name or "").strip()
    if not cleaned:
        return None
    existing = db.scalar(
        select(Supplier).where(Supplier.name.ilike(cleaned))
    )
    if existing is not None:
        return existing.id
    if not has_permission(actor, "suppliers.manage"):
        raise PermissionDeniedError(
            "Le fournisseur est inconnu et vous n'avez pas la permission de le créer."
        )
    supplier = suppliers_service.create_supplier(
        db,
        SupplierCreate(name=cleaned, type="Fournisseur importé"),
        actor=actor,
        request=request,
    )
    return supplier.id


def integrate(
    db: Session,
    token: str,
    payload: DocumentIntegrationRequest,
    *,
    actor: User,
    request: Request | None = None,
) -> DocumentIntegrationRead:
    if not token or "/" in token or "\\" in token:
        raise NotFoundError("Import introuvable.")
    token_dir = _intake_root() / token
    meta_path = token_dir / "meta.json"
    if not meta_path.is_file():
        raise NotFoundError("Import introuvable ou expiré.")
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    if meta.get("created_by") != str(actor.id) and not has_permission(actor, "admin.settings.manage"):
        raise PermissionDeniedError("Cet import ne vous appartient pas.")
    if payload.target == "purchase_order" and not (payload.engagement_number or "").strip():
        raise ValidationAppError(
            "Le numéro d'engagement est obligatoire pour un bon de commande."
        )
    supplier_id = None
    if payload.target in {"contract", "invoice", "quote", "purchase_order"}:
        supplier_id = _supplier_id(db, payload.supplier, actor, request)
    link = "/documentation"
    message = "Document enregistré dans la documentation."
    commercial_document_id: UUID | None = None
    if payload.target in {"quote", "purchase_order"}:
        if not has_permission(actor, "suppliers.manage"):
            raise PermissionDeniedError("Vous ne pouvez pas créer de devis ou de bon de commande.")
        if supplier_id is None:
            raise ValidationAppError("Renseignez le fournisseur du document.")
        kind: Literal["quote", "purchase_order"] = (
            "quote" if payload.target == "quote" else "purchase_order"
        )
        engagement_number = (payload.engagement_number or "").strip() or None
        if kind == "purchase_order" and engagement_number is None:
            raise ValidationAppError(
                "Le numéro d'engagement est obligatoire pour un bon de commande."
            )
        created = commercial_service.create_document(
            db,
            CommercialDocumentCreate(
                kind=kind,
                supplier_id=supplier_id,
                reference=payload.reference or "",
                engagement_number=engagement_number,
                object=payload.title,
                status="draft",
                issue_date=payload.start_date or date.today(),
                valid_until=payload.end_date if kind == "quote" else None,
                expected_date=payload.end_date if kind == "purchase_order" else None,
                amount_ht=payload.amount_ht,
                amount_ttc=payload.amount_ttc,
                vat_rate=payload.vat_rate,
                notes=payload.summary,
            ),
            actor=actor,
            request=request,
        )
        commercial_document_id = created.id
        link = "/devis" if kind == "quote" else "/bons-commande"
        message = (
            f"Devis {created.reference} créé."
            if kind == "quote"
            else f"Bon de commande {created.reference} créé."
        )
    elif payload.target == "contract":
        if not has_permission(actor, "contracts.create"):
            raise PermissionDeniedError("Vous ne pouvez pas créer de contrat.")
        if supplier_id is None:
            raise ValidationAppError("Renseignez le fournisseur du contrat.")
        reference = payload.reference or f"IA-{token[:8].upper()}"
        contract = contracts_service.create_contract(
            db,
            ContractCreate(
                supplier_id=supplier_id,
                reference=reference,
                object=payload.title,
                start_date=payload.start_date,
                end_date=payload.end_date,
                amount_ht=payload.amount_ht,
                amount_ttc=payload.amount_ttc,
                vat_rate=payload.vat_rate,
                annual_cost=payload.amount_ttc,
                status="draft",
            ),
            actor=actor,
            request=request,
        )
        link = "/contrats"
        message = f"Contrat {contract.reference} créé en brouillon."
    elif payload.target == "license":
        if not has_permission(actor, "licenses.manage"):
            raise PermissionDeniedError("Vous ne pouvez pas créer de licence.")
        license_row = licenses_service.create_license(
            db,
            LicenseCreate(
                name=payload.title,
                vendor=payload.supplier,
                license_type=payload.document_type,
                start_date=payload.start_date,
                end_date=payload.end_date,
                annual_cost=payload.amount_ttc,
                notes=payload.summary,
            ),
            actor=actor,
            request=request,
        )
        link = "/fournisseurs"
        message = f"Licence créée : {license_row.name}."
    elif payload.target == "invoice":
        if not has_permission(actor, "budget.update"):
            raise PermissionDeniedError("Vous ne pouvez pas créer de facture budgétaire.")
        if payload.budget_line_id is None:
            raise ValidationAppError("Sélectionnez une ligne budgétaire pour la facture.")
        line = db.get(BudgetLine, payload.budget_line_id)
        if line is None:
            raise NotFoundError("Ligne budgétaire introuvable.")
        budget = budget_service.get_budget(db, line.budget_id)
        budget_service.create_invoice(
            db,
            budget,
            BudgetInvoiceCreate(
                budget_line_id=line.id,
                invoice_number=payload.reference,
                invoice_date=payload.start_date or date.today(),
                amount_ht=payload.amount_ht,
                amount_ttc=payload.amount_ttc,
                vat_rate=payload.vat_rate,
                status="received",
                supplier_id=supplier_id,
            ),
            actor=actor,
            request=request,
        )
        link = "/budget"
        message = "Facture ajoutée au budget."
    elif payload.target == "documentation":
        if not has_permission(actor, "documents.create"):
            raise PermissionDeniedError("Vous ne pouvez pas créer de document.")
    else:
        raise ValidationAppError("Destination d'intégration inconnue.")

    document_id = _archive_document(
        db,
        token_dir=token_dir,
        payload=payload,
        actor=actor,
        request=request,
        extra_tags=[payload.target],
    )
    for item in token_dir.iterdir():
        item.unlink(missing_ok=True)
    token_dir.rmdir()
    if commercial_document_id is not None:
        document_row = commercial_service.get_document(db, commercial_document_id)
        document_row.document_id = document_id
        db.commit()
    return DocumentIntegrationRead(
        message=f"{message} Fichier source archivé dans la documentation.",
        link=link,
        document_id=document_id,
    )
