from typing import Literal

from pydantic import BaseModel, Field

AssetNamingScheme = Literal[
    "prefix_seq",
    "prefix_category_seq",
    "category_seq",
    "custom",
]


class AssetNamingRead(BaseModel):
    enabled: bool
    scheme: AssetNamingScheme
    prefix: str
    sequence_length: int
    template: str
    preview: str
    sample_category_code: str
    sample_category_prefix: str


class AssetNamingUpdate(BaseModel):
    enabled: bool = False
    scheme: AssetNamingScheme = "prefix_seq"
    prefix: str = Field(default="SI", min_length=1, max_length=20)
    sequence_length: int = Field(default=4, ge=1, le=8)
    template: str = Field(default="{PREFIX}-{SEQ:4}", min_length=1, max_length=120)
