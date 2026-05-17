"""
Round-robin / min-load allocation for sourcers, callers, and validators.

Strategy: always assign to the active team member with the fewest current
open items. Ties are broken by user ID (smallest ID = longest-tenured).

  Sourcers  → count open (non-closed) Jobs where recruiter appears in sourcer_ids array
  Callers   → count active Candidates assigned to them
  Validators→ count Candidates pending validation assigned to them
"""
import json
from sqlalchemy.orm import Session
from infra.models import User, Job, Candidate, UserRole, JobStatus, CandidateStatus


def _team(db: Session, pod_lead_id: int, role: UserRole) -> list[User]:
    return (
        db.query(User)
        .filter(
            User.pod_lead_id == pod_lead_id,
            User.role == role,
            User.is_active == True,
        )
        .order_by(User.id)
        .all()
    )


def _sourcer_load(db: Session, user_id: int) -> int:
    # Must check sourcer_ids JSON array because multiple recruiters share a JD.
    # assigned_sourcer_id only points to the first recruiter, so non-primary
    # recruiters would show zero load if we queried that field instead.
    open_jobs = db.query(Job).filter(Job.status != JobStatus.closed).all()
    count = 0
    for job in open_jobs:
        ids = json.loads(job.sourcer_ids or '[]') if isinstance(job.sourcer_ids, str) else (job.sourcer_ids or [])
        if user_id in ids:
            count += 1
    return count


def _caller_load(db: Session, user_id: int) -> int:
    closed = [
        CandidateStatus.joined,
        CandidateStatus.backed_out,
        CandidateStatus.rejected,
    ]
    return db.query(Candidate).filter(
        Candidate.assigned_to_id == user_id,
        ~Candidate.status.in_(closed),
    ).count()


def _validator_load(db: Session, user_id: int) -> int:
    done = [
        CandidateStatus.validated,
        CandidateStatus.joined,
        CandidateStatus.backed_out,
        CandidateStatus.rejected,
    ]
    return db.query(Candidate).filter(
        Candidate.assigned_validator_id == user_id,
        ~Candidate.status.in_(done),
    ).count()


def get_min_load(db: Session, pod_lead_id: int, role: UserRole) -> User | None:
    members = _team(db, pod_lead_id, role)
    if not members:
        return None

    load_fn = {
        UserRole.recruiter:     _caller_load,
        UserRole.delivery_lead: _validator_load,
    }.get(role)

    if load_fn is None:
        return members[0]

    return min(members, key=lambda m: load_fn(db, m.id))


def team_loads(db: Session, pod_lead_id: int, role: UserRole) -> list[dict]:
    """Return each member with their current load counts — used by frontend."""
    members = _team(db, pod_lead_id, role)
    result = []
    for m in members:
        sourcing = _sourcer_load(db, m.id)
        calling  = _caller_load(db, m.id)
        result.append({
            "id":             m.id,
            "name":           m.name,
            "email":          m.email,
            "role":           m.role.value,
            "recruiter_type": m.recruiter_type.value if m.recruiter_type else None,
            "sourcing_load":  sourcing,
            "calling_load":   calling,
            "load":           sourcing + calling,
        })
    return result
