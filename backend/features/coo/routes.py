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
from core.deps import require_roles
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

_SQL = """
SELECT
    cl.company_name                              AS client,
    aj.current_step                              AS step_id,
    COUNT(DISTINCT aj.id)                        AS total_cnt,
    COUNT(DISTINCT CASE
        WHEN aj.updated_at >= %(today_utc_start)s
         AND aj.updated_at  < %(tomorrow_utc_start)s
        THEN aj.id END)                          AS today_cnt,
    COUNT(DISTINCT CASE
        WHEN aj.updated_at >= %(cmp_utc_start)s
         AND aj.updated_at  < %(cmp_utc_end)s
        THEN aj.id END)                          AS compare_cnt
FROM  applied_jobs      AS aj
LEFT JOIN job_postings  AS jp ON aj.job_posting_id = jp.id
LEFT JOIN clients       AS cl ON jp.client_id      = cl.user_id
WHERE aj.current_step IN %(step_ids)s
  AND jp.id IS NOT NULL
  AND cl.id NOT IN (1, 2)
GROUP BY cl.company_name, aj.current_step
ORDER BY cl.company_name, aj.current_step
"""


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
    _=Depends(require_roles("coo", "admin")),
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
    _=Depends(require_roles("coo", "admin")),
):
    """Per-recruiter daily metrics for the COO dashboard.

    All counts use today's IST calendar day. "Verified by DL" counts validations
    completed today on candidates this recruiter sourced. Performance category
    is derived from verified count only (per product spec).
    """
    from infra.models import (
        User, UserRole, Candidate, CandidateStatus,
        Submission, Validation, ValidationStatus, ConsultantMail,
    )
    from sqlalchemy import func, or_

    # IST today
    ist_now = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    today_ist = ist_now.date()
    # UTC range covering the IST day
    day_start_utc = datetime(today_ist.year, today_ist.month, today_ist.day) - timedelta(hours=5, minutes=30)
    day_end_utc   = day_start_utc + timedelta(days=1)

    # All active recruiters (primary or secondary role)
    recruiters = (
        db.query(User)
        .filter(
            User.is_active == True,  # noqa: E712
            or_(User.role == UserRole.recruiter, User.secondary_role == "recruiter"),
        )
        .order_by(User.name)
        .all()
    )
    rec_ids = [u.id for u in recruiters]
    if not rec_ids:
        return {
            "rows": [],
            "totals": {"done": 0, "verified": 0, "rejections": 0, "ack_sent": 0, "pct": 0, "status": "Behind"},
            "day_target": RECRUITER_DAY_TARGET,
            "today": today_ist.isoformat(),
        }

    # We define a recruiter's "submission" for today as any candidate they
    # sourced where there's activity today on the submission pipeline — either
    # a Submission row submitted today, OR a Validation row updated today.
    # This guarantees Verified <= Done (a candidate the DL verified today
    # always shows up in Done, even if the original submission was yesterday).
    subs_today: set[tuple[int, int]] = set(
        db.query(Candidate.sourced_by_id, Submission.candidate_id)
        .join(Submission, Submission.candidate_id == Candidate.id)
        .filter(
            Candidate.sourced_by_id.in_(rec_ids),
            Submission.submitted_at >= day_start_utc,
            Submission.submitted_at <  day_end_utc,
        ).all()
    )

    val_rows_today = (
        db.query(Candidate.sourced_by_id, Validation.candidate_id, Validation.status)
        .join(Validation, Validation.candidate_id == Candidate.id)
        .filter(
            Candidate.sourced_by_id.in_(rec_ids),
            Validation.updated_at >= day_start_utc,
            Validation.updated_at <  day_end_utc,
        ).all()
    )
    val_today: set[tuple[int, int]] = {(r, c) for r, c, _ in val_rows_today}
    verified_today: set[tuple[int, int]] = {
        (r, c) for r, c, s in val_rows_today if s == ValidationStatus.validated
    }

    # Done = union of (submitted today) and (had validation activity today)
    done_set = subs_today | val_today
    done_by_rec: dict[int, int] = {}
    for r, _c in done_set:
        done_by_rec[r] = done_by_rec.get(r, 0) + 1
    verified_by_rec: dict[int, int] = {}
    for r, _c in verified_today:
        verified_by_rec[r] = verified_by_rec.get(r, 0) + 1

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

    # Acknowledgment-pending mails — recruiter sent the mail but no ack yet.
    # Open-ended (not date-scoped) since the spec is "sent but not acknowledged".
    ack_rows = (
        db.query(ConsultantMail.sent_by_id, func.count(ConsultantMail.id))
        .filter(
            ConsultantMail.sent_by_id.in_(rec_ids),
            ConsultantMail.acknowledgement_received == False,  # noqa: E712
        )
        .group_by(ConsultantMail.sent_by_id)
        .all()
    )
    ack_by_rec = {uid: int(cnt) for uid, cnt in ack_rows}

    rows = []
    sum_done = sum_verified = sum_rejects = sum_ack = 0
    for u in recruiters:
        done     = done_by_rec.get(u.id, 0)
        verified = verified_by_rec.get(u.id, 0)
        rejects  = reject_by_rec.get(u.id, 0)
        ack      = ack_by_rec.get(u.id, 0)
        pct      = round((verified / RECRUITER_DAY_TARGET) * 100) if RECRUITER_DAY_TARGET else 0
        status   = "On Track" if pct >= ON_TRACK_THRESHOLD else "Behind"
        rows.append({
            "recruiter_id":   u.id,
            "recruiter_name": u.name,
            "day_target":     RECRUITER_DAY_TARGET,
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

    total_target = RECRUITER_DAY_TARGET * len(recruiters)
    total_pct = round((sum_verified / total_target) * 100) if total_target else 0
    totals = {
        "day_target": total_target,
        "done":       sum_done,
        "verified":   sum_verified,
        "rejections": sum_rejects,
        "ack_sent":   sum_ack,
        "pct":        total_pct,
        "status":     "On Track" if total_pct >= ON_TRACK_THRESHOLD else "Behind",
    }

    return {
        "rows":       rows,
        "totals":     totals,
        "day_target": RECRUITER_DAY_TARGET,
        "today":      today_ist.isoformat(),
    }
