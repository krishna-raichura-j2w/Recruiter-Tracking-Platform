from core.database import get_db
from core.deps import get_current_user
from core.response_format import (
    error_response,
    success_response,
    success_response_with_pagination,
)
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from infra.models import User

from features.hrbp.exits import service
from features.hrbp.exits.schema import ExitCreate, ExitUpdate

router = APIRouter(prefix="/exits", tags=["hrbp-exits"])


@router.get("/stats")
def get_exit_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        data = service.get_stats(db, current_user)
        return success_response(data=data, message="Exit stats fetched successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.post("")
def create_exit(
    payload: ExitCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        data = service.create(db, payload, current_user)
        return success_response(data=data, message="Exit record created successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.get("")
def list_exits(
    page_no: int = Query(default=1, ge=1),
    per_page: int = Query(default=10, ge=-1),
    status: str | None = Query(default=None),
    client_id: int | None = Query(default=None),
    consultant_id: int | None = Query(default=None),
    exit_reason: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = service.list_paginated(
        db, current_user, page_no, per_page, status, client_id, consultant_id, exit_reason
    )
    return success_response_with_pagination(
        data=result.items,
        message="Exit records fetched successfully",
        page_no=result.page_no,
        per_page=result.per_page,
        total=result.total,
        total_pages=result.total_pages,
    )


@router.get("/{exit_id}")
def get_exit(
    exit_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        data = service.get_by_id(db, exit_id, current_user)
        return success_response(data=data, message="Exit record fetched successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.patch("/{exit_id}")
def update_exit(
    exit_id: int,
    payload: ExitUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        data = service.update(db, exit_id, payload, current_user)
        return success_response(data=data, message="Exit record updated successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.delete("/{exit_id}")
def delete_exit(
    exit_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        service.delete(db, exit_id, current_user)
        return success_response(data={}, message="Exit record deleted successfully")
    except Exception as exc:
        return error_response(message=str(exc))
