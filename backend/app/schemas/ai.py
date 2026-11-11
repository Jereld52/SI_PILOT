from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

AiProvider = Literal[
    "openai",
    "azure_openai",
    "mistral",
    "groq",
    "openrouter",
    "gemini",
    "anthropic",
    "ollama",
    "openwebui",
    "custom",
]


class AiConfigRead(BaseModel):
    enabled: bool = False
    provider: str = "openai"
    base_url: str = ""
    model: str = ""
    api_key_set: bool = False
    temperature: float = 0.2
    max_tokens: int = 1200
    timeout_seconds: int = 60
    include_fleet_context: bool = True
    configured: bool = False


class AiConfigUpdate(BaseModel):
    enabled: bool = False
    provider: AiProvider = "openai"
    base_url: str = Field(default="", max_length=500)
    model: str = Field(default="", max_length=200)
    api_key: str | None = Field(default=None, max_length=500)
    temperature: float = Field(default=0.2, ge=0, le=2)
    max_tokens: int = Field(default=1200, ge=100, le=8000)
    timeout_seconds: int = Field(default=60, ge=10, le=300)
    include_fleet_context: bool = True


class AiStatusRead(BaseModel):
    enabled: bool
    configured: bool
    provider: str
    model: str


class AiTestResponse(BaseModel):
    ok: bool
    message: str
    model: str = ""
    latency_ms: int = 0


class AiChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=8000)


class AiContext(BaseModel):
    type: Literal["asset", "ticket", "meeting", "training", "communication"]
    id: UUID


class AiChatRequest(BaseModel):
    messages: list[AiChatMessage] = Field(min_length=1, max_length=20)
    include_context: bool | None = None
    context: AiContext | None = None


class AiChatResponse(BaseModel):
    message: str
    model: str
    provider: str
    duration_ms: int
    usage: dict[str, int] | None = None
    tools_used: list[str] = Field(default_factory=list)


class AiToolInfo(BaseModel):
    key: str
    label: str
    description: str
    permission: str
