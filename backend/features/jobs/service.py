import json
from sqlalchemy.orm import Session
from infra.models import Job, JobStatus, Candidate, User


def _job_dict(db: Session, job: Job) -> dict:
    count = db.query(Candidate).filter(Candidate.job_id == job.id).count()
    d = {c.name: getattr(job, c.name) for c in Job.__table__.columns}
    d["candidate_count"] = count
    d["assigned_sourcer_name"] = job.assigned_sourcer.name if job.assigned_sourcer else None
    d["assigned_caller_name"]  = job.assigned_caller.name  if job.assigned_caller  else None
    d["delivery_lead_name"]    = job.delivery_lead.name    if job.delivery_lead    else None
    d["business_head_name"]    = job.business_head.name    if job.business_head    else None
    d["business_head_id"]      = d.pop("account_manager_id", None)
    d["sourcer_ids"] = json.loads(job.sourcer_ids or '[]') if isinstance(job.sourcer_ids, str) else []
    d["caller_ids"]  = json.loads(job.caller_ids  or '[]') if isinstance(job.caller_ids,  str) else []
    from infra.models import User as UserModel
    sourcer_names = []
    for sid in d["sourcer_ids"]:
        u = db.query(UserModel).filter(UserModel.id == sid).first()
        if u: sourcer_names.append(u.name)
    d["sourcer_names"] = sourcer_names

    caller_names = []
    for cid in d["caller_ids"]:
        u = db.query(UserModel).filter(UserModel.id == cid).first()
        if u: caller_names.append(u.name)
    d["caller_names"] = caller_names

    # Serialize DateTime fields to ISO strings
    for dt_field in ("deadline", "sourcing_deadline", "calling_deadline", "created_at", "updated_at"):
        v = d.get(dt_field)
        if hasattr(v, "isoformat"):
            d[dt_field] = v.isoformat()
    return d


def list_jobs(
    db: Session,
    status: str | None = None,
    created_by_id: int | None = None,
    delivery_lead_id: int | None = None,
    assigned_sourcer_id: int | None = None,
) -> list:
    q = db.query(Job)
    if status:
        q = q.filter(Job.status == status)
    if created_by_id is not None:
        q = q.filter(Job.created_by_id == created_by_id)
    if delivery_lead_id is not None:
        q = q.filter(Job.delivery_lead_id == delivery_lead_id)
    jobs = q.order_by(Job.created_at.desc()).all()

    if assigned_sourcer_id is not None:
        # A recruiter sees the JD if they appear in sourcer_ids OR caller_ids
        # (both are JSON arrays) OR as the primary assigned_sourcer/caller.
        uid = assigned_sourcer_id
        filtered = []
        for job in jobs:
            sourcer_ids = json.loads(job.sourcer_ids or '[]') if isinstance(job.sourcer_ids, str) else []
            caller_ids  = json.loads(job.caller_ids  or '[]') if isinstance(job.caller_ids,  str) else []
            if (
                uid in sourcer_ids
                or uid in caller_ids
                or job.assigned_sourcer_id == uid
                or job.assigned_caller_id  == uid
            ):
                filtered.append(job)
        jobs = filtered

    return [_job_dict(db, j) for j in jobs]


def get_job(db: Session, job_id: int) -> Job | None:
    return db.query(Job).filter(Job.id == job_id).first()


def is_job_id_taken(db: Session, client_job_id: str, exclude_job_id: int | None = None) -> bool:
    """Return True if client_job_id is already used by another job."""
    q = db.query(Job).filter(Job.client_job_id == client_job_id)
    if exclude_job_id:
        q = q.filter(Job.id != exclude_job_id)
    return q.first() is not None


def create_job(db: Session, data: dict, created_by_id: int) -> Job:
    job = Job(**data, created_by_id=created_by_id)
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def delete_job(db: Session, job_id: int, created_by_id: int) -> bool:
    """Delete a pending_review job created by this KAM. Returns False if not found/not allowed."""
    job = db.query(Job).filter(
        Job.id == job_id,
        Job.created_by_id == created_by_id,
        Job.status == JobStatus.pending_review,
    ).first()
    if not job:
        return False
    db.delete(job)
    db.commit()
    return True


def update_job(db: Session, job_id: int, data: dict) -> Job | None:
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        return None
    for k, v in data.items():
        if v is not None:
            setattr(job, k, v)
    db.commit()
    db.refresh(job)
    return job
