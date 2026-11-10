from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class WaptConfigRead(BaseModel):
    enabled: bool = False
    base_url: str = ""
    username: str = ""
    password_set: bool = False
    verify_tls: bool = True
    hosts_path: str = "/api/v1/hosts"
    host_detail_path: str = "/api/v1/hosts?uuid={uuid}"
    fetch_details: bool = False
    packages_path: str = "/api/v3/packages"
    host_packages_path: str = "/api/v1/host_data?uuid={uuid}&field=installed_packages"
    install_path: str = "/api/v1/hosts/{uuid}/install"
    uninstall_path: str = "/api/v1/hosts/{uuid}/uninstall"
    trigger_action_path: str = "/api/v3/trigger_host_action"
    signing_key_path: str = ""
    signing_cert_path: str = ""
    signing_key_password_set: bool = False
    package_field: str = "package"
    timeout_seconds: int = 30
    configured: bool = False


class WaptConfigUpdate(BaseModel):
    enabled: bool = False
    base_url: str = Field(default="", max_length=500)
    username: str = Field(default="", max_length=255)
    password: str | None = Field(default=None, max_length=255)
    verify_tls: bool = True
    hosts_path: str = Field(default="/api/v1/hosts", max_length=255)
    host_detail_path: str = Field(default="/api/v1/hosts?uuid={uuid}", max_length=255)
    fetch_details: bool = False
    packages_path: str = Field(default="/api/v3/packages", max_length=255)
    host_packages_path: str = Field(
        default="/api/v1/host_data?uuid={uuid}&field=installed_packages",
        max_length=255,
    )
    install_path: str = Field(default="/api/v1/hosts/{uuid}/install", max_length=255)
    uninstall_path: str = Field(default="/api/v1/hosts/{uuid}/uninstall", max_length=255)
    trigger_action_path: str = Field(
        default="/api/v3/trigger_host_action", max_length=255
    )
    signing_key_path: str = Field(default="", max_length=500)
    signing_cert_path: str = Field(default="", max_length=500)
    signing_key_password: str | None = Field(default=None, max_length=255)
    package_field: str = Field(default="package", max_length=60)
    timeout_seconds: int = Field(default=30, ge=5, le=300)


class WaptSigningTestResponse(BaseModel):
    ok: bool
    message: str
    fingerprint: str = ""
    certificate_subject: str = ""


class WaptTestResponse(BaseModel):
    ok: bool
    message: str
    host_count: int = 0
    sample_hosts: list[str] = Field(default_factory=list)


class WaptHostRead(BaseModel):
    uuid: str
    hostname: str = ""
    description: str = ""
    connected: bool = False
    last_seen: str = ""
    os_name: str = ""
    os_version: str = ""
    ip_address: str = ""
    mac_address: str = ""
    serial_number: str = ""
    manufacturer: str = ""
    model: str = ""
    last_user: str = ""
    groups: str = ""
    domain: str = ""
    wapt_version: str = ""
    raw: dict[str, Any] = Field(default_factory=dict)


class WaptPackageRead(BaseModel):
    name: str
    version: str = ""
    description: str = ""
    raw: dict[str, Any] = Field(default_factory=dict)


class WaptHostPackageRead(BaseModel):
    name: str
    version: str = ""
    installed: bool = True
    install_status: str = ""
    update_available: bool = False
    available_version: str = ""
    raw: dict[str, Any] = Field(default_factory=dict)


class WaptAssetRead(BaseModel):
    id: str
    asset_tag: str
    name: str
    hostname: str = ""
    external_id: str = ""
    os_name: str = ""
    os_version: str = ""
    update_count: int = 0


class WaptSoftwareHostRead(BaseModel):
    asset_id: str
    asset_tag: str
    name: str
    hostname: str = ""
    installed_version: str = ""
    available_version: str = ""
    last_seen: str = ""


class WaptSoftwareOverviewItem(BaseModel):
    name: str
    installed_versions: list[str] = Field(default_factory=list)
    host_count: int = 0
    update_count: int = 0
    available_version: str = ""
    hosts: list[WaptSoftwareHostRead] = Field(default_factory=list)


class WaptSoftwareSummary(BaseModel):
    total_software: int = 0
    total_installations: int = 0
    updates_available: int = 0
    hosts_with_updates: int = 0
    synced_at: datetime | None = None
    configured: bool = False


class WaptSoftwareOverview(BaseModel):
    summary: WaptSoftwareSummary
    items: list[WaptSoftwareOverviewItem] = Field(default_factory=list)


class WaptSoftwareSyncResponse(BaseModel):
    total_hosts: int
    synced_hosts: int
    packages: int
    updates: int
    skipped: int
    errors: list[str] = Field(default_factory=list)
    duration_seconds: float
    synced_at: datetime


class WaptAssetSoftwareRead(BaseModel):
    asset_id: str
    configured: bool = False
    synced_at: datetime | None = None
    packages: list[WaptHostPackageRead] = Field(default_factory=list)


class WaptSyncResponse(BaseModel):
    total: int
    created: int
    updated: int
    skipped: int
    errors: list[str] = Field(default_factory=list)
    duration_seconds: float
    synced_at: datetime


class WaptPackageAction(BaseModel):
    package: str = Field(min_length=1, max_length=255)


class WaptActionResponse(BaseModel):
    message: str
    result: dict[str, Any] | None = None
