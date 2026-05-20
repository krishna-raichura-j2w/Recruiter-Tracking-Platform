from core.database import get_db
from core.deps import require_roles
from fastapi import APIRouter, Depends, Query
from infra.models import isofy_datetimes
from sqlalchemy.orm import Session

from features.mrr.validation import service
from features.mrr.validation.schema import ValidationAction

router = APIRouter(prefix="/validation", tags=["validation"])

VALIDATORS = ("delivery_lead", "admin")


def _serialize_candidate(c) -> dict:
    candidate = {col.name: getattr(c, col.name) for col in c.__table__.columns}
    isofy_datetimes(candidate)
    candidate["job_title"] = c.job.role_title if c.job else None
    candidate["client_name"] = c.job.client_name if c.job else None
    candidate["assigned_to_name"] = c.assigned_to.name if c.assigned_to else None
    candidate["assigned_validator_name"] = (
        c.assigned_validator.name if c.assigned_validator else None
    )
    if c.assessment:
        candidate["overall_score"] = c.assessment.overall_score
        candidate["auto_recommendation"] = c.assessment.auto_recommendation

    assessment = None
    if c.assessment:
        assessment = isofy_datetimes(
            {
                col.name: getattr(c.assessment, col.name)
                for col in c.assessment.__table__.columns
            },
        )

    return {"candidate": candidate, "assessment": assessment}


@router.get("/queue")
def pending_queue(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=0, le=500),
    # Filters (admin can use freely; DLs are still scoped to their own queue)
    search: str | None = Query(None),
    client_name: str | None = Query(None),
    business_head_id: int | None = Query(None),
    kam_id: int | None = Query(None),
    delivery_lead_id: int | None = Query(None),
    validator_id: int | None = Query(None),
    from_date: str | None = Query(None, description="YYYY-MM-DD or ISO 8601"),
    to_date: str | None = Query(None, description="YYYY-MM-DD or ISO 8601 (inclusive)"),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(*VALIDATORS)),
):
    role = current_user.role.value
    filters = dict(
        search=search,
        client_name=client_name,
        business_head_id=business_head_id,
        kam_id=kam_id,
        delivery_lead_id=delivery_lead_id,
        validator_id=validator_id,
        from_date=from_date,
        to_date=to_date,
    )
    if role == "delivery_lead":
        # DL sees all ready_for_validation candidates in their own jobs.
        # Remove validator_id so it doesn't conflict with the explicit dl_id argument.
        dl_filters = {
            k: v
            for k, v in filters.items()
            if k != "validator_id" and k != "delivery_lead_id"
        }
        candidates, total = service.list_pending_for_dl(
            db, current_user.id, skip=skip, limit=limit, **dl_filters,
        )
    else:
        candidates, total = service.list_pending(db, skip=skip, limit=limit, **filters)

    return {
        "items": [_serialize_candidate(c) for c in candidates],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.post("/action")
def validate(
    body: ValidationAction,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(*VALIDATORS)),
):
    v = service.validate_candidate(
        db, body.model_dump(), current_user.id, current_user.name,
    )
    from infra.models import Candidate

    from features.mrr.activity.service import log as log_activity

    c = db.query(Candidate).filter(Candidate.id == body.candidate_id).first()
    verdict = body.model_dump().get("verdict", "")
    if c and c.job:
        log_activity(
            db,
            current_user.id,
            "validated_candidate",
            f"Validated {c.full_name} ({verdict}) for {c.job.client_name} – {c.job.role_title}",
            entity_type="candidate",
            entity_id=c.id,
        )
    return isofy_datetimes(
        {col.name: getattr(v, col.name) for col in v.__table__.columns},
    )
