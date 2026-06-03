from infra.models import (
    Candidate,
    CandidateStatus,
    User,
    Validation,
)
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload


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
