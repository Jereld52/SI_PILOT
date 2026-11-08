import app.models  # noqa: F401
from app.db.base import Base
from app.models.audit import AuditLog
from app.models.setting import Setting
from app.seed.reference_data import seed_reference_data
from app.services import setup_service
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker


def test_setup_initializes_admin_and_branding():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    with session_factory() as db:
        seed_reference_data(db)
        user = setup_service.initialize(
            db,
            app_name="SI PILOT",
            organization_name="Structure de test",
            tagline="Pilotage du SI",
            description="Description de test.",
            primary_color="#1A4D6D",
            support_email="support@example.org",
            first_name="Ada",
            last_name="Lovelace",
            email="ada@example.org",
            password="Initial2026!",
        )
        assert user.email == "ada@example.org"
        assert user.role.code == "admin"
        assert user.is_active is True

        stored = db.scalar(select(Setting).where(Setting.key == "app.organization"))
        assert stored is not None
        assert stored.value_json == '"Structure de test"'
        color = db.scalar(select(Setting).where(Setting.key == "app.primary_color"))
        assert color is not None
        assert color.value_json == '"#1a4d6d"'

        audit = db.scalar(select(AuditLog).where(AuditLog.action == "setup_completed"))
        assert audit is not None
        assert "Structure de test" in (audit.after_json or "")

        assert setup_service.get_status(db).needs_setup is False
        try:
            setup_service.initialize(
                db,
                app_name="SI PILOT",
                organization_name="Autre structure",
                tagline="",
                description="",
                primary_color="#772B2F",
                support_email=None,
                first_name="Grace",
                last_name="Hopper",
                email="grace@example.org",
                password="Initial2026!",
            )
        except Exception as exc:  # noqa: BLE001
            assert getattr(exc, "code", "") == "CONFLICT"
        else:
            raise AssertionError("Une seconde initialisation aurait dû être refusée.")
    engine.dispose()


def test_setup_status_is_public(client):
    response = client.get("/api/v1/setup/status")
    assert response.status_code == 200
    body = response.json()
    assert body["database"] == "ok"
    assert "needs_setup" in body


def test_setup_is_refused_when_an_admin_exists(admin_client):
    client, _ = admin_client
    response = client.post(
        "/api/v1/setup/initialize",
        data={
            "organization_name": "Autre structure",
            "app_name": "SI PILOT",
            "first_name": "Grace",
            "last_name": "Hopper",
            "email": "grace@example.org",
            "password": "Initial2026!",
        },
    )
    assert response.status_code == 409, response.text
