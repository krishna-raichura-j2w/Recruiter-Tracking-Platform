from fastapi import APIRouter, Depends, HTTPException
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
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    role = current_user.role.value
    sent_by_id = current_user.id if role == "recruiter" else None
    return service.list_mails(db, sent_by_id)


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
