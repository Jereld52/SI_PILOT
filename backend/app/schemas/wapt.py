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
    package_field: str = Field(default="package", max_length=60)
    timeout_seconds: int = Field(default=30, ge=5, le=300)


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
    raw: dict[str, Any] = Field(default_factory=dict)


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
