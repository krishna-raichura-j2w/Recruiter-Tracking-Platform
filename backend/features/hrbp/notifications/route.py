from core.database import get_db
from core.deps import get_current_user
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from features.hrbp.notifications import service

router = APIRouter(prefix="/notifications", tags=["hrbp-notifications"])


@router.get("")
def list_notifications(
    unread_only: bool = Query(False),
    page_no: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.list_for_user(db, current_user.id, unread_only, page_no, per_page)


@router.patch("/{notif_id}/read")
def mark_one_read(
    notif_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.mark_read(db, notif_id, current_user.id)


@router.post("/mark-all-read")
def mark_all_read(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.mark_all_read(db, current_user.id)


@router.delete("/{notif_id}")
def delete_notification(
    notif_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.delete(db, notif_id, current_user.id)
