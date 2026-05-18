from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from core.database import get_db
from core.deps import get_current_user, require_roles
from features.mails.schema import MailCreate, MailUpdate
from features.mails import service

router = APIRouter(prefix="/mails", tags=["mails"])


@router.post("")
def mark_mail_sent(
    body: MailCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("recruiter", "admin", "delivery_lead")),
):
    return service.mark_sent(db, body.candidate_id, current_user.id)


@router.get("")
def list_mails(
    search: str | None = Query(None),
    skip:   int        = Query(0, ge=0),
    limit:  int        = Query(50, ge=0, le=500),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    role = current_user.role.value
    sent_by_id = current_user.id if role == "recruiter" else None
    items, total = service.list_mails(db, sent_by_id, search=search, skip=skip, limit=limit)
    return {"items": items, "total": total, "skip": skip, "limit": limit}


@router.patch("/{mail_id}")
def update_mail(
    mail_id: int,
    body: MailUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = service.update_mail(db, mail_id, body.model_dump(exclude_none=True), current_user.role.value)
    if not result:
        raise HTTPException(status_code=404, detail="Mail record not found")
    return result
