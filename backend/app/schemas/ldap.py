from uuid import UUID

from pydantic import BaseModel, Field


class LdapConfigRead(BaseModel):
    enabled: bool
    url: str
    base_dn: str
    bind_dn: str
    user_filter: str
    tls_verify: bool
    bind_password_set: bool


class LdapConfigUpdate(BaseModel):
    enabled: bool = False
    url: str = Field(default="", max_length=255)
    base_dn: str = Field(default="", max_length=500)
    bind_dn: str = Field(default="", max_length=500)
    bind_password: str | None = Field(default=None, max_length=500)
    user_filter: str = Field(default="", max_length=1000)
    tls_verify: bool = True


class LdapTestResponse(BaseModel):
    success: bool
    message: str
    server_vendor: str | None = None
    server_version: str | None = None
    user_count: int | None = None


class LdapUserPreview(BaseModel):
    status: str
    label: str
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    login: str | None = None
    department: str | None = None
    service_name: str | None = None
    agent_id: UUID | None = None
    errors: list[str] = Field(default_factory=list)


class LdapPreviewResponse(BaseModel):
    total: int
    to_create: int
    to_update: int
    skipped: int
    errors: int
    message: str
    rows: list[LdapUserPreview] = Field(default_factory=list)


class LdapSyncRequest(BaseModel):
    update_existing: bool = True


class LdapSyncResponse(BaseModel):
    created: int
    updated: int
    skipped: int
    errors: int
    message: str
