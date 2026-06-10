from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from core.database import get_db
from core.deps import get_current_user
from core.response_format import error_response, success_response
from features.hrbp.dashboard import service
from infra.models import User

router = APIRouter(prefix="/dashboard", tags=["hrbp-dashboard"])


@router.get("/kpis")
def get_kpis(
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        data = service.get_kpis(db, current_user, date_from=date_from, date_to=date_to)
        return success_response(data=data, message="KPIs fetched")
    except Exception as exc:
        return error_response(message=str(exc))


@router.get("/my-tickets")
def get_my_tickets(
    limit: int = Query(default=5, ge=1, le=20),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        data = service.get_my_tickets(db, current_user, limit)
        return success_response(data=data, message="My tickets fetched")
    except Exception as exc:
        return error_response(message=str(exc))


@router.get("/today-cadence")
def get_today_cadence(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        data = service.get_today_cadence(db, current_user)
        return success_response(data=data, message="Today's cadence fetched")
    except Exception as exc:
        return error_response(message=str(exc))


@router.get("/pinned-ticket")
def get_pinned_ticket(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        data = service.get_pinned_ticket(db, current_user)
        return success_response(data=data, message="Pinned ticket fetched")
    except Exception as exc:
        return error_response(message=str(exc))


@router.post("/pin/{ticket_id}")
def pin_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        data = service.pin_ticket(db, current_user, ticket_id)
        return success_response(data=data, message="Ticket pinned")
    except Exception as exc:
        return error_response(message=str(exc))


@router.delete("/pin")
def unpin_ticket(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        data = service.unpin_ticket(db, current_user)
        return success_response(data=data, message="Ticket unpinned")
    except Exception as exc:
        return error_response(message=str(exc))


@router.get("/consultants-at-risk")
def get_consultants_at_risk(
    limit: int = Query(default=8, ge=1, le=20),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        data = service.get_consultants_at_risk(db, current_user, limit)
        return success_response(data=data, message="Consultants at risk fetched")
    except Exception as exc:
        return error_response(message=str(exc))


@router.get("/recent-activity")
def get_recent_activity(
    limit: int = Query(default=10, ge=1, le=30),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        data = service.get_recent_activity(db, current_user, limit)
        return success_response(data=data, message="Recent activity fetched")
    except Exception as exc:
        return error_response(message=str(exc))
