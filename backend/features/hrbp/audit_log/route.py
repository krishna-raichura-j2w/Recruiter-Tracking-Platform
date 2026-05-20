from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from core.database import get_db
from core.deps import get_current_user
from core.response_format import success_response, success_response_with_pagination, error_response
from features.hrbp.audit_log import service

router = APIRouter(prefix="/audit-log", tags=["hrbp-audit-log"])


@router.get("")
def list_audit_log(
    page_no:     int            = Query(default=1,  ge=1),
    per_page:    int            = Query(default=10, ge=-1),
    entity_type: Optional[str]  = Query(default=None),
    entity_id:   Optional[int] = Query(default=None),
    actor_id:    Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    _: object   = Depends(get_current_user),
):
    result = service.list_paginated(db, page_no, per_page, entity_type, entity_id, actor_id)
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
    _: object   = Depends(get_current_user),
):
    try:
        data = service.get_by_id(db, id)
        return success_response(data=data.__dict__, message="Audit log entry fetched successfully")
    except Exception as exc:
        return error_response(message=str(exc))
