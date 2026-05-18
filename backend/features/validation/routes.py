from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from core.database import get_db
from core.deps import get_current_user, require_roles
from features.validation.schema import ValidationAction
from features.validation import service
from infra.models import isofy_datetimes

router = APIRouter(prefix="/validation", tags=["validation"])

VALIDATORS = ("delivery_lead", "admin")


def _serialize_candidate(c) -> dict:
    candidate = {col.name: getattr(c, col.name) for col in c.__table__.columns}
    isofy_datetimes(candidate)
    candidate["job_title"]               = c.job.role_title if c.job else None
    candidate["client_name"]             = c.job.client_name if c.job else None
    candidate["assigned_to_name"]        = c.assigned_to.name if c.assigned_to else None
    candidate["assigned_validator_name"] = c.assigned_validator.name if c.assigned_validator else None
    if c.assessment:
        candidate["overall_score"]       = c.assessment.overall_score
        candidate["auto_recommendation"] = c.assessment.auto_recommendation

    assessment = None
    if c.assessment:
        assessment = isofy_datetimes({col.name: getattr(c.assessment, col.name) for col in c.assessment.__table__.columns})

    return {"candidate": candidate, "assessment": assessment}


@router.get("/queue")
def pending_queue(
    skip:  int   = Query(0, ge=0),
    limit: int   = Query(50, ge=0, le=500),
    db: Session  = Depends(get_db),
    current_user = Depends(require_roles(*VALIDATORS)),
):
    role = current_user.role.value
    if role == "delivery_lead":
        candidates, total = service.list_pending_for_validator(db, current_user.id, skip=skip, limit=limit)
    else:
        candidates, total = service.list_pending(db, skip=skip, limit=limit)

    return {"items": [_serialize_candidate(c) for c in candidates], "total": total, "skip": skip, "limit": limit}


@router.post("/action")
def validate(
    body: ValidationAction,
    db: Session  = Depends(get_db),
    current_user = Depends(require_roles(*VALIDATORS)),
):
    v = service.validate_candidate(db, body.model_dump(), current_user.id, current_user.name)
    from infra.models import Candidate
    from features.activity.service import log as log_activity
    c = db.query(Candidate).filter(Candidate.id == body.candidate_id).first()
    verdict = body.model_dump().get("verdict", "")
    if c and c.job:
        log_activity(db, current_user.id, "validated_candidate",
                     f"Validated {c.full_name} ({verdict}) for {c.job.client_name} – {c.job.role_title}",
                     entity_type="candidate", entity_id=c.id)
    return isofy_datetimes({col.name: getattr(v, col.name) for col in v.__table__.columns})
