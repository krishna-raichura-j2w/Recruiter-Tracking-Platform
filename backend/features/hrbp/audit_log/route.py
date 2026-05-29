from datetime import datetime

from core.database import get_db
from core.deps import get_current_user
from core.response_format import (
    error_response,
    success_response,
    success_response_with_pagination,
)
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from features.hrbp.audit_log import service

router = APIRouter(prefix="/audit-log", tags=["hrbp-audit-log"])


@router.get("")
def list_audit_log(
    page_no: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=-1),
    entity_type: str | None = Query(default=None),
    entity_id: int | None = Query(default=None),
    actor_id: int | None = Query(default=None),
    action: str | None = Query(default=None),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    result = service.list_paginated(
        db,
        page_no,
        per_page,
        entity_type,
        entity_id,
        actor_id,
        action,
        date_from,
        date_to,
    )
    return success_response_with_pagination(
        data=[r.__dict__ for r in result.items],
        message="Audit log fetched successfully",
        page_no=result.page_no,
        per_page=result.per_page,
        total=result.total,
        total_pages=result.total_pages,
    )


@router.get("/{id}")
def get_audit_entry(
    id: int,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    try:
        data = service.get_by_id(db, id)
        return success_response(
            data=data.__dict__,
            message="Audit log entry fetched successfully",
        )
    except Exception as exc:
        return error_response(message=str(exc))
