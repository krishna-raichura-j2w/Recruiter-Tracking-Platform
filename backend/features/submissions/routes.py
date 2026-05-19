from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from core.database import get_db
from core.deps import get_current_user, require_roles
from features.submissions.schema import SubmitToClient, StageUpdate
from features.submissions import service

router = APIRouter(prefix="/submissions", tags=["submissions"])

# Who can SUBMIT a candidate to a client (queue access + the submit action).
# DLs validate but do NOT submit; only KAM + admin send to client.
SUBMITTERS = ("admin", "kam")
# Who can VIEW or UPDATE existing submissions (interview tracking).
# DLs need to see and update interview stages for their team's candidates.
VIEWERS    = ("admin", "kam", "delivery_lead", "recruiter")


@router.get("/ready")
def ready_to_submit(
    search: str | None = Query(None),
    skip:   int        = Query(0, ge=0),
    limit:  int        = Query(50, ge=0, le=500),
    # Filters (admin-only effectively; KAM stays scoped to their JDs)
    client_name:      str | None = Query(None),
    business_head_id: int | None = Query(None),
    from_date:        str | None = Query(None),
    to_date:          str | None = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(*SUBMITTERS)),
):
    role   = current_user.role.value
    kam_id = current_user.id if role == "kam" else None
    items, total = service.list_validated_candidates(
        db, kam_id=kam_id, dl_id=None, search=search,
        client_name=client_name, business_head_id=business_head_id,
        from_date=from_date, to_date=to_date,
        skip=skip, limit=limit,
    )
    return {"items": items, "total": total, "skip": skip, "limit": limit}


@router.get("")
def list_submissions(
    closed: bool       = Query(False),
    search: str | None = Query(None),
    skip:   int        = Query(0, ge=0),
    limit:  int        = Query(50, ge=0, le=500),
    # Filters
    client_name:       str | None = Query(None),
    business_head_id:  int | None = Query(None),
    kam_filter_id:     int | None = Query(None, alias="kam_id"),
    delivery_lead_id:  int | None = Query(None),
    from_date:         str | None = Query(None),
    to_date:           str | None = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(*VIEWERS)),
):
    role   = current_user.role.value
    # Role-scoped IDs (KAM/DL only see their own; admin sees all, then applies filters)
    scoped_kam_id = current_user.id if role == "kam" else None
    scoped_dl_id  = current_user.id if role == "delivery_lead" else None
    items, total = service.list_submissions(
        db, kam_id=scoped_kam_id, dl_id=scoped_dl_id,
        closed=closed, search=search,
        client_name=client_name, business_head_id=business_head_id,
        delivery_lead_id=delivery_lead_id, kam_filter_id=kam_filter_id,
        from_date=from_date, to_date=to_date,
        skip=skip, limit=limit,
    )
    return {"items": items, "total": total, "skip": skip, "limit": limit}


@router.post("")
def submit_to_client(
    body: SubmitToClient,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(*SUBMITTERS)),
):
    result = service.submit_to_client(db, body.candidate_id, body.notes, current_user.id)
    if not result:
        raise HTTPException(status_code=404, detail="Candidate not found")
    from infra.models import Candidate
    from features.activity.service import log as log_activity
    c = db.query(Candidate).filter(Candidate.id == body.candidate_id).first()
    if c and c.job:
        log_activity(db, current_user.id, "submitted_to_client",
                     f"Submitted {c.full_name} to {c.job.client_name} – {c.job.role_title}",
                     entity_type="candidate", entity_id=c.id)
    return result


@router.patch("/{submission_id}")
def update_stage(
    submission_id: int,
    body: StageUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(*VIEWERS)),
):
    result = service.update_stage(
        db, submission_id,
        body.model_dump(exclude_none=True),
        updated_by_id=current_user.id,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Submission not found")
    # Log stage update
    from features.activity.service import log as log_activity
    stage = body.model_dump(exclude_none=True).get("current_stage", "")
    log_activity(db, current_user.id, "updated_stage",
                 f"Updated interview stage to {stage.replace('_', ' ')}",
                 entity_type="submission", entity_id=submission_id)
    return result


@router.get("/{submission_id}/timeline")
def get_timeline(
    submission_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    return service.get_timeline(db, submission_id)
