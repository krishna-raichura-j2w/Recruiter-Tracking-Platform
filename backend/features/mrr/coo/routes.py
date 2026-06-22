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


# ── Client → BH mapping (from client_bh_mapping.csv / xlsx) ──────────────────


def _resolve_client_bh_path() -> str:
    env_override = os.environ.get("CLIENT_BH_MAP_PATH")
    if env_override:
        return env_override
    base = os.path.dirname(__file__)
    # __file__ is backend/features/mrr/coo/routes.py → 4 levels up = repo root
    candidates = [
        os.path.normpath(os.path.join(base, "..", "..", "..", "..", "client_bh_mapping.csv")),
        os.path.normpath(os.path.join(base, "..", "..", "..", "client_bh_mapping.csv")),
        "/client_bh_mapping.csv",
    ]
    for p in candidates:
        if os.path.exists(p):
            return p
    return candidates[0]


@lru_cache(maxsize=1)
def _load_client_bh_map() -> dict[str, str]:
    """Returns {client_name_lower: bh_name} from client_bh_mapping file (xlsx saved as .csv)."""
    path = _resolve_client_bh_path()
    mapping: dict[str, str] = {}
    try:
        import io
        import openpyxl
        # File has .csv extension but is actually xlsx — load via BytesIO to bypass ext check
        with open(path, "rb") as f:
            data = io.BytesIO(f.read())
        wb = openpyxl.load_workbook(data, read_only=True, data_only=True)
        ws = wb.active
        for row in ws.iter_rows(min_row=2, values_only=True):
            client, bh = row[0], row[1]
            if client and isinstance(client, str):
                bh_str = str(bh).strip() if bh and bh != 0 else ""
                if bh_str.lower() in ("none", "0", ""):
                    bh_str = ""
                mapping[client.strip().lower()] = bh_str
        wb.close()
    except Exception as exc:
        print(f"[coo] client_bh_mapping load failed: {exc}")
    return mapping


def _lookup_bh(client: str) -> str:
    """Returns BH name for a client, or empty string if not found."""
    if not client:
        return ""
    bh_map = _load_client_bh_map()
    key = client.strip().lower()
    if key in bh_map:
        return bh_map[key]
    # Normalize and try fuzzy match
    norm = re.sub(r"[^a-z0-9 ]", "", key).strip()
    for k, bh in bh_map.items():
        if re.sub(r"[^a-z0-9 ]", "", k).strip() == norm:
            return bh
    for k, bh in bh_map.items():
        kn = re.sub(r"[^a-z0-9 ]", "", k).strip()
        if norm in kn or kn in norm:
            return bh
    return ""


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

_SQL         = load_sql("002-coo_leaderboard_pipeline.sql")
_CLIENT_SQL  = load_sql("003-coo_client_pipeline.sql")
_HOURLY_SQL  = load_sql("004-bh_hourly_pipeline.sql")


# ── BH Dashboard (commented out — replaced by client-pipeline) ────────────────
#
# @router.get("/leaderboard")
# def coo_leaderboard(compare_date: str | None = None, _=Depends(get_current_user)):
#     ...  (original BH × client pipeline endpoint — see git history)


# ── Client Pipeline endpoint ──────────────────────────────────────────────────

@router.get("/client-pipeline")
def client_pipeline(
    date: str | None = None,
    _=Depends(get_current_user),
):
    """
    Per-client pipeline counts for a single IST day (default: today).
    Counts applied_jobs where created_at IST = date and current_step > 6.
    """
    from datetime import date as _date

    ist_now   = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    today_ist = ist_now.date()

    if date:
        try:
            sel_date = _date.fromisoformat(date)
        except ValueError:
            raise HTTPException(400, "date must be YYYY-MM-DD")
    else:
        sel_date = today_ist

    params = {"sel_date": sel_date.isoformat()}

    conn = None
    try:
        conn = _get_mysql_conn()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, f"DB connection failed: {exc}")

    db_rows = []
    try:
        with conn.cursor() as cur:
            cur.execute(_CLIENT_SQL, params)
            db_rows = cur.fetchall()
    except Exception as exc:
        raise HTTPException(500, f"Query failed: {exc}")
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass

    # ── Column definition — add a row here to show a new column ─────────────
    # Order here = column order in the table. Only these step_ids ever appear.
    # step_id comes from candidate_work_flows.step_id in the OL replica.
    PIPELINE_COLUMNS: list[tuple[int, str]] = [
        (7,  "Client Submit"),
        (8,  "Screen Reject"),
        (9,  "Schedule L1"),
        (12, "L1 Reject"),
        (13, "L1 Select"),
        (14, "Schedule L2"),
        (17, "L2 Reject"),
        (18, "L2 Select"),
        (19, "Schedule L3"),
        (22, "L3 Reject"),
        (23, "L3 Select"),
        (33, "Offer Accepted"),
        (34, "Offer Rejected"),
        (44, "Onboarded"),
    ]
    # step_ids that always appear even when count = 0 for the selected date
    PINNED = {7, 13, 18, 44}

    allowed_ids = {sid for sid, _ in PIPELINE_COLUMNS}

    # Aggregate: client → step_id → count
    agg: dict[str, dict[int, int]] = {}
    for r in db_rows:
        raw_client = r.get("client")
        if not raw_client:
            continue
        client  = str(raw_client).strip()
        step_id = int(float(r.get("step_id") or 0))
        if step_id not in allowed_ids:
            continue
        if client not in agg:
            agg[client] = {}
        agg[client][step_id] = agg[client].get(step_id, 0) + int(r.get("day_cnt") or 0)

    # Which step_ids actually have data today (union with pinned)
    active_ids = PINNED | {sid for data in agg.values() for sid in data if data[sid] > 0}
    visible_cols = [(sid, lbl) for sid, lbl in PIPELINE_COLUMNS if sid in active_ids]

    rows = [
        {
            "client_name": client,
            "bh_name":     _lookup_bh(client),
            "cols": {str(sid): {"day": data.get(sid, 0)} for sid, _ in visible_cols},
        }
        for client, data in sorted(agg.items())
        if any(data.get(sid, 0) > 0 for sid, _ in visible_cols)
    ]

    columns = [{"key": str(sid), "label": lbl} for sid, lbl in visible_cols]

    return {
        "rows":    rows,
        "columns": columns,
        "date":    sel_date.isoformat(),
    }


# ── BH × Client Hourly Tracker ───────────────────────────────────────────────
#
# Per (BH, client) row with 5 collapsed metric columns and an hourly breakdown
# (IST). Each cell counts applied_jobs whose updated_at falls in that IST hour
# of the selected date AND whose current_step matches the metric's step bucket.
#
# Bucketing verified against candidate_work_flows table:
#   Client Submit     → 7                                          (Client Submit)
#   L1 Interview      → 9, 10, 11, 12, 13                          (L1 scheduling + outcomes)
#                        9  Schedule L1   / 10 Reschedule L1
#                        11 L1 No Show    / 12 L1 Reject   / 13 L1 Select
#   L2/L3 Interview   → 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 58 (L2 + L3 scheduling + outcomes)
#                        14 Schedule L2   / 15 Reschedule L2
#                        16 L2 No Show    / 17 L2 Reject   / 18 L2 Select
#                        19 Schedule L3   / 20 Reschedule L3
#                        21 L3 No Show    / 22 L3 Reject   / 23 L3 Select
#                        58 Schedule L4 (proxy for L3 cleared)
#   Selections        → 47, 33                                     (client confirmed select OR offer accepted)
#                        47 Confirm Final Select / 33 Offer Accepted
#   Onboarded         → 44                                         (candidate actually joined)
#
# Hours rendered are the IST business window 09:00–21:00 (13 columns).

HOURLY_METRICS: list[tuple[str, str, tuple[int, ...]]] = [
    ("client_submit", "Client Submit",   (7,)),
    ("l1",            "L1 Interview",    (9, 10, 11, 12, 13)),
    ("l2_l3",         "L2/L3 Interview", (14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 58)),
    ("selections",    "Selections",      (47, 33)),
    ("onboarded",     "Onboarded",       (44,)),
]

# step_id → metric key
_STEP_TO_METRIC: dict[int, str] = {
    sid: key for key, _label, sids in HOURLY_METRICS for sid in sids
}

HOURLY_RANGE = list(range(9, 22))  # 9 AM … 9 PM IST (inclusive)


def _hour_label(h: int) -> str:
    suffix = "AM" if h < 12 else "PM"
    h12 = h % 12 or 12
    return f"{h12} {suffix}"


@router.get("/bh-hourly")
def bh_hourly(
    date: str | None = None,
    _=Depends(get_current_user),
):
    """
    Per (BH, client) hourly breakdown of pipeline events for a single IST day.

    Response shape:
      {
        "date": "YYYY-MM-DD",
        "metrics": [{"key", "label"}, ...],            # 5 metric columns
        "hours":   [{"key": "9", "label": "9 AM"}, …], # 13 hour columns (9 AM–9 PM)
        "rows": [
          {
            "bh_name", "client_name",
            "totals":  {<metric_key>: int, ...},      # day-level totals per metric
            "hourly":  {<hour_int>: {<metric_key>: int, ...}, ...},
            "row_total": int                          # sum across all metrics today
          }, ...
        ],
        "totals":     {<metric_key>: int, ...},        # column totals (all rows)
        "totals_row_total": int,
      }
    """
    from datetime import date as _date

    ist_now   = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    today_ist = ist_now.date()

    if date:
        try:
            sel_date = _date.fromisoformat(date)
        except ValueError:
            raise HTTPException(400, "date must be YYYY-MM-DD")
    else:
        sel_date = today_ist

    conn = None
    try:
        conn = _get_mysql_conn()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, f"DB connection failed: {exc}")

    db_rows = []
    try:
        with conn.cursor() as cur:
            cur.execute(_HOURLY_SQL, {"sel_date": sel_date.isoformat()})
            db_rows = cur.fetchall()
    except Exception as exc:
        raise HTTPException(500, f"Query failed: {exc}")
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass

    # client → {totals: {metric: n}, hourly: {hour: {metric: n}}}
    agg: dict[str, dict] = {}
    for r in db_rows:
        client = (r.get("client") or "").strip()
        if not client:
            continue
        step_id = int(float(r.get("step_id") or 0))
        metric  = _STEP_TO_METRIC.get(step_id)
        if not metric:
            continue
        hour_raw = r.get("hour_ist")
        hour     = int(hour_raw) if hour_raw is not None else -1
        cnt      = int(r.get("cnt") or 0)

        bucket = agg.setdefault(client, {"totals": {}, "hourly": {}})
        bucket["totals"][metric] = bucket["totals"].get(metric, 0) + cnt
        hr_bucket = bucket["hourly"].setdefault(hour, {})
        hr_bucket[metric] = hr_bucket.get(metric, 0) + cnt

    metric_keys = [k for k, _l, _s in HOURLY_METRICS]

    rows = []
    for client, data in sorted(agg.items()):
        totals = {k: data["totals"].get(k, 0) for k in metric_keys}
        hourly = {
            h: {k: data["hourly"].get(h, {}).get(k, 0) for k in metric_keys}
            for h in HOURLY_RANGE
            if h in data["hourly"]
        }
        # Include "other hours" bucket if any data fell outside 9-21
        other_hours = {h: cnts for h, cnts in data["hourly"].items() if h not in HOURLY_RANGE}
        if other_hours:
            merged: dict[str, int] = {k: 0 for k in metric_keys}
            for cnts in other_hours.values():
                for k, v in cnts.items():
                    merged[k] = merged.get(k, 0) + v
            hourly[-1] = merged

        row_total = sum(totals.values())
        rows.append({
            "bh_name":     _lookup_bh(client) or "Unmapped",
            "client_name": client,
            "totals":      totals,
            "hourly":      hourly,
            "row_total":   row_total,
        })

    # Column totals
    grand_totals = {k: sum(r["totals"][k] for r in rows) for k in metric_keys}

    return {
        "date":               sel_date.isoformat(),
        "metrics":            [{"key": k, "label": lbl} for k, lbl, _s in HOURLY_METRICS],
        "hours":              [{"key": str(h), "label": _hour_label(h)} for h in HOURLY_RANGE],
        "rows":               rows,
        "totals":             grand_totals,
        "totals_row_total":   sum(grand_totals.values()),
    }


# ── BH × Client Hourly Tracker — row-level drill-down ────────────────────────
#
# Returns the individual applied_jobs rows behind any cell in the BH Hourly
# Tracker UI. Filter by any combination of {date, bh_name, client_name,
# metric, hour} to scope the drill-down.

@router.get("/bh-hourly/details")
def bh_hourly_details(
    date: str | None = None,
    bh_name: str | None = None,
    client_name: str | None = None,
    metric: str | None = None,
    hour: int | None = None,
    _=Depends(get_current_user),
):
    from datetime import date as _date

    ist_now   = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    today_ist = ist_now.date()

    if date:
        try:
            sel_date = _date.fromisoformat(date)
        except ValueError:
            raise HTTPException(400, "date must be YYYY-MM-DD")
    else:
        sel_date = today_ist

    # Resolve metric → step IDs (or use all 16 tracked steps if no metric)
    metric_step_ids: tuple[int, ...] | None = None
    if metric:
        for key, _label, sids in HOURLY_METRICS:
            if key == metric:
                metric_step_ids = sids
                break
        if metric_step_ids is None:
            raise HTTPException(400, f"unknown metric: {metric}")
    step_ids = metric_step_ids or tuple(_STEP_TO_METRIC.keys())

    # Resolve bh_name → list of client names (via CSV mapping). Pre-resolved
    # so the SQL stays simple (one IN clause). If the BH has zero clients in
    # the mapping, return empty rather than scanning the whole replica.
    bh_client_names: list[str] | None = None
    if bh_name and bh_name not in ("All BHs", "Unmapped"):
        bh_map = _load_client_bh_map()  # {client_lower: bh_name}
        bh_client_names = [k for k, v in bh_map.items() if v == bh_name]
        if not bh_client_names:
            return {
                "date": sel_date.isoformat(),
                "filters": {"bh_name": bh_name, "client_name": client_name, "metric": metric, "hour": hour},
                "rows": [],
                "total": 0,
            }

    # Build WHERE clauses
    where = [
        "DATE(CONVERT_TZ(aj.updated_at, '+00:00', '+05:30')) = %(sel_date)s",
        f"aj.current_step IN ({','.join(str(s) for s in step_ids)})",
        "jp.id IS NOT NULL",
        "cl.id NOT IN (1, 2)",
    ]
    params: dict = {"sel_date": sel_date.isoformat()}

    if hour is not None:
        where.append("HOUR(CONVERT_TZ(aj.updated_at, '+00:00', '+05:30')) = %(hour)s")
        params["hour"] = int(hour)

    if client_name:
        where.append("LOWER(cl.company_name) = %(client_lower)s")
        params["client_lower"] = client_name.strip().lower()
    elif bh_client_names is not None:
        # Lowercased exact-match list. Build a pure-SQL IN list of escaped strings.
        # Names from our CSV mapping are stable and admin-managed; we still escape.
        esc = lambda s: s.replace("\\", "\\\\").replace("'", "''")
        in_list = ",".join(f"'{esc(n)}'" for n in bh_client_names)
        where.append(f"LOWER(cl.company_name) IN ({in_list})")

    if bh_name == "Unmapped":
        # Unmapped = BH lookup returned empty. Resolve in Python after the
        # query because the BH map lives in CSV, not in the OL DB.
        pass

    sql = f"""
        SELECT
            aj.id                                                          AS applied_job_id,
            aj.current_step                                                AS step_id,
            cwf.workflow_step                                              AS step_label,
            DATE(CONVERT_TZ(aj.updated_at, '+00:00', '+05:30'))            AS event_date_ist,
            HOUR(CONVERT_TZ(aj.updated_at, '+00:00', '+05:30'))            AS event_hour_ist,
            DATE_FORMAT(CONVERT_TZ(aj.updated_at, '+00:00', '+05:30'),
                        '%%Y-%%m-%%d %%H:%%i')                            AS moved_at_ist,
            DATE_FORMAT(CONVERT_TZ(aj.created_at, '+00:00', '+05:30'),
                        '%%Y-%%m-%%d %%H:%%i')                            AS applied_at_ist,
            cl.company_name                                                AS client_name,
            jp.id                                                          AS job_posting_id,
            jp.title                                                       AS job_title,
            TRIM(CONCAT(IFNULL(us.first_name,''),' ',IFNULL(us.middle_name,''),
                        ' ',IFNULL(us.last_name,'')))                     AS candidate,
            us.email                                                       AS candidate_email,
            ud.contact_phone                                               AS candidate_phone,
            TRIM(CONCAT(IFNULL(ur.first_name,''),' ',IFNULL(ur.last_name,''))) AS recruiter,
            ur.email                                                       AS recruiter_email
        FROM      applied_jobs            aj
        LEFT JOIN job_postings            jp  ON jp.id       = aj.job_posting_id
        LEFT JOIN clients                 cl  ON cl.user_id  = jp.client_id
        LEFT JOIN candidate_work_flows    cwf ON cwf.step_id = aj.current_step
        LEFT JOIN users                   us  ON us.id       = aj.user_id
        LEFT JOIN user_details            ud  ON ud.user_id  = us.id
        LEFT JOIN users                   ur  ON ur.id       = aj.applied_by_id
        WHERE {' AND '.join(where)}
        ORDER BY aj.updated_at DESC
        LIMIT 500
    """

    conn = None
    try:
        conn = _get_mysql_conn()
        with conn.cursor() as cur:
            cur.execute(sql, params)
            db_rows = cur.fetchall()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, f"Query failed: {exc}")
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass

    # Annotate each row with bucket + bh_name, and filter Unmapped in Python.
    rows = []
    for r in db_rows:
        sid = int(r.get("step_id") or 0)
        bucket = _STEP_TO_METRIC.get(sid)
        row_bh = _lookup_bh(r.get("client_name") or "") or "Unmapped"
        if bh_name == "Unmapped" and row_bh != "Unmapped":
            continue
        # Map bucket key → label
        bucket_label = next((lbl for k, lbl, _s in HOURLY_METRICS if k == bucket), bucket)
        rows.append({
            "applied_job_id":   r.get("applied_job_id"),
            "step_id":          sid,
            "step_label":       r.get("step_label"),
            "bucket":           bucket,
            "bucket_label":     bucket_label,
            "event_date_ist":   str(r.get("event_date_ist") or ""),
            "event_hour_ist":   r.get("event_hour_ist"),
            "moved_at_ist":     r.get("moved_at_ist"),
            "applied_at_ist":   r.get("applied_at_ist"),
            "client_name":      r.get("client_name"),
            "bh_name":          row_bh,
            "job_posting_id":   r.get("job_posting_id"),
            "job_title":        r.get("job_title"),
            "candidate":        r.get("candidate"),
            "candidate_email":  r.get("candidate_email"),
            "candidate_phone":  r.get("candidate_phone"),
            "recruiter":        r.get("recruiter"),
            "recruiter_email":  r.get("recruiter_email"),
        })

    return {
        "date":    sel_date.isoformat(),
        "filters": {"bh_name": bh_name, "client_name": client_name, "metric": metric, "hour": hour},
        "rows":    rows,
        "total":   len(rows),
    }


# ── BH × Company (Postgres jobs table) ───────────────────────────────────────
#
# For each Business Head, list the companies they have jobs for, the role
# titles created under each company, and the total headcount (HC) requested
# across those roles. One row per (BH, company, role).
#
# NB: `jobs.account_manager_id` is declared as FK to `account_managers.id`
# in the model, but production data actually stores `users.id` of BH-role
# users. We join to `users` here to recover the real BH name.

@router.get("/bh-companies")
def bh_companies(
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    from sqlalchemy import case, func

    from infra.models import Candidate, Job, User, Validation, ValidationStatus

    # Per-job candidate counts + DL-verified counts in one subquery.
    # DL-verified = candidate has a Validation row with status='validated'.
    cand_sub = (
        db.query(
            Candidate.job_id.label("job_id"),
            func.count(Candidate.id).label("cnt"),
            func.count(
                case(
                    (Validation.status == ValidationStatus.validated, 1),
                ),
            ).label("verified_cnt"),
        )
        .outerjoin(Validation, Validation.candidate_id == Candidate.id)
        .group_by(Candidate.job_id)
        .subquery()
    )

    # Postgres `string_agg` collects distinct Job.job_id values (= OL
    # job_posting_ids) for each bucket. One bucket can contain multiple jobs.
    ol_job_ids_expr = func.array_remove(
        func.array_agg(func.distinct(Job.job_id)),
        None,
    )

    rows_q = (
        db.query(
            Job.account_manager_id.label("bh_user_id"),
            User.name.label("bh_name"),
            Job.client_name.label("client_name"),
            Job.role_title.label("role_title"),
            func.coalesce(func.sum(Job.headcount), 0).label("headcount"),
            func.count(Job.id).label("jobs_count"),
            func.coalesce(func.sum(cand_sub.c.cnt), 0).label("candidates_count"),
            func.coalesce(func.sum(cand_sub.c.verified_cnt), 0).label("dl_verified_count"),
            ol_job_ids_expr.label("ol_job_ids"),
        )
        .outerjoin(User, Job.account_manager_id == User.id)
        .outerjoin(cand_sub, cand_sub.c.job_id == Job.id)
        .group_by(Job.account_manager_id, User.name, Job.client_name, Job.role_title)
        .order_by(User.name.asc(), Job.client_name.asc(), Job.role_title.asc())
        .all()
    )

    rows = [
        {
            "bh_user_id":        r.bh_user_id,
            "bh_name":           r.bh_name or "Unmapped",
            "client_name":       r.client_name,
            "role_title":        r.role_title,
            "headcount":         int(r.headcount or 0),
            "jobs_count":        int(r.jobs_count or 0),
            "candidates_count":  int(r.candidates_count or 0),
            "dl_verified_count": int(r.dl_verified_count or 0),
            "ol_job_ids":        sorted(r.ol_job_ids or []),
        }
        for r in rows_q
    ]

    # ── Enrich each row with `client_submitted_count`.
    #
    # Definition (per user): a candidate counts as "client submitted" if
    # their OL applied_jobs row for THIS bucket's job_posting_id has
    # current_step >= 7 (anything from "Client Submit" onwards in the
    # pipeline). One trip to OL; bucketed back to Python aggregations.
    cand_pairs = (
        db.query(
            Candidate.email,
            Job.account_manager_id.label("bh_uid"),
            Job.client_name,
            Job.role_title,
            Job.job_id.label("ol_jp_id"),
        )
        .join(Job, Job.id == Candidate.job_id)
        .filter(Candidate.email.isnot(None), Job.job_id.isnot(None))
        .all()
    )

    submitted_counts: dict[tuple, int] = {}
    if cand_pairs:
        emails = list({(p.email or "").strip().lower() for p in cand_pairs if p.email})
        jp_ids = list({p.ol_jp_id for p in cand_pairs if p.ol_jp_id})

        ol_user_by_email: dict[str, int] = {}
        submitted_pairs: set[tuple[int, int]] = set()

        if emails and jp_ids:
            try:
                from features.mrr.ol_lookup.routes import _get_ol_conn
                ol = _get_ol_conn()
                try:
                    with ol.cursor() as cur:
                        fmt_e = ",".join(["%s"] * len(emails))
                        cur.execute(
                            f"SELECT id, LOWER(email) AS em FROM users "
                            f"WHERE LOWER(email) IN ({fmt_e})",
                            emails,
                        )
                        for r in cur.fetchall():
                            ol_user_by_email[r["em"]] = r["id"]

                        uids = list({v for v in ol_user_by_email.values()})
                        if uids:
                            fmt_u  = ",".join(["%s"] * len(uids))
                            fmt_jp = ",".join(["%s"] * len(jp_ids))
                            cur.execute(
                                f"""
                                SELECT user_id, job_posting_id
                                FROM applied_jobs
                                WHERE user_id IN ({fmt_u})
                                  AND job_posting_id IN ({fmt_jp})
                                  AND current_step >= 7
                                """,
                                (*uids, *jp_ids),
                            )
                            for r in cur.fetchall():
                                submitted_pairs.add((r["user_id"], r["job_posting_id"]))
                finally:
                    ol.close()
            except Exception:
                # OL unreachable → fall through with empty data; counts will be 0.
                ol_user_by_email = {}
                submitted_pairs = set()

        for p in cand_pairs:
            uid = ol_user_by_email.get((p.email or "").strip().lower())
            if uid is not None and (uid, p.ol_jp_id) in submitted_pairs:
                key = (p.bh_uid, p.client_name, p.role_title)
                submitted_counts[key] = submitted_counts.get(key, 0) + 1

    for row in rows:
        # Map "Unmapped" label back to None for the lookup key.
        bh_uid = row["bh_user_id"]
        key = (bh_uid, row["client_name"], row["role_title"])
        row["client_submitted_count"] = submitted_counts.get(key, 0)

    return {"rows": rows}


def _iso(v) -> str | None:
    """Format a datetime/date for the BH × Companies drawer (UTC, naive)."""
    from datetime import date as _date
    from datetime import datetime as _dt
    if v is None:
        return None
    if isinstance(v, _dt):
        return v.strftime("%Y-%m-%d %H:%M")
    if isinstance(v, _date):
        return v.strftime("%Y-%m-%d")
    return str(v)


@router.get("/bh-companies/candidates")
def bh_companies_candidates(
    client_name: str,
    role_title: str,
    bh_user_id: int | None = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """Per-candidate detail for one (BH, company, role) bucket.

    Each row carries:
      • name + email + local DL-verified state + timestamp
      • OL user_id matched on email
      • latest applied_jobs status from OL replica (step label,
        created_at, updated_at)
    """
    from infra.models import Candidate, Job, Validation, ValidationStatus

    job_q = (
        db.query(Job.id, Job.job_id)  # id = local PK, job_id = OL job_posting_id
        .filter(Job.client_name == client_name, Job.role_title == role_title)
    )
    if bh_user_id is None:
        job_q = job_q.filter(Job.account_manager_id.is_(None))
    else:
        job_q = job_q.filter(Job.account_manager_id == bh_user_id)
    job_rows = job_q.all()
    if not job_rows:
        return {"candidates": []}

    local_job_ids   = [r.id for r in job_rows]
    # Map: local Postgres Job.id → OL job_posting_id (Job.job_id). Some jobs
    # have no OL counterpart (job_id NULL) — those candidates won't match in OL.
    local_to_ol_jp: dict[int, int] = {
        r.id: r.job_id for r in job_rows if r.job_id is not None
    }
    ol_jp_ids = list({jp for jp in local_to_ol_jp.values()})

    # Local DB: candidate + validation timestamp (when status='validated') +
    # the parent Job.created_at (= when the role was opened in MRR tool).
    cand_rows = (
        db.query(
            Candidate.id,
            Candidate.job_id.label("local_job_id"),
            Candidate.full_name,
            Candidate.email,
            Validation.status,
            Validation.created_at.label("validation_at"),
            Job.created_at.label("job_created_at"),
        )
        .join(Job, Job.id == Candidate.job_id)
        .outerjoin(Validation, Validation.candidate_id == Candidate.id)
        .filter(Candidate.job_id.in_(local_job_ids))
        .order_by(Candidate.full_name.asc())
        .all()
    )

    # ── OL replica enrichment: match on (user_id, job_posting_id).
    # We only fetch applied_jobs rows for the OL job_posting_ids that map to
    # the Postgres jobs in this bucket — so a candidate's OL status reflects
    # THIS role specifically, not their other applications elsewhere.
    emails = [c.email.strip() for c in cand_rows if c.email and c.email.strip()]
    email_to_uid: dict[str, int] = {}
    # Keyed by (ol_user_id, ol_job_posting_id) → latest applied_jobs row.
    aj_by_uid_jp: dict[tuple[int, int], dict] = {}

    if emails and ol_jp_ids:
        from features.mrr.ol_lookup.routes import _get_ol_conn
        try:
            ol = _get_ol_conn()
            try:
                with ol.cursor() as cur:
                    fmt = ",".join(["%s"] * len(emails))
                    cur.execute(
                        f"SELECT id, email FROM users WHERE email IN ({fmt})",
                        emails,
                    )
                    email_to_uid = {
                        (r["email"] or "").strip().lower(): r["id"]
                        for r in cur.fetchall()
                        if r.get("email")
                    }
                    uids = list({v for v in email_to_uid.values()})
                    if uids:
                        fmt_u  = ",".join(["%s"] * len(uids))
                        fmt_jp = ",".join(["%s"] * len(ol_jp_ids))
                        cur.execute(
                            f"""
                            SELECT aj.user_id,
                                   aj.job_posting_id,
                                   aj.current_step,
                                   cwf.workflow_step AS step_name,
                                   aj.created_at,
                                   aj.updated_at
                            FROM applied_jobs aj
                            LEFT JOIN candidate_work_flows cwf
                                   ON cwf.step_id = aj.current_step
                            WHERE aj.user_id IN ({fmt_u})
                              AND aj.job_posting_id IN ({fmt_jp})
                            ORDER BY aj.updated_at DESC
                            """,
                            (*uids, *ol_jp_ids),
                        )
                        # Keep latest aj per (user, job_posting). First match
                        # wins since the query is ordered updated_at DESC.
                        for r in cur.fetchall():
                            key = (r["user_id"], r["job_posting_id"])
                            if key not in aj_by_uid_jp:
                                aj_by_uid_jp[key] = r
            finally:
                ol.close()
        except Exception:
            # OL replica unreachable / SSL / VPC issue — return locals only.
            email_to_uid = {}
            aj_by_uid_jp = {}

    out = []
    for c in cand_rows:
        em = (c.email or "").strip().lower()
        uid = email_to_uid.get(em)
        jp  = local_to_ol_jp.get(c.local_job_id)
        aj  = aj_by_uid_jp.get((uid, jp)) if (uid is not None and jp is not None) else None
        out.append({
            "full_name":          c.full_name,
            "email":              c.email,
            "mrr_job_created_at": _iso(c.job_created_at),
            "dl_verified":        c.status == ValidationStatus.validated if c.status else False,
            "dl_verified_at":     _iso(c.validation_at) if c.status == ValidationStatus.validated else None,
            "ol_user_id":         uid,
            "ol_job_posting_id":  jp,
            "ol_step":            (aj or {}).get("step_name"),
            "ol_created_at":      _iso((aj or {}).get("created_at")),
            "ol_updated_at":      _iso((aj or {}).get("updated_at")),
        })

    return {"candidates": out}


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
    date: str | None = None,      # YYYY-MM-DD; defaults to today IST
    period: str = "day",          # "day" | "week" | "month"
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Per-recruiter metrics for the COO dashboard.

    period=day   → single-day view with hourly breakdown (default: today)
    period=week  → Mon-Sun week containing `date`, aggregate totals
    period=month → calendar month containing `date`, aggregate totals
    """
    from infra.models import (
        Candidate,
        CandidateStatus,
        ConsultantMail,
        Pod,
        PodMembership,
        Submission,
        User,
        UserLeave,
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
    import calendar as _cal

    # ── Resolve anchor date (IST) ──────────────────────────────────────────
    ist_now   = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    today_ist = ist_now.date()

    from datetime import date as _date
    if date:
        try:
            anchor = _date.fromisoformat(date)
        except ValueError:
            raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")
    else:
        anchor = today_ist

    is_today = (anchor == today_ist)

    # ── Compute UTC range and period label based on period ─────────────────
    if period == "week":
        # Monday of anchor's week
        range_start_ist = anchor - timedelta(days=anchor.weekday())
        range_end_ist   = range_start_ist + timedelta(days=7)
        period_label    = f"Week of {range_start_ist.strftime('%d %b')} – {(range_end_ist - timedelta(days=1)).strftime('%d %b %Y')}"
        # working days Mon-Fri in this week (up to today for current week)
        end_for_target  = min(range_end_ist - timedelta(days=1), today_ist)
        working_days    = sum(
            1 for i in range(7)
            if (range_start_ist + timedelta(days=i)).weekday() < 5
            and (range_start_ist + timedelta(days=i)) <= end_for_target
        )
    elif period == "month":
        range_start_ist = _date(anchor.year, anchor.month, 1)
        last_day        = _cal.monthrange(anchor.year, anchor.month)[1]
        range_end_ist   = _date(anchor.year, anchor.month, last_day) + timedelta(days=1)
        period_label    = anchor.strftime("%B %Y")
        end_for_target  = min(range_end_ist - timedelta(days=1), today_ist)
        working_days    = sum(
            1 for d in range(last_day)
            if (_date(anchor.year, anchor.month, d + 1)).weekday() < 5
            and (_date(anchor.year, anchor.month, d + 1)) <= end_for_target
        )
    else:  # day
        range_start_ist = anchor
        range_end_ist   = anchor + timedelta(days=1)
        period_label    = anchor.strftime("%d %b %Y")
        working_days    = 1

    # Convert IST range to UTC
    range_start_utc = datetime(range_start_ist.year, range_start_ist.month, range_start_ist.day) - timedelta(hours=5, minutes=30)
    range_end_utc   = datetime(range_end_ist.year,   range_end_ist.month,   range_end_ist.day)   - timedelta(hours=5, minutes=30)

    # Aliases kept for day-period compat
    today_ist     = anchor
    day_start_utc = range_start_utc
    day_end_utc   = range_end_utc

    # All active recruiters (primary or secondary role)…
    # Pod scoping: admin / COO see everyone; BH / KAM / DL see only the
    # recruiters who belong to their own pod, so each pod head gets a focused
    # leaderboard for their own team rather than the whole company.
    _caller_role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    _scope_to_pod = _caller_role in ("bh", "kam", "delivery_lead") and current_user.pod_id is not None

    # Base list: every active recruiter AND every active delivery lead — both
    # primary and secondary role assignments. DLs are always shown so the
    # leaderboard renders their row even on days they didn't source anything.
    rec_query = (
        db.query(User)
        .filter(
            User.is_active == True,  # noqa: E712
            or_(
                User.role == UserRole.recruiter,
                User.secondary_role == "recruiter",
                User.role == UserRole.delivery_lead,
                User.secondary_role == "delivery_lead",
            ),
        )
    )
    if _scope_to_pod:
        rec_query = rec_query.filter(User.pod_id == current_user.pod_id)
    recruiters = (
        rec_query
        .all()
    )
    rec_ids_set = {u.id for u in recruiters}
    # …plus any user who has sourced a candidate today, even if they're not
    # classified as a recruiter or DL (rare edge case — e.g. KAM sourcing
    # directly). Without this, POD TOTAL diverges from the candidates table.
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
        # Honour pod-scoping for the extras branch too — a BH should not see
        # a sourcer from another pod show up just because they sourced today.
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

    # ── Targets ──
    completed_slots = set(current_slot_indices_completed(ist_now))
    resolved = latest_targets_for_users(db, rec_ids, anchor)
    slots_by_user: dict[int, dict[int, int]] = {
        uid: slot_map for uid, (slot_map, _) in resolved.items()
    }
    rec_by_id: dict[int, User] = {u.id: u for u in recruiters}

    def _targets_for(uid: int) -> tuple[int, int]:
        slots = slots_by_user.get(uid)
        if not slots:
            user = rec_by_id.get(uid)
            slots = default_targets_for_user(user) if user is not None else {}
        day = sum(slots.values())
        if period == "day":
            so_far = sum(c for idx, c in slots.items() if idx in completed_slots)
        else:
            # For week/month: scale by number of working days in the period
            so_far = day * working_days
            day    = day * working_days
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

    # Recruiters on leave — only relevant for day view (single date)
    on_leave_ids: set[int] = set()
    if period == "day":
        on_leave_ids = {
            r.user_id
            for r in db.query(UserLeave.user_id).filter(UserLeave.leave_date == anchor).all()
        }

    rows = []
    sum_done = sum_ack = sum_subs = sum_verified = sum_rejects = 0
    sum_target_so_far = sum_day_target = 0
    sum_hourly_target = [0] * len(TIME_SLOTS)
    sum_hourly_ack    = [0] * len(TIME_SLOTS)
    sum_hourly_sub    = [0] * len(TIME_SLOTS)
    sum_hourly_ver    = [0] * len(TIME_SLOTS)
    for u in recruiters:
        is_on_leave = u.id in on_leave_ids
        done       = done_by_rec.get(u.id, 0)
        verified   = verified_by_rec.get(u.id, 0)
        subs       = max(sub_by_rec.get(u.id, 0), verified)   # submissions ≥ dl_verified
        ack        = max(ack_by_rec.get(u.id, 0), subs)       # ack_sent ≥ submissions
        rejects    = reject_by_rec.get(u.id, 0)
        target_so_far, day_target = _targets_for(u.id)
        if is_on_leave:
            # On-leave recruiters don't contribute to the team target
            target_so_far = 0
            day_target    = 0
        pct = round((verified / target_so_far) * 100) if target_so_far else 0
        status = (
            "On Leave"
            if is_on_leave
            else (
                "On Track"
                if (target_so_far == 0 or pct >= ON_TRACK_THRESHOLD)
                else "Behind"
            )
        )

        # Hourly breakdown only for day view
        target_slots = slots_by_user.get(u.id, {})
        hourly = []
        if period == "day":
            a_h = ack_hourly.get(u.id, {})
            s_h = sub_hourly.get(u.id, {})
            v_h = verified_hourly.get(u.id, {})
            for s in TIME_SLOTS:
                idx = s["index"]
                t   = 0 if is_on_leave else int(target_slots.get(idx, 0))
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
                "is_on_leave":    is_on_leave,
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
        "rows":         rows,
        "totals":       totals,
        "today":        anchor.isoformat(),
        "period":       period,
        "period_label": period_label,
        "is_today":     is_today and period == "day",
        "slots":        TIME_SLOTS,
    }


# ── KAM Interviews: candidates stuck at "Client Submit" (OL step 7) ───────────
#
# Per-demand aging report for interview planning. The status of record is the
# Offer-Letter (OL) replica: a candidate is "stuck at Client Submit" when their
# OL applied_jobs.current_step is EXACTLY 7 (submitted but not yet moved to an
# interview round). We bucket each such candidate by how long they've sat there,
# measured from applied_jobs.updated_at (the OL step-transition timestamp).
#
# Read-only: Postgres (our candidates/jobs + KAM/BH ownership) + OL replica.

def _ki_bucket(age_days: int) -> str:
    """Map an age in days to the aging bucket key."""
    if age_days <= 3:
        return "d0_3"
    if age_days <= 5:
        return "d4_5"
    if age_days <= 7:
        return "d6_7"
    return "dgt7"


@router.get("/kam-interviews")
def kam_interviews(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from sqlalchemy.orm import aliased

    from infra.models import Candidate, Job, User

    # ── Postgres: every candidate that could map to an OL record, with its
    # demand (job) and ownership. In this data the KAM that owns a demand is the
    # creator (jobs.created_by_id, role=kam) and the BH is jobs.account_manager_id
    # (role=bh) — jobs.kam_id is unused. Only rows usable for an OL match (have an
    # email AND an OL job id) are selected.
    Kam = aliased(User)
    Bh = aliased(User)
    q = (
        db.query(
            Candidate.email.label("email"),
            Job.id.label("demand_id"),
            Job.job_id.label("ol_jp_id"),
            Job.role_title.label("role_title"),
            Job.client_name.label("client_name"),
            Job.jd_raw_text.label("jd_raw_text"),
            Kam.name.label("kam_name"),
            Bh.name.label("bh_name"),
        )
        .join(Job, Job.id == Candidate.job_id)
        .outerjoin(Kam, Kam.id == Job.created_by_id)
        .outerjoin(Bh, Bh.id == Job.account_manager_id)
        .filter(Candidate.email.isnot(None), Job.job_id.isnot(None))
    )

    # Pod scoping: admin / COO / CEO / ops_head see all demands; BH / KAM / DL
    # see only demands whose KAM (creator) belongs to their own pod.
    _caller_role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    if _caller_role in ("bh", "kam", "delivery_lead") and current_user.pod_id is not None:
        q = q.filter(Kam.pod_id == current_user.pod_id)

    cand_rows = q.all()

    # Per-demand metadata + ordered list of (email, demand_id, ol_jp_id).
    demand_meta: dict[int, dict] = {}
    for r in cand_rows:
        if r.demand_id not in demand_meta:
            demand_meta[r.demand_id] = {
                "demand_id":   r.demand_id,
                "role_title":  r.role_title,
                "client_name": r.client_name,
                "jd_raw_text": r.jd_raw_text,
                "kam_name":    r.kam_name,
                "bh_name":     r.bh_name,
            }

    # ── OL replica: which (user, job_posting) pairs sit at current_step = 7,
    # and when they got there (updated_at). One round-trip.
    email_to_uid: dict[str, int] = {}
    aj_by_uid_jp: dict[tuple[int, int], datetime] = {}
    ol_available = True

    emails = list({(r.email or "").strip().lower() for r in cand_rows if r.email and r.email.strip()})
    jp_ids = list({r.ol_jp_id for r in cand_rows if r.ol_jp_id is not None})

    if emails and jp_ids:
        try:
            from features.mrr.ol_lookup.routes import _get_ol_conn
            ol = _get_ol_conn()
            try:
                with ol.cursor() as cur:
                    fmt_e = ",".join(["%s"] * len(emails))
                    cur.execute(
                        f"SELECT id, LOWER(email) AS em FROM users WHERE LOWER(email) IN ({fmt_e})",
                        emails,
                    )
                    for r in cur.fetchall():
                        if r.get("em"):
                            email_to_uid[r["em"]] = r["id"]

                    uids = list({v for v in email_to_uid.values()})
                    if uids:
                        fmt_u  = ",".join(["%s"] * len(uids))
                        fmt_jp = ",".join(["%s"] * len(jp_ids))
                        cur.execute(
                            f"""
                            SELECT user_id, job_posting_id, updated_at
                            FROM applied_jobs
                            WHERE user_id IN ({fmt_u})
                              AND job_posting_id IN ({fmt_jp})
                              AND current_step = 7
                            ORDER BY updated_at DESC
                            """,
                            (*uids, *jp_ids),
                        )
                        # Keep the latest applied_jobs row per (user, posting).
                        for r in cur.fetchall():
                            key = (r["user_id"], r["job_posting_id"])
                            if key not in aj_by_uid_jp:
                                aj_by_uid_jp[key] = r["updated_at"]
            finally:
                ol.close()
        except Exception:
            # OL replica unreachable — degrade gracefully, no counts.
            email_to_uid = {}
            aj_by_uid_jp = {}
            ol_available = False

    # ── Aggregate per demand: total + aging buckets.
    # Naive UTC "now" so it subtracts cleanly against OL's naive updated_at.
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    agg: dict[int, dict] = {}

    def _blank(demand_id: int) -> dict:
        return {**demand_meta[demand_id], "total": 0, "d0_3": 0, "d4_5": 0, "d6_7": 0, "dgt7": 0}

    for r in cand_rows:
        uid = email_to_uid.get((r.email or "").strip().lower())
        if uid is None:
            continue
        updated_at = aj_by_uid_jp.get((uid, r.ol_jp_id))
        if updated_at is None:
            continue  # not at step 7 for this demand
        age_days = (now - updated_at).days
        if age_days < 0:
            age_days = 0
        bucket = _ki_bucket(age_days)
        row = agg.setdefault(r.demand_id, _blank(r.demand_id))
        row["total"] += 1
        row[bucket] += 1

    rows = sorted(agg.values(), key=lambda x: (x["dgt7"], x["total"]), reverse=True)

    totals = {"total": 0, "d0_3": 0, "d4_5": 0, "d6_7": 0, "dgt7": 0}
    for row in rows:
        for k in totals:
            totals[k] += row[k]

    return {
        "rows":         rows,
        "totals":       totals,
        "ol_available": ol_available,
        "generated_at": now.replace(tzinfo=timezone.utc).isoformat(),
    }
