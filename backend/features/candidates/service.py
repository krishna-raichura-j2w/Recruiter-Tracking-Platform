from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
from infra.models import Candidate, CandidateStatus


def list_candidates(
    db: Session,
    job_id: int | None,
    status: str | None,
    assigned_to: int | None,
    sourced_by: int | None = None,
    job_ids: list[int] | None = None,
    recruiter_id: int | None = None,  # OR: sourced_by OR assigned_to
) -> list[Candidate]:
    q = db.query(Candidate).options(
        joinedload(Candidate.assigned_to),
        joinedload(Candidate.sourced_by),
        joinedload(Candidate.assigned_validator),
        joinedload(Candidate.assessment),
        joinedload(Candidate.validation),
        joinedload(Candidate.submission),
        joinedload(Candidate.job),
    )
    if job_ids is not None:
        if job_ids:
            q = q.filter(Candidate.job_id.in_(job_ids))
        else:
            return []
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
    return q.order_by(Candidate.updated_at.desc()).all()


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
