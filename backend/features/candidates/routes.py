from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from core.database import get_db
from core.deps import get_current_user, require_roles
from features.candidates.schema import CandidateCreate, CandidateUpdate
from features.candidates import service
from features.notifications.service import push
from infra.models import Job, Candidate, CandidateStatus, NotifType, to_iso_utc, isofy_datetimes
from infra.s3 import to_viewable_url

router = APIRouter(prefix="/candidates", tags=["candidates"])


def _serialize(c):
    base = {col.name: getattr(c, col.name) for col in c.__table__.columns}
    isofy_datetimes(base)
    base["assigned_to_name"]        = c.assigned_to.name if c.assigned_to else None
    base["assigned_validator_name"] = c.assigned_validator.name if c.assigned_validator else None
    base["sourced_by_name"]         = c.sourced_by.name if c.sourced_by else None
    base["job_title"]               = c.job.role_title if c.job else None
    base["client_name"]             = c.job.client_name if c.job else None
    if c.assessment:
        base["overall_score"]       = c.assessment.overall_score
        base["auto_recommendation"] = c.assessment.auto_recommendation
    else:
        base["overall_score"]       = None
        base["auto_recommendation"] = None
    base["resume_data"] = to_viewable_url(base.get("resume_data"))
    return base


def _pod_job_ids(db: Session, created_by_id: int) -> list[int]:
    return [j.id for j in db.query(Job).filter(Job.created_by_id == created_by_id).all()]


@router.get("")
def list_candidates(
    job_id:      int | None = Query(None),
    status:      str | None = Query(None),
    assigned_to: int | None = Query(None),
    db:          Session    = Depends(get_db),
    current_user            = Depends(get_current_user),
):
    role = current_user.role.value
    _assigned_to  = assigned_to
    _sourced_by   = None
    _job_ids: list[int] | None = None
    _recruiter_id: int | None  = None

    if role == "recruiter":
        # Show everything they sourced OR are assigned to call
        _recruiter_id = current_user.id

    elif role == "delivery_lead":
        # DL sees all candidates for jobs they oversee
        # pod_lead_id on DL points to... nothing (DL is the manager)
        # DL team members have pod_lead_id = DL's id
        # Jobs are created by pod_lead → DL confirmed them (delivery_lead_id = DL.id)
        # Show all candidates from jobs DL has confirmed
        dl_job_ids = [j.id for j in db.query(Job).filter(Job.delivery_lead_id == current_user.id).all()]
        # Also show all pending jobs' candidates where DL is in the org
        _job_ids = dl_job_ids if dl_job_ids else []

    elif role == "kam":
        _job_ids = []  # KAM doesn't see candidates directly

    candidates = service.list_candidates(db, job_id, status, _assigned_to, _sourced_by, _job_ids, _recruiter_id)
    return [_serialize(c) for c in candidates]


@router.get("/{candidate_id}")
def get_candidate(
    candidate_id: int,
    db: Session   = Depends(get_db),
    _             = Depends(get_current_user),
):
    c = service.get_candidate(db, candidate_id)
    if not c:
        raise HTTPException(status_code=404, detail="Candidate not found")
    result = _serialize(c)
    result["call_logs"] = [
        {"id": l.id, "call_date": to_iso_utc(l.call_date), "outcome": l.outcome, "notes": l.notes}
        for l in c.call_logs
    ]
    result["assessment"] = (
        isofy_datetimes({col.name: getattr(c.assessment, col.name) for col in c.assessment.__table__.columns})
        if c.assessment else None
    )
    result["validation"] = (
        isofy_datetimes({col.name: getattr(c.validation, col.name) for col in c.validation.__table__.columns})
        if c.validation else None
    )
    result["consultant_profile"] = (
        isofy_datetimes({col.name: getattr(c.consultant_profile, col.name) for col in c.consultant_profile.__table__.columns})
        if c.consultant_profile else None
    )
    # Include mail-sent flag so frontend can disable Generate Email once sent
    result["mail_sent"] = c.consultant_mail is not None
    return result


@router.post("")
def create_candidate(
    body: CandidateCreate,
    db: Session    = Depends(get_db),
    current_user   = Depends(require_roles("recruiter", "admin", "delivery_lead")),
):
    role = current_user.role.value
    sourced_by_id = current_user.id if role == "recruiter" else None
    candidate = service.create_candidate(db, body.model_dump(), sourced_by_id=sourced_by_id)

    # Log activity
    import json as _json
    job = db.query(Job).filter(Job.id == candidate.job_id).first()
    from features.activity.service import log as log_activity
    log_activity(db, current_user.id, "sourced_candidate",
                 f"Sourced {candidate.full_name} for {job.client_name} – {job.role_title}" if job
                 else f"Sourced candidate: {candidate.full_name}",
                 entity_type="candidate", entity_id=candidate.id)
    if job:
        caller_ids = _json.loads(job.caller_ids or '[]') if isinstance(job.caller_ids, str) else []
        if not caller_ids and job.assigned_caller_id:
            caller_ids = [job.assigned_caller_id]
        if caller_ids:
            from features.allocation.service import _caller_load
            best_id = min(caller_ids, key=lambda uid: _caller_load(db, uid))
            candidate = service.assign_candidate(db, candidate.id, best_id)
            # Notify the caller
            push(db, best_id,
                f"New candidate sourced: {candidate.full_name} for {job.role_title} ({job.client_name}). Ready for your call.",
                NotifType.candidate_sourced, entity_id=candidate.id)
            db.commit()

    return _serialize(candidate)


@router.patch("/{candidate_id}")
def update_candidate(
    candidate_id: int,
    body: CandidateUpdate,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    c = service.update_candidate(db, candidate_id, body.model_dump(exclude_none=True))
    if not c:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return _serialize(c)


@router.post("/{candidate_id}/assign")
def assign_candidate(
    candidate_id: int,
    user_id: int = Query(...),
    db: Session  = Depends(get_db),
    _=Depends(require_roles("admin", "delivery_lead")),
):
    c = service.assign_candidate(db, candidate_id, user_id)
    if not c:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return _serialize(c)


class RejectBody(BaseModel):
    reason: str


REJECT_ROLES = ("kam", "delivery_lead", "admin")


@router.post("/{candidate_id}/reject")
def reject_candidate(
    candidate_id: int,
    body: RejectBody,
    db: Session  = Depends(get_db),
    current_user = Depends(require_roles(*REJECT_ROLES)),
):
    c = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Candidate not found")
    role_label = {
        "kam":           "KAM",
        "delivery_lead": "Delivery Lead",
        "admin":         "Admin",
    }.get(current_user.role.value, current_user.role.value)
    c.status           = CandidateStatus.rejected
    c.rejection_reason = body.reason
    c.rejected_by      = f"{role_label}: {current_user.name}"
    db.commit()
    db.refresh(c)
    return _serialize(c)
