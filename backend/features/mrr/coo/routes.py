"""
COO Leaderboard — pulls from OL Replica MySQL, maps clients to Business Heads
and Account Managers via Mehr.xlsx, returns 10 fixed pipeline columns with
total (all-time) and today counts.
"""

from __future__ import annotations

import os
import re
from datetime import datetime, timedelta, timezone
from functools import lru_cache

from core.database import get_db
from core.deps import get_current_user
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

router = APIRouter(prefix="/coo", tags=["coo"])

# ── Fixed column definitions (order matches the spreadsheet) ─────────────────

COLUMNS = [
    ("submission", "Submission"),
    ("screen_reject", "Screen Reject"),
    ("l1_reject", "L1 Reject"),
    ("l1_accept", "L1 Accept"),
    ("l2_reject", "L2 Reject"),
    ("l2_accept", "L2 Accept"),
    ("l3_reject", "L3 Reject"),
    ("l3_accept", "L3 Accept"),
    ("selection", "Selection"),
    ("onboarding", "Onboarding"),
]

# step_id → leaderboard column key
STEP_TO_COL: dict[int, str] = {
    7: "submission",
    8: "screen_reject",
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
    """
    Locate Mehr.xlsx across local dev layout and deployed container layouts.
    Allows an explicit override via COO_EXCEL_PATH for any other deploy shape.
    """
    env_override = os.environ.get("COO_EXCEL_PATH")
    if env_override:
        return env_override
    base = os.path.dirname(__file__)
    candidates = [
        os.path.normpath(
            os.path.join(base, "..", "..", "..", "Mehr.xlsx"),
        ),  # local repo: backend/features/coo → repo root
        os.path.normpath(
            os.path.join(base, "..", "..", "Mehr.xlsx"),
        ),  # deployed: file copied next to backend root (/app/Mehr.xlsx)
        "/Mehr.xlsx",  # fallback: container root
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
            client = row[4]  # Column E
            bh = row[5]  # Column F
            am = row[6]  # Column G
            if (
                client
                and bh
                and isinstance(client, str)
                and isinstance(bh, str)
                and bh.strip().lower() not in ("none", "")
            ):
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

    missing = [
        k
        for k, v in [
            ("OL_REPLICA_HOST", settings.ol_replica_host),
            ("OL_REPLICA_USER", settings.ol_replica_user),
            ("OL_REPLICA_PASSWORD", settings.ol_replica_password),
        ]
        if not v
    ]
    if missing:
        raise HTTPException(
            status_code=503,
            detail=f"OL Replica not configured: {', '.join(missing)}",
        )
    return pymysql.connect(
        host=settings.ol_replica_host,
        port=settings.ol_replica_port,
        user=settings.ol_replica_user,
        password=settings.ol_replica_password,
        database=settings.ol_replica_database,  # defaults to "offerletter"
        connect_timeout=10,
        cursorclass=pymysql.cursors.DictCursor,
        ssl_disabled=True,
    )


# ── SQL — uses UTC ranges (index-friendly, no per-row CONVERT_TZ) ────────────

from core.sql_loader import load_sql  # noqa: E402

_SQL = load_sql("002-coo_leaderboard_pipeline.sql")


# ── Endpoint ──────────────────────────────────────────────────────────────────


def _zero():
    return {"total": 0, "today": 0, "compare": 0}


def _utc_day_range(d) -> tuple[str, str]:
    """Return UTC start/end strings for one IST calendar day."""
    start = datetime(d.year, d.month, d.day) - timedelta(hours=5, minutes=30)
    end = datetime(d.year, d.month, d.day) + timedelta(hours=18, minutes=30)
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

    ist_now = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    today_d = ist_now.date()

    today_utc_start, tomorrow_utc_start = _utc_day_range(today_d)

    # Validate + resolve compare_date; use a dead range when absent so compare_cnt = 0
    cmp_d: _date | None = None
    if compare_date:
        try:
            cmp_d = _date.fromisoformat(compare_date)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="compare_date must be YYYY-MM-DD",
            )
        cmp_utc_start, cmp_utc_end = _utc_day_range(cmp_d)
    else:
        # Dead range → compare_cnt always 0
        cmp_utc_start = "1970-01-01 00:00:00"
        cmp_utc_end = "1970-01-01 00:00:01"

    params = {
        "today_utc_start": today_utc_start,
        "tomorrow_utc_start": tomorrow_utc_start,
        "cmp_utc_start": cmp_utc_start,
        "cmp_utc_end": cmp_utc_end,
        "step_ids": STEP_IDS,
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
        client = str(raw_client).strip()
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
        agg[key][col_key]["total"] += int(r.get("total_cnt") or 0)
        agg[key][col_key]["today"] += int(r.get("today_cnt") or 0)
        agg[key][col_key]["compare"] += int(r.get("compare_cnt") or 0)

    rows = [
        {"bh_name": bh, "am_name": am, "client_name": client, "cols": data}
        for (bh, am, client), data in sorted(agg.items())
        if any(data[c]["total"] > 0 or data[c]["today"] > 0 for c, _ in COLUMNS)
    ]

    return {
        "rows": rows,
        "compare_date": compare_date,
        "columns": [{"key": k, "label": lbl} for k, lbl in COLUMNS],
        "today": today_d.isoformat(),
    }


# ── Recruiter leaderboard (local DB, today's metrics) ────────────────────────

RECRUITER_DAY_TARGET = 4
ON_TRACK_THRESHOLD = 75  # % of target


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
    current_user=Depends(get_current_user),
):
    """
    Per-recruiter daily metrics for the COO dashboard.

    All counts use today's IST calendar day. "Verified by DL" counts validations
    completed today on candidates this recruiter sourced. Performance category
    is derived from verified count only (per product spec).
    """
    from infra.models import (
        Candidate,
        CandidateStatus,
        ConsultantMail,
        Pod,
        PodMembership,
        Submission,
        User,
        UserRole,
        Validation,
        ValidationStatus,
    )
    from sqlalchemy import or_

    from features.mrr.targets.routes import (
        TIME_SLOTS,
        current_slot_indices_completed,
        default_targets_for_user,
        latest_targets_for_users,
    )

    # IST today
    ist_now = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    today_ist = ist_now.date()
    # UTC range covering the IST day
    day_start_utc = datetime(
        today_ist.year,
        today_ist.month,
        today_ist.day,
    ) - timedelta(hours=5, minutes=30)
    day_end_utc = day_start_utc + timedelta(days=1)

    # All active recruiters (primary or secondary role)…
    # Pod scoping: admin / COO see everyone; BH / KAM / DL see only the
    # recruiters who belong to their own pod, so each pod head gets a focused
    # leaderboard for their own team rather than the whole company.
    _caller_role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    _scope_to_pod = _caller_role in ("bh", "kam", "delivery_lead") and current_user.pod_id is not None

    rec_query = (
        db.query(User)
        .filter(
            User.is_active == True,  # noqa: E712
            or_(User.role == UserRole.recruiter, User.secondary_role == "recruiter"),
        )
    )
    if _scope_to_pod:
        rec_query = rec_query.filter(User.pod_id == current_user.pod_id)
    recruiters = (
        rec_query
        .all()
    )
    rec_ids_set = {u.id for u in recruiters}
    # …plus any user who has sourced a candidate today, even if not classified
    # as a recruiter (e.g. delivery leads who source directly). Without this,
    # POD TOTAL diverges from the candidates table.
    extra_sourcer_ids = [
        row[0]
        for row in db.query(Candidate.sourced_by_id)
        .filter(
            Candidate.sourced_by_id.isnot(None),
            Candidate.sourced_at >= day_start_utc,
            Candidate.sourced_at < day_end_utc,
        )
        .distinct()
        .all()
        if row[0] not in rec_ids_set
    ]
    if extra_sourcer_ids:
        extras_q = db.query(User).filter(User.id.in_(extra_sourcer_ids))
        # Honour pod-scoping for non-recruiter sourcers too — a BH should not
        # see a DL from another pod show up just because they sourced today.
        if _scope_to_pod:
            extras_q = extras_q.filter(User.pod_id == current_user.pod_id)
        recruiters = recruiters + extras_q.all()
    recruiters.sort(key=lambda u: u.name or "")
    rec_ids = [u.id for u in recruiters]
    if not rec_ids:
        return {
            "rows": [],
            "totals": {
                "done": 0,
                "verified": 0,
                "rejections": 0,
                "ack_sent": 0,
                "pct": 0,
                "status": "Behind",
            },
            "day_target": RECRUITER_DAY_TARGET,
            "today": today_ist.isoformat(),
        }

    # ── Cumulative funnel: Ack Sent ≥ Submissions ≥ DL Verified ──
    #
    # Scope: candidates this recruiter SOURCED today (so the row stays
    # internally consistent — every later-stage candidate also went through
    # the earlier stages on this day). A verified candidate adds +1 to all
    # three columns; that's the "if dl verified is 1, submissions and
    # acknowledgment also 1" rule from product.

    todays_sourced_rows = (
        db.query(Candidate.id, Candidate.sourced_by_id)
        .filter(
            Candidate.sourced_by_id.in_(rec_ids),
            Candidate.sourced_at >= day_start_utc,
            Candidate.sourced_at < day_end_utc,
        )
        .all()
    )
    cand_to_rec: dict[int, int] = {cid: uid for cid, uid in todays_sourced_rows}
    todays_candidate_ids: list[int] = list(cand_to_rec.keys())
    done_by_rec: dict[int, int] = {}
    for _cid, uid in todays_sourced_rows:
        done_by_rec[uid] = done_by_rec.get(uid, 0) + 1

    # ── Per-slot bucketing helpers ──
    # Each event has a UTC timestamp; convert to IST and find which TIME_SLOTS
    # bucket it falls into. Lunch (13:30-14:30 IST) has no slot → None.
    _slot_bounds = [
        (
            s["index"],
            int(s["start"].split(":")[0]) * 60 + int(s["start"].split(":")[1]),
            int(s["end"].split(":")[0]) * 60 + int(s["end"].split(":")[1]),
        )
        for s in TIME_SLOTS
    ]

    def _slot_for_utc(utc_dt):
        if utc_dt is None:
            return None
        if utc_dt.tzinfo is None:
            ist = utc_dt + timedelta(hours=5, minutes=30)
        else:
            ist = utc_dt.astimezone(timezone.utc) + timedelta(hours=5, minutes=30)
            ist = ist.replace(tzinfo=None)
        m = ist.hour * 60 + ist.minute
        for idx, sm, em in _slot_bounds:
            if sm <= m < em:
                return idx
        return None

    # ack_sent: today's sourced candidates that have a ConsultantMail row.
    # Counts on the candidate (not the mail) so each candidate adds at most 1.
    ack_by_rec: dict[int, int] = {}
    ack_hourly: dict[int, dict[int, int]] = {}   # rec_id → {slot_idx → count}
    if todays_candidate_ids:
        for cid, sent_at in (
            db.query(ConsultantMail.candidate_id, ConsultantMail.sent_at)
            .filter(ConsultantMail.candidate_id.in_(todays_candidate_ids))
            .all()
        ):
            rec_id = cand_to_rec.get(cid)
            if rec_id is None:
                continue
            ack_by_rec[rec_id] = ack_by_rec.get(rec_id, 0) + 1
            slot = _slot_for_utc(sent_at)
            if slot is not None:
                ack_hourly.setdefault(rec_id, {})[slot] = ack_hourly.get(rec_id, {}).get(slot, 0) + 1

    # submissions: today's sourced candidates that have a Submission row.
    sub_by_rec: dict[int, int] = {}
    sub_hourly: dict[int, dict[int, int]] = {}
    if todays_candidate_ids:
        for cid, submitted_at in (
            db.query(Submission.candidate_id, Submission.submitted_at)
            .filter(Submission.candidate_id.in_(todays_candidate_ids))
            .all()
        ):
            rec_id = cand_to_rec.get(cid)
            if rec_id is None:
                continue
            sub_by_rec[rec_id] = sub_by_rec.get(rec_id, 0) + 1
            slot = _slot_for_utc(submitted_at)
            if slot is not None:
                sub_hourly.setdefault(rec_id, {})[slot] = sub_hourly.get(rec_id, {}).get(slot, 0) + 1

    # dl_verified: today's sourced candidates that have a Validation(validated).
    verified_by_rec: dict[int, int] = {}
    verified_hourly: dict[int, dict[int, int]] = {}
    if todays_candidate_ids:
        for cid, validated_at in (
            db.query(Validation.candidate_id, Validation.created_at)
            .filter(
                Validation.candidate_id.in_(todays_candidate_ids),
                Validation.status == ValidationStatus.validated,
            )
            .all()
        ):
            rec_id = cand_to_rec.get(cid)
            if rec_id is None:
                continue
            verified_by_rec[rec_id] = verified_by_rec.get(rec_id, 0) + 1
            slot = _slot_for_utc(validated_at)
            if slot is not None:
                verified_hourly.setdefault(rec_id, {})[slot] = verified_hourly.get(rec_id, {}).get(slot, 0) + 1

    # Rejections today (kept for footer compat but not in main funnel UI).
    reject_by_rec: dict[int, int] = {}
    if rec_ids:
        for uid, in (
            db.query(Candidate.sourced_by_id)
            .filter(
                Candidate.sourced_by_id.in_(rec_ids),
                Candidate.status == CandidateStatus.rejected,
                Candidate.updated_at >= day_start_utc,
                Candidate.updated_at < day_end_utc,
            )
            .all()
        ):
            reject_by_rec[uid] = reject_by_rec.get(uid, 0) + 1

    # ── Hourly targets ──
    # Sum of slot_targets for slots that have already ended → "target_so_far".
    # Sum of all slot_targets for today → "day_target".
    completed_slots = set(current_slot_indices_completed(ist_now))
    # Resolve targets per recruiter using the same logic the Targets page
    # uses: exact-date save → carry-forward from the latest prior save →
    # role default. This guarantees that once a recruiter has any saved
    # targets, the leaderboard keeps using them on every subsequent day
    # until the next save overrides them.
    resolved = latest_targets_for_users(db, rec_ids, today_ist)
    slots_by_user: dict[int, dict[int, int]] = {
        uid: slot_map for uid, (slot_map, _) in resolved.items()
    }
    # Quick role lookup for the default fallback when nothing is saved.
    rec_by_id: dict[int, User] = {u.id: u for u in recruiters}

    def _targets_for(uid: int) -> tuple[int, int]:
        slots = slots_by_user.get(uid)
        if not slots:
            user = rec_by_id.get(uid)
            slots = default_targets_for_user(user) if user is not None else {}
        so_far = sum(c for idx, c in slots.items() if idx in completed_slots)
        day = sum(slots.values())
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
        .filter(
            User.role == UserRole.kam,
            User.pod_id.isnot(None),
            User.is_active,
        )
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
        parent_users = {
            u.id: u for u in db.query(User).filter(User.id.in_(parent_ids)).all()
        }

    # Collect ALL DLs a recruiter rolls up to. A recruiter can sit on multiple
    # DL teams via pod_memberships; that has to be reflected in the leaderboard
    # so multi-team recruiters are visible everywhere they report.
    dls_by_user: dict[int, list[str]] = {}
    if rec_ids:
        legacy_rows = (
            db.query(PodMembership.user_id, User.name)
            .join(User, PodMembership.pod_lead_id == User.id)
            .filter(PodMembership.user_id.in_(rec_ids))
            .order_by(User.name)
            .all()
        )
        for uid, name in legacy_rows:
            if name:
                dls_by_user.setdefault(uid, [])
                if name not in dls_by_user[uid]:
                    dls_by_user[uid].append(name)

    def _role_value(u: User) -> str:
        return u.role.value if hasattr(u.role, "value") else str(u.role)

    def _chain_for(u: User) -> dict:
        names: list[str] = list(dls_by_user.get(u.id, []))

        # New-model: direct parent in the pod tree (if it's a DL).
        parent = parent_users.get(u.parent_user_id) if u.parent_user_id else None
        if parent and _role_value(parent) == "delivery_lead" and parent.name not in names:
            names.insert(0, parent.name)

        # User themselves IS a DL (sourcing directly).
        if _role_value(u) == "delivery_lead" and u.name not in names:
            names.insert(0, u.name)

        names.sort()
        pod = pods_by_id.get(u.pod_id) if u.pod_id else None
        pod_name = pod.name if pod else None
        bh_name = bh_by_pod.get(u.pod_id) if u.pod_id else None
        kam_names = kams_by_pod.get(u.pod_id, []) if u.pod_id else []
        return {"dl_names": names, "kam_names": kam_names, "bh": bh_name, "pod": pod_name}

    rows = []
    sum_done = sum_ack = sum_subs = sum_verified = sum_rejects = 0
    sum_target_so_far = sum_day_target = 0
    sum_hourly_target = [0] * len(TIME_SLOTS)
    sum_hourly_ack    = [0] * len(TIME_SLOTS)
    sum_hourly_sub    = [0] * len(TIME_SLOTS)
    sum_hourly_ver    = [0] * len(TIME_SLOTS)
    for u in recruiters:
        done       = done_by_rec.get(u.id, 0)
        verified   = verified_by_rec.get(u.id, 0)
        subs       = max(sub_by_rec.get(u.id, 0), verified)   # submissions ≥ dl_verified
        ack        = max(ack_by_rec.get(u.id, 0), subs)       # ack_sent ≥ submissions
        rejects    = reject_by_rec.get(u.id, 0)
        target_so_far, day_target = _targets_for(u.id)
        # % against the cumulative target the recruiter SHOULD have hit by now,
        # measured on the DL-verified count (the bottom of the funnel).
        pct = round((verified / target_so_far) * 100) if target_so_far else 0
        status = (
            "On Track"
            if (target_so_far == 0 or pct >= ON_TRACK_THRESHOLD)
            else "Behind"
        )

        # Per-slot view: target + actual at each level. Frontend renders the
        # hourly drill-down from this list.
        target_slots = slots_by_user.get(u.id, {})
        a_h = ack_hourly.get(u.id, {})
        s_h = sub_hourly.get(u.id, {})
        v_h = verified_hourly.get(u.id, {})
        hourly = []
        for s in TIME_SLOTS:
            idx = s["index"]
            t   = int(target_slots.get(idx, 0))
            vr  = int(v_h.get(idx, 0))
            sb  = max(int(s_h.get(idx, 0)), vr)
            a   = max(int(a_h.get(idx, 0)), sb)
            hourly.append({
                "slot_index":  idx,
                "label":       s["label"],
                "target":      t,
                "ack_sent":    a,
                "submissions": sb,
                "dl_verified": vr,
                "completed":   idx in completed_slots,
            })
            sum_hourly_target[idx] += t
            sum_hourly_ack[idx]    += a
            sum_hourly_sub[idx]    += sb
            sum_hourly_ver[idx]    += vr

        chain = _chain_for(u)
        rows.append(
            {
                "recruiter_id":   u.id,
                "recruiter_name": u.name,
                "dl_names":       chain["dl_names"],
                "kam_names":      chain["kam_names"],
                "bh_name":        chain["bh"],
                "pod_name":       chain["pod"],
                "day_target":     day_target,
                "target_so_far":  target_so_far,
                "done":           done,
                "ack_sent":       ack,
                "submissions":    subs,
                "dl_verified":    verified,
                "pct":            pct,
                "status":         status,
                "rejections":     rejects,
                "performance":    _performance_category(verified),
                "hourly":         hourly,
            },
        )
        sum_done     += done
        sum_ack      += ack
        sum_subs     += subs
        sum_verified += verified
        sum_rejects  += rejects
        sum_target_so_far += target_so_far
        sum_day_target    += day_target

    total_pct = (
        round((sum_verified / sum_target_so_far) * 100) if sum_target_so_far else 0
    )
    totals_hourly = [
        {
            "slot_index":  s["index"],
            "label":       s["label"],
            "target":      sum_hourly_target[s["index"]],
            "ack_sent":    sum_hourly_ack[s["index"]],
            "submissions": sum_hourly_sub[s["index"]],
            "dl_verified": sum_hourly_ver[s["index"]],
            "completed":   s["index"] in completed_slots,
        }
        for s in TIME_SLOTS
    ]
    totals = {
        "day_target":    sum_day_target,
        "target_so_far": sum_target_so_far,
        "done":          sum_done,
        "ack_sent":      sum_ack,
        "submissions":   sum_subs,
        "dl_verified":   sum_verified,
        "rejections":    sum_rejects,
        "pct":           total_pct,
        "status": (
            "On Track"
            if (sum_target_so_far == 0 or total_pct >= ON_TRACK_THRESHOLD)
            else "Behind"
        ),
        "hourly": totals_hourly,
    }

    return {
        "rows":   rows,
        "totals": totals,
        "today":  today_ist.isoformat(),
        "slots":  TIME_SLOTS,
    }
