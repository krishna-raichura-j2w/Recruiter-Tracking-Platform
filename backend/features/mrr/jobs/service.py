import json

from infra.models import Candidate, Job, JobStatus, User, now_utc, to_iso_utc
from sqlalchemy import or_
from sqlalchemy.orm import Session


def _parse_ids(raw) -> list:
    """Deserialize a JSON-array column into a list of ints, robustly."""
    try:
        arr = json.loads(raw) if isinstance(raw, str) else (raw or [])
    except Exception:
        return []
    out = []
    for x in arr:
        try:
            out.append(int(x))
        except Exception:
            pass
    return out


def _build_job_ctx(db: Session, jobs: list) -> dict:
    """Prefetch everything _job_dict needs for a batch of jobs in a constant
    number of queries (kills the per-job N+1 that was exhausting the pool).

    Returns {"user_names": {id: name}, "bh_names": {id: name},
             "cand_counts": {job_id: count}}.
    """
    from sqlalchemy import func
    from infra.models import BusinessHead

    user_ids: set = set()
    am_ids: set = set()
    job_ids: list = []
    for job in jobs:
        job_ids.append(job.id)
        for attr in ("assigned_sourcer_id", "assigned_caller_id", "delivery_lead_id"):
            v = getattr(job, attr, None)
            if v:
                user_ids.add(v)
        if getattr(job, "account_manager_id", None):
            am_ids.add(job.account_manager_id)
        for col in ("delivery_lead_ids", "sourcer_ids", "caller_ids", "collaborator_kam_ids"):
            user_ids.update(_parse_ids(getattr(job, col, None)))

    user_names: dict = {}
    if user_ids:
        for uid, name in db.query(User.id, User.name).filter(User.id.in_(user_ids)).all():
            user_names[uid] = name

    bh_names: dict = {}
    if am_ids:
        for aid, name in db.query(BusinessHead.id, BusinessHead.name).filter(BusinessHead.id.in_(am_ids)).all():
            bh_names[aid] = name

    cand_counts: dict = {}
    if job_ids:
        for jid, cnt in (
            db.query(Candidate.job_id, func.count(Candidate.id))
            .filter(Candidate.job_id.in_(job_ids))
            .group_by(Candidate.job_id)
            .all()
        ):
            cand_counts[jid] = cnt

    return {"user_names": user_names, "bh_names": bh_names, "cand_counts": cand_counts}


def _job_dict(db: Session, job: Job, ctx: dict | None = None) -> dict:
    # When a prefetched ctx is supplied (batch list path), all name/count lookups
    # are O(1) dict hits — no per-job queries. Single-job callers pass ctx=None and
    # fall back to direct queries.
    if ctx is not None:
        unames = ctx["user_names"]
        bhnames = ctx["bh_names"]
        count = ctx["cand_counts"].get(job.id, 0)
        uname = unames.get
        bhname = bhnames.get
    else:
        count = db.query(Candidate).filter(Candidate.job_id == job.id).count()
        _ucache: dict = {}

        def uname(uid, default=None):
            if not uid:
                return default
            if uid not in _ucache:
                u = db.query(User.name).filter(User.id == uid).first()
                _ucache[uid] = u[0] if u else None
            return _ucache[uid]

        def bhname(aid, default=None):
            if not aid:
                return default
            from infra.models import BusinessHead
            u = db.query(BusinessHead.name).filter(BusinessHead.id == aid).first()
            return u[0] if u else default

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
    # Use the (non-deferred) generated-at timestamp as the "has questionnaire"
    # flag — accessing the deferred blob would trigger a per-row lazy load.
    d["has_questionnaire"] = getattr(job, "questionnaire_generated_at", None) is not None
    d["candidate_count"] = count
    d["assigned_sourcer_name"] = uname(job.assigned_sourcer_id)
    d["assigned_caller_name"] = uname(job.assigned_caller_id)
    d["delivery_lead_name"] = uname(job.delivery_lead_id)
    d["business_head_name"] = bhname(job.account_manager_id)
    d["business_head_id"] = d.pop("account_manager_id", None)
    d["sourcer_ids"] = _parse_ids(job.sourcer_ids)
    d["caller_ids"] = _parse_ids(job.caller_ids)

    # Multi-DL: deserialize delivery_lead_ids; back-fill from delivery_lead_id for old rows
    dl_ids = _parse_ids(job.delivery_lead_ids)
    if not dl_ids and job.delivery_lead_id:
        dl_ids = [job.delivery_lead_id]
    d["delivery_lead_ids"] = dl_ids
    d["delivery_lead_names"] = [n for n in (uname(i) for i in dl_ids) if n]

    # Cross-pod collaborator KAMs
    collab_kam_ids = _parse_ids(getattr(job, "collaborator_kam_ids", None))
    d["collaborator_kam_ids"] = collab_kam_ids
    d["collaborator_kam_names"] = [n for n in (uname(i) for i in collab_kam_ids) if n]
    sourcer_names = [n for n in (uname(i) for i in d["sourcer_ids"]) if n]
    d["sourcer_names"] = sourcer_names
    caller_names = [n for n in (uname(i) for i in d["caller_ids"]) if n]
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


def _collaborator_kam_ids_for(job) -> list:
    """Return collaborator KAM IDs (KAMs from other pods invited to co-manage)."""
    return _parse_ids(getattr(job, "collaborator_kam_ids", None))


def _assignable_pod_ids(db: Session, job) -> set:
    """Pods whose members may work this job: owner KAM's pod ∪ each collaborator
    KAM's pod ∪ each assigned DL's pod. This is the cross-pod union that widens
    the (previously single-pod) recruiter pool and assignment validation."""
    user_ids: set = set()
    for v in (job.created_by_id, job.kam_id):
        if v:
            user_ids.add(v)
    user_ids.update(_collaborator_kam_ids_for(job))
    user_ids.update(_dl_ids_for(job))
    if not user_ids:
        return set()
    pod_ids = {
        pid
        for (pid,) in db.query(User.pod_id)
        .filter(User.id.in_(user_ids), User.pod_id.isnot(None))
        .all()
    }
    return pod_ids


def _assignable_recruiter_ids(db: Session, job) -> set:
    """Set of recruiter user IDs that may be assigned to this job — every active
    recruiter/DL across the union of pods (mirrors allocation.service._team's
    pod model), plus a legacy pod_memberships fallback for the assigned DLs."""
    from infra.models import PodMembership, UserRole

    pod_ids = _assignable_pod_ids(db, job)
    ids: set = set()
    if pod_ids:
        for (uid,) in (
            db.query(User.id)
            .filter(
                User.pod_id.in_(pod_ids),
                User.is_active == True,  # noqa: E712
                User.role.in_([UserRole.recruiter, UserRole.delivery_lead]),
            )
            .all()
        ):
            ids.add(uid)
    # Legacy fallback: recruiters hand-picked into an assigned DL's pod_memberships
    # team (covers pre-pods rows where DLs have no pod_id).
    dl_ids = _dl_ids_for(job)
    if dl_ids:
        for (uid,) in (
            db.query(PodMembership.user_id)
            .filter(PodMembership.pod_lead_id.in_(dl_ids))
            .all()
        ):
            ids.add(uid)
    return ids


def list_jobs(
    db: Session,
    status: str | None = None,
    created_by_id: int | None = None,
    delivery_lead_id: int | None = None,
    assigned_sourcer_id: int | None = None,
    dual_user_id: int | None = None,
    kam_user_id: int | None = None,
    search: str | None = None,
    client: str | None = None,
    business_head_id: int | None = None,
    skip: int = 0,
    limit: int = 0,
) -> tuple[list, int]:
    """Returns (items, total). limit=0 means no pagination (return all).

    kam_user_id scopes to jobs a KAM owns OR co-manages as a cross-pod
    collaborator (created_by_id == id OR id ∈ collaborator_kam_ids)."""
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
    if business_head_id is not None:
        # BH is stored on account_manager_id (table kept for backward compat).
        q = q.filter(Job.account_manager_id == business_head_id)
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

    # Python-side filters for JSON array columns (delivery_lead_ids, sourcer_ids,
    # caller_ids, collaborator_kam_ids)
    needs_python_filter = (
        delivery_lead_id is not None
        or dual_user_id is not None
        or assigned_sourcer_id is not None
        or kam_user_id is not None
    )
    if needs_python_filter:
        all_jobs = q.all()
        filtered = []
        for job in all_jobs:
            dl_ids = _dl_ids_for(job)
            collab_kam_ids = _collaborator_kam_ids_for(job)
            # kam_user_id: owns (created_by) OR co-manages (collaborator) the job
            if kam_user_id is not None:
                if job.created_by_id != kam_user_id and kam_user_id not in collab_kam_ids:
                    continue
            # dual_user_id: created_by OR is a DL OR is a collaborator KAM on this job
            if dual_user_id is not None:
                if (
                    job.created_by_id != dual_user_id
                    and dual_user_id not in dl_ids
                    and dual_user_id not in collab_kam_ids
                ):
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
        ctx = _build_job_ctx(db, filtered)
        return [_job_dict(db, j, ctx) for j in filtered], total

    total = q.count()
    if limit > 0:
        q = q.offset(skip).limit(limit)
    page = q.all()
    ctx = _build_job_ctx(db, page)
    return [_job_dict(db, j, ctx) for j in page], total


def client_summary(
    db: Session,
    created_by_id: int | None = None,
    delivery_lead_id: int | None = None,
    assigned_sourcer_id: int | None = None,
    dual_user_id: int | None = None,
    kam_user_id: int | None = None,
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
        Job.collaborator_kam_ids,
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
            ck_ids = _parse_ids(r.collaborator_kam_ids)
            return r.created_by_id == dual_user_id or dual_user_id in dl_ids or dual_user_id in ck_ids
        if kam_user_id is not None:
            ck_ids = _parse_ids(r.collaborator_kam_ids)
            return r.created_by_id == kam_user_id or kam_user_id in ck_ids
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
    # Walk-in / drive jobs auto-create a drive card so they surface in the
    # Walk-ins / Drives tab. Fire-and-forget — never abort job creation.
    if job.walkin or job.drive:
        from features.mrr.drives.service import ensure_drive_for_job

        ensure_drive_for_job(db, job, created_by_id)
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


def repost_job(db: Session, original: Job, reposted_by_id: int, new_deadline=None, new_headcount: int | None = None) -> tuple[Job, Job]:
    """Close the original job and create a copy with job_id=None, status=pending_review."""
    _SKIP = {
        "id", "job_id", "client_job_id", "status",
        "questionnaire_data", "questionnaire_generated_at",
        "sourcing_deadline", "calling_deadline",
        "sourcing_warned", "sourcing_alerted", "calling_warned", "calling_alerted",
        "email_id", "assigned_email_id",
    }
    new_data = {
        c.name: getattr(original, c.name)
        for c in Job.__table__.columns
        if c.name not in _SKIP
    }
    new_data["job_id"] = None
    new_data["client_job_id"] = None
    new_data["status"] = JobStatus.open
    new_data["questionnaire_generated_at"] = None
    new_data["sourcing_deadline"] = None
    new_data["calling_deadline"] = None
    new_data["sourcing_warned"] = False
    new_data["sourcing_alerted"] = False
    new_data["calling_warned"] = False
    new_data["calling_alerted"] = False
    new_data["is_synced"] = False
    _now = now_utc()
    new_data["created_at"] = _now
    new_data["updated_at"] = _now

    creator = db.query(User).filter(User.id == new_data.get("created_by_id")).first()
    new_data["email_id"] = creator.email if creator else None

    if new_deadline is not None:
        new_data["deadline"] = new_deadline
    if new_headcount is not None and new_headcount > 0:
        new_data["headcount"] = new_headcount

    # Track which job this was reposted from
    new_data["repost_of_job_id"] = original.id
    new_data["repost_of_ol_job_id"] = original.job_id  # OL numeric id (may be None)

    original.status = JobStatus.closed
    new_job = Job(**new_data)
    db.add(new_job)
    db.commit()
    db.refresh(original)
    db.refresh(new_job)
    return original, new_job
