from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from core.database import get_db
from core.deps import get_current_user, require_roles
from features.users.schema import UserCreate, UserUpdate, UserOut
from features.users import service
from features.allocation.service import team_loads
from infra.models import UserRole

router = APIRouter(prefix="/users", tags=["users"])


def _out(user, db=None) -> dict:
    pod_lead_name = None
    if user.pod_lead_id and db:
        from infra.models import User as UserModel
        pl = db.query(UserModel).filter(UserModel.id == user.pod_lead_id).first()
        if pl:
            pod_lead_name = pl.name
    elif hasattr(user, 'pod_lead') and user.pod_lead:
        pod_lead_name = user.pod_lead.name
    return {
        "id":             user.id,
        "name":           user.name,
        "email":          user.email,
        "role":           user.role.value,
        "secondary_role": user.secondary_role,
        "recruiter_type": user.recruiter_type.value if user.recruiter_type else None,
        "is_active":      user.is_active,
        "pod_lead_id":    user.pod_lead_id,
        "pod_lead_name":  pod_lead_name,
    }


@router.get("")
def list_users(
    role: str | None = Query(None),
    available: bool  = Query(False),
    db: Session      = Depends(get_db),
    current_user     = Depends(require_roles("admin", "delivery_lead")),
):
    """
    admin: all users
    delivery_lead: their team; ?available=true returns unassigned callers/sourcing_partners
    """
    is_dl = current_user.role.value == "delivery_lead"
    if available and is_dl:
        users = service.list_available_team(db, dl_id=current_user.id)
    elif is_dl:
        users = service.list_users(db, role=role, pod_lead_id=current_user.id)
    else:
        users = service.list_users(db, role=role)
    return [_out(u, db) for u in users]


@router.post("")
def create_user(
    body: UserCreate,
    db: Session = Depends(get_db),
    _=Depends(require_roles("admin")),
):
    return _out(service.create_user(db, body.model_dump()), db)


@router.post("/{user_id}/reset-password")
def reset_password(
    user_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_roles("admin")),
):
    user = service.reset_password(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": f"Password reset to default for {user.name}"}


@router.patch("/{user_id}")
def update_user(
    user_id: int,
    body: UserUpdate,
    db: Session    = Depends(get_db),
    current_user   = Depends(require_roles("admin", "delivery_lead")),
):
    data = body.model_dump(exclude_none=True)
    if current_user.role.value == "delivery_lead":
        allowed_keys = {"pod_lead_id"}
        data = {k: v for k, v in data.items() if k in allowed_keys}
    user = service.update_user(db, user_id, data)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _out(user, db)


class AssignPodBody(BaseModel):
    recruiter_type: str = "both"   # kept for backward compat; always "both" now


@router.post("/{user_id}/assign-pod")
def assign_pod(
    user_id: int,
    body: AssignPodBody,
    db: Session  = Depends(get_db),
    current_user = Depends(require_roles("admin", "delivery_lead")),
):
    dl_id = current_user.id if current_user.role.value == "delivery_lead" else None
    # Always assign as "both" — sourcer/caller distinction removed
    user = service.assign_to_pod(db, user_id, dl_id, recruiter_type="both")
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _out(user, db)


@router.get("/delivery-leads")
def list_delivery_leads(
    db: Session  = Depends(get_db),
    _            = Depends(require_roles("admin", "kam")),
):
    """KAM fetches active delivery leads; includes the clients each DL is currently handling."""
    from infra.models import Job, JobStatus
    users = service.list_users(db, role=UserRole.delivery_lead)
    result = []
    for u in users:
        if not u.is_active:
            continue
        client_rows = (
            db.query(Job.client_name)
            .filter(Job.delivery_lead_id == u.id, Job.status != JobStatus.closed)
            .distinct()
            .all()
        )
        data = _out(u, db)
        data["clients"] = [r.client_name for r in client_rows]
        result.append(data)
    return result


@router.get("/kams")
def list_kams(
    db: Session  = Depends(get_db),
    _            = Depends(require_roles("admin", "delivery_lead")),
):
    """DL fetches active KAMs to assign as job owner when creating a JD."""
    users = service.list_users(db, role=UserRole.kam)
    return [_out(u, db) for u in users if u.is_active]


@router.get("/team-assignments")
def get_team_assignments(
    db: Session  = Depends(get_db),
    current_user = Depends(require_roles("admin", "delivery_lead")),
):
    """Per-JD assignment progress for each DL's team member (target vs actual)."""
    import json as _json
    from infra.models import Job, JobStatus, Candidate, CandidateStatus
    dl_id = current_user.id if current_user.role.value == "delivery_lead" else None
    if dl_id is None:
        return []

    closed = {CandidateStatus.joined, CandidateStatus.backed_out, CandidateStatus.rejected}
    jobs = db.query(Job).filter(
        Job.delivery_lead_id == dl_id,
        Job.status.notin_([JobStatus.closed]),
    ).all()

    members: dict[int, dict] = {}

    def _ensure(uid: int, role_type: str):
        if uid not in members:
            u = db.query(User).filter(User.id == uid).first()
            if not u:
                return False
            members[uid] = {
                "id": u.id, "name": u.name,
                "recruiter_type": u.recruiter_type.value if u.recruiter_type else role_type,
                "jobs": [],
            }
        return True

    for job in jobs:
        sourcer_ids = _json.loads(job.sourcer_ids or '[]') if isinstance(job.sourcer_ids, str) else []
        caller_ids  = _json.loads(job.caller_ids  or '[]') if isinstance(job.caller_ids,  str) else []
        # Unified recruiter list — deduped union so each person appears once per job
        recruiter_ids = list(dict.fromkeys(sourcer_ids + caller_ids))

        for uid in recruiter_ids:
            if not _ensure(uid, "recruiter"):
                continue
            sourced = db.query(Candidate).filter(
                Candidate.job_id == job.id,
                Candidate.sourced_by_id == uid,
            ).count()
            called = db.query(Candidate).filter(
                Candidate.job_id == job.id,
                Candidate.assigned_to_id == uid,
            ).count()
            members[uid]["jobs"].append({
                "job_id": job.id,
                "role_title": job.role_title,
                "client_name": job.client_name,
                "assignment_type": "recruiter",
                "target": job.sourcing_target,
                "actual": sourced + called,
                "sourced": sourced,
                "called": called,
            })

    return list(members.values())


@router.get("/team-loads")
def get_team_loads(
    db: Session  = Depends(get_db),
    current_user = Depends(require_roles("admin", "delivery_lead")),
):
    """Return per-role load counts for each DL's team."""
    dl_id = current_user.id if current_user.role.value == "delivery_lead" else None
    if dl_id is None:
        return {"sourcers": [], "callers": []}
    recruiters = team_loads(db, dl_id, UserRole.recruiter)
    return {
        "sourcers": recruiters,
        "callers":  recruiters,
    }


@router.get("/activity-summary")
def activity_summary(
    db: Session = Depends(get_db),
    _           = Depends(require_roles("admin")),
):
    """All users with last login + last action — for the admin leaderboard."""
    from features.activity.service import get_activity_summary
    return get_activity_summary(db)


@router.get("/{user_id}/activity")
def get_activity(
    user_id: int,
    date: str | None = Query(None, description="YYYY-MM-DD filter"),
    db: Session      = Depends(get_db),
    _                = Depends(require_roles("admin", "delivery_lead")),
):
    """Return sourced & called candidate lists for a team member, optionally filtered by date."""
    return service.get_user_activity(db, user_id, date)


@router.get("/{user_id}/details")
def get_details(
    user_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_roles("admin")),
):
    """Full rollup of a user's identity + activity counts + recent items.
    Powers the admin Users-page overlay; works for any role."""
    data = service.get_user_details(db, user_id)
    if data is None:
        raise HTTPException(status_code=404, detail="User not found")
    return data


@router.delete("/{user_id}/pod")
def remove_from_pod(
    user_id: int,
    db: Session  = Depends(get_db),
    _            = Depends(require_roles("admin", "delivery_lead")),
):
    user = service.assign_to_pod(db, user_id, None)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _out(user, db)


@router.delete("/{user_id}")
def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_roles("admin")),
):
    if not service.delete_user(db, user_id):
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deactivated"}
