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
    _job_ids: list[int] | None = None
    _recruiter_id: int | None = None

    if role == "recruiter":
        _recruiter_id = current_user.id
        # Restrict to candidates on JDs the recruiter is CURRENTLY assigned to.
        # When a recruiter is removed from a JD, they should stop seeing its
        # candidates — even ones they originally sourced. Attribution is
        # preserved in the DB (sourced_by_id) for leaderboards / reports.
        import json as _json

        uid = current_user.id
        active_job_ids = []
        for j in db.query(Job).all():
            s_ids = (
                _json.loads(j.sourcer_ids or "[]")
                if isinstance(j.sourcer_ids, str)
                else []
            )
            c_ids = (
                _json.loads(j.caller_ids or "[]")
                if isinstance(j.caller_ids, str)
                else []
            )
            if (
                uid in s_ids
                or uid in c_ids
                or j.assigned_sourcer_id == uid
                or j.assigned_caller_id == uid
            ):
                active_job_ids.append(j.id)
        _job_ids = active_job_ids if active_job_ids else []
    elif role == "delivery_lead":
        import json as _json

        uid = current_user.id
        dl_job_ids = []
        for j in db.query(Job).all():
            dl_ids = (
                _json.loads(j.delivery_lead_ids or "[]")
                if isinstance(j.delivery_lead_ids, str)
                else (j.delivery_lead_ids or [])
            )
            if j.delivery_lead_id == uid or uid in dl_ids:
                dl_job_ids.append(j.id)
        _job_ids = dl_job_ids if dl_job_ids else []
    elif role == "kam":
        # KAM sees candidates for jobs they created/own
        kam_job_ids = [
            j.id
            for j in db.query(Job).filter(Job.created_by_id == current_user.id).all()
        ]
        _job_ids = kam_job_ids  # empty list = no results if KAM has no jobs
    elif role == "bh":
        # BH sees every candidate sourced by any user in their pod.
        # Filter by pod members (recruiters + DLs who could have sourced).
        if not current_user.pod_id:
            _job_ids = []  # BH with no pod → nothing
        else:
            pod_user_ids = [
                u.id for u in db.query(User).filter(User.pod_id == current_user.pod_id).all()
            ]
            _sourced_by = None  # we use a different shape below
            # Scope by sourcer being a pod member. service.list_candidates
            # supports filtering by a specific sourced_by; we pass the pod's
            # full set as an "any of these" list via the _job_ids escape
            # hatch indirectly — instead, narrow to jobs created by pod KAMs
            # or those whose delivery_lead_id is a pod DL.
            pod_user_id_set = set(pod_user_ids)
            pod_job_ids: list[int] = []
            import json as _json
            for j in db.query(Job).all():
                if j.created_by_id in pod_user_id_set:
                    pod_job_ids.append(j.id)
                    continue
                if j.delivery_lead_id in pod_user_id_set:
                    pod_job_ids.append(j.id)
                    continue
                dl_ids = (
                    _json.loads(j.delivery_lead_ids or "[]")
                    if isinstance(j.delivery_lead_ids, str)
                    else (j.delivery_lead_ids or [])
                )
                if any(d in pod_user_id_set for d in dl_ids):
                    pod_job_ids.append(j.id)
                    continue
                s_ids = (
                    _json.loads(j.sourcer_ids or "[]")
                    if isinstance(j.sourcer_ids, str)
                    else []
                )
                if any(s in pod_user_id_set for s in s_ids):
                    pod_job_ids.append(j.id)
            _job_ids = pod_job_ids

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
    import json as _json

    role = current_user.role.value

    # OL duplicate check — block if this candidate is already applied to this job in OL
    job = db.query(Job).filter(Job.id == body.job_id).first()
    if job and job.job_id and body.email:
        try:
            from core.sql_loader import load_ol_sql
            from features.mrr.ol_lookup.routes import _get_ol_conn
            _ol = _get_ol_conn()
            try:
                with _ol.cursor() as _cur:
                    _cur.execute(load_ol_sql("check_duplicate_application.sql"), (body.email, job.job_id))
                    if (_cur.fetchone() or {}).get("is_mapped") == "YES":
                        raise HTTPException(
                            status_code=409,
                            detail="This candidate has already applied for this job in OfferLetter.",
                        )
            finally:
                _ol.close()
        except HTTPException:
            raise
        except Exception:
            pass  # OL unreachable — don't block sourcing

    # Both recruiters and DLs are credited as sourcer
    sourced_by_id = current_user.id if role in ("recruiter", "delivery_lead") else None
    candidate = service.create_candidate(
        db,
        body.model_dump(),
        sourced_by_id=sourced_by_id,
        created_by_email=current_user.email,
    )

    # OL onboarding/benched flags
    if body.email:
        try:
            from features.mrr.ol_lookup.routes import check_onboarded_benched
            flags = check_onboarded_benched(body.email)
            candidate.is_onboarded = flags["is_onboarded"]
            candidate.is_benched   = flags["is_benched"]
            db.commit()
            db.refresh(candidate)
        except Exception:
            pass  # OL unreachable — flags stay False, non-blocking

    job = db.query(Job).filter(Job.id == candidate.job_id).first()
    from features.mrr.activity.service import log as log_activity

    log_activity(
        db,
        current_user.id,
        "sourced_candidate",
        (
            f"Sourced {candidate.full_name} for {job.client_name} – {job.role_title}"
            if job
            else f"Sourced candidate: {candidate.full_name}"
        ),
        entity_type="candidate",
        entity_id=candidate.id,
    )

    # Caller assignment:
    #  - Recruiter sourced → hand off to a recruiter caller (min-load).
    #  - DL sourced  → DL keeps the candidate; no "handed to recruiter" badge.
    if job:
        if role == "delivery_lead":
            # DL is the caller. Assign directly without flipping status to
            # "handed_to_recruiter" — that label is only correct when someone
            # ELSE is going to make the call.
            candidate.assigned_to_id = current_user.id
            db.commit()
            db.refresh(candidate)
        else:
            caller_ids = (
                _json.loads(job.caller_ids or "[]")
                if isinstance(job.caller_ids, str)
                else []
            )
            if not caller_ids and job.assigned_caller_id:
                caller_ids = [job.assigned_caller_id]
            if caller_ids:
                from features.mrr.allocation.service import _batch_caller_counts

                caller_counts = _batch_caller_counts(db, caller_ids)
                caller_id = min(caller_ids, key=lambda uid: caller_counts.get(uid, 0))
                candidate = service.assign_candidate(db, candidate.id, caller_id)
                if caller_id != current_user.id:
                    push(
                        db,
                        caller_id,
                        f"New candidate sourced: {candidate.full_name} for {job.role_title} ({job.client_name}). Ready for your call.",
                        NotifType.candidate_sourced,
                        entity_id=candidate.id,
                    )
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
