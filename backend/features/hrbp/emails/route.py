from core.database import get_db
from core.deps import get_current_user
from core.response_format import (
    error_response,
    success_response,
    success_response_with_pagination,
)
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from features.hrbp.emails import service
from features.hrbp.emails.schema import EmailCreate, EmailUpdate

router = APIRouter(prefix="/emails", tags=["hrbp-emails"])


@router.post("")
def create_email(
    payload: EmailCreate,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    try:
        data = service.create(db, payload)
        return success_response(
            data=data.__dict__,
            message="Email record created successfully",
        )
    except Exception as exc:
        return error_response(message=str(exc))


@router.get("")
def list_emails(
    page_no: int = Query(default=1, ge=1),
    per_page: int = Query(default=10, ge=-1),
    direction: str | None = Query(default=None),
    consultant_id: int | None = Query(default=None),
    incident_id: int | None = Query(default=None),
    processed: bool | None = Query(default=None),
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    result = service.list_paginated(
        db,
        page_no,
        per_page,
        direction,
        consultant_id,
        incident_id,
        processed,
    )
    return success_response_with_pagination(
        data=[r.__dict__ for r in result.items],
        message="Emails fetched successfully",
        page_no=result.page_no,
        per_page=result.per_page,
        total=result.total,
        total_pages=result.total_pages,
    )


@router.get("/{id}")
def get_email(
    id: int,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    try:
        data = service.get_by_id(db, id)
        return success_response(
            data=data.__dict__,
            message="Email record fetched successfully",
        )
    except Exception as exc:
        return error_response(message=str(exc))


@router.put("/{id}")
def update_email(
    id: int,
    payload: EmailUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    try:
        data = service.update(db, id, payload)
        return success_response(
            data=data.__dict__,
            message="Email record updated successfully",
        )
    except Exception as exc:
        return error_response(message=str(exc))


@router.delete("/{id}")
def delete_email(
    id: int,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    try:
        service.delete(db, id)
        return success_response(data={}, message="Email record deleted successfully")
    except Exception as exc:
        return error_response(message=str(exc))
