from pydantic import BaseModel, Field


class OcrSettingsRead(BaseModel):
    enabled: bool
    tesseract_command: str
    language: str
    max_pages: int
    dpi: int
    tessdata_dir: str
    available: bool
    version: str | None = None


class OcrSettingsUpdate(BaseModel):
    enabled: bool = True
    tesseract_command: str = Field(default="", max_length=500)
    language: str = Field(default="fra+eng", min_length=1, max_length=60)
    max_pages: int = Field(default=10, ge=1, le=50)
    dpi: int = Field(default=200, ge=120, le=400)
    tessdata_dir: str = Field(default="", max_length=500)
