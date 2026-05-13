from fastapi import APIRouter, Depends
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
    db: Session  = Depends(get_db),
    current_user = Depends(require_roles(*VALIDATORS)),
):
    role = current_user.role.value
    if role == "delivery_lead":
        # Each DL only sees candidates explicitly assigned to them as validator
        candidates = service.list_pending_for_validator(db, current_user.id)
    else:
        candidates = service.list_pending(db)

    return [_serialize_candidate(c) for c in candidates]


@router.post("/action")
def validate(
    body: ValidationAction,
    db: Session  = Depends(get_db),
    current_user = Depends(require_roles(*VALIDATORS)),
):
    v = service.validate_candidate(db, body.model_dump(), current_user.id, current_user.name)
    return isofy_datetimes({col.name: getattr(v, col.name) for col in v.__table__.columns})
