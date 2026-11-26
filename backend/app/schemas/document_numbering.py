from typing import Literal

from pydantic import BaseModel, Field

DocumentNumberingScheme = Literal["short_year", "full_year", "simple"]


class DocumentNumberingRead(BaseModel):
    scheme: DocumentNumberingScheme
    sequence_length: int
    preview: str
    sample_year: int


class DocumentNumberingUpdate(BaseModel):
    scheme: DocumentNumberingScheme = "short_year"
    sequence_length: int = Field(default=4, ge=2, le=8)
