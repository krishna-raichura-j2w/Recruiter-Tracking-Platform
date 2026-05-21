from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Query


@dataclass
class PageResult:
    items: list[Any]
    total: int
    page_no: int
    per_page: int
    total_pages: int


def paginate_raw(query: Query, page_no: int, per_page: int) -> dict:
    """Like paginate() but for column-projection queries (named tuples)."""
    total = query.count()
    if per_page == -1:
        items = [r._asdict() for r in query.all()]
        return {"items": items, "total": total, "page_no": 1, "per_page": total, "total_pages": 1}
    items = [r._asdict() for r in query.offset((page_no - 1) * per_page).limit(per_page).all()]
    total_pages = max(1, (total + per_page - 1) // per_page)
    return {"items": items, "total": total, "page_no": page_no, "per_page": per_page, "total_pages": total_pages}


def paginate(query: Query, page_no: int, per_page: int) -> PageResult:
    total = query.count()
    if per_page == -1:
        items = query.all()
        return PageResult(
            items=items,
            total=total,
            page_no=1,
            per_page=total,
            total_pages=1,
        )
    items = query.offset((page_no - 1) * per_page).limit(per_page).all()
    total_pages = max(1, (total + per_page - 1) // per_page)
    return PageResult(
        items=items,
        total=total,
        page_no=page_no,
        per_page=per_page,
        total_pages=total_pages,
    )
