from datetime import date

from core.database import get_db
from core.deps import get_current_user, resolve_hrbp_ids
from core.response_format import (
    error_response,
    success_response,
    success_response_with_pagination,
)
from fastapi import APIRouter, Depends, Query
from infra.models import User
from sqlalchemy.orm import Session

from features.hrbp.cadence_schedules import service
from features.hrbp.cadence_schedules.export import build_and_upload
from features.hrbp.cadence_schedules.schema import (
    CadenceScheduleCreate,
    CadenceScheduleUpdate,
    CadenceSessionUpdate,
)

router = APIRouter(prefix="/cadence-schedules", tags=["hrbp-cadence-schedules"])


@router.post("")
def create_cadence_schedule(
    payload: CadenceScheduleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        data = service.create(db, payload, hrbp_id=current_user.id)
        return success_response(
            data=data.__dict__,
            message="Cadence schedule created successfully",
        )
    except Exception as exc:
        return error_response(message=str(exc))


@router.get("/sessions/export")
def export_sessions(
    client_id: int | None = Query(default=None),
    consultant_id: int | None = Query(default=None),
    status: str | None = Query(default=None),
    scheduled_date: date | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        hrbp_ids = resolve_hrbp_ids(current_user, db)
        url = build_and_upload(
            db,
            hrbp_ids=hrbp_ids,
            client_id=client_id,
            consultant_id=consultant_id,
            status=status,
            scheduled_date=scheduled_date,
            date_from=date_from,
            date_to=date_to,
        )
        return success_response(data={"url": url}, message="Excel exported successfully")
    except Exception as exc:
        return error_response(message=str(exc))


@router.get("/sessions/summary")
def get_sessions_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    hrbp_ids = resolve_hrbp_ids(current_user, db)
    data = service.get_summary(db, hrbp_ids)
    return success_response(
        data=data,
        message="Cadence sessions summary fetched successfully",
    )


@router.get("/sessions")
def list_all_sessions(
    page_no: int = Query(default=1, ge=1),
    per_page: int = Query(default=10, ge=-1),
    client_id: int | None = Query(default=None),
    consultant_id: int | None = Query(default=None),
    status: str | None = Query(default=None),
    scheduled_date: date | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    cadence_tag: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    hrbp_ids = resolve_hrbp_ids(current_user, db)
    current_bh_id = current_user.id if current_user.role.value == "bh" else None
    result = service.list_all_sessions(
        db,
        page_no,
        per_page,
        hrbp_ids,
        client_id,
        consultant_id,
        status,
        scheduled_date,
        date_from,
        date_to,
        cadence_tag=cadence_tag,
        current_bh_id=current_bh_id,
    )
    return success_response_with_pagination(
        data=result["items"],
        message="Cadence sessions fetched successfully",
        page_no=result["page_no"],
        per_page=result["per_page"],
        total=result["total"],
        total_pages=result["total_pages"],
    )


@router.get("")
def list_cadence_schedules(
    page_no: int = Query(default=1, ge=1),
    per_page: int = Query(default=10, ge=-1),
    client_id: int | None = Query(default=None),
    consultant_id: int | None = Query(default=None),
    status: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    hrbp_ids = resolve_hrbp_ids(current_user, db)
    result = service.list_paginated(
        db,
        page_no,
        per_page,
        client_id,
        consultant_id,
        hrbp_ids,
        status,
        date_from,
        date_to,
    )
    return success_response_with_pagination(
        data=[r.__dict__ for r in result.items],
        message="Cadence schedules fetched successfully",
        page_no=result.page_no,
        per_page=result.per_page,
        total=result.total,
        total_pages=result.total_pages,
    )


@router.get("/{id}")
def get_cadence_schedule(
    id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        data = service.get_by_id(db, id)
        return success_response(
            data=data.__dict__,
            message="Cadence schedule fetched successfully",
        )
    except Exception as exc:
        return error_response(message=str(exc))


@router.get("/{id}/sessions")
def list_cadence_sessions(
    id: int,
    page_no: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=-1),
    status: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        result = service.get_sessions(db, id, page_no, per_page, status)
        return success_response_with_pagination(
            data=[r.__dict__ for r in result.items],
            message="Cadence sessions fetched successfully",
            page_no=result.page_no,
            per_page=result.per_page,
            total=result.total,
            total_pages=result.total_pages,
        )
    except Exception as exc:
        return error_response(message=str(exc))


@router.patch("/{id}")
def update_cadence_schedule(
    id: int,
    payload: CadenceScheduleUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        data = service.update(db, id, payload)
        return success_response(
            data=data.__dict__,
            message="Cadence schedule updated successfully",
        )
    except Exception as exc:
        return error_response(message=str(exc))


@router.get("/{id}/sessions/{session_id}")
def get_cadence_session(
    id: int,
    session_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        data = service.get_session_by_id(db, id, session_id)
        return success_response(
            data=data.__dict__,
            message="Cadence session fetched successfully",
        )
    except Exception as exc:
        return error_response(message=str(exc))


@router.patch("/{id}/sessions/{session_id}")
def update_cadence_session(
    id: int,
    session_id: int,
    payload: CadenceSessionUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        data = service.update_session(db, id, session_id, payload)
        return success_response(
            data=data.__dict__,
            message="Cadence session updated successfully",
        )
    except Exception as exc:
        return error_response(message=str(exc))


@router.delete("/{id}")
def cancel_cadence_schedule(
    id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        service.cancel(db, id)
        return success_response(
            data={},
            message="Cadence schedule cancelled successfully",
        )
    except Exception as exc:
        return error_response(message=str(exc))
