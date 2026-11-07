from typing import Literal

from pydantic import BaseModel


class SearchResult(BaseModel):
    type: str
    id: str
    title: str
    subtitle: str | None = None
    link: str
    score: int = 0


class SearchResponse(BaseModel):
    query: str
    results: list[SearchResult]
    total: int
    took_ms: int


class SearchQuery(BaseModel):
    q: str
    types: list[str] | None = None
    limit: int = 5
    sort: Literal["relevance", "recent"] = "relevance"
