from datetime import datetime

from pydantic import BaseModel, Field


class BackupFileRead(BaseModel):
    name: str
    size: int
    created_at: datetime


class BackupStatusRead(BaseModel):
    app_version: str
    schema_revision: str = ""
    database_name: str = ""
    database_host: str = ""
    database_port: int | None = None
    dialect: str = ""
    pg_dump_available: bool = False
    pg_dump_path: str = ""
    pg_restore_available: bool = False
    pg_restore_path: str = ""
    backup_directory: str = ""
    backup_count: int = 0
    last_backup_at: datetime | None = None
    last_backup_name: str | None = None
    last_backup_size: int | None = None
    uploads_directory: str = ""
    uploads_size: int = 0
    backups: list[BackupFileRead] = Field(default_factory=list)


class ConfigImportResult(BaseModel):
    imported: int
    skipped: int
    message: str


class RestoreResult(BaseModel):
    restored: bool
    safety_backup: str | None = None
    message: str
    output: str | None = None
