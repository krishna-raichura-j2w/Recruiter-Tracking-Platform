"""
User leaves — mark/unmark recruiters as on leave for a specific date.
Allowed for admin, coo, bh, kam, and delivery_lead.
"""
from __future__ import annotations

from datetime import date, datetime, timezone, timedelta

from core.database import get_db
from core.deps import get_current_user, require_roles
from fastapi import APIRouter, Depends, HTTPException
from infra.models import User, UserLeave, UserRole
from pydantic import BaseModel
from sqlalchemy.orm import Session

router = APIRouter(prefix="/leaves", tags=["leaves"])

ALLOWED_ROLES = ("admin", "coo", "bh", "kam", "delivery_lead")


def _today_ist() -> date:
    return (datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)).date()


class LeaveCreate(BaseModel):
    user_id: int
    leave_date: date | None = None   # defaults to today IST
    note: str | None = None


@router.post("")
def mark_leave(
    body: LeaveCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*ALLOWED_ROLES)),
):
    target_date = body.leave_date or _today_ist()

    user = db.query(User).filter(User.id == body.user_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    existing = (
        db.query(UserLeave)
        .filter(UserLeave.user_id == body.user_id, UserLeave.leave_date == target_date)
        .first()
    )
    if existing:
        return {"id": existing.id, "user_id": existing.user_id, "leave_date": str(existing.leave_date)}

    leave = UserLeave(
        user_id=body.user_id,
        leave_date=target_date,
        marked_by=current_user.id,
        note=body.note,
    )
    db.add(leave)
    db.commit()
    db.refresh(leave)
    return {"id": leave.id, "user_id": leave.user_id, "leave_date": str(leave.leave_date)}


@router.delete("/{user_id}/{leave_date}")
def unmark_leave(
    user_id: int,
    leave_date: date,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*ALLOWED_ROLES)),
):
    leave = (
        db.query(UserLeave)
        .filter(UserLeave.user_id == user_id, UserLeave.leave_date == leave_date)
        .first()
    )
    if not leave:
        raise HTTPException(404, "Leave record not found")
    db.delete(leave)
    db.commit()
    return {"deleted": True}


@router.get("")
def list_leaves(
    leave_date: date | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*ALLOWED_ROLES)),
):
    target_date = leave_date or _today_ist()
    rows = db.query(UserLeave).filter(UserLeave.leave_date == target_date).all()
    return {
        "date": str(target_date),
        "leaves": [{"user_id": r.user_id, "leave_date": str(r.leave_date)} for r in rows],
    }
