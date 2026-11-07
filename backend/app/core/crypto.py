from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings
from app.core.errors import ValidationAppError


def _fernet() -> Fernet:
    if not settings.field_encryption_key:
        raise ValidationAppError(
            "La clé de chiffrement des secrets n'est pas configurée.",
            code="ENCRYPTION_KEY_MISSING",
        )
    try:
        return Fernet(settings.field_encryption_key.encode("ascii"))
    except (ValueError, TypeError) as exc:
        raise ValidationAppError(
            "La clé de chiffrement des secrets est invalide.",
            code="ENCRYPTION_KEY_INVALID",
        ) from exc


def encrypt_secret(value: str | None) -> str | None:
    if value is None:
        return None
    text = value.strip()
    if not text:
        return None
    return _fernet().encrypt(text.encode("utf-8")).decode("ascii")


def decrypt_secret(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return _fernet().decrypt(value.encode("ascii")).decode("utf-8")
    except InvalidToken as exc:
        raise ValidationAppError(
            "Impossible de déchiffrer le secret. Vérifiez la clé de chiffrement.",
            code="SECRET_DECRYPTION_FAILED",
        ) from exc


def mask_secret(value: str | None) -> str:
    return "••••••" if value else "—"
