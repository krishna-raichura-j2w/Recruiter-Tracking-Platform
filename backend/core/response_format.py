"""Standardized API response format helper."""

import math
from typing import Any


def _make_json_safe(value: Any) -> Any:
    """Recursively convert non-JSON-compliant floats to None and strip SQLAlchemy internals."""
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, dict):
        return {
            k: _make_json_safe(v)
            for k, v in value.items()
            if not k.startswith("_sa_")
        }
    if isinstance(value, list):
        return [_make_json_safe(v) for v in value]
    return value


def success_response(data: Any, message: str = "Success") -> dict[str, Any]:
    return {
        "meta": {
            "status": True,
            "message": message,
        },
        "data": _make_json_safe(data),
    }


def success_response_with_pagination(
    data: Any,
    message: str = "Success",
    page_no: int = 1,
    per_page: int = 10,
    total: int = 0,
    total_pages: int = 1,
) -> dict[str, Any]:
    return {
        "meta": {
            "status": True,
            "message": message,
            "page_no": page_no,
            "per_page": per_page,
            "total": total,
            "total_pages": total_pages,
        },
        "data": _make_json_safe(data),
    }


def error_response(message: str, data: Any | None = None) -> dict[str, Any]:
    return {
        "meta": {
            "status": False,
            "message": message,
        },
        "data": _make_json_safe(data) if data is not None else {},
    }


def error_response_with_pagination(
    message: str,
    data: Any | None = None,
    page_no: int = 1,
    per_page: int = 10,
) -> dict[str, Any]:
    return {
        "meta": {
            "status": False,
            "message": message,
            "page_no": page_no,
            "per_page": per_page,
        },
        "data": _make_json_safe(data) if data is not None else {},
    }
