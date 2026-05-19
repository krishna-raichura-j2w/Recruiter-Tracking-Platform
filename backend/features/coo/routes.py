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
from core.deps import require_roles

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
