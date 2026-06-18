import json as _json

from infra.models import (
    Candidate,
    CandidateStatus,
    Job,
    User,
    Validation,
)
from sqlalchemy import or_, text
from sqlalchemy.orm import Session, joinedload


def resolve_candidate_scope(db: Session, current_user) -> tuple[list[int] | None, int | None]:
    """Resolve the candidate visibility scope for the logged-in user by role.

    Returns ``(job_ids, recruiter_id)``:
      • ``job_ids`` — restrict candidates to these job ids. ``None`` = unrestricted
        (admin / unhandled roles); ``[]`` = the role resolves to *no* jobs (show nothing).
      • ``recruiter_id`` — when set (recruiter role), additionally restrict to candidates
        this user sourced or is assigned to.

    This mirrors exactly the per-role scoping used by ``list_candidates`` so the
    OL-status view shows the same candidate set the user sees in their list.
    """
    role = current_user.role.value

    if role == "recruiter":
        uid = current_user.id
        active_job_ids: list[int] = []
        for j in db.query(Job).all():
            s_ids = _json.loads(j.sourcer_ids or "[]") if isinstance(j.sourcer_ids, str) else []
            c_ids = _json.loads(j.caller_ids or "[]") if isinstance(j.caller_ids, str) else []
            if uid in s_ids or uid in c_ids or j.assigned_sourcer_id == uid or j.assigned_caller_id == uid:
                active_job_ids.append(j.id)
        return (active_job_ids if active_job_ids else []), uid

    if role == "delivery_lead":
        uid = current_user.id
        dl_job_ids: list[int] = []
        for j in db.query(Job).all():
            dl_ids = (
                _json.loads(j.delivery_lead_ids or "[]")
                if isinstance(j.delivery_lead_ids, str)
                else (j.delivery_lead_ids or [])
            )
            if j.delivery_lead_id == uid or uid in dl_ids:
                dl_job_ids.append(j.id)
        return (dl_job_ids if dl_job_ids else []), None

    if role == "kam":
        from features.mrr.jobs.service import _collaborator_kam_ids_for

        kam_job_ids = [
            j.id
            for j in db.query(Job).all()
            if j.created_by_id == current_user.id or current_user.id in _collaborator_kam_ids_for(j)
        ]
        return kam_job_ids, None

    if role == "bh":
        if not current_user.pod_id:
            return [], None
        pod_user_id_set = {
            u.id for u in db.query(User).filter(User.pod_id == current_user.pod_id).all()
        }
        pod_job_ids: list[int] = []
        for j in db.query(Job).all():
            if j.created_by_id in pod_user_id_set or j.delivery_lead_id in pod_user_id_set:
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
            s_ids = _json.loads(j.sourcer_ids or "[]") if isinstance(j.sourcer_ids, str) else []
            if any(s in pod_user_id_set for s in s_ids):
                pod_job_ids.append(j.id)
        return pod_job_ids, None

    # admin / other leadership roles → unrestricted
    return None, None


def resolve_ol_status_scope(db: Session, current_user) -> dict:
    """Scope for the Candidate Status (OL reconciliation) tab — by who SOURCED the
    candidate, not by job ownership.

    Returns a dict of filters for :func:`fetch_scoped_ol_reconciliation`:
      • recruiter      → ``{"sourcer_ids": [self]}`` — every candidate they sourced.
      • delivery_lead  → ``{"sourcer_ids": [...pod recruiter ids]}`` — candidates
        sourced by any recruiter in the DL's pod (via ``_team``).
      • kam / bh / admin → fall back to the job-based ``resolve_candidate_scope``.
    ``sourcer_ids == []`` means the user has no recruiters → show nothing.
    """
    role = current_user.role.value

    if role == "recruiter":
        return {"sourcer_ids": [current_user.id]}

    if role == "delivery_lead":
        from infra.models import UserRole

        from features.mrr.allocation.service import _team

        # Pod recruiters PLUS the DL themselves — a DL can also source/submit, and
        # _team excludes the anchor and returns only recruiter-role members.
        rec_ids = [u.id for u in _team(db, current_user.id, role=UserRole.recruiter)]
        return {"sourcer_ids": list({*rec_ids, current_user.id})}

    job_ids, recruiter_id = resolve_candidate_scope(db, current_user)
    return {"job_ids": job_ids, "recruiter_id": recruiter_id}


def fetch_scoped_ol_reconciliation(
    db: Session,
    bounds: dict,
    *,
    sourcer_ids: list[int] | None = None,
    job_ids: list[int] | None = None,
    recruiter_id: int | None = None,
) -> list[dict]:
    """DL-verified candidates in the [start, end] window, scoped to one user, each
    annotated with the status the Offer-Letter tool shows (matched by email).

    Same population/definition as the leaderboard's "DL Subs — Offer Letter Status"
    table (``validations.status='validated'``, anchored on ``candidates.sourced_at``).
    Scope is one of:
      • ``sourcer_ids`` — candidates whose ``sourced_by_id`` is in this set (the
        Candidate Status tab uses this for recruiters / DLs).
      • ``job_ids`` (+ optional ``recruiter_id``) — the job-based fallback for
        kam / bh / admin, from :func:`resolve_candidate_scope`.
    An empty ``sourcer_ids``/``job_ids`` list means the scope resolves to nothing →
    returns ``[]``. OL status matching is shared via ``enrich_rows_with_ol_status``.
    """
    if sourcer_ids is not None and len(sourcer_ids) == 0:
        return []
    if job_ids is not None and len(job_ids) == 0:
        return []

    where = [
        "v.status = 'validated'",
        "c.sourced_at >= :ps",
        "c.sourced_at < :pe",
        "c.email IS NOT NULL",
        "c.email <> ''",
    ]
    params: dict = {"ps": bounds["period_start_utc"], "pe": bounds["period_end_utc"]}
    if sourcer_ids is not None:
        where.append("c.sourced_by_id = ANY(:sourcer_ids)")
        params["sourcer_ids"] = sourcer_ids
    if job_ids is not None:
        where.append("c.job_id = ANY(:job_ids)")
        params["job_ids"] = job_ids
    if recruiter_id:
        where.append("(c.sourced_by_id = :rid OR c.assigned_to_id = :rid)")
        params["rid"] = recruiter_id

    rows = db.execute(
        text(f"""
            SELECT DISTINCT c.id     AS candidate_id,
                   c.full_name       AS candidate_name,
                   c.email           AS candidate_email,
                   c.status          AS mrr_status,
                   j.client_name     AS client_name,
                   j.job_id          AS demand_id,
                   j.role_title      AS role_title,
                   r.name            AS recruiter_name
            FROM validations v
            JOIN candidates c ON c.id = v.candidate_id
            JOIN jobs j ON j.id = c.job_id
            LEFT JOIN users r ON r.id = c.sourced_by_id
            WHERE {' AND '.join(where)}
            ORDER BY recruiter_name, candidate_name
        """),
        params,
    ).mappings().all()

    out: list[dict] = [
        {
            "candidate_id": r["candidate_id"],
            "candidate_name": r["candidate_name"],
            "candidate_email": r["candidate_email"],
            "mrr_status": r["mrr_status"].value if hasattr(r["mrr_status"], "value") else r["mrr_status"],
            "client_name": r["client_name"],
            "demand_id": r["demand_id"],
            "role_title": r["role_title"],
            "recruiter_name": r["recruiter_name"],
            "ol_status": None,
        }
        for r in rows
    ]

    from features.mrr.pod_plan.service import enrich_rows_with_ol_status

    enrich_rows_with_ol_status(out)
    return out


def _recruiter_email(db: Session, user_id) -> str | None:
    """Look up a recruiter's email by user id. Returns None on a bad id."""
    if user_id is None:
        return None
    u = db.query(User).filter(User.id == int(user_id)).first()
    return u.email if u else None


def _apply_candidate_filters(
    q,
    job_id,
    status,
    assigned_to,
    sourced_by,
    job_ids,
    recruiter_id,
    search,
):
    """Apply all candidate filters to a query object. Used for both count and data queries."""
    from infra.models import Candidate
    from sqlalchemy import func

    if job_ids is not None:
        if job_ids:
            q = q.filter(Candidate.job_id.in_(job_ids))
        else:
            return None  # empty result
    if job_id:
        q = q.filter(Candidate.job_id == job_id)
    if status:
        q = q.filter(Candidate.status == status)
    if recruiter_id:
        q = q.filter(
            or_(
                Candidate.sourced_by_id == recruiter_id,
                Candidate.assigned_to_id == recruiter_id,
            ),
        )
    else:
        if assigned_to:
            q = q.filter(Candidate.assigned_to_id == assigned_to)
        if sourced_by:
            q = q.filter(Candidate.sourced_by_id == sourced_by)
    if search:
        s = f"%{search.lower()}%"
        q = q.filter(
            or_(
                func.lower(Candidate.full_name).like(s),
                func.lower(Candidate.email).like(s),
                func.lower(Candidate.mobile).like(s),
                func.lower(Candidate.skills).like(s),
            ),
        )
    return q


def list_candidates(
    db: Session,
    job_id: int | None,
    status: str | None,
    assigned_to: int | None,
    sourced_by: int | None = None,
    job_ids: list[int] | None = None,
    recruiter_id: int | None = None,
    search: str | None = None,
    skip: int = 0,
    limit: int = 0,
    kam_order: bool = False,
) -> tuple[list[Candidate], int]:
    """
    Returns (items, total). limit=0 means no pagination (return all).
    kam_order=True sorts: validated first, then rejected, then rest.
    """
    from sqlalchemy import case as sa_case

    # Count query — lightweight, no joins
    count_q = _apply_candidate_filters(
        db.query(Candidate.id),
        job_id,
        status,
        assigned_to,
        sourced_by,
        job_ids,
        recruiter_id,
        search,
    )
    if count_q is None:
        return [], 0
    total = count_q.count()

    # Data query — with all joins
    data_q = _apply_candidate_filters(
        db.query(Candidate).options(
            joinedload(Candidate.assigned_to),
            joinedload(Candidate.sourced_by),
            joinedload(Candidate.assigned_validator),
            joinedload(Candidate.assessment),
            joinedload(Candidate.validation).joinedload(Validation.delivery_lead),
            joinedload(Candidate.submission),
            joinedload(Candidate.job),
        ),
        job_id,
        status,
        assigned_to,
        sourced_by,
        job_ids,
        recruiter_id,
        search,
    )
    if data_q is None:
        return [], 0

    if kam_order:
        # Priority: validated/submitted → rejected (DL or KAM) → everything else
        priority = sa_case(
            (
                Candidate.status.in_(
                    [
                        CandidateStatus.validated,
                        CandidateStatus.submitted_to_client,
                    ],
                ),
                0,
            ),
            (
                Candidate.status.in_(
                    [
                        CandidateStatus.rejected,
                    ],
                ),
                1,
            ),
            else_=2,
        )
        q = data_q.order_by(priority, Candidate.updated_at.desc())
    else:
        q = data_q.order_by(Candidate.updated_at.desc())

    if limit > 0:
        q = q.offset(skip).limit(limit)
    return q.all(), total


def get_candidate(db: Session, candidate_id: int) -> Candidate | None:
    return (
        db.query(Candidate)
        .options(
            joinedload(Candidate.assigned_to),
            joinedload(Candidate.sourced_by),
            joinedload(Candidate.assessment),
            joinedload(Candidate.validation),
            joinedload(Candidate.submission),
            joinedload(Candidate.consultant_profile),
            joinedload(Candidate.call_logs),
            joinedload(Candidate.job),
        )
        .filter(Candidate.id == candidate_id)
        .first()
    )


def create_candidate(
    db: Session,
    data: dict,
    sourced_by_id: int | None = None,
    created_by_email: str | None = None,
) -> Candidate:
    if sourced_by_id:
        data["sourced_by_id"] = sourced_by_id
    if created_by_email:
        data["created_by"] = created_by_email

    # Derive legacy / convenience fields from the new required ones so existing
    # downstream pages (validation queue, submissions, pipeline, etc.) keep
    # working without code changes.
    fn = (data.get("first_name") or "").strip()
    ln = (data.get("last_name") or "").strip()
    if not data.get("full_name"):
        data["full_name"] = (fn + " " + ln).strip() or "Unknown"
    if not data.get("mobile") and data.get("contact_phone"):
        data["mobile"] = data["contact_phone"]
    if not data.get("current_company") and data.get("employer"):
        data["current_company"] = data["employer"]
    if not data.get("resume_data") and data.get("resume"):
        data["resume_data"] = data["resume"]
    # total_experience = mid-point of the min/max range when not explicitly set
    if data.get("total_experience") is None:
        mn, mx = data.get("min_experience"), data.get("max_experience")
        if mn is not None and mx is not None:
            data["total_experience"] = (float(mn) + float(mx)) / 2.0
    if (
        not data.get("exp_range")
        and data.get("min_experience") is not None
        and data.get("max_experience") is not None
    ):
        data["exp_range"] = f"{data['min_experience']}-{data['max_experience']} yrs"

    # The resume/resume_data fields may arrive as a pending S3 key
    # (mrr_tracking/uploads/candidates/resumes/_pending/...) from the upload
    # endpoint. The DB should only ever store the filename — the canonical
    # path is constructed from candidate.id + filename. We strip them from the
    # initial INSERT, then finalize after we have an id.
    pending_resume_key = data.pop("resume", None) or data.pop("resume_data", None)
    if pending_resume_key == "None":
        pending_resume_key = None

    # applied_by = the email of the recruiter applying this candidate. Each
    # candidate row represents one (person × job) application, so this stays
    # a single email — no dedup, no array. Same person → different job means
    # another candidate row gets created with its own applied_by.
    if not data.get("applied_by"):
        data["applied_by"] = _recruiter_email(db, data.get("sourced_by_id"))

    # A candidate added fresh for a drive starts at the first tracker stage.
    if data.get("drive_id") and not data.get("drive_tracker_stage"):
        from infra.models import DriveTrackerStage
        data["drive_tracker_stage"] = DriveTrackerStage.lined_up

    candidate = Candidate(**data, status=CandidateStatus.sourced)
    db.add(candidate)
    db.flush()  # assign candidate.id without committing yet

    if pending_resume_key:
        from infra.s3 import finalize_resume

        try:
            filename = finalize_resume(pending_resume_key, candidate.id)
            candidate.resume = filename
            candidate.resume_data = filename
        except Exception:
            # Don't block candidate creation if S3 move fails — keep the
            # original key so the file is still reachable.
            candidate.resume = pending_resume_key
            candidate.resume_data = pending_resume_key

    db.commit()
    db.refresh(candidate)
    return candidate


def create_candidate_full(db: Session, data: dict, current_user, drive_id: int | None = None) -> Candidate:
    """Full source-a-candidate orchestration shared by the normal `POST /candidates`
    route and the drive add-candidate route, so both save identical data and run the
    same side effects: OL duplicate check, candidate insert, OL onboarding/benched
    flags, activity log, and self-assignment (the sourcer is always the caller).

    `data` is a CandidateCreate-shaped dict. When `drive_id` is given the candidate is
    linked to that drive (and starts at tracker stage lined_up via create_candidate)."""
    from features.mrr.activity.service import log as log_activity
    from infra.models import Job

    role = current_user.role.value
    if drive_id is not None:
        data["drive_id"] = drive_id
    email = data.get("email")
    job_id = data.get("job_id")

    job = db.query(Job).filter(Job.id == job_id).first() if job_id else None

    # OL duplicate check — block if already applied to this job in OfferLetter.
    if job and job.job_id and email:
        try:
            from core.sql_loader import load_ol_sql
            from features.mrr.ol_lookup.routes import _get_ol_conn
            from fastapi import HTTPException

            _ol = _get_ol_conn()
            try:
                with _ol.cursor() as _cur:
                    _cur.execute(load_ol_sql("check_duplicate_application.sql"), (email, job.job_id))
                    if (_cur.fetchone() or {}).get("is_mapped") == "YES":
                        raise HTTPException(
                            status_code=409,
                            detail="This candidate has already applied for this job in OfferLetter.",
                        )
            finally:
                _ol.close()
        except Exception as exc:
            from fastapi import HTTPException
            if isinstance(exc, HTTPException):
                raise
            # OL unreachable — don't block sourcing.

    # Both recruiters and DLs are credited as sourcer.
    sourced_by_id = current_user.id if role in ("recruiter", "delivery_lead") else None
    candidate = create_candidate(
        db,
        data,
        sourced_by_id=sourced_by_id,
        created_by_email=current_user.email,
    )

    # OL onboarding/benched flags.
    if email:
        try:
            from features.mrr.ol_lookup.routes import check_onboarded_benched
            flags = check_onboarded_benched(email)
            candidate.is_onboarded = flags["is_onboarded"]
            candidate.is_benched = flags["is_benched"]
            db.commit()
            db.refresh(candidate)
        except Exception:
            pass  # OL unreachable — flags stay False, non-blocking.

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

    # Caller assignment: the person who sourced the candidate is ALWAYS the
    # caller — no min-load handoff to another recruiter.
    #  - Recruiter sourced → assigned to themselves (status → handed_to_recruiter
    #    so the normal calling flow continues).
    #  - DL sourced → DL keeps the candidate; no "handed to recruiter" badge.
    if job:
        if role == "delivery_lead":
            candidate.assigned_to_id = current_user.id
            db.commit()
            db.refresh(candidate)
        else:
            candidate = assign_candidate(db, candidate.id, current_user.id)

    return candidate


def update_candidate(db: Session, candidate_id: int, data: dict) -> Candidate | None:
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not candidate:
        return None
    for k, v in data.items():
        if v is not None:
            setattr(candidate, k, v)
    db.commit()
    db.refresh(candidate)
    return candidate


def assign_candidate(db: Session, candidate_id: int, user_id: int) -> Candidate | None:
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not candidate:
        return None
    candidate.assigned_to_id = user_id
    candidate.status = CandidateStatus.handed_to_recruiter
    db.commit()
    db.refresh(candidate)
    return candidate
