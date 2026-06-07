import math
from datetime import date, datetime

from infra.models import (
    Candidate,
    Drive,
    DriveCall,
    DriveCallOutcome,
    DriveCallType,
    DriveStatus,
    DriveTrackerStage,
    DriveType,
    Job,
    User,
    isofy_datetimes,
    now_utc,
    to_iso_utc,
)
from sqlalchemy.orm import Session, joinedload


# ── Funnel math ───────────────────────────────────────────────────────────────
def compute_target(open_positions, conversion_rate, buffer_pct) -> int:
    """Submission target = positions ÷ conversion_rate × (1 + buffer). Rounded up —
    you can't submit a fractional candidate."""
    try:
        pos = float(open_positions or 0)
        conv = float(conversion_rate or 0)
        buf = float(buffer_pct or 0)
    except (TypeError, ValueError):
        return 0
    if conv <= 0 or pos <= 0:
        return 0
    return math.ceil(pos / conv * (1 + buf))


def _to_float(v):
    return float(v) if v is not None else None


def _parse_date(v):
    if not v or isinstance(v, date):
        return v
    try:
        return date.fromisoformat(str(v)[:10])
    except ValueError:
        return None


def _parse_dt(v):
    if not v or isinstance(v, datetime):
        return v
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except ValueError:
        return None


# ── Serialization ─────────────────────────────────────────────────────────────
def _drive_dict(db: Session, drive: Drive) -> dict:
    d = {c.name: getattr(drive, c.name) for c in Drive.__table__.columns}
    # rates → float for clean JSON
    for k in ("conversion_rate", "buffer_pct", "show_rate"):
        d[k] = _to_float(d.get(k))

    def uname(uid):
        if not uid:
            return None
        u = db.query(User.name).filter(User.id == uid).first()
        return u[0] if u else None

    d["bh_owner_name"] = uname(drive.bh_owner_id)
    d["kam_owner_name"] = uname(drive.kam_owner_id)
    d["dl_owner_name"] = uname(drive.dl_owner_id)

    job = drive.job or db.query(Job).filter(Job.id == drive.job_id).first()
    if job:
        d["client_name"] = job.client_name
        d["role_title"] = job.role_title
        d["job_headcount"] = job.headcount

    computed = compute_target(drive.open_positions, drive.conversion_rate, drive.buffer_pct)
    effective = drive.submission_target_override or computed
    d["submission_target_computed"] = computed
    d["submission_target"] = effective
    d["show_target"] = round(effective * float(drive.show_rate or 0))
    d["select_target"] = round(effective * float(drive.conversion_rate or 0))

    d["lineup_count"] = (
        db.query(Candidate).filter(Candidate.drive_id == drive.id).count()
    )
    return isofy_datetimes(d)


def _reconfirm_status(calls: list, call_type: DriveCallType) -> dict:
    """Phase 4.1 reconfirmation checkpoint, derived from the flexible call log: the
    latest call of `call_type` marks it attempted (`done`); `confirmed` is true only
    when that latest call's outcome == "confirmed". attempts = how many were logged."""
    matching = [c for c in calls if c.call_type == call_type]
    if not matching:
        return {"done": False, "confirmed": False, "at": None, "outcome": None, "notes": None, "attempts": 0}
    latest = max(matching, key=lambda x: x.call_date or now_utc())
    return {
        "done": True,
        "confirmed": latest.outcome == DriveCallOutcome.confirmed.value,
        "at": to_iso_utc(latest.call_date),
        "outcome": latest.outcome,
        "notes": latest.notes,
        "attempts": len(matching),
    }


def _candidate_dict(db: Session, c: Candidate) -> dict:
    calls = sorted(c.drive_calls, key=lambda x: x.call_date or now_utc())
    d1 = _reconfirm_status(calls, DriveCallType.reconfirm_d1)
    dday = _reconfirm_status(calls, DriveCallType.reconfirm_dday)
    assigned_to_name = c.assigned_to.name if c.assigned_to else None
    sourced_by_name = c.sourced_by.name if c.sourced_by else None
    return {
        "id": c.id,
        "drive_id": c.drive_id,
        "full_name": c.full_name,
        "mobile": c.mobile,
        # Recruiter attribution: assigned caller, falling back to the sourcer.
        "assigned_to_name": assigned_to_name,
        "sourced_by_name": sourced_by_name,
        "recruiter_name": assigned_to_name or sourced_by_name,
        "email": c.email,
        "skills": c.skills,
        "designation": c.designation,
        "current_company": c.current_company,
        "location": c.location or c.city,
        "exp_range": c.exp_range,
        "current_ctc": c.current_ctc,
        "expected_ctc": c.expected_ctc,
        "lead_source": c.lead_source,
        "status": c.status.value if c.status else None,
        "drive_tracker_stage": (
            c.drive_tracker_stage.value if c.drive_tracker_stage else None
        ),
        "drive_reached_at": to_iso_utc(c.drive_reached_at),
        # Phase 4.1 reconfirmation checkpoints (derived from drive_calls)
        "reconfirm_d1_done": d1["done"],
        "reconfirm_d1_confirmed": d1["confirmed"],
        "reconfirm_d1_at": d1["at"],
        "reconfirm_d1_outcome": d1["outcome"],
        "reconfirm_d1_notes": d1["notes"],
        "reconfirm_d1_attempts": d1["attempts"],
        "reconfirm_dday_done": dday["done"],
        "reconfirm_dday_confirmed": dday["confirmed"],
        "reconfirm_dday_at": dday["at"],
        "reconfirm_dday_outcome": dday["outcome"],
        "reconfirm_dday_notes": dday["notes"],
        "reconfirm_dday_attempts": dday["attempts"],
        "drive_calls": [_call_dict(call) for call in calls],
    }


def _call_dict(call: DriveCall) -> dict:
    return {
        "id": call.id,
        "candidate_id": call.candidate_id,
        "drive_id": call.drive_id,
        "caller_id": call.caller_id,
        "caller_name": call.caller.name if call.caller else None,
        "call_type": call.call_type.value if call.call_type else None,
        "call_date": to_iso_utc(call.call_date),
        "outcome": call.outcome,
        "notes": call.notes,
    }


# ── Auto-creation hook ────────────────────────────────────────────────────────
def ensure_drive_for_job(db: Session, job: Job, created_by_id: int | None = None) -> Drive | None:
    """Create the first drive card for a walk-in/drive job. Idempotent: returns the
    existing drive if one already exists. Never raises — drive seeding must not abort
    job creation."""
    try:
        existing = db.query(Drive).filter(Drive.job_id == job.id).first()
        if existing:
            return existing
        is_walkin = bool(job.walkin)
        client = (job.client_name or "").lower()
        drive = Drive(
            job_id=job.id,
            drive_type=DriveType.walkin if is_walkin else DriveType.virtual,
            status=DriveStatus.planned,
            open_positions=job.headcount,
            conversion_rate=0.20 if "infosys" in client else 0.10,
            buffer_pct=0.25,
            show_rate=0.65 if is_walkin else 0.80,
            drive_date_from=job.date_from,
            drive_date_upto=job.date_upto,
            start_time=job.start_time,
            end_time=job.end_time,
            kam_owner_id=job.kam_id,
            dl_owner_id=job.delivery_lead_id,
            created_by_id=created_by_id,
        )
        db.add(drive)
        db.commit()
        db.refresh(drive)
        return drive
    except Exception:
        db.rollback()
        return None


# ── Drive CRUD ────────────────────────────────────────────────────────────────
def list_drives(db: Session, status: str | None = None, user=None, mine: bool = False) -> list[dict]:
    q = db.query(Drive)
    if status:
        q = q.filter(Drive.status == status)
    if mine and user is not None:
        q = q.filter(
            (Drive.kam_owner_id == user.id)
            | (Drive.dl_owner_id == user.id)
            | (Drive.bh_owner_id == user.id)
        )
    drives = q.order_by(Drive.drive_date_from.desc().nullslast(), Drive.id.desc()).all()
    return [_drive_dict(db, d) for d in drives]


# ── Aggregate dashboard (DL/KAM/Admin) ────────────────────────────────────────
_CONFIRMED_STAGES = {
    DriveTrackerStage.confirmed,
    DriveTrackerStage.en_route,
    DriveTrackerStage.reached,
    DriveTrackerStage.attended,
}


def _empty_counts() -> dict:
    return {
        "in_pipeline": 0, "confirmed": 0, "not_confirmed": 0, "no_show": 0,
        "d1_confirmed": 0, "d1_pending": 0, "dday_confirmed": 0, "dday_pending": 0,
    }


def _accumulate(counts: dict, c: Candidate) -> None:
    """Tally one drive candidate into a counts dict. Base for pipeline/reconfirm
    counts excludes no-shows."""
    stage = c.drive_tracker_stage
    if stage == DriveTrackerStage.no_show:
        counts["no_show"] += 1
        return
    counts["in_pipeline"] += 1
    if stage in _CONFIRMED_STAGES:
        counts["confirmed"] += 1
    else:
        counts["not_confirmed"] += 1
    calls = c.drive_calls
    if _reconfirm_status(calls, DriveCallType.reconfirm_d1)["confirmed"]:
        counts["d1_confirmed"] += 1
    else:
        counts["d1_pending"] += 1
    if _reconfirm_status(calls, DriveCallType.reconfirm_dday)["confirmed"]:
        counts["dday_confirmed"] += 1
    else:
        counts["dday_pending"] += 1


def drives_summary(db: Session, user, scope: str = "mine") -> dict:
    """Aggregate drive-candidate counts by status for a DL/KAM/Admin dashboard.
    scope='mine' → drives the user owns (kam/dl/bh); scope='all' → every drive."""
    q = db.query(Drive)
    if scope == "mine" and user is not None:
        q = q.filter(
            (Drive.kam_owner_id == user.id)
            | (Drive.dl_owner_id == user.id)
            | (Drive.bh_owner_id == user.id)
        )
    drives = q.order_by(Drive.drive_date_from.desc().nullslast(), Drive.id.desc()).all()
    drive_ids = [d.id for d in drives]

    totals = _empty_counts()
    by_stage = {s.value: 0 for s in DriveTrackerStage}
    per_counts = {did: _empty_counts() for did in drive_ids}

    if drive_ids:
        cands = (
            db.query(Candidate)
            .options(joinedload(Candidate.drive_calls))
            .filter(Candidate.drive_id.in_(drive_ids))
            .all()
        )
        for c in cands:
            stage = c.drive_tracker_stage or DriveTrackerStage.lined_up
            by_stage[stage.value] = by_stage.get(stage.value, 0) + 1
            _accumulate(totals, c)
            if c.drive_id in per_counts:
                _accumulate(per_counts[c.drive_id], c)

    per_drive = []
    for d in drives:
        job = d.job
        per_drive.append({
            "drive_id": d.id,
            "client_name": job.client_name if job else None,
            "role_title": job.role_title if job else None,
            "drive_date_from": d.drive_date_from.isoformat() if d.drive_date_from else None,
            "status": d.status.value if d.status else None,
            **per_counts[d.id],
        })

    return {
        "scope": scope,
        "total_drives": len(drives),
        "totals": totals,
        "by_stage": by_stage,
        "per_drive": per_drive,
    }


def get_drive(db: Session, drive_id: int) -> Drive | None:
    return db.query(Drive).filter(Drive.id == drive_id).first()


def create_drive(db: Session, data: dict, created_by_id: int) -> Drive | None:
    job = db.query(Job).filter(Job.id == data["job_id"]).first()
    if not job:
        return None
    is_walkin = (data.get("drive_type") == DriveType.walkin) or (
        data.get("drive_type") is None and bool(job.walkin)
    )
    client = (job.client_name or "").lower()
    drive = Drive(
        job_id=job.id,
        drive_type=data.get("drive_type") or (DriveType.walkin if job.walkin else DriveType.virtual),
        status=DriveStatus.planned,
        open_positions=data.get("open_positions") if data.get("open_positions") is not None else job.headcount,
        conversion_rate=0.20 if "infosys" in client else 0.10,
        buffer_pct=0.25,
        show_rate=0.65 if is_walkin else 0.80,
        drive_date_from=_parse_date(data.get("drive_date_from")) or job.date_from,
        drive_date_upto=_parse_date(data.get("drive_date_upto")) or job.date_upto,
        start_time=data.get("start_time") or job.start_time,
        end_time=data.get("end_time") or job.end_time,
        kam_owner_id=job.kam_id,
        dl_owner_id=job.delivery_lead_id,
        created_by_id=created_by_id,
    )
    db.add(drive)
    db.commit()
    db.refresh(drive)
    return drive


_DATE_FIELDS = {"drive_date_from", "drive_date_upto"}
_DT_FIELDS = {"portal_cutoff"}


def update_drive(db: Session, drive_id: int, data: dict) -> Drive | None:
    drive = db.query(Drive).filter(Drive.id == drive_id).first()
    if not drive:
        return None
    for k, v in data.items():
        if v is None:
            continue
        if k in _DATE_FIELDS:
            v = _parse_date(v)
        elif k in _DT_FIELDS:
            v = _parse_dt(v)
        setattr(drive, k, v)
    db.commit()
    db.refresh(drive)
    return drive


# ── Drive candidates ──────────────────────────────────────────────────────────
def list_drive_candidates(db: Session, drive_id: int) -> list[dict]:
    cands = (
        db.query(Candidate)
        .filter(Candidate.drive_id == drive_id)
        .order_by(Candidate.id.asc())
        .all()
    )
    return [_candidate_dict(db, c) for c in cands]


def update_tracker(db: Session, drive_id: int, candidate_id: int, stage: DriveTrackerStage) -> Candidate | None:
    c = (
        db.query(Candidate)
        .filter(Candidate.id == candidate_id, Candidate.drive_id == drive_id)
        .first()
    )
    if not c:
        return None
    c.drive_tracker_stage = stage
    if stage in (DriveTrackerStage.reached, DriveTrackerStage.attended) and not c.drive_reached_at:
        c.drive_reached_at = now_utc()
    db.commit()
    db.refresh(c)
    return c


def add_drive_call(
    db: Session,
    drive_id: int,
    candidate_id: int,
    caller_id: int,
    call_type,
    outcome: str | None,
    notes: str | None,
) -> DriveCall | None:
    c = (
        db.query(Candidate)
        .filter(Candidate.id == candidate_id, Candidate.drive_id == drive_id)
        .first()
    )
    if not c:
        return None
    call = DriveCall(
        candidate_id=candidate_id,
        drive_id=drive_id,
        caller_id=caller_id,
        call_type=call_type,
        outcome=outcome,
        notes=notes,
    )
    db.add(call)
    # Phase 4.1: a D-1 / D-day reconfirmation call advances a still-"lined up"
    # candidate to "confirmed" ONLY when the candidate actually confirmed
    # (outcome == confirmed). "Not picked"/other outcomes log the attempt but
    # leave the stage; never downgrades a later stage.
    if (
        call_type in (DriveCallType.reconfirm_d1, DriveCallType.reconfirm_dday)
        and outcome == DriveCallOutcome.confirmed.value
        and c.drive_tracker_stage in (None, DriveTrackerStage.lined_up)
    ):
        c.drive_tracker_stage = DriveTrackerStage.confirmed
    db.commit()
    db.refresh(call)
    return call


def list_drive_calls(db: Session, drive_id: int, candidate_id: int) -> list[dict]:
    calls = (
        db.query(DriveCall)
        .filter(DriveCall.drive_id == drive_id, DriveCall.candidate_id == candidate_id)
        .order_by(DriveCall.call_date.asc())
        .all()
    )
    return [_call_dict(c) for c in calls]
