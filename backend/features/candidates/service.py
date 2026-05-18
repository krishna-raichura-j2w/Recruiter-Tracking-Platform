from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
from infra.models import Candidate, CandidateStatus


def _apply_candidate_filters(q, job_id, status, assigned_to, sourced_by, job_ids, recruiter_id, search):
    """Apply all candidate filters to a query object. Used for both count and data queries."""
    from sqlalchemy import or_, func
    from infra.models import Candidate
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
        q = q.filter(or_(
            Candidate.sourced_by_id == recruiter_id,
            Candidate.assigned_to_id == recruiter_id,
        ))
    else:
        if assigned_to:
            q = q.filter(Candidate.assigned_to_id == assigned_to)
        if sourced_by:
            q = q.filter(Candidate.sourced_by_id == sourced_by)
    if search:
        s = f"%{search.lower()}%"
        q = q.filter(or_(
            func.lower(Candidate.full_name).like(s),
            func.lower(Candidate.email).like(s),
            func.lower(Candidate.mobile).like(s),
            func.lower(Candidate.skills).like(s),
        ))
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
) -> tuple[list[Candidate], int]:
    """Returns (items, total). limit=0 means no pagination (return all)."""
    # Count query — lightweight, no joins
    count_q = _apply_candidate_filters(
        db.query(Candidate.id), job_id, status, assigned_to, sourced_by, job_ids, recruiter_id, search
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
            joinedload(Candidate.validation),
            joinedload(Candidate.submission),
            joinedload(Candidate.job),
        ),
        job_id, status, assigned_to, sourced_by, job_ids, recruiter_id, search,
    )
    if data_q is None:
        return [], 0

    q = data_q.order_by(Candidate.updated_at.desc())
    if limit > 0:
        q = q.offset(skip).limit(limit)
    return q.all(), total


def get_candidate(db: Session, candidate_id: int) -> Candidate | None:
    return db.query(Candidate).options(
        joinedload(Candidate.assigned_to),
        joinedload(Candidate.sourced_by),
        joinedload(Candidate.assessment),
        joinedload(Candidate.validation),
        joinedload(Candidate.submission),
        joinedload(Candidate.consultant_profile),
        joinedload(Candidate.call_logs),
        joinedload(Candidate.job),
    ).filter(Candidate.id == candidate_id).first()


def create_candidate(db: Session, data: dict, sourced_by_id: int | None = None) -> Candidate:
    if sourced_by_id:
        data["sourced_by_id"] = sourced_by_id
    candidate = Candidate(**data, status=CandidateStatus.sourced)
    db.add(candidate)
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
    if data.get("pool_verified") and candidate.status == CandidateStatus.sourced:
        candidate.status = CandidateStatus.pool_verified
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
