from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.core.permissions import has_permission
from app.models.assets import Asset
from app.models.auth import User
from app.models.commercial import CommercialDocument
from app.models.contracts import Contract
from app.models.document_intake import DocumentIntake
from app.models.documents import Document, DocumentVersion
from app.schemas.data_quality import DataQualityItem, DataQualityOverview, DataQualitySection
from sqlalchemy import func, select
from sqlalchemy.orm import Session

_MAX_ITEMS = 25


def _item(
    *,
    item_id: str,
    title: str,
    detail: str | None,
    severity: str,
    href: str,
    action_label: str,
    permission: str | None = None,
    module_key: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
) -> DataQualityItem:
    return DataQualityItem(
        id=item_id,
        title=title,
        detail=detail,
        severity=severity,
        href=href,
        action_label=action_label,
        permission=permission,
        module_key=module_key,
        entity_type=entity_type,
        entity_id=entity_id,
    )


def _section(
    key: str,
    label: str,
    description: str,
    items: list[DataQualityItem],
) -> DataQualitySection:
    items.sort(
        key=lambda item: (
            {"danger": 0, "warning": 1, "info": 2}.get(item.severity, 9),
            item.title.lower(),
        )
    )
    return DataQualitySection(
        key=key,
        label=label,
        description=description,
        items=items[:_MAX_ITEMS],
        total=len(items),
        critical=sum(1 for item in items if item.severity == "danger"),
    )


def _purchase_sections(db: Session, actor: User) -> list[DataQualitySection]:
    if not has_permission(actor, "suppliers.read"):
        return []
    items: list[DataQualityItem] = []
    rows = db.scalars(
        select(CommercialDocument)
        .where(
            CommercialDocument.kind == "purchase_order",
            CommercialDocument.engagement_number.is_(None),
            CommercialDocument.status != "cancelled",
        )
        .order_by(CommercialDocument.issue_date.desc())
    ).unique().all()
    for row in rows:
        items.append(
            _item(
                item_id=f"po-engagement-{row.id}",
                title=f"Bon de commande sans engagement · {row.reference}",
                detail=(
                    f"{row.object} — "
                    f"{row.supplier.name if row.supplier else 'fournisseur inconnu'}."
                ),
                severity="danger",
                href="/bons-commande",
                action_label="Compléter",
                permission="suppliers.read",
                module_key="suppliers",
                entity_type="commercial_document",
                entity_id=str(row.id),
            )
        )
    return [
        _section(
            "purchase_order_engagement",
            "Bons de commande sans engagement",
            "Le numéro d'engagement est obligatoire pour le suivi budgétaire.",
            items,
        )
    ] if items else []


def _contract_sections(db: Session, actor: User) -> list[DataQualitySection]:
    if not has_permission(actor, "contracts.read"):
        return []
    items: list[DataQualityItem] = []
    rows = db.scalars(
        select(Contract)
        .where(
            Contract.status.in_(("active", "expiring")),
            Contract.end_date.is_(None),
        )
        .order_by(Contract.reference)
    ).unique().all()
    for row in rows:
        items.append(
            _item(
                item_id=f"contract-end-{row.id}",
                title=f"Contrat sans date de fin · {row.reference}",
                detail=f"{row.object} — échéance non renseignée.",
                severity="warning",
                href="/contrats",
                action_label="Compléter",
                permission="contracts.read",
                module_key="contracts",
                entity_type="contract",
                entity_id=str(row.id),
            )
        )
    return [
        _section(
            "contract_end_date",
            "Contrats sans date de fin",
            "Sans date de fin, les alertes d'échéance ne peuvent pas fonctionner.",
            items,
        )
    ] if items else []


def _asset_sections(db: Session, actor: User) -> list[DataQualitySection]:
    if not has_permission(actor, "assets.read"):
        return []
    sections: list[DataQualitySection] = []

    without_location: list[DataQualityItem] = []
    rows = db.scalars(
        select(Asset)
        .where(
            Asset.archived_at.is_(None),
            Asset.location_id.is_(None),
            Asset.status != "retired",
        )
        .order_by(Asset.asset_tag)
    ).unique().all()
    for row in rows:
        without_location.append(
            _item(
                item_id=f"asset-location-{row.id}",
                title=f"Équipement sans site · {row.asset_tag}",
                detail=row.name,
                severity="warning",
                href=f"/parc?q={row.asset_tag}",
                action_label="Compléter",
                permission="assets.read",
                module_key="assets",
                entity_type="asset",
                entity_id=str(row.id),
            )
        )
    if without_location:
        sections.append(
            _section(
                "asset_location",
                "Équipements sans site",
                "Le site est nécessaire pour les affectations et les statistiques.",
                without_location,
            )
        )

    without_assignment: list[DataQualityItem] = []
    rows = db.scalars(
        select(Asset)
        .where(
            Asset.archived_at.is_(None),
            Asset.status == "in_service",
            Asset.assigned_agent_id.is_(None),
        )
        .order_by(Asset.asset_tag)
    ).unique().all()
    for row in rows:
        without_assignment.append(
            _item(
                item_id=f"asset-assignment-{row.id}",
                title=f"Équipement en service non affecté · {row.asset_tag}",
                detail=row.name,
                severity="warning",
                href=f"/parc?q={row.asset_tag}",
                action_label="Affecter",
                permission="assets.read",
                module_key="assets",
                entity_type="asset",
                entity_id=str(row.id),
            )
        )
    if without_assignment:
        sections.append(
            _section(
                "asset_assignment",
                "Équipements sans affectation",
                "Un équipement en service devrait être affecté à un agent ou à un service.",
                without_assignment,
            )
        )

    for key, column, label in (
        ("asset_duplicate_ip", Asset.ip_address, "Adresse IP"),
        ("asset_duplicate_mac", Asset.mac_address, "Adresse MAC"),
    ):
        duplicate_rows = db.execute(
            select(column, func.count(Asset.id))
            .where(
                Asset.archived_at.is_(None),
                column.is_not(None),
                column != "",
            )
            .group_by(column)
            .having(func.count(Asset.id) > 1)
            .order_by(func.count(Asset.id).desc())
        ).all()
        items: list[DataQualityItem] = []
        for value, count in duplicate_rows:
            text = str(value)
            items.append(
                _item(
                    item_id=f"{key}-{text}",
                    title=f"{label} en doublon · {text}",
                    detail=f"{count} équipements partagent cette valeur.",
                    severity="danger" if key == "asset_duplicate_ip" else "warning",
                    href=f"/parc?q={text}",
                    action_label="Vérifier",
                    permission="assets.read",
                    module_key="assets",
                    entity_type="asset_duplicate",
                    entity_id=text,
                )
            )
        if items:
            sections.append(
                _section(
                    key,
                    f"{label}s en doublon",
                    "Deux équipements ne doivent pas partager la même adresse.",
                    items,
                )
            )
    return sections


def _import_sections(db: Session, actor: User) -> list[DataQualitySection]:
    if not has_permission(actor, "documents.read"):
        return []
    sections: list[DataQualitySection] = []
    now = datetime.now(UTC)

    errors: list[DataQualityItem] = []
    rows = db.scalars(
        select(DocumentIntake)
        .where(DocumentIntake.status == "error")
        .order_by(DocumentIntake.created_at.desc())
    ).all()
    for row in rows:
        errors.append(
            _item(
                item_id=f"import-error-{row.id}",
                title=f"Import en erreur · {row.filename}",
                detail=row.error_message or "L'intégration a échoué.",
                severity="danger",
                href="/import-documents",
                action_label="Réessayer",
                permission="documents.read",
                module_key="ai",
                entity_type="document_intake",
                entity_id=str(row.id),
            )
        )
    if errors:
        sections.append(
            _section(
                "import_errors",
                "Imports en erreur",
                "Ces documents ont été analysés mais l'intégration a échoué.",
                errors,
            )
        )

    pending: list[DataQualityItem] = []
    rows = db.scalars(
        select(DocumentIntake)
        .where(
            DocumentIntake.status == "analyzed",
            DocumentIntake.created_at < now - timedelta(hours=48),
        )
        .order_by(DocumentIntake.created_at.asc())
    ).all()
    for row in rows:
        pending.append(
            _item(
                item_id=f"import-pending-{row.id}",
                title=f"Import non finalisé · {row.filename}",
                detail=(
                    f"Analysé le {row.created_at:%d/%m/%Y %H:%M} "
                    "et jamais intégré."
                ),
                severity="warning",
                href="/import-documents",
                action_label="Finaliser",
                permission="documents.read",
                module_key="ai",
                entity_type="document_intake",
                entity_id=str(row.id),
            )
        )
    if pending:
        sections.append(
            _section(
                "import_pending",
                "Imports non intégrés",
                "Documents analysés depuis plus de 48 heures sans destination.",
                pending,
            )
        )
    return sections


def _documentation_sections(db: Session, actor: User) -> list[DataQualitySection]:
    if not has_permission(actor, "documents.read"):
        return []
    now = datetime.now(UTC)
    sections: list[DataQualitySection] = []

    without_version = db.scalars(
        select(Document)
        .where(
            Document.archived_at.is_(None),
            Document.status.in_(("draft", "published")),
            ~Document.versions.any(),
        )
        .order_by(Document.updated_at.desc())
    ).all()
    items = [
        _item(
            item_id=f"document-no-version-{document.id}",
            title=f"Document sans version · {document.title}",
            detail="Aucun fichier n'est rattaché à ce document.",
            severity="warning",
            href=f"/documentation?document={document.id}",
            action_label="Ajouter une version",
            permission="documents.update",
            module_key="documents",
            entity_type="document",
            entity_id=str(document.id),
        )
        for document in without_version
    ]
    if items:
        sections.append(
            _section(
                "document_without_version",
                "Documents sans version",
                "Ces documents n'ont aucun fichier publié ou brouillon.",
                items,
            )
        )

    missing_current = db.scalars(
        select(Document)
        .where(
            Document.archived_at.is_(None),
            Document.versions.any(),
            ~Document.versions.any(DocumentVersion.is_current.is_(True)),
        )
        .order_by(Document.updated_at.desc())
    ).all()
    items = [
        _item(
            item_id=f"document-no-current-{document.id}",
            title=f"Version courante absente · {document.title}",
            detail="Des versions existent mais aucune n'est marquée comme courante.",
            severity="warning",
            href=f"/documentation?document={document.id}",
            action_label="Corriger",
            permission="documents.update",
            module_key="documents",
            entity_type="document",
            entity_id=str(document.id),
        )
        for document in missing_current
    ]
    if items:
        sections.append(
            _section(
                "document_missing_current",
                "Versions courantes manquantes",
                "Une version doit être marquée comme courante pour être proposée.",
                items,
            )
        )

    stale = db.scalars(
        select(Document)
        .where(
            Document.archived_at.is_(None),
            Document.status == "published",
            Document.updated_at < now - timedelta(days=365),
        )
        .order_by(Document.updated_at.asc())
    ).all()
    items = [
        _item(
            item_id=f"document-stale-{document.id}",
            title=f"Document ancien · {document.title}",
            detail=f"Dernière mise à jour le {document.updated_at.strftime('%d/%m/%Y')}.",
            severity="info",
            href=f"/documentation?document={document.id}",
            action_label="Mettre à jour",
            permission="documents.update",
            module_key="documents",
            entity_type="document",
            entity_id=str(document.id),
        )
        for document in stale
    ]
    if items:
        sections.append(
            _section(
                "document_stale",
                "Documents non mis à jour",
                "Documents publiés sans mise à jour depuis plus de 12 mois.",
                items,
            )
        )

    duplicate_rows = db.execute(
        select(func.lower(Document.title), func.count(Document.id))
        .where(Document.archived_at.is_(None))
        .group_by(func.lower(Document.title))
        .having(func.count(Document.id) > 1)
    ).all()
    items = [
        _item(
            item_id=f"document-duplicate-{str(title)}",
            title=f"Titre en double · {str(title)}",
            detail=f"{count} documents partagent ce titre.",
            severity="warning",
            href=f"/documentation?q={str(title)}",
            action_label="Vérifier",
            permission="documents.read",
            module_key="documents",
            entity_type="document_duplicate",
            entity_id=str(title),
        )
        for title, count in duplicate_rows
    ]
    if items:
        sections.append(
            _section(
                "document_duplicate_title",
                "Doublons de documents",
                "Plusieurs documents portent le même titre.",
                items,
            )
        )

    without_category = db.scalars(
        select(Document)
        .where(
            Document.archived_at.is_(None),
            Document.category_id.is_(None),
        )
        .order_by(Document.updated_at.desc())
    ).all()
    items = [
        _item(
            item_id=f"document-no-category-{document.id}",
            title=f"Document sans catégorie · {document.title}",
            detail="La classification et les recherches seront moins précises.",
            severity="info",
            href=f"/documentation?document={document.id}",
            action_label="Classer",
            permission="documents.update",
            module_key="documents",
            entity_type="document",
            entity_id=str(document.id),
        )
        for document in without_category
    ]
    if items:
        sections.append(
            _section(
                "document_without_category",
                "Documents sans catégorie",
                "Ces documents ne sont rattachés à aucune catégorie.",
                items,
            )
        )
    return sections


def get_overview(db: Session, actor: User) -> DataQualityOverview:
    sections = [
        *_purchase_sections(db, actor),
        *_contract_sections(db, actor),
        *_asset_sections(db, actor),
        *_documentation_sections(db, actor),
        *_import_sections(db, actor),
    ]
    total = sum(section.total for section in sections)
    critical = sum(section.critical for section in sections)
    return DataQualityOverview(
        generated_at=datetime.now(UTC),
        total=total,
        critical=critical,
        sections=sections,
    )
