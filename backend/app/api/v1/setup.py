from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from pydantic import EmailStr
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.setup import SetupResult, SetupStatus
from app.services import branding_service, setup_service

router = APIRouter(prefix="/setup", tags=["Installation"])


@router.get("/status", response_model=SetupStatus)
def setup_status(db: Session = Depends(get_db)) -> SetupStatus:
    return setup_service.get_status(db)


@router.post("/initialize", response_model=SetupResult, status_code=201)
async def initialize(
    request: Request,
    organization_name: str = Form(..., min_length=1, max_length=120),
    app_name: str = Form("SI PILOT", min_length=1, max_length=80),
    tagline: str = Form("", max_length=200),
    description: str = Form("", max_length=600),
    primary_color: str = Form("#772B2F", max_length=7),
    support_email: EmailStr | None = Form(None),
    first_name: str = Form(..., min_length=1, max_length=120),
    last_name: str = Form(..., min_length=1, max_length=120),
    email: EmailStr = Form(...),
    password: str = Form(..., min_length=1, max_length=255),
    logo: UploadFile | None = File(None),
    db: Session = Depends(get_db),
) -> SetupResult:
    content = None
    if logo is not None:
        content = await logo.read(branding_service.LOGO_MAX_BYTES + 1)
    user = setup_service.initialize(
        db,
        app_name=app_name,
        organization_name=organization_name,
        tagline=tagline,
        description=description,
        primary_color=primary_color,
        support_email=str(support_email) if support_email else None,
        first_name=first_name,
        last_name=last_name,
        email=str(email),
        password=password,
        logo_content=content,
        logo_name=(logo.filename or "logo")[:255] if logo else None,
        request=request,
    )
    return SetupResult(
        user_id=str(user.id),
        email=user.email,
        message="Installation terminée. Vous pouvez vous connecter.",
    )
