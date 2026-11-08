from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID

from app.core.errors import NotFoundError
from app.db.base import utcnow
from app.models.assets import Asset
from app.models.auth import User
from app.models.security import (
    BackupCheck,
    Certificate,
    SecurityAction,
    SecurityAudit,
    SecurityIncident,
    Vulnerability,
)
from app.schemas.security import (
    BackupCheckCreate,
    BackupCheckRead,
    BackupCheckUpdate,
    CertificateCreate,
    CertificateRead,
    CertificateUpdate,
    SecurityActionCreate,
    SecurityActionRead,
    SecurityActionUpdate,
    SecurityAuditCreate,
    SecurityAuditRead,
    SecurityAuditUpdate,
    SecurityIncidentCreate,
    SecurityIncidentRead,
    SecurityIncidentUpdate,
    SecurityOverview,
    VulnerabilityCreate,
    VulnerabilityRead,
    VulnerabilityUpdate,
)
from app.services.audit_service import write_audit
from app.services.reference_service import next_reference
from fastapi import Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session


def _require(db: Session, model, entity_id: UUID, message: str):
    row = db.get(model, entity_id)
    if row is None:
        raise NotFoundError(message)
    return row


def _validate_user(db: Session, user_id: UUID | None) -> None:
    if user_id and db.get(User, user_id) is None:
        raise NotFoundError("Responsable introuvable.")


def _validate_asset(db: Session, asset_id: UUID | None) -> None:
    if asset_id and db.get(Asset, asset_id) is None:
        raise NotFoundError("Équipement introuvable.")


# --- Incidents ---------------------------------------------------------------


def list_incidents(
    db: Session,
    *,
    q: str | None = None,
    status: str | None = None,
    severity: str | None = None,
    category: str | None = None,
) -> list[SecurityIncidentRead]:
    statement = select(SecurityIncident)
    if status:
        statement = statement.where(SecurityIncident.status == status)
    if severity:
        statement = statement.where(SecurityIncident.severity == severity)
    if category:
        statement = statement.where(SecurityIncident.category == category)
    if q:
        pattern = f"%{q.strip()}%"
        statement = statement.where(
            or_(
                SecurityIncident.reference.ilike(pattern),
                SecurityIncident.title.ilike(pattern),
                SecurityIncident.description.ilike(pattern),
            )
        )
    rows = db.scalars(
        statement.order_by(SecurityIncident.detected_at.desc())
    ).all()
    return [SecurityIncidentRead.model_validate(row) for row in rows]


def get_incident(db: Session, incident_id: UUID) -> SecurityIncident:
    return _require(db, SecurityIncident, incident_id, "Incident de sécurité introuvable.")


def create_incident(
    db: Session,
    payload: SecurityIncidentCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> SecurityIncidentRead:
    _validate_user(db, payload.owner_user_id)
    data = payload.model_dump(exclude={"reference", "detected_at"})
    incident = SecurityIncident(
        **data,
        reference=payload.reference or next_reference(db, key="security_incident", prefix="INC"),
        detected_at=payload.detected_at or utcnow(),
        created_by_id=actor.id,
    )
    if incident.status == "closed":
        incident.closed_at = utcnow()
    db.add(incident)
    db.flush()
    write_audit(
        db,
        module="security",
        action="security_incident_created",
        actor=actor,
        entity_type="security_incident",
        entity_id=str(incident.id),
        entity_label=f"{incident.reference} — {incident.title}",
        after={"severity": incident.severity, "status": incident.status},
        request=request,
    )
    db.commit()
    db.refresh(incident)
    return SecurityIncidentRead.model_validate(incident)


def update_incident(
    db: Session,
    incident: SecurityIncident,
    payload: SecurityIncidentUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> SecurityIncidentRead:
    data = payload.model_dump(exclude_unset=True)
    if "owner_user_id" in data:
        _validate_user(db, data["owner_user_id"])
    before = {"severity": incident.severity, "status": incident.status}
    for field, value in data.items():
        setattr(incident, field, value)
    if incident.status == "closed" and incident.closed_at is None:
        incident.closed_at = utcnow()
    if incident.status != "closed":
        incident.closed_at = None
    write_audit(
        db,
        module="security",
        action="security_incident_updated",
        actor=actor,
        entity_type="security_incident",
        entity_id=str(incident.id),
        entity_label=f"{incident.reference} — {incident.title}",
        before=before,
        after={"severity": incident.severity, "status": incident.status},
        request=request,
    )
    db.commit()
    db.refresh(incident)
    return SecurityIncidentRead.model_validate(incident)


def close_incident(
    db: Session, incident: SecurityIncident, *, actor: User, request: Request | None = None
) -> SecurityIncidentRead:
    previous = incident.status
    incident.status = "closed"
    incident.closed_at = utcnow()
    write_audit(
        db,
        module="security",
        action="security_incident_closed",
        actor=actor,
        entity_type="security_incident",
        entity_id=str(incident.id),
        entity_label=f"{incident.reference} — {incident.title}",
        before={"status": previous},
        after={"status": "closed"},
        request=request,
    )
    db.commit()
    db.refresh(incident)
    return SecurityIncidentRead.model_validate(incident)


# --- Actions -----------------------------------------------------------------


def list_actions(
    db: Session,
    *,
    q: str | None = None,
    status: str | None = None,
    priority: str | None = None,
    incident_id: UUID | None = None,
) -> list[SecurityActionRead]:
    statement = select(SecurityAction)
    if status:
        statement = statement.where(SecurityAction.status == status)
    if priority:
        statement = statement.where(SecurityAction.priority == priority)
    if incident_id:
        statement = statement.where(SecurityAction.incident_id == incident_id)
    if q:
        pattern = f"%{q.strip()}%"
        statement = statement.where(
            or_(
                SecurityAction.title.ilike(pattern),
                SecurityAction.description.ilike(pattern),
                SecurityAction.category.ilike(pattern),
            )
        )
    rows = db.scalars(
        statement.order_by(SecurityAction.due_date.asc().nullslast(), SecurityAction.created_at.desc())
    ).all()
    return [SecurityActionRead.model_validate(row) for row in rows]


def get_action(db: Session, action_id: UUID) -> SecurityAction:
    return _require(db, SecurityAction, action_id, "Action de sécurité introuvable.")


def create_action(
    db: Session,
    payload: SecurityActionCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> SecurityActionRead:
    _validate_user(db, payload.owner_user_id)
    _validate_asset(db, payload.asset_id)
    if payload.incident_id:
        get_incident(db, payload.incident_id)
    action = SecurityAction(**payload.model_dump())
    if action.status == "done":
        action.completed_at = utcnow()
    db.add(action)
    db.flush()
    write_audit(
        db,
        module="security",
        action="security_action_created",
        actor=actor,
        entity_type="security_action",
        entity_id=str(action.id),
        entity_label=action.title,
        after={"status": action.status, "priority": action.priority},
        request=request,
    )
    db.commit()
    db.refresh(action)
    return SecurityActionRead.model_validate(action)


def update_action(
    db: Session,
    action: SecurityAction,
    payload: SecurityActionUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> SecurityActionRead:
    data = payload.model_dump(exclude_unset=True)
    if "owner_user_id" in data:
        _validate_user(db, data["owner_user_id"])
    if "asset_id" in data:
        _validate_asset(db, data["asset_id"])
    if data.get("incident_id"):
        get_incident(db, data["incident_id"])
    before = {"status": action.status}
    for field, value in data.items():
        setattr(action, field, value)
    if action.status == "done" and action.completed_at is None:
        action.completed_at = utcnow()
    if action.status != "done":
        action.completed_at = None
    write_audit(
        db,
        module="security",
        action="security_action_updated",
        actor=actor,
        entity_type="security_action",
        entity_id=str(action.id),
        entity_label=action.title,
        before=before,
        after={"status": action.status},
        request=request,
    )
    db.commit()
    db.refresh(action)
    return SecurityActionRead.model_validate(action)


def delete_action(
    db: Session, action: SecurityAction, *, actor: User, request: Request | None = None
) -> None:
    write_audit(
        db,
        module="security",
        action="security_action_deleted",
        actor=actor,
        entity_type="security_action",
        entity_id=str(action.id),
        entity_label=action.title,
        request=request,
    )
    db.delete(action)
    db.commit()


# --- Vulnérabilités ----------------------------------------------------------


def list_vulnerabilities(
    db: Session,
    *,
    q: str | None = None,
    status: str | None = None,
    severity: str | None = None,
) -> list[VulnerabilityRead]:
    statement = select(Vulnerability)
    if status:
        statement = statement.where(Vulnerability.status == status)
    if severity:
        statement = statement.where(Vulnerability.severity == severity)
    if q:
        pattern = f"%{q.strip()}%"
        statement = statement.where(
            or_(
                Vulnerability.title.ilike(pattern),
                Vulnerability.cve_id.ilike(pattern),
                Vulnerability.source.ilike(pattern),
            )
        )
    rows = db.scalars(
        statement.order_by(Vulnerability.due_date.asc().nullslast(), Vulnerability.created_at.desc())
    ).all()
    return [VulnerabilityRead.model_validate(row) for row in rows]


def get_vulnerability(db: Session, vulnerability_id: UUID) -> Vulnerability:
    return _require(db, Vulnerability, vulnerability_id, "Vulnérabilité introuvable.")


def create_vulnerability(
    db: Session,
    payload: VulnerabilityCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> VulnerabilityRead:
    _validate_asset(db, payload.asset_id)
    data = payload.model_dump(exclude={"cvss_score"})
    vulnerability = Vulnerability(
        **data,
        cvss_score=Decimal(str(payload.cvss_score)) if payload.cvss_score is not None else None,
    )
    if vulnerability.status in ("resolved", "accepted"):
        vulnerability.resolved_at = utcnow()
    db.add(vulnerability)
    db.flush()
    write_audit(
        db,
        module="security",
        action="vulnerability_created",
        actor=actor,
        entity_type="vulnerability",
        entity_id=str(vulnerability.id),
        entity_label=vulnerability.title,
        after={"severity": vulnerability.severity, "status": vulnerability.status},
        request=request,
    )
    db.commit()
    db.refresh(vulnerability)
    return VulnerabilityRead.model_validate(vulnerability)


def update_vulnerability(
    db: Session,
    vulnerability: Vulnerability,
    payload: VulnerabilityUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> VulnerabilityRead:
    data = payload.model_dump(exclude_unset=True)
    if "asset_id" in data:
        _validate_asset(db, data["asset_id"])
    if "cvss_score" in data and data["cvss_score"] is not None:
        data["cvss_score"] = Decimal(str(data["cvss_score"]))
    before = {"severity": vulnerability.severity, "status": vulnerability.status}
    for field, value in data.items():
        setattr(vulnerability, field, value)
    if vulnerability.status in ("resolved", "accepted") and vulnerability.resolved_at is None:
        vulnerability.resolved_at = utcnow()
    if vulnerability.status not in ("resolved", "accepted"):
        vulnerability.resolved_at = None
    write_audit(
        db,
        module="security",
        action="vulnerability_updated",
        actor=actor,
        entity_type="vulnerability",
        entity_id=str(vulnerability.id),
        entity_label=vulnerability.title,
        before=before,
        after={"severity": vulnerability.severity, "status": vulnerability.status},
        request=request,
    )
    db.commit()
    db.refresh(vulnerability)
    return VulnerabilityRead.model_validate(vulnerability)


def delete_vulnerability(
    db: Session,
    vulnerability: Vulnerability,
    *,
    actor: User,
    request: Request | None = None,
) -> None:
    write_audit(
        db,
        module="security",
        action="vulnerability_deleted",
        actor=actor,
        entity_type="vulnerability",
        entity_id=str(vulnerability.id),
        entity_label=vulnerability.title,
        request=request,
    )
    db.delete(vulnerability)
    db.commit()


# --- Sauvegardes -------------------------------------------------------------


def list_backups(
    db: Session, *, q: str | None = None, status: str | None = None
) -> list[BackupCheckRead]:
    statement = select(BackupCheck)
    if status:
        statement = statement.where(BackupCheck.status == status)
    if q:
        pattern = f"%{q.strip()}%"
        statement = statement.where(
            or_(BackupCheck.scope.ilike(pattern), BackupCheck.notes.ilike(pattern))
        )
    rows = db.scalars(statement.order_by(BackupCheck.run_at.desc())).all()
    return [BackupCheckRead.model_validate(row) for row in rows]


def get_backup(db: Session, backup_id: UUID) -> BackupCheck:
    return _require(db, BackupCheck, backup_id, "Contrôle de sauvegarde introuvable.")


def create_backup(
    db: Session,
    payload: BackupCheckCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> BackupCheckRead:
    data = payload.model_dump(exclude={"run_at"})
    backup = BackupCheck(**data, run_at=payload.run_at or utcnow())
    db.add(backup)
    db.flush()
    write_audit(
        db,
        module="security",
        action="backup_check_created",
        actor=actor,
        entity_type="backup_check",
        entity_id=str(backup.id),
        entity_label=backup.scope,
        after={"status": backup.status},
        request=request,
    )
    db.commit()
    db.refresh(backup)
    return BackupCheckRead.model_validate(backup)


def update_backup(
    db: Session,
    backup: BackupCheck,
    payload: BackupCheckUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> BackupCheckRead:
    data = payload.model_dump(exclude_unset=True)
    before = {"status": backup.status}
    for field, value in data.items():
        setattr(backup, field, value)
    write_audit(
        db,
        module="security",
        action="backup_check_updated",
        actor=actor,
        entity_type="backup_check",
        entity_id=str(backup.id),
        entity_label=backup.scope,
        before=before,
        after={"status": backup.status},
        request=request,
    )
    db.commit()
    db.refresh(backup)
    return BackupCheckRead.model_validate(backup)


def delete_backup(
    db: Session, backup: BackupCheck, *, actor: User, request: Request | None = None
) -> None:
    write_audit(
        db,
        module="security",
        action="backup_check_deleted",
        actor=actor,
        entity_type="backup_check",
        entity_id=str(backup.id),
        entity_label=backup.scope,
        request=request,
    )
    db.delete(backup)
    db.commit()


# --- Certificats -------------------------------------------------------------


def _certificate_read(certificate: Certificate) -> CertificateRead:
    data = CertificateRead.model_validate(certificate)
    data.days_to_expiry = (certificate.valid_to - date.today()).days
    days = data.days_to_expiry
    if certificate.status in ("active", "expiring"):
        if days < 0:
            data.alert_level = "expired"
        elif days <= 30:
            data.alert_level = "critical"
        elif days <= 90:
            data.alert_level = "warning"
        elif days <= 180:
            data.alert_level = "notice"
    return data


def list_certificates(
    db: Session, *, q: str | None = None, status: str | None = None
) -> list[CertificateRead]:
    statement = select(Certificate)
    if status:
        statement = statement.where(Certificate.status == status)
    if q:
        pattern = f"%{q.strip()}%"
        statement = statement.where(
            or_(Certificate.common_name.ilike(pattern), Certificate.issuer.ilike(pattern))
        )
    rows = db.scalars(statement.order_by(Certificate.valid_to)).all()
    return [_certificate_read(row) for row in rows]


def get_certificate(db: Session, certificate_id: UUID) -> Certificate:
    return _require(db, Certificate, certificate_id, "Certificat introuvable.")


def create_certificate(
    db: Session,
    payload: CertificateCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> CertificateRead:
    _validate_user(db, payload.owner_user_id)
    certificate = Certificate(**payload.model_dump())
    db.add(certificate)
    db.flush()
    write_audit(
        db,
        module="security",
        action="certificate_created",
        actor=actor,
        entity_type="certificate",
        entity_id=str(certificate.id),
        entity_label=certificate.common_name,
        after={"valid_to": certificate.valid_to.isoformat()},
        request=request,
    )
    db.commit()
    db.refresh(certificate)
    return _certificate_read(certificate)


def update_certificate(
    db: Session,
    certificate: Certificate,
    payload: CertificateUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> CertificateRead:
    data = payload.model_dump(exclude_unset=True)
    if "owner_user_id" in data:
        _validate_user(db, data["owner_user_id"])
    for field, value in data.items():
        setattr(certificate, field, value)
    write_audit(
        db,
        module="security",
        action="certificate_updated",
        actor=actor,
        entity_type="certificate",
        entity_id=str(certificate.id),
        entity_label=certificate.common_name,
        after={"valid_to": certificate.valid_to.isoformat(), "status": certificate.status},
        request=request,
    )
    db.commit()
    db.refresh(certificate)
    return _certificate_read(certificate)


def delete_certificate(
    db: Session,
    certificate: Certificate,
    *,
    actor: User,
    request: Request | None = None,
) -> None:
    write_audit(
        db,
        module="security",
        action="certificate_deleted",
        actor=actor,
        entity_type="certificate",
        entity_id=str(certificate.id),
        entity_label=certificate.common_name,
        request=request,
    )
    db.delete(certificate)
    db.commit()


# --- Audits ------------------------------------------------------------------


def list_audits(
    db: Session, *, q: str | None = None, status: str | None = None
) -> list[SecurityAuditRead]:
    statement = select(SecurityAudit)
    if status:
        statement = statement.where(SecurityAudit.status == status)
    if q:
        pattern = f"%{q.strip()}%"
        statement = statement.where(
            or_(SecurityAudit.title.ilike(pattern), SecurityAudit.auditor.ilike(pattern))
        )
    rows = db.scalars(
        statement.order_by(SecurityAudit.planned_at.desc().nullslast(), SecurityAudit.created_at.desc())
    ).all()
    return [SecurityAuditRead.model_validate(row) for row in rows]


def get_audit(db: Session, audit_id: UUID) -> SecurityAudit:
    return _require(db, SecurityAudit, audit_id, "Audit de sécurité introuvable.")


def create_audit(
    db: Session,
    payload: SecurityAuditCreate,
    *,
    actor: User,
    request: Request | None = None,
) -> SecurityAuditRead:
    audit = SecurityAudit(**payload.model_dump())
    db.add(audit)
    db.flush()
    write_audit(
        db,
        module="security",
        action="security_audit_created",
        actor=actor,
        entity_type="security_audit",
        entity_id=str(audit.id),
        entity_label=audit.title,
        after={"status": audit.status},
        request=request,
    )
    db.commit()
    db.refresh(audit)
    return SecurityAuditRead.model_validate(audit)


def update_audit(
    db: Session,
    audit: SecurityAudit,
    payload: SecurityAuditUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> SecurityAuditRead:
    data = payload.model_dump(exclude_unset=True)
    before = {"status": audit.status}
    for field, value in data.items():
        setattr(audit, field, value)
    write_audit(
        db,
        module="security",
        action="security_audit_updated",
        actor=actor,
        entity_type="security_audit",
        entity_id=str(audit.id),
        entity_label=audit.title,
        before=before,
        after={"status": audit.status},
        request=request,
    )
    db.commit()
    db.refresh(audit)
    return SecurityAuditRead.model_validate(audit)


def delete_audit(
    db: Session, audit: SecurityAudit, *, actor: User, request: Request | None = None
) -> None:
    write_audit(
        db,
        module="security",
        action="security_audit_deleted",
        actor=actor,
        entity_type="security_audit",
        entity_id=str(audit.id),
        entity_label=audit.title,
        request=request,
    )
    db.delete(audit)
    db.commit()


# --- Vue d'ensemble ----------------------------------------------------------


def overview(db: Session) -> SecurityOverview:
    today = date.today()
    open_incidents = (
        db.scalar(
            select(func.count())
            .select_from(SecurityIncident)
            .where(SecurityIncident.status != "closed")
        )
        or 0
    )
    critical_incidents = (
        db.scalar(
            select(func.count())
            .select_from(SecurityIncident)
            .where(
                SecurityIncident.status != "closed",
                SecurityIncident.severity == "critical",
            )
        )
        or 0
    )
    open_actions = (
        db.scalar(
            select(func.count())
            .select_from(SecurityAction)
            .where(SecurityAction.status.in_(("todo", "in_progress", "blocked")))
        )
        or 0
    )
    overdue_actions = (
        db.scalar(
            select(func.count())
            .select_from(SecurityAction)
            .where(
                SecurityAction.status.in_(("todo", "in_progress", "blocked")),
                SecurityAction.due_date.is_not(None),
                SecurityAction.due_date < today,
            )
        )
        or 0
    )
    open_vulnerabilities = (
        db.scalar(
            select(func.count())
            .select_from(Vulnerability)
            .where(Vulnerability.status.in_(("open", "in_progress")))
        )
        or 0
    )
    critical_vulnerabilities = (
        db.scalar(
            select(func.count())
            .select_from(Vulnerability)
            .where(
                Vulnerability.status.in_(("open", "in_progress")),
                Vulnerability.severity == "critical",
            )
        )
        or 0
    )
    expiring_certificates = (
        db.scalar(
            select(func.count())
            .select_from(Certificate)
            .where(
                Certificate.status.in_(("active", "expiring")),
                Certificate.valid_to >= today,
                Certificate.valid_to <= today + timedelta(days=365),
            )
        )
        or 0
    )
    last_backup = db.scalar(select(BackupCheck).order_by(BackupCheck.run_at.desc()).limit(1))
    return SecurityOverview(
        open_incidents=open_incidents,
        critical_incidents=critical_incidents,
        open_actions=open_actions,
        overdue_actions=overdue_actions,
        open_vulnerabilities=open_vulnerabilities,
        critical_vulnerabilities=critical_vulnerabilities,
        expiring_certificates=expiring_certificates,
        last_backup_status=last_backup.status if last_backup else None,
        last_backup_at=last_backup.run_at if last_backup else None,
    )
