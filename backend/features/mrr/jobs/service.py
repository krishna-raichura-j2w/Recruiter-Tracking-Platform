import json

from infra.models import Candidate, Job, JobStatus, User, to_iso_utc
from sqlalchemy import or_
from sqlalchemy.orm import Session


def _job_dict(db: Session, job: Job) -> dict:
    count = db.query(Candidate).filter(Candidate.job_id == job.id).count()
    # Skip binary columns (e.g. questionnaire_data — a PDF blob). FastAPI's
    # jsonable_encoder calls bytes.decode() on raw `bytes` values which dies
    # on any non-UTF-8 payload (a PDF starts with %PDF-\x... — invalid UTF-8).
    # The PDF is served via a dedicated download endpoint; here we only flag
    # whether a questionnaire has been generated.
    _BINARY_COLS = {"questionnaire_data"}
    d = {
        c.name: getattr(job, c.name)
        for c in Job.__table__.columns
        if c.name not in _BINARY_COLS
    }
    d["has_questionnaire"] = bool(getattr(job, "questionnaire_data", None))
    d["candidate_count"] = count
    d["assigned_sourcer_name"] = (
        job.assigned_sourcer.name if job.assigned_sourcer else None
    )
    d["assigned_caller_name"] = (
        job.assigned_caller.name if job.assigned_caller else None
    )
    d["delivery_lead_name"] = job.delivery_lead.name if job.delivery_lead else None
    d["business_head_name"] = job.business_head.name if job.business_head else None
    d["business_head_id"] = d.pop("account_manager_id", None)
    d["sourcer_ids"] = (
        json.loads(job.sourcer_ids or "[]") if isinstance(job.sourcer_ids, str) else []
    )
    d["caller_ids"] = (
        json.loads(job.caller_ids or "[]") if isinstance(job.caller_ids, str) else []
    )

    from infra.models import User as UserModel

    # Multi-DL: deserialize delivery_lead_ids; back-fill from delivery_lead_id for old rows
    dl_ids = (
        json.loads(job.delivery_lead_ids or "[]")
        if isinstance(job.delivery_lead_ids, str)
        else (job.delivery_lead_ids or [])
    )
    if not dl_ids and job.delivery_lead_id:
        dl_ids = [job.delivery_lead_id]
    d["delivery_lead_ids"] = dl_ids
    dl_names = []
    for did in dl_ids:
        u = db.query(UserModel).filter(UserModel.id == did).first()
        if u:
            dl_names.append(u.name)
    d["delivery_lead_names"] = dl_names
    sourcer_names = []
    for sid in d["sourcer_ids"]:
        u = db.query(UserModel).filter(UserModel.id == sid).first()
        if u:
            sourcer_names.append(u.name)
    d["sourcer_names"] = sourcer_names

    caller_names = []
    for cid in d["caller_ids"]:
        u = db.query(UserModel).filter(UserModel.id == cid).first()
        if u:
            caller_names.append(u.name)
    d["caller_names"] = caller_names

    # Unified recruiter list (union of both, deduped) — used by all new UI
    all_ids = list(dict.fromkeys(d["sourcer_ids"] + d["caller_ids"]))
    seen = set()
    recruiter_names = []
    for name in sourcer_names + caller_names:
        if name not in seen:
            seen.add(name)
            recruiter_names.append(name)
    d["recruiter_ids"] = all_ids
    d["recruiter_names"] = recruiter_names

    # Serialize DateTime fields to ISO strings (UTC-aware)
    for dt_field in (
        "deadline",
        "sourcing_deadline",
        "calling_deadline",
        "created_at",
        "updated_at",
    ):
        v = d.get(dt_field)
        if hasattr(v, "isoformat"):
            d[dt_field] = to_iso_utc(v)
    return d


def _dl_ids_for(job) -> list:
    """Return the full list of DL IDs for a job (multi-DL + legacy single-DL)."""
    ids = (
        json.loads(job.delivery_lead_ids or "[]")
        if isinstance(job.delivery_lead_ids, str)
        else (job.delivery_lead_ids or [])
    )
    if not ids and job.delivery_lead_id:
        ids = [job.delivery_lead_id]
    return ids


def list_jobs(
    db: Session,
    status: str | None = None,
    created_by_id: int | None = None,
    delivery_lead_id: int | None = None,
    assigned_sourcer_id: int | None = None,
    dual_user_id: int | None = None,
    search: str | None = None,
    client: str | None = None,
    skip: int = 0,
    limit: int = 0,
) -> tuple[list, int]:
    """Returns (items, total). limit=0 means no pagination (return all)."""
    from sqlalchemy import func

    q = db.query(Job)
    if status:
        q = q.filter(Job.status == status)
    # Apply SQL filters only for fields that don't need JSON-array inspection
    if created_by_id is not None and dual_user_id is None:
        q = q.filter(Job.created_by_id == created_by_id)
    if client:
        # Exact (case-insensitive) client filter used by the client chips.
        q = q.filter(func.lower(Job.client_name) == client.strip().lower())
    if search:
        s = f"%{search.lower()}%"
        q = q.filter(
            or_(
                func.lower(Job.role_title).like(s),
                func.lower(Job.client_name).like(s),
                func.lower(Job.client_job_id).like(s),
            ),
        )

    q = q.order_by(Job.created_at.desc())

    # Python-side filters for JSON array columns (delivery_lead_ids, sourcer_ids, caller_ids)
    needs_python_filter = (
        delivery_lead_id is not None
        or dual_user_id is not None
        or assigned_sourcer_id is not None
    )
    if needs_python_filter:
        all_jobs = q.all()
        filtered = []
        for job in all_jobs:
            dl_ids = _dl_ids_for(job)
            # dual_user_id: created_by OR is a DL on this job
            if dual_user_id is not None:
                if job.created_by_id != dual_user_id and dual_user_id not in dl_ids:
                    continue
            # delivery_lead_id: is a DL on this job
            if delivery_lead_id is not None:
                if delivery_lead_id not in dl_ids:
                    continue
            # assigned_sourcer_id: in sourcer/caller JSON arrays
            if assigned_sourcer_id is not None:
                sourcer_ids = (
                    json.loads(job.sourcer_ids or "[]")
                    if isinstance(job.sourcer_ids, str)
                    else []
                )
                caller_ids = (
                    json.loads(job.caller_ids or "[]")
                    if isinstance(job.caller_ids, str)
                    else []
                )
                if (
                    assigned_sourcer_id not in sourcer_ids
                    and assigned_sourcer_id not in caller_ids
                    and job.assigned_sourcer_id != assigned_sourcer_id
                    and job.assigned_caller_id != assigned_sourcer_id
                ):
                    continue
            filtered.append(job)
        total = len(filtered)
        if limit > 0:
            filtered = filtered[skip : skip + limit]
        return [_job_dict(db, j) for j in filtered], total

    total = q.count()
    if limit > 0:
        q = q.offset(skip).limit(limit)
    return [_job_dict(db, j) for j in q.all()], total


def client_summary(
    db: Session,
    created_by_id: int | None = None,
    delivery_lead_id: int | None = None,
    assigned_sourcer_id: int | None = None,
    dual_user_id: int | None = None,
) -> list[dict]:
    """Lightweight per-client rollup for the Jobs page client bar.

    Deliberately avoids _job_dict() (which does per-job user lookups) — it only
    selects the few columns needed and aggregates in Python, so it stays fast
    even with thousands of jobs. Returns
    [{client_name, open, pending, total, candidate_count}], sorted by name.
    """
    from sqlalchemy import func

    # Only the columns we actually need (keeps this cheap).
    rows = db.query(
        Job.id, Job.client_name, Job.status,
        Job.created_by_id, Job.delivery_lead_ids, Job.delivery_lead_id,
        Job.sourcer_ids, Job.caller_ids,
        Job.assigned_sourcer_id, Job.assigned_caller_id,
    ).all()

    # Candidate counts per job in ONE grouped query (avoids N+1).
    cand_counts = dict(
        db.query(Candidate.job_id, func.count(Candidate.id))
        .group_by(Candidate.job_id)
        .all()
    )

    def _visible(r) -> bool:
        if dual_user_id is not None:
            dl_ids = (json.loads(r.delivery_lead_ids or "[]") if isinstance(r.delivery_lead_ids, str) else (r.delivery_lead_ids or []))
            return r.created_by_id == dual_user_id or dual_user_id in dl_ids
        if created_by_id is not None:
            return r.created_by_id == created_by_id
        if delivery_lead_id is not None:
            dl_ids = (json.loads(r.delivery_lead_ids or "[]") if isinstance(r.delivery_lead_ids, str) else (r.delivery_lead_ids or []))
            return delivery_lead_id in dl_ids
        if assigned_sourcer_id is not None:
            s_ids = json.loads(r.sourcer_ids or "[]") if isinstance(r.sourcer_ids, str) else []
            c_ids = json.loads(r.caller_ids or "[]") if isinstance(r.caller_ids, str) else []
            return (assigned_sourcer_id in s_ids or assigned_sourcer_id in c_ids
                    or r.assigned_sourcer_id == assigned_sourcer_id
                    or r.assigned_caller_id == assigned_sourcer_id)
        return True  # admin / unscoped

    agg: dict[str, dict] = {}
    for r in rows:
        if not r.client_name or not _visible(r):
            continue
        a = agg.setdefault(r.client_name, {
            "client_name": r.client_name, "open": 0, "pending": 0,
            "on_hold": 0, "closed": 0, "total": 0, "candidate_count": 0,
        })
        a["total"] += 1
        if r.status == "open":
            a["open"] += 1
        elif r.status == "pending_review":
            a["pending"] += 1
        elif r.status == "on_hold":
            a["on_hold"] += 1
        elif r.status == "closed":
            a["closed"] += 1
        a["candidate_count"] += cand_counts.get(r.id, 0)

    return sorted(agg.values(), key=lambda x: x["client_name"].lower())


def get_job(db: Session, job_id: int) -> Job | None:
    return db.query(Job).filter(Job.id == job_id).first()


def is_job_id_taken(
    db: Session,
    client_job_id: str,
    exclude_job_id: int | None = None,
) -> bool:
    """Return True if client_job_id is already used by another job."""
    q = db.query(Job).filter(Job.client_job_id == client_job_id)
    if exclude_job_id:
        q = q.filter(Job.id != exclude_job_id)
    return q.first() is not None


def create_job(db: Session, data: dict, created_by_id: int) -> Job:
    # Snapshot creator email so reports survive even if the user row is later deleted.
    creator = db.query(User).filter(User.id == created_by_id).first()
    email_id = creator.email if creator else None
    job = Job(**data, created_by_id=created_by_id, email_id=email_id)
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def delete_job(db: Session, job_id: int, created_by_id: int) -> bool:
    """Delete a pending_review job created by this KAM. Returns False if not found/not allowed."""
    job = (
        db.query(Job)
        .filter(
            Job.id == job_id,
            Job.created_by_id == created_by_id,
            Job.status == JobStatus.pending_review,
        )
        .first()
    )
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
