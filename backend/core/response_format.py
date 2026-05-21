"""Standardized API response format helper."""

import math
from typing import Any


def _make_json_safe(value: Any) -> Any:
    """Recursively convert non-JSON-compliant floats (NaN, inf, -inf) to None."""
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, dict):
        return {k: _make_json_safe(v) for k, v in value.items()}
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
    total: int | None = None,
    total_pages: int | None = None,
) -> dict[str, Any]:
    meta: dict[str, Any] = {
        "status": True,
        "message": message,
        "page_no": page_no,
        "per_page": per_page,
    }
    if total is not None:
        meta["total"] = total
    if total_pages is not None:
        meta["total_pages"] = total_pages
    return {
        "meta": meta,
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
