from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from core.database import get_db
from core.deps import get_current_user, require_roles
from features.jobs.schema import JobCreate, JobUpdate
from features.jobs import service
from features.allocation.service import get_min_load
from features.notifications.service import push, push_to_role
from infra.models import UserRole, JobStatus, NotifType, User

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("")
def list_jobs(
    status: str | None = Query(None),
    db: Session        = Depends(get_db),
    current_user       = Depends(get_current_user),
):
    role = current_user.role.value
    created_by_id: int | None = None
    assigned_sourcer_id: int | None = None
    delivery_lead_id: int | None = None

    if role == "kam":  # KAM sees only jobs they created
        # Pod lead sees only jobs they created
        created_by_id = current_user.id

    elif role == "delivery_lead":
        # DL sees pending + their confirmed jobs
        if current_user.pod_lead_id:
            # DL is under a pod — see jobs from that pod
            created_by_id = current_user.pod_lead_id
        # else admin-level DL: see all

    elif role == "recruiter":
        assigned_sourcer_id = current_user.id

    return service.list_jobs(db, status,
                             created_by_id=created_by_id,
                             assigned_sourcer_id=assigned_sourcer_id)


@router.get("/{job_id}")
def get_job(
    job_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    job = service.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return service._job_dict(db, job)


@router.post("")
def create_job(
    body: JobCreate,
    db: Session  = Depends(get_db),
    current_user = Depends(require_roles("admin", "kam")),
):
    """Pod lead uploads JD → status = pending_review, no sourcer yet."""
    from datetime import datetime
    data = body.model_dump()
    data["status"] = JobStatus.pending_review
    data["account_manager_id"] = data.pop("business_head_id", None)
    if data.get("deadline"):
        try:
            data["deadline"] = datetime.fromisoformat(data["deadline"].replace("Z", "+00:00"))
        except ValueError:
            data["deadline"] = None
    job = service.create_job(db, data, current_user.id)
    # Notify all Delivery Leads that a new JD is pending review
    push_to_role(db, UserRole.delivery_lead,
        f"New JD uploaded: {job.role_title} for {job.client_name} — pending your review.",
        NotifType.jd_created, entity_id=job.id)
    db.commit()
    return service._job_dict(db, job)


class AssignJDBody(BaseModel):
    sourcer_ids: list[int]
    caller_ids: list[int]
    sourcing_deadline: str | None = None
    calling_deadline: str | None = None


@router.post("/{job_id}/confirm")
def confirm_jd(
    job_id: int,
    body: AssignJDBody,
    db: Session  = Depends(get_db),
    current_user = Depends(require_roles("delivery_lead", "admin")),
):
    """Delivery Lead reviews JD, assigns sourcer + caller, sets status = open."""
    import json
    from datetime import datetime
    job = service.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    job.sourcer_ids         = json.dumps(body.sourcer_ids)
    job.caller_ids          = json.dumps(body.caller_ids)
    job.assigned_sourcer_id = body.sourcer_ids[0] if body.sourcer_ids else None
    job.assigned_caller_id  = body.caller_ids[0]  if body.caller_ids  else None
    job.delivery_lead_id    = current_user.id
    job.status              = JobStatus.open

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

    # Notify assigned sourcers
    for uid in body.sourcer_ids:
        u = db.query(User).filter(User.id == uid).first()
        if u:
            push(db, uid,
                f"You've been assigned as sourcer for {job.role_title} ({job.client_name}). Start sourcing!",
                NotifType.jd_assigned, entity_id=job.id)
    # Notify assigned callers
    for uid in body.caller_ids:
        u = db.query(User).filter(User.id == uid).first()
        if u:
            push(db, uid,
                f"You've been assigned as caller for {job.role_title} ({job.client_name}). Candidates will be routed to you.",
                NotifType.jd_assigned, entity_id=job.id)

    db.commit()
    db.refresh(job)
    return service._job_dict(db, job)


@router.patch("/{job_id}")
def update_job(
    job_id: int,
    body: JobUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_roles("admin", "kam", "delivery_lead")),
):
    from datetime import datetime
    data = body.model_dump(exclude_none=True)
    if "business_head_id" in data:
        data["account_manager_id"] = data.pop("business_head_id")
    if "deadline" in data and isinstance(data["deadline"], str):
        try:
            data["deadline"] = datetime.fromisoformat(data["deadline"].replace("Z", "+00:00"))
        except ValueError:
            data.pop("deadline")
    job = service.update_job(db, job_id, data)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return service._job_dict(db, job)
