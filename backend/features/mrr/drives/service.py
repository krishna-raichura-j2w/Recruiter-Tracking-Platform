import math
from datetime import date, datetime

from infra.models import (
    Candidate,
    Drive,
    DriveCall,
    DriveStatus,
    DriveTrackerStage,
    DriveType,
    Job,
    User,
    isofy_datetimes,
    now_utc,
    to_iso_utc,
)
from sqlalchemy.orm import Session


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


def _candidate_dict(db: Session, c: Candidate) -> dict:
    return {
        "id": c.id,
        "drive_id": c.drive_id,
        "full_name": c.full_name,
        "mobile": c.mobile,
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
        "drive_calls": [_call_dict(call) for call in sorted(
            c.drive_calls, key=lambda x: x.call_date or now_utc()
        )],
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


def add_drive_candidate(
    db: Session,
    drive_id: int,
    job_id: int,
    data: dict,
    sourced_by_id: int | None,
    created_by_email: str | None,
) -> Candidate:
    from features.mrr.candidates import service as cand_service

    payload = {k: v for k, v in data.items() if v is not None}
    payload["job_id"] = job_id
    payload["drive_id"] = drive_id
    payload["drive_tracker_stage"] = DriveTrackerStage.lined_up
    candidate = cand_service.create_candidate(
        db,
        payload,
        sourced_by_id=sourced_by_id,
        created_by_email=created_by_email,
    )
    return candidate


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
