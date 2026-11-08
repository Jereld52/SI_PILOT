from pydantic import BaseModel, EmailStr


class SetupStatus(BaseModel):
    needs_setup: bool
    has_admin: bool
    database: str
    app_name: str
    organization_name: str
    version: str


class SetupResult(BaseModel):
    ok: bool = True
    user_id: str
    email: EmailStr
    message: str
