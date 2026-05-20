from datetime import datetime, timedelta
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload
from infra.models import (
    User, UserRole, PodMembership,
    Candidate, CallLog, Job, JobStatus,
    Submission, ConsultantMail, Notification,
    to_iso_utc,
)
from core.security import hash_password


def list_users(db: Session, role: str | None = None, pod_lead_id: int | None = None, search: str | None = None, skip: int = 0, limit: int = 0):
    from sqlalchemy import func
    q = db.query(User)
    if role:
        q = q.filter(User.role == role)
    if pod_lead_id is not None:
        # Use pod_memberships junction table so multi-team users appear under every DL
        member_ids = db.query(PodMembership.user_id).filter(PodMembership.pod_lead_id == pod_lead_id).subquery()
        q = q.filter(User.id.in_(member_ids))
    if search:
        s = f"%{search.lower()}%"
        q = q.filter(func.lower(User.name).like(s) | func.lower(User.email).like(s))
    q = q.order_by(User.name)
    if limit > 0:
        total = q.count()
        return q.offset(skip).limit(limit).all(), total
    items = q.all()
    return items, len(items)


def get_pod_lead_names(db: Session, user_id: int) -> list[str]:
    """Return names of all DLs this user belongs to (multi-team support)."""
    rows = (
        db.query(User.name)
        .join(PodMembership, PodMembership.pod_lead_id == User.id)
        .filter(PodMembership.user_id == user_id)
        .all()
    )
    return [r.name for r in rows]


def list_available_team(
    db: Session,
    dl_id: int,
    role: str | None = None,
    search: str | None = None,
    skip: int = 0,
    limit: int = 0,
) -> tuple[list[User], int]:
    """Active users NOT already in this DL's team (any role can be added)."""
    from sqlalchemy import func
    already_in_team = db.query(PodMembership.user_id).filter(PodMembership.pod_lead_id == dl_id).subquery()
    q = db.query(User).filter(
        User.is_active == True,  # noqa: E712
        User.id != dl_id,
        ~User.id.in_(already_in_team),
    )
    if role:
        q = q.filter(User.role == role)
    if search:
        s = f"%{search.lower()}%"
        q = q.filter(func.lower(User.name).like(s) | func.lower(User.email).like(s))
    q = q.order_by(User.name)
    if limit > 0:
        total = q.count()
        return q.offset(skip).limit(limit).all(), total
    items = q.all()
    return items, len(items)


DEFAULT_PASSWORD = "joules@123"

def create_user(db: Session, data: dict) -> User:
    user = User(
        name=data["name"],
        email=data["email"],
        password_hash=hash_password(DEFAULT_PASSWORD),
        role=data["role"],
        pod_lead_id=data.get("pod_lead_id"),
        must_change_password=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def reset_password(db: Session, user_id: int) -> User | None:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return None
    user.password_hash = hash_password(DEFAULT_PASSWORD)
    user.must_change_password = True
    db.commit()
    db.refresh(user)
    return user


def change_password(db: Session, user_id: int, new_password: str) -> User | None:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return None
    user.password_hash = hash_password(new_password)
    user.must_change_password = False
    db.commit()
    db.refresh(user)
    return user


def update_user(db: Session, user_id: int, data: dict) -> User | None:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return None
    for k, v in data.items():
        setattr(user, k, v)
    db.commit()
    db.refresh(user)
    return user


def assign_to_pod(db: Session, user_id: int, pod_lead_id: int | None, recruiter_type: str | None = None) -> User | None:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return None
    if pod_lead_id is not None:
        # Add to pod_memberships (ignore if already a member)
        existing = db.query(PodMembership).filter(
            PodMembership.user_id == user_id,
            PodMembership.pod_lead_id == pod_lead_id,
        ).first()
        if not existing:
            db.add(PodMembership(user_id=user_id, pod_lead_id=pod_lead_id))
        # Keep pod_lead_id on user for backward compat (first/primary team)
        if user.pod_lead_id is None:
            user.pod_lead_id = pod_lead_id
        if recruiter_type is not None:
            user.recruiter_type = recruiter_type
    else:
        # Remove ALL pod memberships (used by admin clear-all)
        db.query(PodMembership).filter(PodMembership.user_id == user_id).delete()
        user.pod_lead_id = None
        user.recruiter_type = None
    db.commit()
    db.refresh(user)
    return user


def remove_from_pod(db: Session, user_id: int, pod_lead_id: int) -> User | None:
    """Remove user from one specific DL's team."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return None
    db.query(PodMembership).filter(
        PodMembership.user_id == user_id,
        PodMembership.pod_lead_id == pod_lead_id,
    ).delete()
    # Update pod_lead_id to next remaining membership (or NULL)
    remaining = db.query(PodMembership).filter(PodMembership.user_id == user_id).first()
    user.pod_lead_id = remaining.pod_lead_id if remaining else None
    if user.pod_lead_id is None:
        user.recruiter_type = None
    db.commit()
    db.refresh(user)
    return user


def reassign_pod(db: Session, user_id: int, from_dl_id: int | None, to_dl_id: int) -> User | None:
    """Move user from one DL's team to another (or just add to a new team if from_dl_id is None)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return None
    if from_dl_id:
        db.query(PodMembership).filter(
            PodMembership.user_id == user_id,
            PodMembership.pod_lead_id == from_dl_id,
        ).delete()
    # Add to new team
    existing = db.query(PodMembership).filter(
        PodMembership.user_id == user_id,
        PodMembership.pod_lead_id == to_dl_id,
    ).first()
    if not existing:
        db.add(PodMembership(user_id=user_id, pod_lead_id=to_dl_id))
    # Update primary pod_lead_id
    remaining = db.query(PodMembership).filter(PodMembership.user_id == user_id).first()
    if remaining:
        user.pod_lead_id = remaining.pod_lead_id if remaining.pod_lead_id != to_dl_id else to_dl_id
    user.pod_lead_id = to_dl_id
    if not user.recruiter_type:
        user.recruiter_type = "both"
    db.commit()
    db.refresh(user)
    return user


def delete_user(db: Session, user_id: int) -> bool:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return False
    user.is_active = False
    db.commit()
    return True


def get_user_activity(db: Session, user_id: int, date: str | None = None) -> dict:
    """Return candidates sourced by and calls made by a user, optionally filtered to one day."""
    start = end = None
    if date:
        start = datetime.strptime(date, "%Y-%m-%d")
        end   = start + timedelta(days=1)

    # Candidates sourced by this user
    q_sourced = (
        db.query(Candidate)
        .options(joinedload(Candidate.job))
        .filter(Candidate.sourced_by_id == user_id)
    )
    if start:
        q_sourced = q_sourced.filter(Candidate.sourced_at >= start, Candidate.sourced_at < end)
    sourced = q_sourced.order_by(Candidate.sourced_at.desc()).all()

    # Call logs made by this user
    q_calls = (
        db.query(CallLog)
        .options(joinedload(CallLog.candidate).joinedload(Candidate.job))
        .filter(CallLog.caller_id == user_id)
    )
    if start:
        q_calls = q_calls.filter(CallLog.call_date >= start, CallLog.call_date < end)
    calls = q_calls.order_by(CallLog.call_date.desc()).all()

    return {
        "sourced": [
            {
                "id":          c.id,
                "full_name":   c.full_name,
                "status":      c.status.value if c.status else None,
                "job_title":   c.job.role_title  if c.job else None,
                "client_name": c.job.client_name if c.job else None,
                "sourced_at":  to_iso_utc(c.sourced_at),
            }
            for c in sourced
        ],
        "called": [
            {
                "id":          log.candidate.id        if log.candidate else None,
                "full_name":   log.candidate.full_name if log.candidate else None,
                "status":      log.candidate.status.value if log.candidate and log.candidate.status else None,
                "job_title":   log.candidate.job.role_title  if log.candidate and log.candidate.job else None,
                "client_name": log.candidate.job.client_name if log.candidate and log.candidate.job else None,
                "call_date":   to_iso_utc(log.call_date),
                "outcome":     log.outcome.value if log.outcome else None,
            }
            for log in calls
        ],
    }


def get_user_details(db: Session, user_id: int) -> dict | None:
    """
    Comprehensive admin-facing rollup for a single user. Returns identity,
    role-relevant activity counts, and a few recent items per category so an
    admin can see at a glance what this user has been doing.

    Designed to be role-agnostic — every count is returned for every user;
    the frontend just hides the zeroes that aren't relevant for that role.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return None

    # Manager + team size (only meaningful for recruiters & DLs respectively)
    pod_lead_name = None
    if user.pod_lead_id:
        pl = db.query(User).filter(User.id == user.pod_lead_id).first()
        pod_lead_name = pl.name if pl else None

    team_size = (
        db.query(User)
        .filter(User.pod_lead_id == user_id, User.is_active == True)  # noqa: E712
        .count()
    )

    # ── Job-related counts ────────────────────────────────────────────────────
    q_jobs_created  = db.query(Job).filter(Job.created_by_id == user_id)
    jobs_created    = q_jobs_created.count()
    jobs_created_open = q_jobs_created.filter(Job.status == JobStatus.open).count()

    jobs_as_dl      = db.query(Job).filter(Job.delivery_lead_id == user_id).count()
    jobs_sourcing   = db.query(Job).filter(Job.assigned_sourcer_id == user_id).count()
    jobs_calling    = db.query(Job).filter(Job.assigned_caller_id == user_id).count()

    # ── Candidate / pipeline counts ───────────────────────────────────────────
    candidates_sourced  = db.query(Candidate).filter(Candidate.sourced_by_id == user_id).count()
    candidates_to_call  = db.query(Candidate).filter(Candidate.assigned_to_id == user_id).count()
    candidates_validated = db.query(Candidate).filter(Candidate.assigned_validator_id == user_id).count()

    calls_logged        = db.query(CallLog).filter(CallLog.caller_id == user_id).count()
    submissions_as_dl   = db.query(Submission).filter(Submission.delivery_lead_id == user_id).count()
    mails_sent          = db.query(ConsultantMail).filter(ConsultantMail.sent_by_id == user_id).count()
    notifications_received = db.query(Notification).filter(Notification.user_id == user_id).count()
    unread_notifications   = (
        db.query(Notification)
        .filter(Notification.user_id == user_id, Notification.is_read == False)  # noqa: E712
        .count()
    )

    # ── Recent items (≤ 10 each) ──────────────────────────────────────────────
    recent_jobs = (
        db.query(Job)
        .filter(
            or_(
                Job.created_by_id == user_id,
                Job.delivery_lead_id == user_id,
                Job.assigned_sourcer_id == user_id,
                Job.assigned_caller_id == user_id,
            )
        )
        .order_by(Job.id.desc())
        .limit(10)
        .all()
    )

    def _job_relation(j: Job) -> str:
        rels = []
        if j.created_by_id == user_id:        rels.append("created")
        if j.delivery_lead_id == user_id:     rels.append("DL")
        if j.assigned_sourcer_id == user_id:  rels.append("sourcer")
        if j.assigned_caller_id == user_id:   rels.append("caller")
        return ", ".join(rels) or "—"

    recent_candidates = (
        db.query(Candidate)
        .options(joinedload(Candidate.job))
        .filter(
            or_(
                Candidate.sourced_by_id == user_id,
                Candidate.assigned_to_id == user_id,
                Candidate.assigned_validator_id == user_id,
            )
        )
        .order_by(Candidate.id.desc())
        .limit(10)
        .all()
    )

    def _candidate_relation(c: Candidate) -> str:
        rels = []
        if c.sourced_by_id == user_id:         rels.append("sourced")
        if c.assigned_to_id == user_id:        rels.append("calling")
        if c.assigned_validator_id == user_id: rels.append("validating")
        return ", ".join(rels) or "—"

    recent_calls = (
        db.query(CallLog)
        .options(joinedload(CallLog.candidate).joinedload(Candidate.job))
        .filter(CallLog.caller_id == user_id)
        .order_by(CallLog.call_date.desc())
        .limit(10)
        .all()
    )

    return {
        "user": {
            "id":                   user.id,
            "name":                 user.name,
            "email":                user.email,
            "role":                 user.role.value,
            "recruiter_type":       user.recruiter_type.value if user.recruiter_type else None,
            "is_active":            user.is_active,
            "pod_lead_id":          user.pod_lead_id,
            "pod_lead_name":        pod_lead_name,
            "must_change_password": bool(getattr(user, "must_change_password", False)),
        },
        "stats": {
            # Jobs
            "jobs_created":           jobs_created,
            "jobs_created_open":      jobs_created_open,
            "jobs_as_delivery_lead":  jobs_as_dl,
            "jobs_as_primary_sourcer": jobs_sourcing,
            "jobs_as_primary_caller": jobs_calling,
            # People
            "team_size":              team_size,
            # Candidates / calls
            "candidates_sourced":     candidates_sourced,
            "candidates_to_call":     candidates_to_call,
            "candidates_validated":   candidates_validated,
            "calls_logged":           calls_logged,
            "submissions_as_dl":      submissions_as_dl,
            "consultant_mails_sent":  mails_sent,
            # Inbox
            "notifications_received": notifications_received,
            "unread_notifications":   unread_notifications,
        },
        "recent_jobs": [
            {
                "id":          j.id,
                "client_name": j.client_name,
                "role_title":  j.role_title,
                "status":      j.status.value if j.status else None,
                "relation":    _job_relation(j),
            }
            for j in recent_jobs
        ],
        "recent_candidates": [
            {
                "id":          c.id,
                "full_name":   c.full_name,
                "status":      c.status.value if c.status else None,
                "job_title":   c.job.role_title if c.job else None,
                "client_name": c.job.client_name if c.job else None,
                "relation":    _candidate_relation(c),
            }
            for c in recent_candidates
        ],
        "recent_calls": [
            {
                "id":              log.id,
                "candidate_id":    log.candidate.id if log.candidate else None,
                "candidate_name":  log.candidate.full_name if log.candidate else None,
                "job_title":       log.candidate.job.role_title if log.candidate and log.candidate.job else None,
                "client_name":     log.candidate.job.client_name if log.candidate and log.candidate.job else None,
                "outcome":         log.outcome.value if log.outcome else None,
                "call_date":       to_iso_utc(log.call_date),
            }
            for log in recent_calls
        ],
    }
