from core.database import get_db
from core.deps import get_current_user, require_roles
from core.sql_loader import load_sql
from fastapi import APIRouter, Depends, HTTPException, Query
from infra.models import (
    Candidate,
    CandidateStatus,
    Job,
    NotifType,
    User,
    isofy_datetimes,
    to_iso_utc,
)
from infra.s3 import to_viewable_url
from pydantic import BaseModel
from sqlalchemy.orm import Session

from features.mrr.candidates import service
from features.mrr.candidates.schema import CandidateCreate, CandidateUpdate
from features.mrr.notifications.service import push

router = APIRouter(prefix="/candidates", tags=["candidates"])


def _serialize(c):
    base = {col.name: getattr(c, col.name) for col in c.__table__.columns}
    isofy_datetimes(base)
    base["assigned_to_name"] = c.assigned_to.name if c.assigned_to else None
    base["assigned_validator_name"] = (
        c.assigned_validator.name if c.assigned_validator else None
    )
    base["sourced_by_name"] = c.sourced_by.name if c.sourced_by else None
    base["validated_by_name"] = (
        c.validation.delivery_lead.name
        if c.validation and c.validation.delivery_lead
        else None
    )
    base["validated_by_id"] = (
        c.validation.delivery_lead_id if c.validation else None
    )
    base["job_title"] = c.job.role_title if c.job else None
    base["client_name"] = c.job.client_name if c.job else None
    if c.assessment:
        base["overall_score"] = c.assessment.overall_score
        base["auto_recommendation"] = c.assessment.auto_recommendation
    else:
        base["overall_score"] = None
        base["auto_recommendation"] = None
    base["resume_data"] = to_viewable_url(base.get("resume_data"), candidate_id=c.id)
    # applied_by is the email of the recruiter who applied this candidate to
    # THIS candidate row's job. One row per (person × job).
    base["applied_by"] = c.applied_by
    return base


def _pod_job_ids(db: Session, created_by_id: int) -> list[int]:
    return [
        j.id for j in db.query(Job).filter(Job.created_by_id == created_by_id).all()
    ]


@router.get("")
def list_candidates(
    job_id: int | None = Query(None),
    status: str | None = Query(None),
    assigned_to: int | None = Query(None),
    search: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=0, le=1000),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # Hard cap: each serialized candidate triggers an S3 presigned-URL call, so a
    # large page holds the DB connection for the whole batch. Cap at 100 server-side
    # so stale frontends (which may still request limit=1000) can't exhaust the pool.
    if not limit or limit > 100:
        limit = 100
    role = current_user.role.value
    _assigned_to = assigned_to
    _sourced_by = None
    # Per-role candidate visibility scope (shared with the /ol-status endpoint).
    _job_ids, _recruiter_id = service.resolve_candidate_scope(db, current_user)

    items, total = service.list_candidates(
        db,
        job_id,
        status,
        _assigned_to,
        _sourced_by,
        _job_ids,
        _recruiter_id,
        search=search,
        skip=skip,
        limit=limit,
        kam_order=(role == "kam"),
    )
    return {
        "items": [_serialize(c) for c in items],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.get("/ol-status")
def candidates_ol_status(
    date: str | None = Query(None),
    start: str | None = Query(None),
    end: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """DL-verified candidates (scoped to the logged-in user) in the [start, end]
    window, each annotated with the status the Offer Letter tool shows. Same
    population as the leaderboard's "DL Subs — Offer Letter Status" table, scoped
    via the user's existing per-role candidate visibility.
    """
    from features.mrr.pod_plan.service import period_bounds

    scope = service.resolve_ol_status_scope(db, current_user)
    bounds = period_bounds(date, start, end)
    return {"rows": service.fetch_scoped_ol_reconciliation(db, bounds, **scope)}


@router.get("/{candidate_id}")
def get_candidate(
    candidate_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    c = service.get_candidate(db, candidate_id)
    if not c:
        raise HTTPException(status_code=404, detail="Candidate not found")
    result = _serialize(c)
    result["call_logs"] = [
        {
            "id": log.id,
            "call_date": to_iso_utc(log.call_date),
            "outcome": log.outcome,
            "notes": log.notes,
        }
        for log in c.call_logs
    ]
    result["assessment"] = (
        isofy_datetimes(
            {
                col.name: getattr(c.assessment, col.name)
                for col in c.assessment.__table__.columns
            },
        )
        if c.assessment
        else None
    )
    result["validation"] = (
        isofy_datetimes(
            {
                col.name: getattr(c.validation, col.name)
                for col in c.validation.__table__.columns
            },
        )
        if c.validation
        else None
    )
    result["consultant_profile"] = (
        isofy_datetimes(
            {
                col.name: getattr(c.consultant_profile, col.name)
                for col in c.consultant_profile.__table__.columns
            },
        )
        if c.consultant_profile
        else None
    )
    # Include mail-sent flag so frontend can disable Generate Email once sent
    result["mail_sent"] = c.consultant_mail is not None
    return result


@router.get("/check-email")
def check_email_onboarded(
    email: str = Query(...),
    _=Depends(get_current_user),
):
    """Check via OL Replica if a candidate email is already onboarded."""
    import os
    import pymysql
    import pymysql.cursors

    host = os.getenv("OL_REPLICA_HOST", "")
    if not host:
        # OL Replica not configured — skip the check, allow candidate creation
        return {"onboarded": False, "checked": False}

    try:
        conn = pymysql.connect(
            host=host,
            port=int(os.getenv("OL_REPLICA_PORT", "3306")),
            db=os.getenv("OL_REPLICA_DATABASE", "offerletter"),
            user=os.getenv("OL_REPLICA_USER", ""),
            password=os.getenv("OL_REPLICA_PASSWORD", ""),
            charset="utf8mb4",
            cursorclass=pymysql.cursors.DictCursor,
            connect_timeout=10,
            read_timeout=10,
            autocommit=True,
        )
        with conn:
            with conn.cursor() as cur:
                cur.execute(load_sql("035-check_candidate_onboarded.sql"), {"email": email})
                rows = cur.fetchall()
        return {"onboarded": len(rows) > 0, "checked": True}
    except Exception:
        # If OL Replica is unreachable, don't block the recruiter
        return {"onboarded": False, "checked": False}


@router.post("")
def create_candidate(
    body: CandidateCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("recruiter", "admin", "delivery_lead")),
):
    candidate = service.create_candidate_full(db, body.model_dump(), current_user)
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
    db: Session = Depends(get_db),
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
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(*REJECT_ROLES)),
):
    c = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Candidate not found")
    role_label = {
        "kam": "KAM",
        "delivery_lead": "Delivery Lead",
        "admin": "Admin",
    }.get(current_user.role.value, current_user.role.value)
    c.status = CandidateStatus.rejected
    c.rejection_reason = body.reason
    c.rejected_by = f"{role_label}: {current_user.name}"
    db.commit()
    db.refresh(c)
    return _serialize(c)
