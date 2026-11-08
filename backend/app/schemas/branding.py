from __future__ import annotations

import re

from pydantic import BaseModel, EmailStr, Field, field_validator

HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


class BrandingUpdate(BaseModel):
    app_name: str = Field(min_length=1, max_length=80)
    organization_name: str = Field(min_length=1, max_length=120)
    tagline: str = Field(default="", max_length=200)
    description: str = Field(default="", max_length=600)
    support_email: EmailStr | None = None
    primary_color: str = Field(default="#772B2F", max_length=7)

    @field_validator("app_name", "organization_name", "tagline", "description")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("app_name", "organization_name")
    @classmethod
    def require_text(cls, value: str) -> str:
        if not value:
            raise ValueError("Cette valeur est obligatoire.")
        return value

    @field_validator("primary_color")
    @classmethod
    def validate_color(cls, value: str) -> str:
        if not HEX_COLOR.fullmatch(value):
            raise ValueError("La couleur doit être au format #RRGGBB.")
        return value.lower()


class BrandingRead(BaseModel):
    app_name: str
    organization_name: str
    tagline: str
    description: str
    support_email: str | None = None
    primary_color: str
    logo_url: str
    logo_custom: bool
    logo_updated_at: str | None = None
    version: str
