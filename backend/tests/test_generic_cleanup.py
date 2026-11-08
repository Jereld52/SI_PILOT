from app.core.permissions import ALL_PERMISSION_CODES
from app.seed.reference_data import DEFAULT_SETTINGS


def test_ai_integration_uses_generic_names():
    codes = set(ALL_PERMISSION_CODES)
    assert {"ai.use", "ai.configure"} <= codes

    keys = {row[0] for row in DEFAULT_SETTINGS}
    assert {"ai.enabled", "ai.base_url", "ai.model"} <= keys
