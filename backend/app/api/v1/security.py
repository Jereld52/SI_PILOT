from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.db.session import get_db
from app.models.auth import User
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
from app.services import security_service

router = APIRouter(prefix="/security", tags=["Cybersécurité"])


@router.get("/overview", response_model=SecurityOverview)
def overview(
    _: User = Depends(require_permission("security.read")),
    db: Session = Depends(get_db),
):
    return security_service.overview(db)


# --- Incidents ---------------------------------------------------------------


@router.get("/incidents", response_model=list[SecurityIncidentRead])
def list_incidents(
    q: str | None = Query(None, max_length=120),
    status: str | None = Query(None, max_length=30),
    severity: str | None = Query(None, max_length=20),
    category: str | None = Query(None, max_length=40),
    _: User = Depends(require_permission("security.read")),
    db: Session = Depends(get_db),
):
    return security_service.list_incidents(
        db, q=q, status=status, severity=severity, category=category
    )


@router.post("/incidents", response_model=SecurityIncidentRead, status_code=201)
def create_incident(
    payload: SecurityIncidentCreate,
    request: Request,
    actor: User = Depends(require_permission("security.create")),
    db: Session = Depends(get_db),
):
    return security_service.create_incident(db, payload, actor=actor, request=request)


@router.get("/incidents/{incident_id}", response_model=SecurityIncidentRead)
def get_incident(
    incident_id: UUID,
    _: User = Depends(require_permission("security.read")),
    db: Session = Depends(get_db),
):
    return SecurityIncidentRead.model_validate(
        security_service.get_incident(db, incident_id)
    )


@router.patch("/incidents/{incident_id}", response_model=SecurityIncidentRead)
def update_incident(
    incident_id: UUID,
    payload: SecurityIncidentUpdate,
    request: Request,
    actor: User = Depends(require_permission("security.update")),
    db: Session = Depends(get_db),
):
    incident = security_service.get_incident(db, incident_id)
    return security_service.update_incident(
        db, incident, payload, actor=actor, request=request
    )


@router.delete("/incidents/{incident_id}", response_model=SecurityIncidentRead)
def close_incident(
    incident_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("security.delete")),
    db: Session = Depends(get_db),
):
    incident = security_service.get_incident(db, incident_id)
    return security_service.close_incident(db, incident, actor=actor, request=request)


# --- Actions -----------------------------------------------------------------


@router.get("/actions", response_model=list[SecurityActionRead])
def list_actions(
    q: str | None = Query(None, max_length=120),
    status: str | None = Query(None, max_length=20),
    priority: str | None = Query(None, max_length=20),
    incident_id: UUID | None = None,
    _: User = Depends(require_permission("security.read")),
    db: Session = Depends(get_db),
):
    return security_service.list_actions(
        db, q=q, status=status, priority=priority, incident_id=incident_id
    )


@router.post("/actions", response_model=SecurityActionRead, status_code=201)
def create_action(
    payload: SecurityActionCreate,
    request: Request,
    actor: User = Depends(require_permission("security.create")),
    db: Session = Depends(get_db),
):
    return security_service.create_action(db, payload, actor=actor, request=request)


@router.get("/actions/{action_id}", response_model=SecurityActionRead)
def get_action(
    action_id: UUID,
    _: User = Depends(require_permission("security.read")),
    db: Session = Depends(get_db),
):
    return SecurityActionRead.model_validate(security_service.get_action(db, action_id))


@router.patch("/actions/{action_id}", response_model=SecurityActionRead)
def update_action(
    action_id: UUID,
    payload: SecurityActionUpdate,
    request: Request,
    actor: User = Depends(require_permission("security.update")),
    db: Session = Depends(get_db),
):
    action = security_service.get_action(db, action_id)
    return security_service.update_action(db, action, payload, actor=actor, request=request)


@router.delete("/actions/{action_id}", status_code=204)
def delete_action(
    action_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("security.delete")),
    db: Session = Depends(get_db),
):
    action = security_service.get_action(db, action_id)
    security_service.delete_action(db, action, actor=actor, request=request)


# --- Vulnérabilités ----------------------------------------------------------


@router.get("/vulnerabilities", response_model=list[VulnerabilityRead])
def list_vulnerabilities(
    q: str | None = Query(None, max_length=120),
    status: str | None = Query(None, max_length=20),
    severity: str | None = Query(None, max_length=20),
    _: User = Depends(require_permission("security.read")),
    db: Session = Depends(get_db),
):
    return security_service.list_vulnerabilities(
        db, q=q, status=status, severity=severity
    )


@router.post("/vulnerabilities", response_model=VulnerabilityRead, status_code=201)
def create_vulnerability(
    payload: VulnerabilityCreate,
    request: Request,
    actor: User = Depends(require_permission("security.create")),
    db: Session = Depends(get_db),
):
    return security_service.create_vulnerability(
        db, payload, actor=actor, request=request
    )


@router.patch("/vulnerabilities/{vulnerability_id}", response_model=VulnerabilityRead)
def update_vulnerability(
    vulnerability_id: UUID,
    payload: VulnerabilityUpdate,
    request: Request,
    actor: User = Depends(require_permission("security.update")),
    db: Session = Depends(get_db),
):
    vulnerability = security_service.get_vulnerability(db, vulnerability_id)
    return security_service.update_vulnerability(
        db, vulnerability, payload, actor=actor, request=request
    )


@router.delete("/vulnerabilities/{vulnerability_id}", status_code=204)
def delete_vulnerability(
    vulnerability_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("security.delete")),
    db: Session = Depends(get_db),
):
    vulnerability = security_service.get_vulnerability(db, vulnerability_id)
    security_service.delete_vulnerability(
        db, vulnerability, actor=actor, request=request
    )


# --- Sauvegardes -------------------------------------------------------------


@router.get("/backups", response_model=list[BackupCheckRead])
def list_backups(
    q: str | None = Query(None, max_length=120),
    status: str | None = Query(None, max_length=20),
    _: User = Depends(require_permission("security.read")),
    db: Session = Depends(get_db),
):
    return security_service.list_backups(db, q=q, status=status)


@router.post("/backups", response_model=BackupCheckRead, status_code=201)
def create_backup(
    payload: BackupCheckCreate,
    request: Request,
    actor: User = Depends(require_permission("security.create")),
    db: Session = Depends(get_db),
):
    return security_service.create_backup(db, payload, actor=actor, request=request)


@router.patch("/backups/{backup_id}", response_model=BackupCheckRead)
def update_backup(
    backup_id: UUID,
    payload: BackupCheckUpdate,
    request: Request,
    actor: User = Depends(require_permission("security.update")),
    db: Session = Depends(get_db),
):
    backup = security_service.get_backup(db, backup_id)
    return security_service.update_backup(db, backup, payload, actor=actor, request=request)


@router.delete("/backups/{backup_id}", status_code=204)
def delete_backup(
    backup_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("security.delete")),
    db: Session = Depends(get_db),
):
    backup = security_service.get_backup(db, backup_id)
    security_service.delete_backup(db, backup, actor=actor, request=request)


# --- Certificats -------------------------------------------------------------


@router.get("/certificates", response_model=list[CertificateRead])
def list_certificates(
    q: str | None = Query(None, max_length=120),
    status: str | None = Query(None, max_length=20),
    _: User = Depends(require_permission("security.read")),
    db: Session = Depends(get_db),
):
    return security_service.list_certificates(db, q=q, status=status)


@router.post("/certificates", response_model=CertificateRead, status_code=201)
def create_certificate(
    payload: CertificateCreate,
    request: Request,
    actor: User = Depends(require_permission("security.create")),
    db: Session = Depends(get_db),
):
    return security_service.create_certificate(db, payload, actor=actor, request=request)


@router.patch("/certificates/{certificate_id}", response_model=CertificateRead)
def update_certificate(
    certificate_id: UUID,
    payload: CertificateUpdate,
    request: Request,
    actor: User = Depends(require_permission("security.update")),
    db: Session = Depends(get_db),
):
    certificate = security_service.get_certificate(db, certificate_id)
    return security_service.update_certificate(
        db, certificate, payload, actor=actor, request=request
    )


@router.delete("/certificates/{certificate_id}", status_code=204)
def delete_certificate(
    certificate_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("security.delete")),
    db: Session = Depends(get_db),
):
    certificate = security_service.get_certificate(db, certificate_id)
    security_service.delete_certificate(db, certificate, actor=actor, request=request)


# --- Audits ------------------------------------------------------------------


@router.get("/audits", response_model=list[SecurityAuditRead])
def list_audits(
    q: str | None = Query(None, max_length=120),
    status: str | None = Query(None, max_length=20),
    _: User = Depends(require_permission("security.read")),
    db: Session = Depends(get_db),
):
    return security_service.list_audits(db, q=q, status=status)


@router.post("/audits", response_model=SecurityAuditRead, status_code=201)
def create_audit(
    payload: SecurityAuditCreate,
    request: Request,
    actor: User = Depends(require_permission("security.create")),
    db: Session = Depends(get_db),
):
    return security_service.create_audit(db, payload, actor=actor, request=request)


@router.patch("/audits/{audit_id}", response_model=SecurityAuditRead)
def update_audit(
    audit_id: UUID,
    payload: SecurityAuditUpdate,
    request: Request,
    actor: User = Depends(require_permission("security.update")),
    db: Session = Depends(get_db),
):
    audit = security_service.get_audit(db, audit_id)
    return security_service.update_audit(db, audit, payload, actor=actor, request=request)


@router.delete("/audits/{audit_id}", status_code=204)
def delete_audit(
    audit_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("security.delete")),
    db: Session = Depends(get_db),
):
    audit = security_service.get_audit(db, audit_id)
    security_service.delete_audit(db, audit, actor=actor, request=request)
