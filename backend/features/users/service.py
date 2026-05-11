from datetime import datetime, timedelta
from sqlalchemy.orm import Session, joinedload
from infra.models import User, UserRole, Candidate, CallLog
from core.security import hash_password


def list_users(db: Session, role: str | None = None, pod_lead_id: int | None = None) -> list[User]:
    q = db.query(User)
    if role:
        q = q.filter(User.role == role)
    if pod_lead_id is not None:
        q = q.filter(User.pod_lead_id == pod_lead_id)
    return q.order_by(User.name).all()


def list_available_team(db: Session, dl_id: int, role: str | None = None) -> list[User]:
    """Recruiters not on this DL's team — unassigned (NULL) or on another team."""
    from sqlalchemy import or_
    q = db.query(User).filter(
        User.is_active == True,
        User.role == UserRole.recruiter,
        or_(User.pod_lead_id == None, User.pod_lead_id != dl_id),
    )
    return q.order_by(User.name).all()


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
    user.pod_lead_id = pod_lead_id
    if recruiter_type is not None:
        user.recruiter_type = recruiter_type
    elif pod_lead_id is None:
        user.recruiter_type = None  # clear type when removing from team
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
                "sourced_at":  c.sourced_at.isoformat() if c.sourced_at else None,
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
                "call_date":   log.call_date.isoformat() if log.call_date else None,
                "outcome":     log.outcome.value if log.outcome else None,
            }
            for log in calls
        ],
    }
