from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.schemas.common import ORMModel
from app.schemas.referentials import LocationRef, ServiceRef


class AgentRef(ORMModel):
    id: UUID
    first_name: str
    last_name: str
    email_pro: str


class AgentCreate(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email_pro: EmailStr
    phone_pro: str | None = Field(default=None, max_length=50)
    service_id: UUID | None = None
    function_label: str | None = Field(default=None, max_length=150)
    location_id: UUID | None = None
    manager_agent_id: UUID | None = None
    login: str | None = Field(default=None, max_length=120)
    arrival_date: date | None = None
    departure_date: date | None = None
    status: Literal["active", "arriving", "departed", "suspended"] = "active"
    notes: str | None = None


class AgentUpdate(BaseModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name: str | None = Field(default=None, min_length=1, max_length=100)
    email_pro: EmailStr | None = None
    phone_pro: str | None = Field(default=None, max_length=50)
    service_id: UUID | None = None
    function_label: str | None = Field(default=None, max_length=150)
    location_id: UUID | None = None
    manager_agent_id: UUID | None = None
    login: str | None = Field(default=None, max_length=120)
    arrival_date: date | None = None
    departure_date: date | None = None
    status: Literal["active", "arriving", "departed", "suspended"] | None = None
    notes: str | None = None


class AgentRead(ORMModel):
    id: UUID
    first_name: str
    last_name: str
    email_pro: str
    phone_pro: str | None = None
    service_id: UUID | None = None
    service: ServiceRef | None = None
    function_label: str | None = None
    location_id: UUID | None = None
    location: LocationRef | None = None
    manager_agent_id: UUID | None = None
    login: str | None = None
    arrival_date: date | None = None
    departure_date: date | None = None
    status: str
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


class AgentAssetRead(BaseModel):
    id: UUID
    asset_tag: str
    name: str
    category_name: str | None = None
    status: str
