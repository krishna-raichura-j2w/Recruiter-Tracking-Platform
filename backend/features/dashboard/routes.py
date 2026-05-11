from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from core.database import get_db
from core.deps import get_current_user
from features.dashboard import service

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("")
def dashboard(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.get_dashboard(db, current_user.id, current_user.role.value)


@router.get("/notifications")
def notifications(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.get_notifications(db, current_user.id)


@router.post("/notifications/{notif_id}/read")
def mark_read(notif_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    service.mark_read(db, notif_id, current_user.id)
    return {"message": "marked read"}
