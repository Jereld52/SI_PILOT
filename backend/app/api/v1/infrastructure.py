from uuid import UUID

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.core.errors import NotFoundError
from app.db.session import get_db
from app.models.auth import User
from app.schemas.infrastructure import (
    InfraDependencyCreate,
    InfraDependencyRead,
    InfraEquipmentCreate,
    InfraEquipmentRead,
    InfraEquipmentUpdate,
    InfraMapRead,
    MonitoringCheckCreate,
    MonitoringCheckRead,
    MonitoringCheckUpdate,
    MonitoringResultCreate,
    MonitoringResultRead,
    SupervisionMapCreate,
    SupervisionMapRead,
    SupervisionMapUpdate,
)
from app.services import infrastructure_service

router = APIRouter(prefix="/infrastructure", tags=["Infrastructure"])


@router.get("/equipments", response_model=list[InfraEquipmentRead])
def list_equipments(
    q: str | None = Query(None, max_length=120),
    type: str | None = Query(None, max_length=30),
    status: str | None = Query(None, max_length=30),
    criticality: str | None = Query(None, max_length=20),
    _: User = Depends(require_permission("infrastructure.read")),
    db: Session = Depends(get_db),
):
    return infrastructure_service.list_equipments(
        db, q=q, type=type, status=status, criticality=criticality
    )


@router.get("/map", response_model=InfraMapRead)
def map_overview(
    _: User = Depends(require_permission("infrastructure.topology")),
    db: Session = Depends(get_db),
):
    return infrastructure_service.map_overview(db)


@router.get("/maps", response_model=list[SupervisionMapRead])
def list_maps(
    include_inactive: bool = False,
    _: User = Depends(require_permission("infrastructure.topology")),
    db: Session = Depends(get_db),
):
    return infrastructure_service.list_maps(db, include_inactive=include_inactive)


@router.post("/maps", response_model=SupervisionMapRead, status_code=201)
def create_map(
    payload: SupervisionMapCreate,
    request: Request,
    actor: User = Depends(require_permission("infrastructure.update")),
    db: Session = Depends(get_db),
):
    return infrastructure_service.create_map(db, payload, actor=actor, request=request)


@router.patch("/maps/{map_id}", response_model=SupervisionMapRead)
def update_map(
    map_id: UUID,
    payload: SupervisionMapUpdate,
    request: Request,
    actor: User = Depends(require_permission("infrastructure.update")),
    db: Session = Depends(get_db),
):
    row = infrastructure_service.get_map(db, map_id)
    return infrastructure_service.update_map(
        db, row, payload, actor=actor, request=request
    )


@router.delete("/maps/{map_id}", response_model=SupervisionMapRead)
def archive_map(
    map_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("infrastructure.update")),
    db: Session = Depends(get_db),
):
    row = infrastructure_service.get_map(db, map_id)
    return infrastructure_service.archive_map(db, row, actor=actor, request=request)


@router.get("/maps/{map_id}/background")
def get_map_background(
    map_id: UUID,
    _: User = Depends(require_permission("infrastructure.topology")),
    db: Session = Depends(get_db),
):
    row = infrastructure_service.get_map(db, map_id)
    path = infrastructure_service.background_path(row)
    if path is None or not path.exists():
        raise NotFoundError("Image de plan introuvable.")
    media_types = {".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp"}
    return FileResponse(
        path,
        media_type=media_types.get(path.suffix.lower(), "application/octet-stream"),
        headers={"Cache-Control": "private, max-age=300"},
    )


@router.post("/maps/{map_id}/background", response_model=SupervisionMapRead)
async def upload_map_background(
    map_id: UUID,
    request: Request,
    file: UploadFile = File(...),
    actor: User = Depends(require_permission("infrastructure.update")),
    db: Session = Depends(get_db),
):
    row = infrastructure_service.get_map(db, map_id)
    content = await file.read()
    return infrastructure_service.save_background(
        db,
        row,
        content=content,
        original_name=file.filename or "plan",
        actor=actor,
        request=request,
    )


@router.delete("/maps/{map_id}/background", response_model=SupervisionMapRead)
def delete_map_background(
    map_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("infrastructure.update")),
    db: Session = Depends(get_db),
):
    row = infrastructure_service.get_map(db, map_id)
    return infrastructure_service.delete_background(
        db, row, actor=actor, request=request
    )


@router.post("/equipments", response_model=InfraEquipmentRead, status_code=201)
def create_equipment(
    payload: InfraEquipmentCreate,
    request: Request,
    actor: User = Depends(require_permission("infrastructure.create")),
    db: Session = Depends(get_db),
):
    return infrastructure_service.create_equipment(
        db, payload, actor=actor, request=request
    )


@router.get("/equipments/{equipment_id}", response_model=InfraEquipmentRead)
def get_equipment(
    equipment_id: UUID,
    _: User = Depends(require_permission("infrastructure.read")),
    db: Session = Depends(get_db),
):
    return InfraEquipmentRead.model_validate(
        infrastructure_service.get_equipment(db, equipment_id)
    )


@router.patch("/equipments/{equipment_id}", response_model=InfraEquipmentRead)
def update_equipment(
    equipment_id: UUID,
    payload: InfraEquipmentUpdate,
    request: Request,
    actor: User = Depends(require_permission("infrastructure.update")),
    db: Session = Depends(get_db),
):
    equipment = infrastructure_service.get_equipment(db, equipment_id)
    return infrastructure_service.update_equipment(
        db, equipment, payload, actor=actor, request=request
    )


@router.delete("/equipments/{equipment_id}", response_model=InfraEquipmentRead)
def archive_equipment(
    equipment_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("infrastructure.delete")),
    db: Session = Depends(get_db),
):
    equipment = infrastructure_service.get_equipment(db, equipment_id)
    return infrastructure_service.archive_equipment(
        db, equipment, actor=actor, request=request
    )


@router.get("/dependencies", response_model=list[InfraDependencyRead])
def list_dependencies(
    _: User = Depends(require_permission("infrastructure.read")),
    db: Session = Depends(get_db),
):
    return infrastructure_service.list_dependencies(db)


@router.post("/dependencies", response_model=InfraDependencyRead, status_code=201)
def create_dependency(
    payload: InfraDependencyCreate,
    request: Request,
    actor: User = Depends(require_permission("infrastructure.create")),
    db: Session = Depends(get_db),
):
    return infrastructure_service.create_dependency(
        db, payload, actor=actor, request=request
    )


@router.delete("/dependencies/{dependency_id}", status_code=204)
def delete_dependency(
    dependency_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("infrastructure.delete")),
    db: Session = Depends(get_db),
):
    dependency = infrastructure_service.get_dependency(db, dependency_id)
    infrastructure_service.delete_dependency(
        db, dependency, actor=actor, request=request
    )


@router.get("/checks", response_model=list[MonitoringCheckRead])
def list_checks(
    infra_id: UUID | None = None,
    _: User = Depends(require_permission("infrastructure.read")),
    db: Session = Depends(get_db),
):
    return infrastructure_service.list_checks(db, infra_id=infra_id)


@router.post("/checks", response_model=MonitoringCheckRead, status_code=201)
def create_check(
    payload: MonitoringCheckCreate,
    request: Request,
    actor: User = Depends(require_permission("infrastructure.create")),
    db: Session = Depends(get_db),
):
    return infrastructure_service.create_check(db, payload, actor=actor, request=request)


@router.patch("/checks/{check_id}", response_model=MonitoringCheckRead)
def update_check(
    check_id: UUID,
    payload: MonitoringCheckUpdate,
    request: Request,
    actor: User = Depends(require_permission("infrastructure.update")),
    db: Session = Depends(get_db),
):
    check = infrastructure_service.get_check(db, check_id)
    return infrastructure_service.update_check(
        db, check, payload, actor=actor, request=request
    )


@router.delete("/checks/{check_id}", status_code=204)
def delete_check(
    check_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("infrastructure.delete")),
    db: Session = Depends(get_db),
):
    check = infrastructure_service.get_check(db, check_id)
    infrastructure_service.delete_check(db, check, actor=actor, request=request)


@router.post("/checks/{check_id}/authorize", response_model=MonitoringCheckRead)
def authorize_check(
    check_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("infrastructure.monitoring.authorize")),
    db: Session = Depends(get_db),
):
    check = infrastructure_service.get_check(db, check_id)
    return infrastructure_service.authorize_check(
        db, check, actor=actor, request=request
    )


@router.get("/checks/{check_id}/results", response_model=list[MonitoringResultRead])
def list_results(
    check_id: UUID,
    _: User = Depends(require_permission("infrastructure.read")),
    db: Session = Depends(get_db),
):
    infrastructure_service.get_check(db, check_id)
    return infrastructure_service.list_results(db, check_id)


@router.post(
    "/checks/{check_id}/results",
    response_model=MonitoringResultRead,
    status_code=201,
)
def add_result(
    check_id: UUID,
    payload: MonitoringResultCreate,
    request: Request,
    actor: User = Depends(require_permission("infrastructure.update")),
    db: Session = Depends(get_db),
):
    check = infrastructure_service.get_check(db, check_id)
    return infrastructure_service.add_result(
        db, check, payload, actor=actor, request=request
    )
