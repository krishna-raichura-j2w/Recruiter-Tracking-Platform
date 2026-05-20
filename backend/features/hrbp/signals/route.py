from core.database import get_db
from core.deps import get_current_user
from core.response_format import (
    error_response,
    success_response,
    success_response_with_pagination,
)
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from features.hrbp.signals import service
from features.hrbp.signals.schema import SignalCreate, SignalUpdate

router = APIRouter(prefix="/signals", tags=["hrbp-signals"])


@router.post("")
def create_signal(
    payload: SignalCreate,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    try:
        data = service.create(db, payload)
        return success_response(
            data=data.__dict__,
            message="Signal created successfully",
        )
    except Exception as exc:
        return error_response(message=str(exc))


@router.get("")
def list_signals(
    page_no: int = Query(default=1, ge=1),
    per_page: int = Query(default=10, ge=-1),
    consultant_id: int | None = Query(default=None),
    signal_type: str | None = Query(default=None),
    incident_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    result = service.list_paginated(
        db,
        page_no,
        per_page,
        consultant_id,
        signal_type,
        incident_id,
    )
    return success_response_with_pagination(
        data=[r.__dict__ for r in result.items],
        message="Signals fetched successfully",
        page_no=result.page_no,
        per_page=result.per_page,
        total=result.total,
        total_pages=result.total_pages,
    )


@router.get("/{id}")
def get_signal(
    id: int,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    try:
        data = service.get_by_id(db, id)
        return success_response(
            data=data.__dict__,
            message="Signal fetched successfully",
        )
    except Exception as exc:
        return error_response(message=str(exc))


@router.put("/{id}")
def update_signal(
    id: int,
    payload: SignalUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    try:
        data = service.update(db, id, payload)
        return success_response(
            data=data.__dict__,
            message="Signal updated successfully",
        )
    except Exception as exc:
        return error_response(message=str(exc))


@router.delete("/{id}")
def delete_signal(
    id: int,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    try:
        service.delete(db, id)
        return success_response(data={}, message="Signal deleted successfully")
    except Exception as exc:
        return error_response(message=str(exc))
