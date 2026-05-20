from core.database import get_db
from core.deps import get_current_user
from core.response_format import (
    error_response,
    success_response,
    success_response_with_pagination,
)
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from features.hrbp.incidents import service
from features.hrbp.incidents.schema import IncidentCreate, IncidentUpdate

router = APIRouter(prefix="/incidents", tags=["hrbp-incidents"])


@router.post("")
def create_incident(
    payload: IncidentCreate,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    try:
        data = service.create(db, payload)
        return success_response(
            data=data.__dict__,
            message="Incident created successfully",
        )
    except Exception as exc:
        return error_response(message=str(exc))


@router.get("")
def list_incidents(
    page_no: int = Query(default=1, ge=1),
    per_page: int = Query(default=10, ge=-1),
    status: str | None = Query(default=None),
    risk_level: str | None = Query(default=None),
    consultant_id: int | None = Query(default=None),
    client_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    result = service.list_paginated(
        db,
        page_no,
        per_page,
        status,
        risk_level,
        consultant_id,
        client_id,
    )
    return success_response_with_pagination(
        data=[r.__dict__ for r in result.items],
        message="Incidents fetched successfully",
        page_no=result.page_no,
        per_page=result.per_page,
        total=result.total,
        total_pages=result.total_pages,
    )


@router.get("/ticket/{ticket_ref}")
def get_incident_by_ticket(
    ticket_ref: str,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    try:
        data = service.get_by_ticket_ref(db, ticket_ref)
        return success_response(
            data=data.__dict__,
            message="Incident fetched successfully",
        )
    except Exception as exc:
        return error_response(message=str(exc))


@router.get("/{id}")
def get_incident(
    id: int,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    try:
        data = service.get_by_id(db, id)
        return success_response(
            data=data.__dict__,
            message="Incident fetched successfully",
        )
    except Exception as exc:
        return error_response(message=str(exc))


@router.put("/{id}")
def update_incident(
    id: int,
    payload: IncidentUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    try:
        data = service.update(db, id, payload)
        return success_response(
            data=data.__dict__,
            message="Incident updated successfully",
        )
    except Exception as exc:
        return error_response(message=str(exc))


@router.delete("/{id}")
def delete_incident(
    id: int,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    try:
        service.delete(db, id)
        return success_response(data={}, message="Incident deleted successfully")
    except Exception as exc:
        return error_response(message=str(exc))
