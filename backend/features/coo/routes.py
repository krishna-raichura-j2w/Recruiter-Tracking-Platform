"""
COO Leaderboard — pulls from OL Replica MySQL, maps clients to Business Heads
via Mehr.xlsx, and returns 10 fixed pipeline columns with per-period counts.
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
    7:  "submission",    # Client Submit
    8:  "screen_reject", # Client Screen Reject
    11: "l1_reject",     # L1 No Show
    12: "l1_reject",     # L1 Reject
    13: "l1_accept",     # L1 Select
    14: "l1_accept",     # Schedule L2 Interview (L1 cleared → L2 queued)
    16: "l2_reject",     # L2 No Show
    17: "l2_reject",     # L2 Reject
    18: "l2_accept",     # L2 Select
    19: "l2_accept",     # Schedule L3 Interview (L2 cleared → L3 queued)
    21: "l3_reject",     # L3 No Show
    22: "l3_reject",     # L3 Reject
    23: "l3_accept",     # L3 Select
    47: "l3_accept",     # Confirm Final Select
    33: "selection",     # Offer Accepted
    44: "onboarding",    # Onboarded
    54: "onboarding",    # Induction Completed
    41: "onboarding",    # Confirm Onboarding
}

STEP_IDS = tuple(STEP_TO_COL.keys())

# ── Excel BH mapping ──────────────────────────────────────────────────────────

EXCEL_PATH = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "Mehr.xlsx")
)


@lru_cache(maxsize=1)
def _load_bh_map() -> dict[str, str]:
    try:
        import openpyxl
        wb = openpyxl.load_workbook(EXCEL_PATH, read_only=True, data_only=True)
        ws = wb["AM and BH"]
        mapping: dict[str, str] = {}
        for row in ws.iter_rows(min_row=2, values_only=True):
            client = row[4]   # Column E
            bh     = row[5]   # Column F
            if (client and bh
                    and isinstance(client, str) and isinstance(bh, str)
                    and bh.strip().lower() not in ("none", "")):
                mapping[client.strip().lower()] = bh.strip()
        wb.close()
        return mapping
    except Exception as exc:
        print(f"[coo] Excel load failed: {exc}")
        return {}


def _normalize(name: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", name.lower()).strip()


def _lookup_bh(client: str, bh_map: dict[str, str]) -> str:
    if not client:
        return "Unknown"
    key = client.strip().lower()
    if key in bh_map:
        return bh_map[key]
    norm = _normalize(client)
    for k, v in bh_map.items():
        if _normalize(k) == norm:
            return v
    for k, v in bh_map.items():
        if norm in _normalize(k) or _normalize(k) in norm:
            return v
    return "Unknown"


# ── MySQL helpers ─────────────────────────────────────────────────────────────

def _get_mysql_conn():
    import pymysql
    from core.config import settings
    if not settings.ol_replica_host:
        raise HTTPException(status_code=503, detail="OL Replica not configured.")
    return pymysql.connect(
        host=settings.ol_replica_host,
        port=settings.ol_replica_port,
        user=settings.ol_replica_user,
        password=settings.ol_replica_password,
        database=settings.ol_replica_database,
        connect_timeout=10,
        cursorclass=pymysql.cursors.DictCursor,
        ssl_disabled=True,
    )


# Query — returns today count + selected-date count in one pass ───────────────

_SQL = """
SELECT
    cl.company_name   AS client,
    aj.current_step   AS step_id,
    COUNT(DISTINCT CASE
        WHEN DATE(CONVERT_TZ(aj.updated_at,'+00:00','+05:30')) = %(today)s
        THEN aj.id END)                                                   AS today_cnt,
    COUNT(DISTINCT CASE
        WHEN DATE(CONVERT_TZ(aj.updated_at,'+00:00','+05:30')) = %(compare_date)s
        THEN aj.id END)                                                   AS compare_cnt
FROM  applied_jobs      AS aj
LEFT JOIN job_postings  AS jp ON aj.job_posting_id = jp.id
LEFT JOIN clients       AS cl ON jp.client_id      = cl.user_id
WHERE aj.current_step IN %(step_ids)s
  AND jp.id IS NOT NULL
  AND cl.id NOT IN (1, 2)
  AND DATE(CONVERT_TZ(aj.updated_at,'+00:00','+05:30'))
        IN (%(today)s, %(compare_date)s)
GROUP BY cl.company_name, aj.current_step
ORDER BY cl.company_name, aj.current_step
"""


# ── Endpoint ──────────────────────────────────────────────────────────────────

def _zero():
    return {"today": 0, "compare": 0}


@router.get("/leaderboard")
def coo_leaderboard(
    compare_date: str | None = None,
    _=Depends(require_roles("coo", "admin")),
):
    """
    Returns per-BH × per-client pipeline counts for today + one comparison date.
    compare_date: ISO date string (YYYY-MM-DD); defaults to yesterday.
    Columns: Submission → Screen Reject → L1/L2/L3 → Selection → Onboarding.
    """
    ist_now   = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    today_d   = ist_now.date()
    yesterday = (today_d - timedelta(days=1)).isoformat()

    # Parse and validate compare_date
    if compare_date:
        try:
            from datetime import date as _date
            _date.fromisoformat(compare_date)   # validates format
        except ValueError:
            raise HTTPException(status_code=400, detail="compare_date must be YYYY-MM-DD")
    else:
        compare_date = yesterday

    params = {
        "today":        today_d.isoformat(),
        "compare_date": compare_date,
        "step_ids":     STEP_IDS,
    }

    bh_map = _load_bh_map()

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

    # Aggregate into (bh, client) → {col_key → period counts}
    agg: dict[tuple[str, str], dict[str, dict[str, int]]] = {}

    for r in db_rows:
        raw_client = r.get("client")
        if not raw_client:
            continue
        client  = str(raw_client).strip()
        step_id = int(float(r.get("step_id") or 0))
        col_key = STEP_TO_COL.get(step_id)
        if not col_key:
            continue
        bh = _lookup_bh(client, bh_map)
        if bh == "Unknown":
            continue
        key = (bh, client)
        if key not in agg:
            agg[key] = {k: _zero() for k, _ in COLUMNS}
        agg[key][col_key]["today"]   += int(r.get("today_cnt")   or 0)
        agg[key][col_key]["compare"] += int(r.get("compare_cnt") or 0)

    # Only show rows with at least one non-zero value (today or compare)
    rows = [
        {"bh_name": bh, "client_name": client, "cols": data}
        for (bh, client), data in sorted(agg.items())
        if any(data[c]["today"] > 0 or data[c]["compare"] > 0 for c, _ in COLUMNS)
    ]

    return {
        "rows":         rows,
        "columns":      [{"key": k, "label": lbl} for k, lbl in COLUMNS],
        "today":        today_d.isoformat(),
        "compare_date": compare_date,
    }
