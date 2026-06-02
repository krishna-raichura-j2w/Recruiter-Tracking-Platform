"""
Round-robin / min-load allocation for sourcers, callers, and validators.

Strategy: always assign to the active team member with the fewest current
open items. Ties are broken by user ID (smallest ID = longest-tenured).

  Sourcers  → count open (non-closed) Jobs where recruiter appears in sourcer_ids array
  Callers   → count active Candidates assigned to them
  Validators→ count Candidates pending validation assigned to them
"""

import json

from infra.models import (
    Candidate,
    CandidateStatus,
    Job,
    JobStatus,
    PodMembership,
    User,
    UserRole,
)
from sqlalchemy import func
from sqlalchemy.orm import Session


def _team(db: Session, pod_lead_id: int, role: UserRole | None = None) -> list[User]:
    """All active team members for a given DL, optionally filtered by role.

    Preferred (new pod model): every recruiter and DL in the same pod as the
    anchor, excluding the anchor themselves. KAMs/BH are excluded — they
    aren't work allocators. This means the JD-reassign picker sees the FULL
    pod regardless of which DL hand-picked which recruiters into their
    pod_memberships team.

    Legacy fallback: when the anchor has no `pod_id` yet, read the
    pod_memberships table so existing teams (pre-pods migration) stay visible.
    """
    anchor = db.query(User).filter(User.id == pod_lead_id).first()
    if anchor and anchor.pod_id:
        q = db.query(User).filter(
            User.pod_id == anchor.pod_id,
            User.is_active == True,  # noqa: E712
            User.id != pod_lead_id,
            User.role.in_([UserRole.recruiter, UserRole.delivery_lead]),
        )
        if role is not None:
            q = q.filter(User.role == role)
        return q.order_by(User.id).all()

    member_ids = (
        db.query(PodMembership.user_id)
        .filter(PodMembership.pod_lead_id == pod_lead_id)
        .subquery()
    )
    q = db.query(User).filter(
        User.id.in_(member_ids),
        User.is_active == True,  # noqa: E712
    )
    if role is not None:
        q = q.filter(User.role == role)
    return q.order_by(User.id).all()


def _sourcer_load(db: Session, user_id: int) -> int:
    # Must check sourcer_ids JSON array because multiple recruiters share a JD.
    # assigned_sourcer_id only points to the first recruiter, so non-primary
    # recruiters would show zero load if we queried that field instead.
    return _batch_sourcer_counts(db, [user_id]).get(user_id, 0)


def _caller_load(db: Session, user_id: int) -> int:
    return _batch_caller_counts(db, [user_id]).get(user_id, 0)


def _validator_load(db: Session, user_id: int) -> int:
    return _batch_validator_counts(db, [user_id]).get(user_id, 0)


def _batch_sourcer_counts(db: Session, user_ids: list[int]) -> dict[int, int]:
    """1 query: fetch only sourcer_ids for open jobs, count per user in Python."""
    id_set = set(user_ids)
    counts: dict[int, int] = {uid: 0 for uid in id_set}
    for (raw,) in db.query(Job.sourcer_ids).filter(Job.status != JobStatus.closed).all():
        ids = json.loads(raw or "[]") if isinstance(raw, str) else (raw or [])
        for uid in ids:
            try:
                uid = int(uid)
            except Exception:
                continue
            if uid in id_set:
                counts[uid] += 1
    return counts


def _batch_caller_counts(db: Session, user_ids: list[int]) -> dict[int, int]:
    """1 GROUP BY query: count active candidates per caller."""
    closed = [CandidateStatus.joined, CandidateStatus.backed_out, CandidateStatus.rejected]
    counts: dict[int, int] = {uid: 0 for uid in user_ids}
    for uid, cnt in (
        db.query(Candidate.assigned_to_id, func.count(Candidate.id))
        .filter(
            Candidate.assigned_to_id.in_(user_ids),
            ~Candidate.status.in_(closed),
        )
        .group_by(Candidate.assigned_to_id)
        .all()
    ):
        counts[uid] = cnt
    return counts


def _batch_validator_counts(db: Session, user_ids: list[int]) -> dict[int, int]:
    """1 GROUP BY query: count pending-validation candidates per validator."""
    done = [
        CandidateStatus.validated,
        CandidateStatus.joined,
        CandidateStatus.backed_out,
        CandidateStatus.rejected,
    ]
    counts: dict[int, int] = {uid: 0 for uid in user_ids}
    for uid, cnt in (
        db.query(Candidate.assigned_validator_id, func.count(Candidate.id))
        .filter(
            Candidate.assigned_validator_id.in_(user_ids),
            ~Candidate.status.in_(done),
        )
        .group_by(Candidate.assigned_validator_id)
        .all()
    ):
        counts[uid] = cnt
    return counts


def get_min_load(db: Session, pod_lead_id: int, role: UserRole) -> User | None:
    members = _team(db, pod_lead_id, role)
    if not members:
        return None

    member_ids = [m.id for m in members]

    if role == UserRole.recruiter:
        counts = _batch_caller_counts(db, member_ids)
    elif role == UserRole.delivery_lead:
        counts = _batch_validator_counts(db, member_ids)
    else:
        return members[0]

    return min(members, key=lambda m: counts.get(m.id, 0))


def team_loads(
    db: Session,
    pod_lead_id: int,
    role: UserRole | None = None,
) -> list[dict]:
    """Return each member with their current load counts — used by frontend."""
    members = _team(db, pod_lead_id, role)
    if not members:
        return []

    member_ids = [m.id for m in members]
    sourcer_counts = _batch_sourcer_counts(db, member_ids)
    caller_counts = _batch_caller_counts(db, member_ids)

    return [
        {
            "id": m.id,
            "name": m.name,
            "email": m.email,
            "role": m.role.value,
            "recruiter_type": m.recruiter_type.value if m.recruiter_type else None,
            "sourcing_load": sourcer_counts.get(m.id, 0),
            "calling_load": caller_counts.get(m.id, 0),
            "load": sourcer_counts.get(m.id, 0) + caller_counts.get(m.id, 0),
        }
        for m in members
    ]
