from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from core.database import get_db
from core.deps import get_current_user, require_roles
from features.validation.schema import ValidationAction
from features.validation import service

router = APIRouter(prefix="/validation", tags=["validation"])

VALIDATORS = ("delivery_lead", "admin")


def _serialize_candidate(c) -> dict:
    item = {col.name: getattr(c, col.name) for col in c.__table__.columns}
    item["job_title"]               = c.job.role_title if c.job else None
    item["client_name"]             = c.job.client_name if c.job else None
    item["assigned_to_name"]        = c.assigned_to.name if c.assigned_to else None
    item["assigned_validator_name"] = c.assigned_validator.name if c.assigned_validator else None
    if c.assessment:
        item["overall_score"]       = c.assessment.overall_score
        item["auto_recommendation"] = c.assessment.auto_recommendation
        item["tech_score"]          = c.assessment.tech_score
        item["soft_skill_score"]    = c.assessment.soft_skill_score
    return item


@router.get("/queue")
def pending_queue(
    db: Session  = Depends(get_db),
    current_user = Depends(require_roles(*VALIDATORS)),
):
    role = current_user.role.value
    if role == "delivery_lead" and current_user.pod_lead_id:
        # DL in a pod: only see candidates assigned to them
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
    return {col.name: getattr(v, col.name) for col in v.__table__.columns}
