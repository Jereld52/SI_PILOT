import os
from pathlib import Path

os.environ["APP_ENV"] = "test"
os.environ["DATABASE_URL"] = "sqlite:///./test_si_pnfor.db"
os.environ["SECRET_KEY"] = "test-secret-key-with-more-than-thirty-two-characters"
os.environ["SECURE_COOKIES"] = "false"
os.environ["LOG_LEVEL"] = "WARNING"

import app.models  # noqa: F401
import pytest
from app.core.security import hash_password
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.main import app
from app.models.auth import Role, User
from app.seed.reference_data import seed_reference_data
from fastapi.testclient import TestClient
from sqlalchemy import select

TEST_DB = Path("test_si_pnfor.db")
ADMIN_EMAIL = "admin.test@pnfor.fr"
ADMIN_PASSWORD = "AdminTest2026!"


@pytest.fixture(scope="session", autouse=True)
def database():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed_reference_data(db)
    yield
    Base.metadata.drop_all(engine)
    engine.dispose()
    if TEST_DB.exists():
        TEST_DB.unlink(missing_ok=True)


@pytest.fixture(scope="session")
def admin_user(database):
    with SessionLocal() as db:
        role = db.scalar(select(Role).where(Role.code == "admin"))
        existing = db.scalar(select(User).where(User.email == ADMIN_EMAIL))
        if existing:
            return existing
        user = User(
            email=ADMIN_EMAIL,
            password_hash=hash_password(ADMIN_PASSWORD),
            first_name="Admin",
            last_name="Test",
            role_id=role.id,
            data_scope="all",
            is_active=True,
            must_change_password=False,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def admin_client(client, admin_user):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert response.status_code == 200, response.text
    return client, response.json()["csrf_token"]


@pytest.fixture
def csrf_headers():
    def build(token: str) -> dict[str, str]:
        return {"X-CSRF-Token": token}

    return build
