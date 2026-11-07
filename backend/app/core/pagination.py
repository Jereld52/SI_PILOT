from dataclasses import dataclass
from typing import Any, Literal

from fastapi import Query
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session


@dataclass(frozen=True)
class PageParams:
    page: int = 1
    page_size: int = 25
    sort: str | None = None
    order: Literal["asc", "desc"] = "desc"

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


def page_params(
    page: int = Query(1, ge=1, description="Numéro de page"),
    page_size: int = Query(25, ge=1, le=100, description="Éléments par page"),
    sort: str | None = Query(None, description="Champ de tri"),
    order: Literal["asc", "desc"] = Query("desc", description="Ordre de tri"),
) -> PageParams:
    return PageParams(page=page, page_size=page_size, sort=sort, order=order)


def paginate_items(items: list[Any], params: PageParams) -> dict[str, Any]:
    total = len(items)
    pages = (total + params.page_size - 1) // params.page_size if total else 0
    return {
        "items": items[params.offset : params.offset + params.page_size],
        "total": total,
        "page": params.page,
        "page_size": params.page_size,
        "pages": pages,
    }


def paginate(db: Session, statement: Select, params: PageParams) -> dict[str, Any]:
    count_statement = select(func.count()).select_from(statement.order_by(None).subquery())
    total = db.scalar(count_statement) or 0
    items = db.scalars(statement.offset(params.offset).limit(params.page_size)).all()
    pages = (total + params.page_size - 1) // params.page_size if total else 0
    return {
        "items": items,
        "total": total,
        "page": params.page,
        "page_size": params.page_size,
        "pages": pages,
    }
