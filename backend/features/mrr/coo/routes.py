"""
COO Leaderboard — pulls from OL Replica MySQL, maps clients to Business Heads
and Account Managers via Mehr.xlsx, returns 10 fixed pipeline columns with
total (all-time) and today counts.
"""

from __future__ import annotations
import os
import re
from datetime import timedelta, datetime, timezone
from functools import lru_cache
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from core.deps import get_current_user
from core.database import get_db

router = APIRouter(prefix="/coo", tags=["coo"])

# ── Fixed column definitions (order matches the spreadsheet) ─────────────────

COLUMNS = [
    ("submission",    "Submission"),
    ("screen_reject", "Screen Reject"),
    ("l1_reject",     "L1 Reject"),
    ("l1_accept",     "L1 Accept"),
    ("l2_reject",     "L2 Reject"),
    ("l2_accept",     "L2 Accept"),
    ("l3_reject",     "L3 Reject"),
    ("l3_accept",     "L3 Accept"),
    ("selection",     "Selection"),
    ("onboarding",    "Onboarding"),
]

# step_id → leaderboard column key
STEP_TO_COL: dict[int, str] = {
    7:  "submission",
    8:  "screen_reject",
    11: "l1_reject",
    12: "l1_reject",
    13: "l1_accept",
    14: "l1_accept",
    16: "l2_reject",
    17: "l2_reject",
    18: "l2_accept",
    19: "l2_accept",
    21: "l3_reject",
    22: "l3_reject",
    23: "l3_accept",
    47: "l3_accept",
    33: "selection",
    44: "onboarding",
    54: "onboarding",
    41: "onboarding",
}

STEP_IDS = tuple(STEP_TO_COL.keys())

# ── Excel BH + AM mapping ─────────────────────────────────────────────────────

def _resolve_excel_path() -> str:
    """Locate Mehr.xlsx across local dev layout and deployed container layouts.
    Allows an explicit override via COO_EXCEL_PATH for any other deploy shape."""
    env_override = os.environ.get("COO_EXCEL_PATH")
    if env_override:
        return env_override
    base = os.path.dirname(__file__)
    candidates = [
        os.path.normpath(os.path.join(base, "..", "..", "..", "Mehr.xlsx")),  # local repo: backend/features/coo → repo root
        os.path.normpath(os.path.join(base, "..", "..", "Mehr.xlsx")),        # deployed: file copied next to backend root (/app/Mehr.xlsx)
        "/Mehr.xlsx",                                                          # fallback: container root
    ]
    for p in candidates:
        if os.path.exists(p):
            return p
    return candidates[0]


EXCEL_PATH = _resolve_excel_path()


@lru_cache(maxsize=1)
def _load_bh_am_map() -> dict[str, dict[str, str]]:
    """Returns {client_lower: {bh, am}} from Mehr.xlsx 'AM and BH' sheet."""
    try:
        import openpyxl
        wb = openpyxl.load_workbook(EXCEL_PATH, read_only=True, data_only=True)
        ws = wb["AM and BH"]
        mapping: dict[str, dict[str, str]] = {}
        for row in ws.iter_rows(min_row=2, values_only=True):
            client = row[4]   # Column E
            bh     = row[5]   # Column F
            am     = row[6]   # Column G
            if (client and bh
                    and isinstance(client, str) and isinstance(bh, str)
                    and bh.strip().lower() not in ("none", "")):
                mapping[client.strip().lower()] = {
                    "bh": bh.strip(),
                    "am": am.strip() if isinstance(am, str) and am.strip() else "",
                }
        wb.close()
        return mapping
    except Exception as exc:
        print(f"[coo] Excel load failed: {exc}")
        return {}


def _normalize(name: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", name.lower()).strip()


def _lookup(client: str, bh_am_map: dict[str, dict[str, str]]) -> tuple[str, str]:
    """Returns (bh, am) for a client name. bh='Unknown' if not found."""
    if not client:
        return "Unknown", ""
    key = client.strip().lower()
    if key in bh_am_map:
        rec = bh_am_map[key]
        return rec["bh"], rec["am"]
    norm = _normalize(client)
    for k, rec in bh_am_map.items():
        if _normalize(k) == norm:
            return rec["bh"], rec["am"]
    for k, rec in bh_am_map.items():
        if norm in _normalize(k) or _normalize(k) in norm:
            return rec["bh"], rec["am"]
    return "Unknown", ""


# ── MySQL helpers ─────────────────────────────────────────────────────────────

def _get_mysql_conn():
    import pymysql
    from core.config import settings
    missing = [k for k, v in [
        ("OL_REPLICA_HOST",     settings.ol_replica_host),
        ("OL_REPLICA_USER",     settings.ol_replica_user),
        ("OL_REPLICA_PASSWORD", settings.ol_replica_password),
    ] if not v]
    if missing:
        raise HTTPException(status_code=503, detail=f"OL Replica not configured: {', '.join(missing)}")
    return pymysql.connect(
        host=settings.ol_replica_host,
        port=settings.ol_replica_port,
        user=settings.ol_replica_user,
        password=settings.ol_replica_password,
        database=settings.ol_replica_database,   # defaults to "offerletter"
        connect_timeout=10,
        cursorclass=pymysql.cursors.DictCursor,
        ssl_disabled=True,
    )


# ── SQL — uses UTC ranges (index-friendly, no per-row CONVERT_TZ) ────────────

from core.sql_loader import load_sql
_SQL = load_sql("002-coo_leaderboard_pipeline.sql")


# ── Endpoint ──────────────────────────────────────────────────────────────────

def _zero():
    return {"total": 0, "today": 0, "compare": 0}


def _utc_day_range(d) -> tuple[str, str]:
    """Return UTC start/end strings for one IST calendar day."""
    from datetime import date as _date
    start = datetime(d.year, d.month, d.day) - timedelta(hours=5, minutes=30)
    end   = datetime(d.year, d.month, d.day) + timedelta(hours=18, minutes=30)
    return start.strftime("%Y-%m-%d %H:%M:%S"), end.strftime("%Y-%m-%d %H:%M:%S")


@router.get("/leaderboard")
def coo_leaderboard(
    compare_date: str | None = None,
    _=Depends(get_current_user),
):
    """
    Returns per-BH × per-client pipeline counts — total (all-time), today, and
    optional comparison date.  compare_date: ISO date string (YYYY-MM-DD).
    """
    from datetime import date as _date

    ist_now  = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    today_d  = ist_now.date()

    today_utc_start, tomorrow_utc_start = _utc_day_range(today_d)

    # Validate + resolve compare_date; use a dead range when absent so compare_cnt = 0
    cmp_d: _date | None = None
    if compare_date:
        try:
            cmp_d = _date.fromisoformat(compare_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="compare_date must be YYYY-MM-DD")
        cmp_utc_start, cmp_utc_end = _utc_day_range(cmp_d)
    else:
        # Dead range → compare_cnt always 0
        cmp_utc_start = "1970-01-01 00:00:00"
        cmp_utc_end   = "1970-01-01 00:00:01"

    params = {
        "today_utc_start":    today_utc_start,
        "tomorrow_utc_start": tomorrow_utc_start,
        "cmp_utc_start":      cmp_utc_start,
        "cmp_utc_end":        cmp_utc_end,
        "step_ids":           STEP_IDS,
    }

    bh_am_map = _load_bh_am_map()

    conn = None
    try:
        conn = _get_mysql_conn()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"DB connection failed: {exc}")

    db_rows = []
    try:
        with conn.cursor() as cur:
            cur.execute(_SQL, params)
            db_rows = cur.fetchall()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Query failed: {exc}")
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass

    # Aggregate into (bh, am, client) → {col_key → {total, today, compare}}
    agg: dict[tuple[str, str, str], dict[str, dict[str, int]]] = {}

    for r in db_rows:
        raw_client = r.get("client")
        if not raw_client:
            continue
        client  = str(raw_client).strip()
        step_id = int(float(r.get("step_id") or 0))
        col_key = STEP_TO_COL.get(step_id)
        if not col_key:
            continue
        bh, am = _lookup(client, bh_am_map)
        if bh == "Unknown":
            continue
        key = (bh, am, client)
        if key not in agg:
            agg[key] = {k: _zero() for k, _ in COLUMNS}
        agg[key][col_key]["total"]   += int(r.get("total_cnt")   or 0)
        agg[key][col_key]["today"]   += int(r.get("today_cnt")   or 0)
        agg[key][col_key]["compare"] += int(r.get("compare_cnt") or 0)

    rows = [
        {"bh_name": bh, "am_name": am, "client_name": client, "cols": data}
        for (bh, am, client), data in sorted(agg.items())
        if any(data[c]["total"] > 0 or data[c]["today"] > 0 for c, _ in COLUMNS)
    ]

    return {
        "rows":        rows,
        "compare_date": compare_date,
        "columns": [{"key": k, "label": lbl} for k, lbl in COLUMNS],
        "today":   today_d.isoformat(),
    }


# ── Recruiter leaderboard (local DB, today's metrics) ────────────────────────

RECRUITER_DAY_TARGET = 4
ON_TRACK_THRESHOLD   = 75  # % of target


def _performance_category(verified: int) -> str:
    if verified <= 0:
        return "needs discussion"
    if verified == 1:
        return "below average"
    if verified == 2:
        return "average"
    if verified in (3, 4):
        return "high"
    return "good performance"


@router.get("/recruiter-leaderboard")
def recruiter_leaderboard(
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """Per-recruiter daily metrics for the COO dashboard.

    All counts use today's IST calendar day. "Verified by DL" counts validations
    completed today on candidates this recruiter sourced. Performance category
    is derived from verified count only (per product spec).
    """
    from infra.models import (
        User, UserRole, Candidate, CandidateStatus,
        Validation, ValidationStatus, ConsultantMail,
        Pod, PodMembership, HourlyTarget,
    )
    from features.mrr.targets.routes import TIME_SLOTS, current_slot_indices_completed
    from sqlalchemy import func, or_

    # IST today
    ist_now = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    today_ist = ist_now.date()
    # UTC range covering the IST day
    day_start_utc = datetime(today_ist.year, today_ist.month, today_ist.day) - timedelta(hours=5, minutes=30)
    day_end_utc   = day_start_utc + timedelta(days=1)

    # All active recruiters (primary or secondary role)…
    recruiters = (
        db.query(User)
        .filter(
            User.is_active == True,  # noqa: E712
            or_(User.role == UserRole.recruiter, User.secondary_role == "recruiter"),
        )
        .all()
    )
    rec_ids_set = {u.id for u in recruiters}
    # …plus any user who has sourced a candidate today, even if not classified
    # as a recruiter (e.g. delivery leads who source directly). Without this,
    # POD TOTAL diverges from the candidates table.
    extra_sourcer_ids = [
        row[0] for row in db.query(Candidate.sourced_by_id)
        .filter(
            Candidate.sourced_by_id.isnot(None),
            Candidate.sourced_at >= day_start_utc,
            Candidate.sourced_at <  day_end_utc,
        )
        .distinct()
        .all()
        if row[0] not in rec_ids_set
    ]
    if extra_sourcer_ids:
        extras = db.query(User).filter(User.id.in_(extra_sourcer_ids)).all()
        recruiters = recruiters + extras
    recruiters.sort(key=lambda u: u.name or "")
    rec_ids = [u.id for u in recruiters]
    if not rec_ids:
        return {
            "rows": [],
            "totals": {"done": 0, "verified": 0, "rejections": 0, "ack_sent": 0, "pct": 0, "status": "Behind"},
            "day_target": RECRUITER_DAY_TARGET,
            "today": today_ist.isoformat(),
        }

    # Done = candidates this recruiter SOURCED today (Candidate.sourced_at in
    # today's IST window). Verified = of THOSE same candidates, how many the
    # DL has validated. Verified is a subset of Done by construction.
    todays_sourced_rows = (
        db.query(Candidate.id, Candidate.sourced_by_id)
        .filter(
            Candidate.sourced_by_id.in_(rec_ids),
            Candidate.sourced_at >= day_start_utc,
            Candidate.sourced_at <  day_end_utc,
        ).all()
    )
    todays_candidate_ids: list[int] = [cid for cid, _ in todays_sourced_rows]
    done_by_rec: dict[int, int] = {}
    for _cid, uid in todays_sourced_rows:
        done_by_rec[uid] = done_by_rec.get(uid, 0) + 1

    verified_by_rec: dict[int, int] = {}
    if todays_candidate_ids:
        verified_rows = (
            db.query(Candidate.sourced_by_id, func.count(Validation.id))
            .join(Validation, Validation.candidate_id == Candidate.id)
            .filter(
                Candidate.id.in_(todays_candidate_ids),
                Validation.status == ValidationStatus.validated,
            )
            .group_by(Candidate.sourced_by_id)
            .all()
        )
        verified_by_rec = {uid: int(cnt) for uid, cnt in verified_rows}

    # Rejections today — candidates flipped to rejected with updated_at today
    reject_rows = (
        db.query(Candidate.sourced_by_id, func.count(Candidate.id))
        .filter(
            Candidate.sourced_by_id.in_(rec_ids),
            Candidate.status == CandidateStatus.rejected,
            Candidate.updated_at >= day_start_utc,
            Candidate.updated_at <  day_end_utc,
        )
        .group_by(Candidate.sourced_by_id)
        .all()
    )
    reject_by_rec = {uid: int(cnt) for uid, cnt in reject_rows}

    # Acknowledgment-pending mails — mails the recruiter sent TODAY whose
    # acknowledgement hasn't come back yet. Date-scoped so the row stays
    # internally consistent: a recruiter with no sourcing activity today
    # also has no ack activity today.
    ack_rows = (
        db.query(ConsultantMail.sent_by_id, func.count(ConsultantMail.id))
        .filter(
            ConsultantMail.sent_by_id.in_(rec_ids),
            ConsultantMail.acknowledgement_received == False,  # noqa: E712
            ConsultantMail.sent_at >= day_start_utc,
            ConsultantMail.sent_at <  day_end_utc,
        )
        .group_by(ConsultantMail.sent_by_id)
        .all()
    )
    ack_by_rec = {uid: int(cnt) for uid, cnt in ack_rows}

    # ── Hourly targets for today (per recruiter) ──
    # Sum of slot_targets for slots that have already ended → "target_so_far".
    # Sum of all slot_targets for today → "day_target".
    completed_slots = set(current_slot_indices_completed(ist_now))
    target_rows = (
        db.query(HourlyTarget.user_id, HourlyTarget.slot_index, HourlyTarget.target_count)
          .filter(HourlyTarget.user_id.in_(rec_ids), HourlyTarget.date == today_ist)
          .all()
    )
    slots_by_user: dict[int, dict[int, int]] = {}
    for uid, idx, cnt in target_rows:
        slots_by_user.setdefault(uid, {})[idx] = int(cnt)

    def _targets_for(uid: int) -> tuple[int, int]:
        slots = slots_by_user.get(uid, {})
        so_far = sum(c for idx, c in slots.items() if idx in completed_slots)
        day    = sum(slots.values())
        return so_far, day

    # ── Org chain per recruiter ──
    # New pod shape: KAMs and DLs are flat peers under the BH. A recruiter
    # rolls up to one DL; KAMs are not in the recruiter's direct chain. The
    # leaderboard shows the recruiter's DL, the pod's BH, the pod name, and
    # the full list of KAMs in that pod (since any KAM may work with any DL).
    pods_by_id: dict[int, Pod] = {p.id: p for p in db.query(Pod).all()}

    # Map pod_id → list of KAM names in that pod.
    kams_by_pod: dict[int, list[str]] = {}
    for pid, name in (
        db.query(User.pod_id, User.name)
        .filter(User.role == UserRole.kam, User.pod_id.isnot(None), User.is_active == True)  # noqa: E712
        .order_by(User.name)
        .all()
    ):
        kams_by_pod.setdefault(pid, []).append(name)

    # Map pod_id → BH name.
    bh_by_pod: dict[int, str] = {}
    for p in pods_by_id.values():
        if p.bh_user_id:
            bh_user = db.query(User).filter(User.id == p.bh_user_id).first()
            if bh_user:
                bh_by_pod[p.id] = bh_user.name

    # Map user_id → DL name (the user's parent IF that parent is a DL).
    parent_ids = {u.parent_user_id for u in recruiters if u.parent_user_id}
    parent_users: dict[int, User] = {}
    if parent_ids:
        parent_users = {u.id: u for u in db.query(User).filter(User.id.in_(parent_ids)).all()}

    # Legacy fallback: a recruiter's first pod_lead (DL) from pod_memberships
    legacy_dl_by_user: dict[int, str] = {}
    if rec_ids:
        legacy_rows = (
            db.query(PodMembership.user_id, User.name)
            .join(User, PodMembership.pod_lead_id == User.id)
            .filter(PodMembership.user_id.in_(rec_ids))
            .all()
        )
        for uid, name in legacy_rows:
            legacy_dl_by_user.setdefault(uid, name)

    def _role_value(u: User) -> str:
        return u.role.value if hasattr(u.role, "value") else str(u.role)

    def _chain_for(u: User) -> dict:
        dl_name = None
        # Direct parent → DL?
        parent = parent_users.get(u.parent_user_id) if u.parent_user_id else None
        if parent and _role_value(parent) == "delivery_lead":
            dl_name = parent.name
        # User themselves is a DL (sourcing directly).
        if dl_name is None and _role_value(u) == "delivery_lead":
            dl_name = u.name
        # Legacy fallback when pod tree isn't populated yet.
        if dl_name is None:
            dl_name = legacy_dl_by_user.get(u.id)

        pod = pods_by_id.get(u.pod_id) if u.pod_id else None
        pod_name = pod.name if pod else None
        bh_name  = bh_by_pod.get(u.pod_id) if u.pod_id else None
        kam_names = kams_by_pod.get(u.pod_id, []) if u.pod_id else []
        return {"dl": dl_name, "kam_names": kam_names, "bh": bh_name, "pod": pod_name}

    rows = []
    sum_done = sum_verified = sum_rejects = sum_ack = 0
    sum_target_so_far = sum_day_target = 0
    for u in recruiters:
        done     = done_by_rec.get(u.id, 0)
        verified = verified_by_rec.get(u.id, 0)
        rejects  = reject_by_rec.get(u.id, 0)
        ack      = ack_by_rec.get(u.id, 0)
        target_so_far, day_target = _targets_for(u.id)
        # % against the cumulative target the recruiter SHOULD have hit by now.
        pct      = round((verified / target_so_far) * 100) if target_so_far else 0
        status   = "On Track" if (target_so_far == 0 or pct >= ON_TRACK_THRESHOLD) else "Behind"
        chain    = _chain_for(u)
        rows.append({
            "recruiter_id":   u.id,
            "recruiter_name": u.name,
            "dl_name":        chain["dl"],
            "kam_names":      chain["kam_names"],
            "bh_name":        chain["bh"],
            "pod_name":       chain["pod"],
            "day_target":     day_target,
            "target_so_far":  target_so_far,
            "done":           done,
            "verified":       verified,
            "pct":            pct,
            "status":         status,
            "rejections":     rejects,
            "ack_sent":       ack,
            "performance":    _performance_category(verified),
        })
        sum_done     += done
        sum_verified += verified
        sum_rejects  += rejects
        sum_ack      += ack
        sum_target_so_far += target_so_far
        sum_day_target    += day_target

    total_pct = round((sum_verified / sum_target_so_far) * 100) if sum_target_so_far else 0
    totals = {
        "day_target":    sum_day_target,
        "target_so_far": sum_target_so_far,
        "done":          sum_done,
        "verified":      sum_verified,
        "rejections":    sum_rejects,
        "ack_sent":      sum_ack,
        "pct":           total_pct,
        "status":        "On Track" if (sum_target_so_far == 0 or total_pct >= ON_TRACK_THRESHOLD) else "Behind",
    }

    return {
        "rows":   rows,
        "totals": totals,
        "today":  today_ist.isoformat(),
        "slots":  TIME_SLOTS,
    }
