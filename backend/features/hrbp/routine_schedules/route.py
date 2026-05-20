from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from core.database import get_db
from core.deps import get_current_user
from core.response_format import success_response, success_response_with_pagination, error_response
from features.hrbp.routine_schedules.schema import RoutineScheduleCreate, RoutineScheduleUpdate
from features.hrbp.routine_schedules import service

router = APIRouter(prefix="/routine-schedules", tags=["hrbp-routine-schedules"])


@router.post("")
def create_schedule(
    payload: RoutineScheduleCreate,
    db: Session = Depends(get_db),
    _: object   = Depends(get_current_user),
):
    try:
        data = service.create(db, payload)
        return success_response(data=data.__dict__, message="Routine schedule created successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.get("")
def list_schedules(
    page_no:       int            = Query(default=1,  ge=1),
    per_page:      int            = Query(default=10, ge=-1),
    consultant_id: Optional[int] = Query(default=None),
    assigned_to:   Optional[int] = Query(default=None),
    task_type:     Optional[str]  = Query(default=None),
    status:        Optional[str]  = Query(default=None),
    db: Session = Depends(get_db),
    _: object   = Depends(get_current_user),
):
    result = service.list_paginated(db, page_no, per_page, consultant_id, assigned_to, task_type, status)
    return success_response_with_pagination(
        data=[r.__dict__ for r in result.items],
        message="Routine schedules fetched successfully",
        page_no=result.page_no,
        per_page=result.per_page,
        total=result.total,
        total_pages=result.total_pages,
    )


@router.get("/{id}")
def get_schedule(
    id: int,
    db: Session = Depends(get_db),
    _: object   = Depends(get_current_user),
):
    try:
        data = service.get_by_id(db, id)
        return success_response(data=data.__dict__, message="Routine schedule fetched successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.put("/{id}")
def update_schedule(
    id: int,
    payload: RoutineScheduleUpdate,
    db: Session = Depends(get_db),
    _: object   = Depends(get_current_user),
):
    try:
        data = service.update(db, id, payload)
        return success_response(data=data.__dict__, message="Routine schedule updated successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.delete("/{id}")
def delete_schedule(
    id: int,
    db: Session = Depends(get_db),
    _: object   = Depends(get_current_user),
):
    try:
        service.delete(db, id)
        return success_response(data={}, message="Routine schedule deleted successfully")
    except Exception as exc:
        return error_response(message=str(exc))
