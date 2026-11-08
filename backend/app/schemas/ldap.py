from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class LdapConfigRead(BaseModel):
    enabled: bool
    url: str
    base_dn: str
    bind_dn: str
    user_filter: str
    tls_verify: bool
    bind_password_set: bool
    users_base_dn: str = ""
    groups_base_dn: str = ""
    write_enabled: bool = False
    upn_suffix: str = ""


class LdapConfigUpdate(BaseModel):
    enabled: bool = False
    url: str = Field(default="", max_length=255)
    base_dn: str = Field(default="", max_length=500)
    bind_dn: str = Field(default="", max_length=500)
    bind_password: str | None = Field(default=None, max_length=500)
    user_filter: str = Field(default="", max_length=1000)
    tls_verify: bool = True
    users_base_dn: str = Field(default="", max_length=500)
    groups_base_dn: str = Field(default="", max_length=500)
    write_enabled: bool = False
    upn_suffix: str = Field(default="", max_length=120)


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


class LdapDirectoryGroup(BaseModel):
    distinguished_name: str
    name: str
    description: str | None = None
    member_count: int | None = None


class LdapDirectoryUser(BaseModel):
    distinguished_name: str
    login: str
    email: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    display_name: str | None = None
    department: str | None = None
    title: str | None = None
    phone: str | None = None
    enabled: bool = True
    groups: list[LdapDirectoryGroup] = Field(default_factory=list)


class LdapDirectoryUserList(BaseModel):
    total: int
    truncated: bool = False
    rows: list[LdapDirectoryUser] = Field(default_factory=list)


class LdapDirectoryGroupList(BaseModel):
    total: int
    rows: list[LdapDirectoryGroup] = Field(default_factory=list)


class LdapDirectoryUserCreate(BaseModel):
    login: str = Field(min_length=1, max_length=20)
    first_name: str = Field(min_length=1, max_length=120)
    last_name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str | None = Field(default=None, min_length=8, max_length=255)
    department: str | None = Field(default=None, max_length=180)
    title: str | None = Field(default=None, max_length=180)
    phone: str | None = Field(default=None, max_length=60)


class LdapDirectoryUserUpdate(BaseModel):
    user_dn: str = Field(min_length=1, max_length=1000)
    first_name: str | None = Field(default=None, max_length=120)
    last_name: str | None = Field(default=None, max_length=120)
    email: EmailStr | None = None
    department: str | None = Field(default=None, max_length=180)
    title: str | None = Field(default=None, max_length=180)
    phone: str | None = Field(default=None, max_length=60)
    enabled: bool | None = None
    password: str | None = Field(default=None, min_length=8, max_length=255)


class LdapGroupMembershipUpdate(BaseModel):
    user_dn: str = Field(min_length=1, max_length=1000)
    add_group_dns: list[str] = Field(default_factory=list)
    remove_group_dns: list[str] = Field(default_factory=list)


class LdapDirectoryActionResponse(BaseModel):
    success: bool = True
    message: str
    user: LdapDirectoryUser | None = None
