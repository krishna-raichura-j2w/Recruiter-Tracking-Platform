from core.database import get_db
from core.deps import require_roles, user_has_role
from fastapi import APIRouter, Depends, HTTPException, Query
from infra.models import User, UserRole
from pydantic import BaseModel
from sqlalchemy.orm import Session

from features.mrr.allocation.service import team_loads
from features.mrr.users import service
from features.mrr.users.schema import UserCreate, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


def _out(user, db=None) -> dict:
    pod_lead_names: list[str] = []
    if db:
        pod_lead_names = service.get_pod_lead_names(db, user.id)
    elif hasattr(user, "pod_memberships") and user.pod_memberships:
        pod_lead_names = [m.pod_lead.name for m in user.pod_memberships if m.pod_lead]
    # Primary pod lead for backward compat
    pod_lead_name = pod_lead_names[0] if pod_lead_names else None
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role.value,
        "secondary_role": user.secondary_role,
        "recruiter_type": user.recruiter_type.value if user.recruiter_type else None,
        "is_active": user.is_active,
        "pod_lead_id": user.pod_lead_id,
        "pod_lead_name": pod_lead_name,
        "pod_lead_names": pod_lead_names,
    }


@router.get("")
def list_users(
    role: str | None = Query(None),
    available: bool = Query(False),
    search: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(0, ge=0, le=500),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("admin", "delivery_lead", "coo")),
):
    """admin/coo: all users (paginated). delivery_lead: their team or ?available=true for unassigned."""
    is_dl = current_user.role.value == "delivery_lead"
    if available and is_dl:
        items, total = service.list_available_team(
            db,
            dl_id=current_user.id,
            role=role,
            search=search,
            skip=skip,
            limit=limit if limit > 0 else 20,
        )
        return {
            "items": [_out(u, db) for u in items],
            "total": total,
            "skip": skip,
            "limit": limit,
        }
    if is_dl:
        users, total = service.list_users(
            db,
            role=role,
            pod_lead_id=current_user.id,
            search=search,
            skip=skip,
            limit=limit,
        )
    else:
        users, total = service.list_users(
            db,
            role=role,
            search=search,
            skip=skip,
            limit=limit,
        )

    items = [_out(u, db) for u in users]
    # If no limit requested (old callers like team-loads dropdown), return plain array for compat
    if limit == 0:
        return items
    return {"items": items, "total": total, "skip": skip, "limit": limit}


@router.post("")
def create_user(
    body: UserCreate,
    db: Session = Depends(get_db),
    _=Depends(require_roles("admin")),
):
    return _out(service.create_user(db, body.model_dump()), db)


class _BulkUserItem(BaseModel):
    name: str
    email: str
    role: str


class _BulkUserCreate(BaseModel):
    users: list[_BulkUserItem]


@router.post("/bulk")
def bulk_create_users(
    body: _BulkUserCreate,
    db: Session = Depends(get_db),
    _=Depends(require_roles("admin")),
):
    """Bulk-create users. Returns per-row ok/error results."""
    valid_roles = {r.value for r in UserRole}
    results = []
    for item in body.users:
        if item.role not in valid_roles:
            results.append({"email": item.email, "name": item.name, "ok": False, "error": f"Invalid role '{item.role}'"})
            continue
        try:
            user = service.create_user(db, {"name": item.name, "email": item.email, "role": item.role})
            results.append({"email": item.email, "name": item.name, "ok": True, "id": user.id})
        except Exception as e:
            db.rollback()
            results.append({"email": item.email, "name": item.name, "ok": False, "error": str(e)})
    return {"results": results}


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
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("admin", "delivery_lead")),
):
    data = body.model_dump(exclude_none=True)
    if current_user.role.value == "delivery_lead":
        allowed_keys = {"pod_lead_id"}
        data = {k: v for k, v in data.items() if k in allowed_keys}
    user = service.update_user(db, user_id, data)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _out(user, db)


class ReassignPodBody(BaseModel):
    to_dl_id: int
    from_dl_id: int | None = None  # if None, just adds without removing another team


@router.post("/{user_id}/reassign-pod")
def reassign_pod(
    user_id: int,
    body: ReassignPodBody,
    db: Session = Depends(get_db),
    _=Depends(require_roles("admin")),
):
    user = service.reassign_pod(db, user_id, body.from_dl_id, body.to_dl_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _out(user, db)


class AssignPodBody(BaseModel):
    recruiter_type: str = "both"  # kept for backward compat; always "both" now


@router.post("/{user_id}/assign-pod")
def assign_pod(
    user_id: int,
    body: AssignPodBody,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("admin", "delivery_lead")),
):
    dl_id = current_user.id if current_user.role.value == "delivery_lead" else None
    # Always assign as "both" — sourcer/caller distinction removed
    user = service.assign_to_pod(db, user_id, dl_id, recruiter_type="both")
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _out(user, db)


@router.get("/delivery-leads")
def list_delivery_leads(
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("admin", "kam")),
):
    """KAM fetches active delivery leads in their pod; admin gets all."""
    from infra.models import Job, JobStatus

    is_admin = current_user.role.value == "admin"
    q = db.query(User).filter(User.is_active == True, User.role == UserRole.delivery_lead)
    if not is_admin and current_user.pod_id:
        q = q.filter(User.pod_id == current_user.pod_id)
    result = []
    for u in q.order_by(User.name).all():
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
    db: Session = Depends(get_db),
    _=Depends(require_roles("admin", "delivery_lead")),
):
    """DL fetches active KAMs to assign as job owner when creating a JD."""
    users, _ = service.list_users(db, role=UserRole.kam)
    return [_out(u, db) for u in users if u.is_active]


@router.get("/team-assignments")
def get_team_assignments(
    member_id: int | None = Query(None, description="Return data for one recruiter only (lazy expand)"),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("admin", "delivery_lead")),
):
    """Per-JD assignment progress for a DL's team. Pass member_id for single-recruiter lazy load."""
    import json as _json

    from infra.models import Candidate, Job, JobStatus
    from sqlalchemy import func

    dl_id = current_user.id if current_user.role.value == "delivery_lead" else None
    if dl_id is None:
        return []

    jobs = (
        db.query(Job)
        .filter(
            Job.delivery_lead_id == dl_id,
            Job.status.notin_([JobStatus.closed]),
        )
        .all()
    )
    if not jobs:
        return []

    job_ids = [j.id for j in jobs]

    # Collect recruiter IDs per job in one Python pass
    job_recruiter_map: dict[int, list[int]] = {}
    all_uids: set[int] = set()
    for job in jobs:
        sourcer_ids = (
            _json.loads(job.sourcer_ids or "[]") if isinstance(job.sourcer_ids, str) else []
        )
        caller_ids = (
            _json.loads(job.caller_ids or "[]") if isinstance(job.caller_ids, str) else []
        )
        rids = list(dict.fromkeys(sourcer_ids + caller_ids))
        job_recruiter_map[job.id] = rids
        all_uids.update(rids)

    if not all_uids:
        return []

    # Scope to one member when doing lazy expand
    target_uids = {member_id} if member_id is not None else all_uids
    target_uids = target_uids & all_uids  # ensure member is actually on a job
    if not target_uids:
        return []

    # Batch fetch user names — 1 query instead of N
    users_map = {
        u.id: u for u in db.query(User).filter(User.id.in_(target_uids)).all()
    }

    # Batch candidate counts per (uid, job_id) — 2 queries instead of N×M×2
    sourced_counts: dict[tuple[int, int], int] = {}
    for uid, jid, cnt in (
        db.query(Candidate.sourced_by_id, Candidate.job_id, func.count(Candidate.id))
        .filter(
            Candidate.job_id.in_(job_ids),
            Candidate.sourced_by_id.in_(target_uids),
        )
        .group_by(Candidate.sourced_by_id, Candidate.job_id)
        .all()
    ):
        sourced_counts[(uid, jid)] = cnt

    called_counts: dict[tuple[int, int], int] = {}
    for uid, jid, cnt in (
        db.query(Candidate.assigned_to_id, Candidate.job_id, func.count(Candidate.id))
        .filter(
            Candidate.job_id.in_(job_ids),
            Candidate.assigned_to_id.in_(target_uids),
        )
        .group_by(Candidate.assigned_to_id, Candidate.job_id)
        .all()
    ):
        called_counts[(uid, jid)] = cnt

    members: dict[int, dict] = {}
    for job in jobs:
        for uid in job_recruiter_map[job.id]:
            if uid not in target_uids:
                continue
            u = users_map.get(uid)
            if not u:
                continue
            if uid not in members:
                members[uid] = {
                    "id": u.id,
                    "name": u.name,
                    "recruiter_type": u.recruiter_type.value if u.recruiter_type else "recruiter",
                    "jobs": [],
                }
            sourced = sourced_counts.get((uid, job.id), 0)
            called = called_counts.get((uid, job.id), 0)
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
    dl_id: int | None = Query(None, description="DL user ID — admin/KAM can pass any DL's ID"),
    job_id: int | None = Query(None, description="Job ID — return the job's cross-pod assignable recruiter pool"),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("admin", "delivery_lead", "kam")),
):
    """
    Return per-role load counts for each DL's team.
    DL users always see their own team.
    Admins and KAMs may pass ?dl_id=<N> to filter by a DL's team, or omit to get all recruiters.
    When ?job_id=<N> is passed, return the job's full cross-pod assignable pool
    (owner KAM + collaborator KAMs + assigned DLs across pods) — used by the
    Confirm/Reassign recruiter picker so collaborators' recruiters show up.
    """
    from infra.models import UserRole

    is_admin = current_user.role.value == "admin"
    is_kam   = user_has_role(current_user, "kam")

    # Cross-pod path: derive the assignable pool from the job itself.
    if job_id is not None:
        from features.mrr.allocation.service import (
            _batch_caller_counts,
            _batch_sourcer_counts,
        )
        from features.mrr.jobs import service as job_service

        job = job_service.get_job(db, job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

        # Access: admin, owner KAM, a collaborator KAM, or an assigned DL.
        collab_kam_ids = job_service._collaborator_kam_ids_for(job)
        dl_ids = job_service._dl_ids_for(job)
        allowed_viewer = (
            is_admin
            or job.created_by_id == current_user.id
            or current_user.id in collab_kam_ids
            or current_user.id in dl_ids
        )
        if not allowed_viewer:
            raise HTTPException(status_code=403, detail="Not allowed for this job.")

        member_ids = job_service._assignable_recruiter_ids(db, job)
        if not member_ids:
            return {"sourcers": [], "callers": []}
        members_q = (
            db.query(User)
            .filter(User.id.in_(member_ids), User.is_active == True)  # noqa: E712
            .order_by(User.name)
            .all()
        )
        ids = [m.id for m in members_q]
        scount = _batch_sourcer_counts(db, ids)
        ccount = _batch_caller_counts(db, ids)
        members = [
            {
                "id": m.id,
                "name": m.name,
                "email": m.email,
                "role": m.role.value,
                "recruiter_type": m.recruiter_type.value if m.recruiter_type else None,
                "sourcing_load": scount.get(m.id, 0),
                "calling_load": ccount.get(m.id, 0),
                "load": scount.get(m.id, 0) + ccount.get(m.id, 0),
            }
            for m in members_q
        ]
        return {"sourcers": members, "callers": members}

    if is_admin:
        if dl_id:
            members = team_loads(db, dl_id)
        else:
            return {"sourcers": [], "callers": []}
    elif is_kam:
        # KAM sees recruiters from DLs in their own pod only (shared pod_id)
        pod_dl_ids = [
            u.id for u in db.query(User).filter(
                User.pod_id == current_user.pod_id,
                User.is_active == True,
                User.role == UserRole.delivery_lead,
            ).all()
        ] if current_user.pod_id else []

        if dl_id:
            members = team_loads(db, dl_id) if dl_id in pod_dl_ids else []
        else:
            seen: set[int] = set()
            members = []
            for did in pod_dl_ids:
                for m in team_loads(db, did):
                    if m["id"] not in seen:
                        seen.add(m["id"])
                        members.append(m)
            members.sort(key=lambda x: x["name"])
    else:
        members = team_loads(db, current_user.id)

    return {"sourcers": members, "callers": members}


@router.get("/leads")
def list_leads(
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("admin", "kam")),
):
    """All active KAMs and DLs across every pod, with their pod name — feeds the
    cross-pod "add collaborator" picker on a job. Returns
    [{id, name, role, pod_id, pod_name}], sorted by pod then name."""
    from infra.models import Pod

    pod_names = dict(db.query(Pod.id, Pod.name).all())
    rows = (
        db.query(User)
        .filter(
            User.is_active == True,  # noqa: E712
            User.role.in_([UserRole.kam, UserRole.delivery_lead]),
        )
        .order_by(User.name)
        .all()
    )
    out = [
        {
            "id": u.id,
            "name": u.name,
            "role": u.role.value,
            "pod_id": u.pod_id,
            "pod_name": pod_names.get(u.pod_id) if u.pod_id else None,
        }
        for u in rows
    ]
    out.sort(key=lambda x: ((x["pod_name"] or "~"), x["name"]))
    return {"leads": out}


@router.get("/activity-summary")
def activity_summary(
    db: Session = Depends(get_db),
    _=Depends(require_roles("admin", "delivery_lead", "kam")),
):
    """All users with last login + last action — for the leaderboard."""
    from features.mrr.activity.service import get_activity_summary

    return get_activity_summary(db)


@router.get("/{user_id}/activity")
def get_activity(
    user_id: int,
    date: str | None = Query(None, description="YYYY-MM-DD filter"),
    db: Session = Depends(get_db),
    _=Depends(require_roles("admin", "delivery_lead")),
):
    """Return sourced & called candidate lists for a team member, optionally filtered by date."""
    return service.get_user_activity(db, user_id, date)


@router.get("/{user_id}/details")
def get_details(
    user_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_roles("admin")),
):
    """
    Full rollup of a user's identity + activity counts + recent items.
    Powers the admin Users-page overlay; works for any role.
    """
    data = service.get_user_details(db, user_id)
    if data is None:
        raise HTTPException(status_code=404, detail="User not found")
    return data


class RemovePodBody(BaseModel):
    pod_lead_id: int | None = (
        None  # which DL's team to remove from; defaults to current user if DL
    )


@router.delete("/{user_id}/pod")
def remove_from_pod(
    user_id: int,
    body: RemovePodBody = RemovePodBody(),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("admin", "delivery_lead")),
):
    # Determine which DL's team to remove from
    if body.pod_lead_id:
        dl_id = body.pod_lead_id
    elif current_user.role.value == "delivery_lead":
        dl_id = current_user.id
    else:
        # Admin removing without specifying → clear ALL memberships
        user = service.assign_to_pod(db, user_id, None)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return _out(user, db)

    user = service.remove_from_pod(db, user_id, dl_id)
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
