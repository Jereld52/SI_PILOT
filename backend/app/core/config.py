from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuration centrale, chargée depuis l'environnement et backend/.env."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "SI PNFor PILOTE"
    app_env: Literal["development", "test", "production"] = "development"
    app_version: str = "0.1.0"
    debug: bool = False
    api_prefix: str = "/api/v1"

    secret_key: str = Field(min_length=32)
    field_encryption_key: str = ""
    database_url: str = "sqlite:///./si_pnfor.db"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    session_cookie_name: str = "pnfor_session"
    csrf_cookie_name: str = "pnfor_csrf"
    session_idle_minutes: int = 480
    session_absolute_days: int = 7
    secure_cookies: bool = False
    cookie_domain: str | None = None
    trust_proxy_headers: bool = False

    upload_dir: str = "./data/uploads"
    max_upload_mb: int = 25
    log_level: str = "INFO"
    serve_frontend: bool = False
    frontend_dist: str = "../frontend/dist"

    sylvia_enabled: bool = False
    sylvia_base_url: str = ""
    sylvia_api_key: str = ""
    sylvia_model: str = ""
    sylvia_timeout_seconds: int = 30
    sylvia_verify_tls: bool = True

    bootstrap_admin_email: str = ""
    bootstrap_admin_password: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @field_validator("secret_key")
    @classmethod
    def validate_secret(cls, value: str) -> str:
        if value.startswith("change-me"):
            raise ValueError("SECRET_KEY doit être remplacée par une valeur aléatoire.")
        return value

    @field_validator("database_url")
    @classmethod
    def validate_database_url(cls, value: str) -> str:
        if not value.startswith(("postgresql+psycopg://", "sqlite:///")):
            raise ValueError("DATABASE_URL doit pointer vers PostgreSQL (psycopg) ou SQLite.")
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


settings = get_settings()
