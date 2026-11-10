from pydantic import BaseModel, Field


class ModuleRead(BaseModel):
    key: str
    label: str
    description: str
    path: str
    permission: str
    section: str
    enabled: bool


class ModuleSettingsRead(BaseModel):
    disabled: list[str] = Field(default_factory=list)
    modules: list[ModuleRead] = Field(default_factory=list)


class ModuleSettingsUpdate(BaseModel):
    disabled: list[str] = Field(default_factory=list)


class ModuleStatusRead(BaseModel):
    disabled: list[str] = Field(default_factory=list)
