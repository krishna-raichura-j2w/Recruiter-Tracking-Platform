
from core.database import get_db
from core.deps import get_current_user
from core.response_format import (
    error_response,
    success_response,
    success_response_with_pagination,
)
from fastapi import APIRouter, Depends, Query
from infra.models import User
from sqlalchemy.orm import Session

from features.hrbp.consultants import service
from features.hrbp.consultants.schema import ConsultantCreate, ConsultantUpdate

router = APIRouter(prefix="/consultants", tags=["hrbp-consultants"])


@router.post("")
def create_consultant(
    payload: ConsultantCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        data = service.create(db, payload)
        return success_response(
            data=data.__dict__, message="Consultant created successfully",
        )
    except Exception as exc:
        return error_response(message=str(exc))


@router.get("")
def list_consultants(
    page_no: int = Query(default=1, ge=1),
    per_page: int = Query(default=10, ge=-1),
    hrbp_id: int | None = Query(default=None),
    client_id: int | None = Query(default=None),
    cohort: str | None = Query(default=None),
    perf_tier: str | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = service.list_paginated(
        db, page_no, per_page, hrbp_id, client_id, cohort, perf_tier, is_active,
    )
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
    _: User = Depends(get_current_user),
):
    try:
        data = service.get_by_emp_id(db, emp_id)
        return success_response(
            data=data.__dict__, message="Consultant fetched successfully",
        )
    except Exception as exc:
        return error_response(message=str(exc))


@router.get("/{id}")
def get_consultant(
    id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        data = service.get_by_id(db, id)
        return success_response(
            data=data.__dict__, message="Consultant fetched successfully",
        )
    except Exception as exc:
        return error_response(message=str(exc))


@router.put("/{id}")
def update_consultant(
    id: int,
    payload: ConsultantUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        data = service.update(db, id, payload)
        return success_response(
            data=data.__dict__, message="Consultant updated successfully",
        )
    except Exception as exc:
        return error_response(message=str(exc))


@router.delete("/{id}")
def delete_consultant(
    id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        service.delete(db, id)
        return success_response(data={}, message="Consultant deleted successfully")
    except Exception as exc:
        return error_response(message=str(exc))
