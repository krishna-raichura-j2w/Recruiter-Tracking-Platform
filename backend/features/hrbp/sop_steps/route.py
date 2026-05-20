from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from core.database import get_db
from core.deps import get_current_user
from core.response_format import success_response, success_response_with_pagination, error_response
from features.hrbp.sop_steps.schema import SopStepCreate, SopStepUpdate
from features.hrbp.sop_steps import service

router = APIRouter(prefix="/sop-steps", tags=["hrbp-sop-steps"])


@router.post("")
def create_sop_step(
    payload: SopStepCreate,
    db: Session = Depends(get_db),
    _: object   = Depends(get_current_user),
):
    try:
        data = service.create(db, payload)
        return success_response(data=data.__dict__, message="SOP step created successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.get("")
def list_sop_steps(
    page_no:     int            = Query(default=1,  ge=1),
    per_page:    int            = Query(default=10, ge=-1),
    incident_id: Optional[int] = Query(default=None),
    status:      Optional[str]  = Query(default=None),
    db: Session = Depends(get_db),
    _: object   = Depends(get_current_user),
):
    result = service.list_paginated(db, page_no, per_page, incident_id, status)
    return success_response_with_pagination(
        data=[r.__dict__ for r in result.items],
        message="SOP steps fetched successfully",
        page_no=result.page_no,
        per_page=result.per_page,
        total=result.total,
        total_pages=result.total_pages,
    )


@router.get("/{id}")
def get_sop_step(
    id: int,
    db: Session = Depends(get_db),
    _: object   = Depends(get_current_user),
):
    try:
        data = service.get_by_id(db, id)
        return success_response(data=data.__dict__, message="SOP step fetched successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.put("/{id}")
def update_sop_step(
    id: int,
    payload: SopStepUpdate,
    db: Session = Depends(get_db),
    _: object   = Depends(get_current_user),
):
    try:
        data = service.update(db, id, payload)
        return success_response(data=data.__dict__, message="SOP step updated successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.delete("/{id}")
def delete_sop_step(
    id: int,
    db: Session = Depends(get_db),
    _: object   = Depends(get_current_user),
):
    try:
        service.delete(db, id)
        return success_response(data={}, message="SOP step deleted successfully")
    except Exception as exc:
        return error_response(message=str(exc))
