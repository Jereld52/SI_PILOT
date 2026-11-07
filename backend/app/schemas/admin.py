from datetime import datetime
from typing import Any

from pydantic import BaseModel


class SettingRead(BaseModel):
    key: str
    value: Any
    category: str
    is_secret: bool
    description: str | None = None
    updated_at: datetime


class SettingUpdate(BaseModel):
    value: Any
