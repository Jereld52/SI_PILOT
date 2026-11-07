from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class MobileLineCreate(BaseModel):
    line_number: str = Field(min_length=1, max_length=30)
    civility: str | None = Field(default=None, max_length=20)
    holder_name: str | None = Field(default=None, max_length=180)
    role_label: str | None = Field(default=None, max_length=180)
    email: str | None = Field(default=None, max_length=255)
    siren: str | None = Field(default=None, max_length=20)
    company_name: str | None = Field(default=None, max_length=180)
    contract_number: str | None = Field(default=None, max_length=60)
    titulaire_number: str | None = Field(default=None, max_length=60)
    cf_number: str | None = Field(default=None, max_length=60)
    cf_name: str | None = Field(default=None, max_length=180)
    status: str = Field(default="Actif", max_length=30)
    activation_date: date | None = None
    commitment_end_date: date | None = None
    billing_date: date | None = None
    portability_date: date | None = None
    list_name: str | None = Field(default=None, max_length=120)
    plan_name: str | None = Field(default=None, max_length=180)
    terminal_communicating: str | None = Field(default=None, max_length=180)
    terminal_purchased: str | None = Field(default=None, max_length=180)
    imei_communicating: str | None = Field(default=None, max_length=40)
    imei_purchased: str | None = Field(default=None, max_length=40)
    out_of_bundle: float | None = Field(default=None, ge=0)
    sim_format: str | None = Field(default=None, max_length=30)
    vpn_identifier: str | None = Field(default=None, max_length=120)
    private_number: str | None = Field(default=None, max_length=30)
    terminal_change_date: date | None = None
    plan_change_date: date | None = None
    is_secondary_line: bool = False
    main_line_number: str | None = Field(default=None, max_length=30)
    master_access_id: str | None = Field(default=None, max_length=60)
    offer_type: str | None = Field(default=None, max_length=30)
    company_id: str | None = Field(default=None, max_length=60)
    notes: str | None = None


class MobileLineUpdate(BaseModel):
    civility: str | None = Field(default=None, max_length=20)
    holder_name: str | None = Field(default=None, max_length=180)
    role_label: str | None = Field(default=None, max_length=180)
    email: str | None = Field(default=None, max_length=255)
    siren: str | None = Field(default=None, max_length=20)
    company_name: str | None = Field(default=None, max_length=180)
    contract_number: str | None = Field(default=None, max_length=60)
    titulaire_number: str | None = Field(default=None, max_length=60)
    cf_number: str | None = Field(default=None, max_length=60)
    cf_name: str | None = Field(default=None, max_length=180)
    status: str | None = Field(default=None, max_length=30)
    activation_date: date | None = None
    commitment_end_date: date | None = None
    billing_date: date | None = None
    portability_date: date | None = None
    list_name: str | None = Field(default=None, max_length=120)
    plan_name: str | None = Field(default=None, max_length=180)
    terminal_communicating: str | None = Field(default=None, max_length=180)
    terminal_purchased: str | None = Field(default=None, max_length=180)
    imei_communicating: str | None = Field(default=None, max_length=40)
    imei_purchased: str | None = Field(default=None, max_length=40)
    out_of_bundle: float | None = Field(default=None, ge=0)
    sim_format: str | None = Field(default=None, max_length=30)
    vpn_identifier: str | None = Field(default=None, max_length=120)
    private_number: str | None = Field(default=None, max_length=30)
    terminal_change_date: date | None = None
    plan_change_date: date | None = None
    is_secondary_line: bool | None = None
    main_line_number: str | None = Field(default=None, max_length=30)
    master_access_id: str | None = Field(default=None, max_length=60)
    offer_type: str | None = Field(default=None, max_length=30)
    company_id: str | None = Field(default=None, max_length=60)
    notes: str | None = None


class MobileLineRead(ORMModel):
    id: UUID
    line_number: str
    civility: str | None = None
    holder_name: str | None = None
    role_label: str | None = None
    email: str | None = None
    siren: str | None = None
    company_name: str | None = None
    contract_number: str | None = None
    titulaire_number: str | None = None
    cf_number: str | None = None
    cf_name: str | None = None
    status: str
    activation_date: date | None = None
    commitment_end_date: date | None = None
    billing_date: date | None = None
    portability_date: date | None = None
    list_name: str | None = None
    plan_name: str | None = None
    terminal_communicating: str | None = None
    terminal_purchased: str | None = None
    imei_communicating: str | None = None
    imei_purchased: str | None = None
    out_of_bundle: float | None = None
    sim_format: str | None = None
    vpn_identifier: str | None = None
    private_number: str | None = None
    terminal_change_date: date | None = None
    plan_change_date: date | None = None
    is_secondary_line: bool
    main_line_number: str | None = None
    master_access_id: str | None = None
    offer_type: str | None = None
    company_id: str | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime
