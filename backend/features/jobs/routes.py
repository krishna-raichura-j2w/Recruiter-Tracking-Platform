from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from core.database import get_db
from core.deps import get_current_user, require_roles, user_has_role
from features.jobs.schema import JobCreate, JobUpdate
from features.jobs import service
from features.allocation.service import get_min_load
from features.notifications.service import push, push_to_role
from infra.models import UserRole, JobStatus, NotifType, User, PodMembership, Client

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("")
def list_jobs(
    status: str | None = Query(None),
    search: str | None = Query(None),
    skip:   int        = Query(0, ge=0),
    limit:  int        = Query(100, ge=0, le=500),
    db: Session        = Depends(get_db),
    current_user       = Depends(get_current_user),
):
    is_kam = user_has_role(current_user, "kam")
    is_dl  = user_has_role(current_user, "delivery_lead")
    kwargs = dict(search=search, skip=skip, limit=limit)

    if is_kam and is_dl:
        items, total = service.list_jobs(db, status, dual_user_id=current_user.id, **kwargs)
    elif is_kam:
        items, total = service.list_jobs(db, status, created_by_id=current_user.id, **kwargs)
    elif is_dl:
        items, total = service.list_jobs(db, status, delivery_lead_id=current_user.id, **kwargs)
    elif current_user.role.value == "recruiter":
        items, total = service.list_jobs(db, status, assigned_sourcer_id=current_user.id, **kwargs)
    else:
        items, total = service.list_jobs(db, status, **kwargs)

    return {"items": items, "total": total, "skip": skip, "limit": limit}


@router.get("/{job_id}")
def get_job(
    job_id: int,
    db: Session  = Depends(get_db),
    current_user = Depends(get_current_user),
):
    job = service.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    import json as _json
    is_kam = user_has_role(current_user, "kam")
    is_dl  = user_has_role(current_user, "delivery_lead")
    if is_kam and is_dl:
        dl_ids = service._dl_ids_for(job)
        if job.created_by_id != current_user.id and current_user.id not in dl_ids:
            raise HTTPException(status_code=404, detail="Job not found")
    elif is_dl:
        dl_ids = service._dl_ids_for(job)
        if current_user.id not in dl_ids:
            raise HTTPException(status_code=404, detail="Job not found")
    elif is_kam:
        if job.created_by_id != current_user.id:
            raise HTTPException(status_code=404, detail="Job not found")
    return service._job_dict(db, job)


@router.post("")
def create_job(
    body: JobCreate,
    db: Session  = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Only users whose PRIMARY role is KAM can create a JD → status = pending_review.
    Dual-role users (e.g. DL with secondary_role=kam) are blocked. Admin and DL retain
    view/edit/reassign rights through their respective endpoints."""
    if current_user.role.value != "kam":
        raise HTTPException(status_code=403, detail="Only KAMs can create a JD.")
    from datetime import datetime
    import json as _json
    data = body.model_dump()
    kam_id = data.pop("kam_id", None)
    # Merge delivery_lead_ids with legacy delivery_lead_id
    dl_ids: list[int] = data.pop("delivery_lead_ids", []) or []
    single_dl_id: int | None = data.get("delivery_lead_id")
    if single_dl_id and single_dl_id not in dl_ids:
        dl_ids.insert(0, single_dl_id)

    is_kam = user_has_role(current_user, "kam")
    is_dl  = user_has_role(current_user, "delivery_lead")

    if is_kam and is_dl:
        # Dual-role: they're both KAM and DL — own the job as both
        if current_user.id not in dl_ids:
            dl_ids.insert(0, current_user.id)
        data["delivery_lead_id"] = dl_ids[0]
        created_by = current_user.id
    elif is_dl:
        # DL only: must select a KAM as job owner; can optionally assign to another DL
        if not kam_id:
            raise HTTPException(status_code=400, detail="A KAM must be selected when a Delivery Lead creates a JD.")
        if not dl_ids:
            dl_ids = [current_user.id]
        data["delivery_lead_id"] = dl_ids[0]
        created_by = kam_id
    else:
        # KAM only: at least one DL is mandatory
        if not dl_ids:
            raise HTTPException(status_code=400, detail="At least one Delivery Lead must be selected before creating a JD.")
        data["delivery_lead_id"] = dl_ids[0]
        created_by = current_user.id

    data["delivery_lead_ids"] = _json.dumps(dl_ids)

    # Business Head is mandatory for all creators
    if not data.get("account_manager_id") and not data.get("business_head_id"):
        raise HTTPException(status_code=400, detail="A Business Head must be selected before creating a JD.")

    # Auto-link jobs.client_id by matching client_name → of_clients.name (case-insensitive).
    # The client must already exist in of_clients; new clients can no longer be created.
    from sqlalchemy import func as _f
    client_name = (data.get("client_name") or "").strip()
    if not client_name:
        raise HTTPException(status_code=400, detail="Client is required.")
    matched_client = db.query(Client).filter(_f.lower(Client.name) == client_name.lower()).first()
    if not matched_client:
        raise HTTPException(status_code=400, detail=f"Client '{client_name}' is not in the client list. Pick an existing client.")
    if matched_client.client_id is None:
        raise HTTPException(status_code=400, detail=f"Client '{matched_client.name}' has no client_id set. Ask an admin to assign one before creating jobs for this client.")
    data["client_id"] = matched_client.client_id
    data["client_name"] = matched_client.name   # snap to the canonical casing

    # Job ID must be unique across all jobs
    if data.get("client_job_id") and service.is_job_id_taken(db, data["client_job_id"]):
        raise HTTPException(status_code=400, detail=f"Job ID '{data['client_job_id']}' is already in use. Please use a unique Job ID.")

    data["status"] = JobStatus.pending_review
    data["account_manager_id"] = data.pop("business_head_id", None)
    if data.get("deadline"):
        try:
            data["deadline"] = datetime.fromisoformat(data["deadline"].replace("Z", "+00:00"))
        except ValueError:
            data["deadline"] = None
    job = service.create_job(db, data, created_by)

    # Notify all assigned DLs (except the creator)
    notified_dl_ids = _json.loads(job.delivery_lead_ids or '[]') if isinstance(job.delivery_lead_ids, str) else []
    if not notified_dl_ids and job.delivery_lead_id:
        notified_dl_ids = [job.delivery_lead_id]
    for dl_id in notified_dl_ids:
        if dl_id != current_user.id:
            push(db, dl_id,
                f"New JD uploaded: {job.role_title} for {job.client_name} — pending your review.",
                NotifType.jd_created, entity_id=job.id)
    db.commit()

    from features.activity.service import log as log_activity
    log_activity(db, current_user.id, "created_job",
                 f"Created JD: {job.role_title} for {job.client_name}",
                 entity_type="job", entity_id=job.id)
    return service._job_dict(db, job)


class AssignJDBody(BaseModel):
    recruiter_ids: list[int] = []       # unified — same people source and call
    sourcing_target: int | None = None
    sourcing_deadline: str | None = None
    calling_deadline: str | None = None


class ReassignBody(BaseModel):
    recruiter_ids: list[int]


@router.post("/{job_id}/confirm")
def confirm_jd(
    job_id: int,
    body: AssignJDBody,
    db: Session  = Depends(get_db),
    current_user = Depends(require_roles("delivery_lead", "admin")),
):
    """Delivery Lead reviews JD, assigns recruiters (single unified pool), sets status = open."""
    import json
    from datetime import datetime
    job = service.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if not body.recruiter_ids:
        raise HTTPException(status_code=400, detail="Select at least one recruiter.")

    # The confirming DL is whoever is on the job; admin can confirm any job
    dl_id = current_user.id
    is_admin = current_user.role.value == "admin"

    # Validate all recruiter IDs are active members of the confirming DL's team
    # (use pod_memberships for multi-team support)
    for uid in body.recruiter_ids:
        if not is_admin:
            in_team = db.query(PodMembership).filter(
                PodMembership.user_id == uid,
                PodMembership.pod_lead_id == dl_id,
            ).first()
            if not in_team:
                u = db.query(User).filter(User.id == uid).first()
                raise HTTPException(
                    status_code=400,
                    detail=f"{u.name if u else uid} is not a member of your team.",
                )

    # Both sourcer_ids and caller_ids point to the same unified recruiter list
    job.sourcer_ids         = json.dumps(body.recruiter_ids)
    job.caller_ids          = json.dumps(body.recruiter_ids)
    job.assigned_sourcer_id = body.recruiter_ids[0]
    job.assigned_caller_id  = body.recruiter_ids[0]
    # Keep DL assignment if already set (another DL was assigned); otherwise assign to confirmer
    if not job.delivery_lead_id:
        job.delivery_lead_id = current_user.id
    job.status              = JobStatus.open
    if body.sourcing_target is not None:
        job.sourcing_target = body.sourcing_target

    def _parse_dt(s: str | None):
        if not s:
            return None
        try:
            return datetime.fromisoformat(s.replace("Z", "+00:00"))
        except ValueError:
            return None

    if body.sourcing_deadline is not None:
        job.sourcing_deadline = _parse_dt(body.sourcing_deadline)
        job.sourcing_warned   = False
        job.sourcing_alerted  = False
    if body.calling_deadline is not None:
        job.calling_deadline  = _parse_dt(body.calling_deadline)
        job.calling_warned    = False
        job.calling_alerted   = False

    for uid in body.recruiter_ids:
        u = db.query(User).filter(User.id == uid).first()
        if u:
            push(db, uid,
                f"You've been assigned to {job.role_title} ({job.client_name}). Start sourcing and screening!",
                NotifType.jd_assigned, entity_id=job.id)

    db.commit()
    db.refresh(job)

    from features.activity.service import log as log_activity
    log_activity(db, current_user.id, "confirmed_jd",
                 f"Confirmed JD: {job.role_title} for {job.client_name} (target: {body.sourcing_target})",
                 entity_type="job", entity_id=job.id)
    return service._job_dict(db, job)


@router.patch("/{job_id}/reassign")
def reassign_recruiters(
    job_id: int,
    body: ReassignBody,
    db: Session  = Depends(get_db),
    current_user = Depends(require_roles("delivery_lead", "admin")),
):
    """DL reassigns recruiters on an already-open job without changing any other state."""
    import json
    job = service.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if not body.recruiter_ids:
        raise HTTPException(status_code=400, detail="Select at least one recruiter.")

    # Validate all recruiter IDs are members of the job's DL team (multi-team support)
    dl_id    = job.delivery_lead_id or current_user.id
    is_admin = current_user.role.value == "admin"
    for uid in body.recruiter_ids:
        if not is_admin:
            in_team = db.query(PodMembership).filter(
                PodMembership.user_id == uid,
                PodMembership.pod_lead_id == dl_id,
            ).first()
            if not in_team:
                u = db.query(User).filter(User.id == uid).first()
                raise HTTPException(
                    status_code=400,
                    detail=f"{u.name if u else uid} is not a member of your team.",
                )

    old_ids = set(json.loads(job.sourcer_ids or '[]') if isinstance(job.sourcer_ids, str) else [])
    new_ids = set(body.recruiter_ids)

    job.sourcer_ids         = json.dumps(body.recruiter_ids)
    job.caller_ids          = json.dumps(body.recruiter_ids)
    job.assigned_sourcer_id = body.recruiter_ids[0]
    job.assigned_caller_id  = body.recruiter_ids[0]

    # Notify newly added recruiters only
    for uid in new_ids - old_ids:
        u = db.query(User).filter(User.id == uid).first()
        if u:
            push(db, uid,
                f"You've been assigned to {job.role_title} ({job.client_name}).",
                NotifType.jd_assigned, entity_id=job.id)

    db.commit()
    db.refresh(job)

    from features.activity.service import log as log_activity
    log_activity(db, current_user.id, "reassigned_recruiters",
                 f"Reassigned recruiters on {job.role_title} ({job.client_name})",
                 entity_type="job", entity_id=job.id)
    return service._job_dict(db, job)


@router.patch("/{job_id}")
def update_job(
    job_id: int,
    body: JobUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_roles("admin", "kam", "delivery_lead")),
):
    import json as _json
    from datetime import datetime
    data = body.model_dump(exclude_none=True)
    if "business_head_id" in data:
        data["account_manager_id"] = data.pop("business_head_id")
    if "deadline" in data and isinstance(data["deadline"], str):
        try:
            data["deadline"] = datetime.fromisoformat(data["deadline"].replace("Z", "+00:00"))
        except ValueError:
            data.pop("deadline")
    # Handle multi-DL: serialize delivery_lead_ids and sync primary delivery_lead_id
    if "delivery_lead_ids" in data:
        dl_ids = data["delivery_lead_ids"] or []
        data["delivery_lead_ids"] = _json.dumps(dl_ids)
        if dl_ids:
            data["delivery_lead_id"] = dl_ids[0]
    # Ensure updated job ID stays unique
    if "client_job_id" in data and data["client_job_id"] and service.is_job_id_taken(db, data["client_job_id"], exclude_job_id=job_id):
        raise HTTPException(status_code=400, detail=f"Job ID '{data['client_job_id']}' is already in use.")
    job = service.update_job(db, job_id, data)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return service._job_dict(db, job)


@router.delete("/{job_id}")
def delete_job(
    job_id: int,
    db: Session  = Depends(get_db),
    current_user = Depends(require_roles("admin", "kam", "delivery_lead")),
):
    """KAM/DL: delete only their own pending_review JDs. Admin: delete any."""
    role = current_user.role.value
    if role == "admin":
        job = service.get_job(db, job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        db.delete(job)
        db.commit()
        return {"message": "Deleted"}
    if role == "delivery_lead":
        # DL can delete pending_review jobs they own as DL
        job = db.query(service.Job).filter(
            service.Job.id == job_id,
            service.Job.delivery_lead_id == current_user.id,
            service.Job.status == JobStatus.pending_review,
        ).first()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found or cannot be deleted")
        db.delete(job)
        db.commit()
        return {"message": "Deleted"}
    deleted = service.delete_job(db, job_id, current_user.id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Job not found or cannot be deleted — only your pending JDs can be deleted")
    return {"message": "Deleted"}
