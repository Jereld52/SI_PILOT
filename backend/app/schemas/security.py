from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel
from app.schemas.tickets import TicketUserRef


class SecurityIncidentCreate(BaseModel):
    reference: str | None = Field(default=None, max_length=40)
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    severity: Literal["low", "medium", "high", "critical"]
    category: str = Field(min_length=1, max_length=40)
    detected_at: datetime | None = None
    status: Literal["open", "investigating", "contained", "closed"] = "open"
    owner_user_id: UUID | None = None
    actions_taken: str | None = None
    corrective_measures: str | None = None
    lessons_learned: str | None = None


class SecurityIncidentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    severity: Literal["low", "medium", "high", "critical"] | None = None
    category: str | None = Field(default=None, min_length=1, max_length=40)
    detected_at: datetime | None = None
    status: Literal["open", "investigating", "contained", "closed"] | None = None
    owner_user_id: UUID | None = None
    actions_taken: str | None = None
    corrective_measures: str | None = None
    lessons_learned: str | None = None


class SecurityIncidentRead(ORMModel):
    id: UUID
    reference: str
    title: str
    description: str | None = None
    severity: str
    category: str
    detected_at: datetime
    status: str
    owner_user_id: UUID | None = None
    owner: TicketUserRef | None = None
    actions_taken: str | None = None
    corrective_measures: str | None = None
    lessons_learned: str | None = None
    closed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class SecurityActionCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    category: str | None = Field(default=None, max_length=60)
    priority: Literal["low", "medium", "high", "critical"] = "medium"
    due_date: date | None = None
    owner_user_id: UUID | None = None
    status: Literal["todo", "in_progress", "blocked", "done", "cancelled"] = "todo"
    evidence: str | None = None
    incident_id: UUID | None = None
    asset_id: UUID | None = None


class SecurityActionUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    category: str | None = Field(default=None, max_length=60)
    priority: Literal["low", "medium", "high", "critical"] | None = None
    due_date: date | None = None
    owner_user_id: UUID | None = None
    status: Literal["todo", "in_progress", "blocked", "done", "cancelled"] | None = None
    evidence: str | None = None
    incident_id: UUID | None = None
    asset_id: UUID | None = None


class SecurityActionRead(ORMModel):
    id: UUID
    title: str
    description: str | None = None
    category: str | None = None
    priority: str
    due_date: date | None = None
    owner_user_id: UUID | None = None
    owner: TicketUserRef | None = None
    status: str
    evidence: str | None = None
    incident_id: UUID | None = None
    incident_reference: str | None = None
    asset_id: UUID | None = None
    asset_label: str | None = None
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class VulnerabilityCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    cve_id: str | None = Field(default=None, max_length=30)
    cvss_score: float | None = Field(default=None, ge=0, le=10)
    severity: Literal["low", "medium", "high", "critical"]
    asset_id: UUID | None = None
    detected_at: date | None = None
    source: str | None = Field(default=None, max_length=120)
    status: Literal["open", "in_progress", "mitigated", "resolved", "accepted"] = "open"
    remediation: str | None = None
    due_date: date | None = None


class VulnerabilityUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    cve_id: str | None = Field(default=None, max_length=30)
    cvss_score: float | None = Field(default=None, ge=0, le=10)
    severity: Literal["low", "medium", "high", "critical"] | None = None
    asset_id: UUID | None = None
    detected_at: date | None = None
    source: str | None = Field(default=None, max_length=120)
    status: Literal["open", "in_progress", "mitigated", "resolved", "accepted"] | None = None
    remediation: str | None = None
    due_date: date | None = None


class VulnerabilityRead(ORMModel):
    id: UUID
    title: str
    cve_id: str | None = None
    cvss_score: float | None = None
    severity: str
    asset_id: UUID | None = None
    asset_label: str | None = None
    detected_at: date | None = None
    source: str | None = None
    status: str
    remediation: str | None = None
    due_date: date | None = None
    resolved_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class BackupCheckCreate(BaseModel):
    scope: str = Field(min_length=1, max_length=120)
    backup_type: str | None = Field(default=None, max_length=60)
    run_at: datetime | None = None
    status: Literal["success", "partial", "failed", "running"]
    size_bytes: int | None = Field(default=None, ge=0)
    duration_minutes: int | None = Field(default=None, ge=0)
    restore_tested_at: date | None = None
    restore_status: Literal["not_tested", "success", "failed"] | None = None
    notes: str | None = None


class BackupCheckUpdate(BaseModel):
    scope: str | None = Field(default=None, min_length=1, max_length=120)
    backup_type: str | None = Field(default=None, max_length=60)
    run_at: datetime | None = None
    status: Literal["success", "partial", "failed", "running"] | None = None
    size_bytes: int | None = Field(default=None, ge=0)
    duration_minutes: int | None = Field(default=None, ge=0)
    restore_tested_at: date | None = None
    restore_status: Literal["not_tested", "success", "failed"] | None = None
    notes: str | None = None


class BackupCheckRead(ORMModel):
    id: UUID
    scope: str
    backup_type: str | None = None
    run_at: datetime
    status: str
    size_bytes: int | None = None
    duration_minutes: int | None = None
    restore_tested_at: date | None = None
    restore_status: str | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


class CertificateCreate(BaseModel):
    common_name: str = Field(min_length=1, max_length=255)
    issuer: str | None = Field(default=None, max_length=255)
    valid_from: date | None = None
    valid_to: date
    owner_user_id: UUID | None = None
    status: Literal["active", "expiring", "expired", "revoked"] = "active"
    auto_renew: bool = False
    notes: str | None = None


class CertificateUpdate(BaseModel):
    common_name: str | None = Field(default=None, min_length=1, max_length=255)
    issuer: str | None = Field(default=None, max_length=255)
    valid_from: date | None = None
    valid_to: date | None = None
    owner_user_id: UUID | None = None
    status: Literal["active", "expiring", "expired", "revoked"] | None = None
    auto_renew: bool | None = None
    notes: str | None = None


class CertificateRead(ORMModel):
    id: UUID
    common_name: str
    issuer: str | None = None
    valid_from: date | None = None
    valid_to: date
    owner_user_id: UUID | None = None
    owner: TicketUserRef | None = None
    status: str
    auto_renew: bool
    notes: str | None = None
    days_to_expiry: int | None = None
    alert_level: str | None = None
    created_at: datetime
    updated_at: datetime


class SecurityAuditCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    auditor: str | None = Field(default=None, max_length=255)
    type: str | None = Field(default=None, max_length=60)
    planned_at: date | None = None
    completed_at: date | None = None
    status: Literal["planned", "in_progress", "done", "cancelled"] = "planned"
    findings: str | None = None


class SecurityAuditUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    auditor: str | None = Field(default=None, max_length=255)
    type: str | None = Field(default=None, max_length=60)
    planned_at: date | None = None
    completed_at: date | None = None
    status: Literal["planned", "in_progress", "done", "cancelled"] | None = None
    findings: str | None = None


class SecurityAuditRead(ORMModel):
    id: UUID
    title: str
    auditor: str | None = None
    type: str | None = None
    planned_at: date | None = None
    completed_at: date | None = None
    status: str
    findings: str | None = None
    created_at: datetime
    updated_at: datetime


class SecurityOverview(BaseModel):
    open_incidents: int
    critical_incidents: int
    open_actions: int
    overdue_actions: int
    open_vulnerabilities: int
    critical_vulnerabilities: int
    expiring_certificates: int
    last_backup_status: str | None = None
    last_backup_at: datetime | None = None
