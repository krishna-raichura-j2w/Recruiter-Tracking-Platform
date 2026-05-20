from uuid import UUID
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from core.database import get_db
from core.deps import get_current_user
from core.response_format import success_response, success_response_with_pagination, error_response
from features.hrbp.consultants.schema import ConsultantCreate, ConsultantUpdate
from features.hrbp.consultants import service

router = APIRouter(prefix="/consultants", tags=["hrbp-consultants"])


@router.post("")
def create_consultant(
    payload: ConsultantCreate,
    db: Session = Depends(get_db),
    _: object   = Depends(get_current_user),
):
    try:
        data = service.create(db, payload)
        return success_response(data=data.__dict__, message="Consultant created successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.get("")
def list_consultants(
    page_no:   int            = Query(default=1,   ge=1),
    per_page:  int            = Query(default=10,  ge=1, le=100),
    client_id: Optional[UUID] = Query(default=None),
    cohort:    Optional[str]  = Query(default=None),
    perf_tier: Optional[str]  = Query(default=None),
    is_active: Optional[bool] = Query(default=None),
    db: Session = Depends(get_db),
    _: object   = Depends(get_current_user),
):
    result = service.list_paginated(db, page_no, per_page, client_id, cohort, perf_tier, is_active)
    return success_response_with_pagination(
        data=[r.__dict__ for r in result.items],
        message="Consultants fetched successfully",
        page_no=result.page_no,
        per_page=result.per_page,
        total=result.total,
        total_pages=result.total_pages,
    )


@router.get("/emp/{emp_id}")
def get_consultant_by_emp_id(
    emp_id: str,
    db: Session = Depends(get_db),
    _: object   = Depends(get_current_user),
):
    try:
        data = service.get_by_emp_id(db, emp_id)
        return success_response(data=data.__dict__, message="Consultant fetched successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.get("/{id}")
def get_consultant(
    id: UUID,
    db: Session = Depends(get_db),
    _: object   = Depends(get_current_user),
):
    try:
        data = service.get_by_id(db, id)
        return success_response(data=data.__dict__, message="Consultant fetched successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.put("/{id}")
def update_consultant(
    id: UUID,
    payload: ConsultantUpdate,
    db: Session = Depends(get_db),
    _: object   = Depends(get_current_user),
):
    try:
        data = service.update(db, id, payload)
        return success_response(data=data.__dict__, message="Consultant updated successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.delete("/{id}")
def delete_consultant(
    id: UUID,
    db: Session = Depends(get_db),
    _: object   = Depends(get_current_user),
):
    try:
        service.delete(db, id)
        return success_response(data={}, message="Consultant deleted successfully")
    except Exception as exc:
        return error_response(message=str(exc))
