from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.auth import User
from app.schemas.search import SearchResponse
from app.services.search_service import global_search

router = APIRouter(prefix="/search", tags=["Recherche"])


@router.get("", response_model=SearchResponse)
def search(
    q: str = Query(..., min_length=2, max_length=120),
    types: str | None = Query(None, description="Types séparés par des virgules"),
    limit: int = Query(5, ge=1, le=20),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SearchResponse:
    type_list = [item.strip() for item in types.split(",") if item.strip()] if types else None
    return global_search(db, user=user, query=q, types=type_list, limit=limit)
