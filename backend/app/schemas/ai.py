from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel

AiProvider = Literal[
    "openai",
    "azure_openai",
    "mistral",
    "groq",
    "openrouter",
    "gemini",
    "anthropic",
    "albert",
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


class AiModelsResponse(BaseModel):
    provider: str
    models: list[str] = Field(default_factory=list)
    message: str = ""


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


class AiActionProposal(BaseModel):
    type: Literal[
        "create_action",
        "create_ticket",
        "create_meeting",
        "create_communication",
        "create_quote",
        "create_purchase_order",
        "create_document",
    ]
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=4000)
    content: str | None = Field(default=None, max_length=20000)
    priority: Literal["low", "medium", "high", "critical"] = "medium"
    due_date: date | None = None
    category: str | None = Field(default=None, max_length=50)
    scheduled_at: datetime | None = None
    duration_minutes: int | None = Field(default=60, ge=5, le=1440)
    location: str | None = Field(default=None, max_length=255)
    supplier_name: str | None = Field(default=None, max_length=150)
    engagement_number: str | None = Field(default=None, max_length=80)
    reference: str | None = Field(default=None, max_length=80)
    amount_ht: float | None = Field(default=None, ge=0)
    amount_ttc: float | None = Field(default=None, ge=0)
    vat_rate: float | None = Field(default=None, ge=0, le=100)
    expected_date: date | None = None
    source_quote_reference: str | None = Field(default=None, max_length=80)


class AiSource(BaseModel):
    kind: str
    id: str
    title: str
    subtitle: str | None = None
    link: str = ""
    excerpt: str | None = None


class AiChatResponse(BaseModel):
    message: str
    model: str
    provider: str
    duration_ms: int
    usage: dict[str, int] | None = None
    tools_used: list[str] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)
    actions: list[AiActionProposal] = Field(default_factory=list)
    sources: list[AiSource] = Field(default_factory=list)


class AiActionExecuteResponse(BaseModel):
    message: str
    link: str = ""


class AiConversationContext(BaseModel):
    type: str = Field(min_length=1, max_length=30)
    id: UUID | None = None
    label: str | None = Field(default=None, max_length=255)


class AiConversationCreate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    context: AiConversationContext | None = None


class AiConversationUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    archived: bool | None = None


class AiConversationRead(ORMModel):
    id: UUID
    title: str
    context_type: str | None = None
    context_label: str | None = None
    archived_at: datetime | None = None
    last_message_at: datetime
    message_count: int
    created_at: datetime
    updated_at: datetime


class AiMessageRead(BaseModel):
    id: UUID
    role: Literal["user", "assistant", "system"]
    content: str
    tools_used: list[str] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)
    actions: list[AiActionProposal] = Field(default_factory=list)
    sources: list[AiSource] = Field(default_factory=list)
    actions_done: bool = False
    actions_ignored: bool = False
    created_at: datetime


class AiConversationDetail(AiConversationRead):
    messages: list[AiMessageRead] = Field(default_factory=list)


class AiConversationMessageRequest(BaseModel):
    content: str = Field(min_length=1, max_length=8000)
    include_context: bool | None = None


class AiConversationChatResponse(BaseModel):
    conversation: AiConversationRead
    user_message: AiMessageRead
    assistant_message: AiMessageRead
    model: str
    provider: str
    duration_ms: int
    usage: dict[str, int] | None = None
    tools_used: list[str] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)
    actions: list[AiActionProposal] = Field(default_factory=list)
    sources: list[AiSource] = Field(default_factory=list)


class AiMessageActionsUpdate(BaseModel):
    state: Literal["done", "ignored"]


class AiToolInfo(BaseModel):
    key: str
    label: str
    description: str
    permission: str
    domain: str = "general"


class AiRunRead(BaseModel):
    id: UUID
    feature_code: str
    status: str
    request_summary: str | None = None
    duration_ms: int | None = None
    created_at: datetime


AiComposeKind = Literal[
    "ticket",
    "communication",
    "meeting",
    "intervention",
    "project",
    "contract",
    "generic",
]
AiComposeField = Literal["description", "body", "agenda", "notes", "summary", "title"]


class AiComposeRequest(BaseModel):
    kind: AiComposeKind = "generic"
    field: AiComposeField = "description"
    title: str | None = Field(default=None, max_length=500)
    current: str | None = Field(default=None, max_length=8000)
    context: str | None = Field(default=None, max_length=8000)
    tone: Literal["professional", "friendly", "direct", "technical"] = "professional"
    length: Literal["short", "medium", "long"] = "medium"
    instructions: str | None = Field(default=None, max_length=1000)


class AiComposeResponse(BaseModel):
    text: str
    kind: str
    field: str
    duration_ms: int
