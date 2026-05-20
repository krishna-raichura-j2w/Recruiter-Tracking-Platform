
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

from features.hrbp.clients import service
from features.hrbp.clients.schema import ClientCreate, ClientUpdate

router = APIRouter(prefix="/clients", tags=["hrbp-clients"])


@router.post("")
def create_client(
    payload: ClientCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        data = service.create(db, payload)
        return success_response(
            data=data.__dict__, message="Client created successfully",
        )
    except Exception as exc:
        return error_response(message=str(exc))


@router.get("")
def list_clients(
    page_no: int = Query(default=1, ge=1),
    per_page: int = Query(default=10, ge=-1),
    hrbp_id: int | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = service.list_paginated(db, page_no, per_page, hrbp_id, is_active)
    return success_response_with_pagination(
        data=[r.__dict__ for r in result.items],
        message="Clients fetched successfully",
        page_no=result.page_no,
        per_page=result.per_page,
        total=result.total,
        total_pages=result.total_pages,
    )


@router.get("/{id}")
def get_client(
    id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        data = service.get_by_id(db, id)
        return success_response(
            data=data.__dict__, message="Client fetched successfully",
        )
    except Exception as exc:
        return error_response(message=str(exc))


@router.put("/{id}")
def update_client(
    id: int,
    payload: ClientUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        data = service.update(db, id, payload)
        return success_response(
            data=data.__dict__, message="Client updated successfully",
        )
    except Exception as exc:
        return error_response(message=str(exc))


@router.delete("/{id}")
def delete_client(
    id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        service.delete(db, id)
        return success_response(data={}, message="Client deleted successfully")
    except Exception as exc:
        return error_response(message=str(exc))
