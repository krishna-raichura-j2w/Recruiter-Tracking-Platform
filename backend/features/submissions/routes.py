from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from core.database import get_db
from core.deps import get_current_user, require_roles
from features.submissions.schema import SubmitToClient, StageUpdate
from features.submissions import service

router = APIRouter(prefix="/submissions", tags=["submissions"])

ALLOWED = ("delivery_lead", "admin", "kam")


@router.get("/ready")
def ready_to_submit(
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(*ALLOWED)),
):
    """KAM sees validated candidates for JDs they manage; DL/admin sees all."""
    kam_id = current_user.id if current_user.role.value == "kam" else None
    return service.list_validated_candidates(db, kam_id=kam_id)


@router.get("")
def list_submissions(
    closed: bool = Query(False),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(*ALLOWED, "recruiter")),
):
    role = current_user.role.value
    kam_id = current_user.id if role == "kam" else None
    return service.list_submissions(db, kam_id=kam_id, closed=closed)


@router.post("")
def submit_to_client(
    body: SubmitToClient,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(*ALLOWED)),
):
    result = service.submit_to_client(db, body.candidate_id, body.notes, current_user.id)
    if not result:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return result


@router.patch("/{submission_id}")
def update_stage(
    submission_id: int,
    body: StageUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(*ALLOWED, "recruiter")),
):
    result = service.update_stage(
        db, submission_id,
        body.model_dump(exclude_none=True),
        updated_by_id=current_user.id,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Submission not found")
    return result


@router.get("/{submission_id}/timeline")
def get_timeline(
    submission_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    return service.get_timeline(db, submission_id)
