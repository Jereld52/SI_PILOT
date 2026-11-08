from pydantic import BaseModel, EmailStr, Field


class SmtpSettingsRead(BaseModel):
    host: str = ""
    port: int = 587
    username: str = ""
    from_email: str = ""
    from_name: str = "SI PNFor PILOTE"
    use_tls: bool = True
    use_ssl: bool = False
    email_enabled: bool = False
    password_set: bool = False
    configured: bool = False


class SmtpSettingsUpdate(BaseModel):
    host: str = Field(default="", max_length=255)
    port: int = Field(default=587, ge=1, le=65535)
    username: str = Field(default="", max_length=255)
    password: str | None = Field(default=None, max_length=255)
    from_email: str = Field(default="", max_length=255)
    from_name: str = Field(default="SI PNFor PILOTE", max_length=150)
    use_tls: bool = True
    use_ssl: bool = False
    email_enabled: bool = False


class SmtpTestRequest(BaseModel):
    to_email: EmailStr
