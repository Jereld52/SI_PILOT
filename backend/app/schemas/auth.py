from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.security import validate_password_strength
from app.schemas.common import ORMModel


class PermissionRead(ORMModel):
    id: UUID
    code: str
    module: str
    action: str
    description: str | None = None


class RoleRead(ORMModel):
    id: UUID
    code: str
    name: str
    description: str | None = None
    data_scope_default: str
    is_system: bool


class RoleWithPermissions(RoleRead):
    permissions: list[PermissionRead] = []


class UserRead(ORMModel):
    id: UUID
    email: str
    first_name: str
    last_name: str
    role_id: UUID
    role: RoleRead
    data_scope: str
    is_active: bool
    must_change_password: bool
    mfa_enabled: bool = False
    last_login_at: datetime | None = None
    created_at: datetime


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class LoginResponse(BaseModel):
    user: UserRead | None = None
    permissions: list[str] = Field(default_factory=list)
    csrf_token: str = ""
    expires_at: datetime | None = None
    mfa_required: bool = False
    challenge_token: str | None = None


class MfaStatusResponse(BaseModel):
    enabled: bool
    configured: bool


class MfaSetupResponse(BaseModel):
    secret: str
    provisioning_uri: str
    qr_code_data_url: str


class MfaCodeRequest(BaseModel):
    code: str = Field(min_length=6, max_length=32)


class MfaEnableResponse(BaseModel):
    message: str
    recovery_codes: list[str]


class MfaVerifyRequest(BaseModel):
    challenge_token: str = Field(min_length=20, max_length=200)
    code: str = Field(min_length=6, max_length=32)


class MfaDisableRequest(BaseModel):
    password: str = Field(min_length=1, max_length=128)
    code: str = Field(min_length=6, max_length=32)


class SessionRead(BaseModel):
    id: UUID
    ip: str | None = None
    user_agent: str | None = None
    created_at: datetime
    last_seen_at: datetime
    expires_at: datetime
    is_current: bool = False


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=12, max_length=128)

    @field_validator("new_password")
    @classmethod
    def strong_password(cls, value: str) -> str:
        errors = validate_password_strength(value)
        if errors:
            raise ValueError(" ".join(errors))
        return value


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=20)
    new_password: str = Field(min_length=12, max_length=128)

    @field_validator("new_password")
    @classmethod
    def strong_password(cls, value: str) -> str:
        errors = validate_password_strength(value)
        if errors:
            raise ValueError(" ".join(errors))
        return value


class UserCreateRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    role_id: UUID
    data_scope: Literal["all", "service", "own"] = "own"
    is_active: bool = True

    @field_validator("password")
    @classmethod
    def strong_password(cls, value: str) -> str:
        errors = validate_password_strength(value)
        if errors:
            raise ValueError(" ".join(errors))
        return value


class UserUpdateRequest(BaseModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name: str | None = Field(default=None, min_length=1, max_length=100)
    role_id: UUID | None = None
    data_scope: Literal["all", "service", "own"] | None = None
    is_active: bool | None = None


class AdminResetPasswordRequest(BaseModel):
    new_password: str = Field(min_length=12, max_length=128)

    @field_validator("new_password")
    @classmethod
    def strong_password(cls, value: str) -> str:
        errors = validate_password_strength(value)
        if errors:
            raise ValueError(" ".join(errors))
        return value


class RolePermissionsUpdateRequest(BaseModel):
    permission_codes: list[str]


class MeResponse(BaseModel):
    user: UserRead
    permissions: list[str]
    modules: list[str]
