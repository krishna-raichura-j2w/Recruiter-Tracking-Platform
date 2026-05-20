from core.database import get_db
from core.deps import get_current_user
from core.response_format import (
    error_response,
    success_response,
    success_response_with_pagination,
)
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from features.hrbp.signal_definitions import service
from features.hrbp.signal_definitions.schema import (
    SignalDefinitionCreate,
    SignalDefinitionUpdate,
)

router = APIRouter(prefix="/signal-definitions", tags=["hrbp-signal-definitions"])


@router.post("")
def create_signal(
    payload: SignalDefinitionCreate,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    try:
        data = service.create(db, payload)
        return success_response(
            data=data.__dict__,
            message="Signal definition created successfully",
        )
    except Exception as exc:
        return error_response(message=str(exc))


@router.get("")
def list_signals(
    page_no: int = Query(default=1, ge=1),
    per_page: int = Query(default=10, ge=-1),
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    result = service.list_paginated(db, page_no, per_page)
    return success_response_with_pagination(
        data=[r.__dict__ for r in result.items],
        message="Signal definitions fetched successfully",
        page_no=result.page_no,
        per_page=result.per_page,
        total=result.total,
        total_pages=result.total_pages,
    )


@router.get("/urgency/{urgency_level}")
def list_by_urgency(
    urgency_level: str,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    data = service.list_by_urgency(db, urgency_level)
    return success_response(
        data=[r.__dict__ for r in data],
        message="Signal definitions fetched successfully",
    )


@router.get("/{id}")
def get_signal_by_id(
    id: int,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    try:
        data = service.get_by_id(db, id)
        return success_response(
            data=data.__dict__,
            message="Signal definition fetched successfully",
        )
    except Exception as exc:
        return error_response(message=str(exc))


@router.get("/code/{signal_code}")
def get_signal_by_code(
    signal_code: str,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    try:
        data = service.get_by_code(db, signal_code)
        return success_response(
            data=data.__dict__,
            message="Signal definition fetched successfully",
        )
    except Exception as exc:
        return error_response(message=str(exc))


@router.put("/{id}")
def update_signal(
    id: int,
    payload: SignalDefinitionUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    try:
        data = service.update(db, id, payload)
        return success_response(
            data=data.__dict__,
            message="Signal definition updated successfully",
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
        return success_response(
            data={},
            message="Signal definition deleted successfully",
        )
    except Exception as exc:
        return error_response(message=str(exc))
