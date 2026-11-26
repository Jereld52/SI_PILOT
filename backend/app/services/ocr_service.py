from __future__ import annotations

import os
import shutil
import subprocess
from dataclasses import dataclass
from functools import lru_cache
from io import BytesIO
from pathlib import Path
from typing import Any

import pymupdf as fitz
import pytesseract
from app.core.errors import ValidationAppError
from app.schemas.ocr import OcrSettingsRead, OcrSettingsUpdate
from app.services import settings_service
from PIL import Image
from sqlalchemy.orm import Session

BACKEND_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_LANGUAGE = "fra+eng"
DEFAULT_MAX_PAGES = 10
DEFAULT_DPI = 200
COMMON_WINDOWS_PATHS = (
    Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe"),
    Path(r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe"),
    Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Tesseract-OCR" / "tesseract.exe",
)


@dataclass(frozen=True)
class OcrConfig:
    enabled: bool
    command: str | None
    language: str
    max_pages: int
    dpi: int
    tessdata_dir: str | None


def _value(db: Session, key: str, default: Any) -> Any:
    value = settings_service.get_value(db, key, default)
    return default if value is None else value


def _resolve_command(db: Session) -> str | None:
    configured = str(_value(db, "ocr.tesseract_command", "") or "").strip()
    candidates = [
        configured or None,
        os.environ.get("TESSERACT_CMD"),
        shutil.which("tesseract"),
        *(str(path) for path in COMMON_WINDOWS_PATHS),
    ]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return candidate
    return None


def _resolve_tessdata(db: Session) -> str | None:
    configured = str(_value(db, "ocr.tessdata_dir", "") or "").strip()
    candidates = [
        configured or None,
        os.environ.get("TESSDATA_PREFIX"),
        str(BACKEND_ROOT / "tessdata") if (BACKEND_ROOT / "tessdata").is_dir() else None,
    ]
    for candidate in candidates:
        if candidate and Path(candidate).is_dir():
            return candidate
    return None


def get_config(db: Session) -> OcrConfig:
    return OcrConfig(
        enabled=bool(_value(db, "ocr.enabled", True)),
        command=_resolve_command(db),
        language=str(_value(db, "ocr.language", DEFAULT_LANGUAGE) or DEFAULT_LANGUAGE),
        max_pages=max(
            1,
            min(50, int(_value(db, "ocr.max_pages", DEFAULT_MAX_PAGES))),
        ),
        dpi=max(120, min(400, int(_value(db, "ocr.dpi", DEFAULT_DPI)))),
        tessdata_dir=_resolve_tessdata(db),
    )


@lru_cache(maxsize=8)
def _version_for(command: str) -> str | None:
    try:
        result = subprocess.run(
            [command, "--version"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    except OSError:
        return None
    first_line = (result.stdout or result.stderr or "").splitlines()
    return first_line[0].strip() if first_line else None


def read_settings(db: Session) -> OcrSettingsRead:
    config = get_config(db)
    version = _version_for(config.command) if config.command else None
    return OcrSettingsRead(
        enabled=config.enabled,
        tesseract_command=str(_value(db, "ocr.tesseract_command", "") or ""),
        language=config.language,
        max_pages=config.max_pages,
        dpi=config.dpi,
        tessdata_dir=str(_value(db, "ocr.tessdata_dir", "") or ""),
        available=bool(config.command),
        version=version,
    )


def update_settings(
    db: Session,
    payload: OcrSettingsUpdate,
    *,
    actor: Any,
    request: Any = None,
) -> OcrSettingsRead:
    from app.services.audit_service import write_audit

    before = read_settings(db)
    values = {
        "ocr.enabled": payload.enabled,
        "ocr.tesseract_command": payload.tesseract_command.strip(),
        "ocr.language": payload.language.strip() or DEFAULT_LANGUAGE,
        "ocr.max_pages": payload.max_pages,
        "ocr.dpi": payload.dpi,
        "ocr.tessdata_dir": payload.tessdata_dir.strip(),
    }
    descriptions = {
        "ocr.enabled": "Activer l'OCR pour les PDF scannés et les images",
        "ocr.tesseract_command": "Chemin vers tesseract.exe (vide = détection automatique)",
        "ocr.language": "Langues OCR Tesseract (ex. fra+eng)",
        "ocr.max_pages": "Nombre maximum de pages PDF analysées par OCR",
        "ocr.dpi": "Résolution de rendu PDF pour l'OCR",
        "ocr.tessdata_dir": "Dossier des données de langue Tesseract",
    }
    for key, value in values.items():
        settings_service.set_value(
            db,
            key,
            value,
            category="general",
            description=descriptions[key],
        )
    db.flush()
    after = read_settings(db)
    write_audit(
        db,
        module="settings",
        action="ocr_settings_updated",
        actor=actor,
        entity_type="setting",
        entity_id="ocr",
        entity_label="OCR",
        before=before.model_dump(mode="json"),
        after=after.model_dump(mode="json"),
        request=request,
    )
    db.commit()
    return after


def _configure(config: OcrConfig) -> None:
    if config.tessdata_dir:
        os.environ["TESSDATA_PREFIX"] = config.tessdata_dir
    if config.command:
        pytesseract.pytesseract.tesseract_cmd = config.command


def _ocr_image(image: Image.Image, config: OcrConfig) -> str:
    _configure(config)
    configuration = ""
    try:
        return pytesseract.image_to_string(
            image,
            lang=config.language,
            config=configuration,
        ).strip()
    except pytesseract.TesseractError:
        try:
            return pytesseract.image_to_string(
                image,
                lang="eng",
                config=configuration,
            ).strip()
        except pytesseract.TesseractError as exc:
            raise ValidationAppError(
                "OCR impossible. Vérifiez l'installation de Tesseract et les langues "
                f"disponibles ({exc})."
            ) from exc


def _ensure_available(config: OcrConfig) -> None:
    if not config.enabled:
        raise ValidationAppError(
            "L'OCR est désactivé. Activez-le dans Administration → Paramètres → OCR."
        )
    if not config.command:
        raise ValidationAppError(
            "Tesseract OCR est introuvable. Installez Tesseract-OCR puis vérifiez le "
            "chemin dans Administration → Paramètres → OCR."
        )


def extract_image_text(content: bytes, config: OcrConfig) -> str:
    _ensure_available(config)
    try:
        image = Image.open(BytesIO(content))
        image.load()
    except Exception as exc:  # noqa: BLE001 - message explicite
        raise ValidationAppError(f"Lecture de l'image impossible : {exc}") from exc
    text = _ocr_image(image.convert("RGB"), config)
    if not text:
        raise ValidationAppError(
            "Aucun texte n'a été détecté dans l'image. Vérifiez la qualité du scan."
        )
    return text


def extract_pdf_text(content: bytes, config: OcrConfig) -> str:
    _ensure_available(config)
    try:
        document = fitz.open(stream=content, filetype="pdf")
    except Exception as exc:  # noqa: BLE001 - message explicite
        raise ValidationAppError(f"Lecture du PDF impossible : {exc}") from exc
    parts: list[str] = []
    matrix = fitz.Matrix(config.dpi / 72, config.dpi / 72)
    try:
        page_count = min(document.page_count, config.max_pages)
        for index in range(page_count):
            page = document.load_page(index)
            pixmap = page.get_pixmap(matrix=matrix, colorspace=fitz.csRGB)
            image = Image.frombytes(
                "RGB",
                (pixmap.width, pixmap.height),
                pixmap.samples,
            )
            page_text = _ocr_image(image, config)
            if page_text:
                parts.append(page_text)
    finally:
        document.close()
    text = "\n\n".join(parts).strip()
    if not text:
        raise ValidationAppError(
            "Aucun texte n'a été détecté par OCR. Vérifiez la qualité du scan."
        )
    return text
