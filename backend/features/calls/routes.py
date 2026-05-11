from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from core.database import get_db
from core.deps import get_current_user, require_roles
from features.calls.schema import CallLogCreate, AssessmentUpsert
from features.calls import service

router = APIRouter(prefix="/calls", tags=["calls"])

CALLERS = ("recruiter", "admin", "delivery_lead")


@router.post("/log")
def log_call(
    body: CallLogCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(*CALLERS)),
):
    log = service.log_call(db, body.model_dump(), current_user.id)
    return {"id": log.id, "outcome": log.outcome, "created_at": str(log.created_at)}


@router.post("/assessment")
def upsert_assessment(
    body: AssessmentUpsert,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(*CALLERS)),
):
    assessment = service.upsert_assessment(db, body.model_dump(), current_user.id)
    return {
        col.name: getattr(assessment, col.name)
        for col in assessment.__table__.columns
    }


@router.get("/assessment/{candidate_id}")
def get_assessment(
    candidate_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    a = service.get_assessment(db, candidate_id)
    if not a:
        raise HTTPException(status_code=404, detail="No assessment found")
    return {col.name: getattr(a, col.name) for col in a.__table__.columns}
