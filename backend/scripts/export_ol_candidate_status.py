#!/usr/bin/env python3
"""
Cross-DB candidate status report.

Steps:
  1. Pull submitted candidates from MRR PostgreSQL (email, name, job_id, MRR status)
  2. For each candidate email → find user_id in OL MySQL users table
  3. Query OL applied_jobs using that user_id + job_posting_id (= jobs.job_id in MRR)
  4. Fetch OL current step/stage from candidate_work_flows
  5. Export to Excel: one row per candidate with both MRR & OL status

Usage:
    python scripts/export_ol_candidate_status.py
    python scripts/export_ol_candidate_status.py --out /tmp/report.xlsx
"""
import os
import sys
import argparse
from datetime import datetime
from pathlib import Path
from urllib.parse import unquote

# ── load .env ─────────────────────────────────────────────────────────────────
env_file = Path(__file__).parent.parent / ".env"
if env_file.exists():
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        os.environ.setdefault(key.strip(), val.strip().strip("'\""))

import psycopg2
import psycopg2.extras
import pymysql
import pymysql.cursors

try:
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "openpyxl", "-q"])
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter


# ── connections ───────────────────────────────────────────────────────────────

def get_pg_conn():
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        sys.exit("ERROR: DATABASE_URL not set.")
    # Fix passwords containing '@'
    scheme_end = url.index("://") + 3
    if url[scheme_end:].count("@") > 1:
        last_at  = url.rfind("@")
        creds    = url[scheme_end:last_at]
        hostpart = url[last_at + 1:]
        colon    = creds.index(":")
        password = creds[colon + 1:].replace("@", "%40")
        url = f"{url[:scheme_end]}{creds[:colon]}:{password}@{hostpart}"
    return psycopg2.connect(url, cursor_factory=psycopg2.extras.RealDictCursor)


def get_ol_conn():
    host     = os.environ.get("OL_REPLICA_HOST", "")
    port     = int(os.environ.get("OL_REPLICA_PORT", "3306"))
    user     = os.environ.get("OL_REPLICA_USER", "")
    password = os.environ.get("OL_REPLICA_PASSWORD", "")
    database = os.environ.get("OL_REPLICA_DATABASE", "offerletter")
    missing  = [k for k, v in {
        "OL_REPLICA_HOST": host, "OL_REPLICA_USER": user, "OL_REPLICA_PASSWORD": password,
    }.items() if not v]
    if missing:
        sys.exit(f"ERROR: Missing OL env vars: {', '.join(missing)}")
    return pymysql.connect(
        host=host, port=port, user=user, password=password,
        database=database, charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        connect_timeout=15, read_timeout=30,
    )


# ── step 1: pull candidates from MRR Postgres ─────────────────────────────────

MRR_SQL = """
SELECT
    c.id                        AS mrr_candidate_id,
    c.full_name                 AS candidate_name,
    c.email                     AS candidate_email,
    c.status                    AS mrr_status,
    j.id                        AS mrr_job_id,
    j.job_id                    AS ol_job_id,
    j.client_name,
    j.role_title,
    r.name                      AS recruiter_name,
    s.current_stage             AS submission_stage,
    s.submitted_at              AS submitted_at
FROM candidates c
JOIN jobs j        ON j.id  = c.job_id
LEFT JOIN users r  ON r.id  = c.sourced_by_id
LEFT JOIN submissions s ON s.candidate_id = c.id
WHERE c.email IS NOT NULL
  AND c.email != ''
ORDER BY r.name, c.full_name
"""

STATUS_LABELS = {
    "sourced":              "Sourced",
    "handed_to_recruiter":  "Handed to Recruiter",
    "call_in_progress":     "Call In Progress",
    "ready_for_validation": "Ready for Validation",
    "validated":            "Validated",
    "needs_rework":         "Needs Rework",
    "on_hold":              "On Hold",
    "rejected":             "Rejected",
    "submitted_to_client":  "Submitted to Client",
    "interview_stage":      "Interview Stage",
    "offer_rolled_out":     "Offer Rolled Out",
    "joined":               "Joined",
    "backed_out":           "Backed Out",
}

STATUS_COLORS = {
    "sourced":              "EFF6FF",
    "submitted_to_client":  "D1FAE5",
    "interview_stage":      "FEF9C3",
    "offer_rolled_out":     "DCFCE7",
    "joined":               "BBF7D0",
    "rejected":             "FEE2E2",
    "backed_out":           "FEE2E2",
    "validated":            "E0F2FE",
    "needs_rework":         "FEF3C7",
    "on_hold":              "F3F4F6",
}

OL_STATUS_COLORS = {
    "joined":   "BBF7D0",
    "offer":    "DCFCE7",
    "cleared":  "D1FAE5",
    "rejected": "FEE2E2",
    "pending":  "FEF9C3",
    "":         "F8FAFC",
}


def fetch_mrr_candidates(pg) -> list[dict]:
    with pg.cursor() as cur:
        cur.execute(MRR_SQL)
        return cur.fetchall()


# ── step 2+3: look up each email in OL and fetch status ───────────────────────

OL_USER_SQL = """
    SELECT id, CONCAT(first_name, ' ', last_name) AS full_name
    FROM users
    WHERE email = %s
    LIMIT 1
"""

OL_STATUS_SQL = """
    SELECT
        aj.id                  AS applied_job_id,
        aj.job_posting_id,
        aj.current_step,
        aj.updated_at          AS ol_updated_at,
        cwf.workflow_step      AS ol_step_name,
        cwf.stage              AS ol_stage,
        jp.title               AS ol_job_title
    FROM applied_jobs aj
    LEFT JOIN candidate_work_flows cwf ON cwf.step_id = aj.current_step
    LEFT JOIN job_postings jp          ON jp.id = aj.job_posting_id
    WHERE aj.user_id = %s
      AND aj.job_posting_id = %s
    ORDER BY aj.updated_at DESC
    LIMIT 1
"""

OL_ANY_STATUS_SQL = """
    SELECT
        aj.id                  AS applied_job_id,
        aj.job_posting_id,
        aj.current_step,
        aj.updated_at          AS ol_updated_at,
        cwf.workflow_step      AS ol_step_name,
        cwf.stage              AS ol_stage,
        jp.title               AS ol_job_title
    FROM applied_jobs aj
    LEFT JOIN candidate_work_flows cwf ON cwf.step_id = aj.current_step
    LEFT JOIN job_postings jp          ON jp.id = aj.job_posting_id
    WHERE aj.user_id = %s
    ORDER BY aj.updated_at DESC
    LIMIT 1
"""


def enrich_with_ol(mrr_rows: list[dict], ol) -> list[dict]:
    """Add OL user_id and OL status fields to each MRR row."""
    results = []
    with ol.cursor() as cur:
        for row in mrr_rows:
            email   = row.get("candidate_email") or ""
            ol_job  = row.get("ol_job_id")        # numeric OL job_posting_id

            # look up OL user by email
            cur.execute(OL_USER_SQL, (email,))
            ol_user = cur.fetchone()

            if not ol_user:
                row["ol_user_id"]    = None
                row["ol_step_name"]  = "Not found in OL"
                row["ol_stage"]      = ""
                row["ol_updated_at"] = None
                row["ol_job_title"]  = ""
                results.append(row)
                continue

            ol_user_id = ol_user["id"]
            row["ol_user_id"] = ol_user_id

            # try exact job match first
            if ol_job:
                cur.execute(OL_STATUS_SQL, (ol_user_id, int(ol_job)))
                status = cur.fetchone()
            else:
                status = None

            # fallback: any application by this user (most recent)
            if not status:
                cur.execute(OL_ANY_STATUS_SQL, (ol_user_id,))
                status = cur.fetchone()

            if status:
                row["ol_step_name"]  = status.get("ol_step_name") or "—"
                row["ol_stage"]      = status.get("ol_stage") or "—"
                row["ol_updated_at"] = status.get("ol_updated_at")
                row["ol_job_title"]  = status.get("ol_job_title") or "—"
            else:
                row["ol_step_name"]  = "No application in OL"
                row["ol_stage"]      = ""
                row["ol_updated_at"] = None
                row["ol_job_title"]  = ""

            results.append(row)

    return results


# ── Excel builder ──────────────────────────────────────────────────────────────

HEADER_FILL = PatternFill("solid", fgColor="1E3A8A")
ALT_FILL    = PatternFill("solid", fgColor="F8FAFC")
WHITE_FILL  = PatternFill("solid", fgColor="FFFFFF")
HEADER_FONT = Font(bold=True, color="FFFFFF", size=11)
THIN        = Side(style="thin", color="CBD5E1")
BORDER      = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
CENTER      = Alignment(horizontal="center", vertical="center", wrap_text=True)
LEFT_WRAP   = Alignment(horizontal="left",   vertical="center", wrap_text=True)

HEADERS = [
    "Recruiter Name",
    "Candidate Name",
    "Candidate Email",
    "OL User ID",
    "OL Job ID",
    "Client Name",
    "Role Title",
    "MRR Status",
    "Submission Stage",
    "OL Current Step",
    "OL Stage",
    "OL Last Updated",
    "Submitted At (MRR)",
]

COL_WIDTHS = [22, 24, 32, 12, 12, 22, 28, 22, 22, 30, 18, 18, 18]


def _fmt(dt) -> str:
    if dt is None:
        return "—"
    if hasattr(dt, "strftime"):
        return dt.strftime("%d %b %Y %H:%M")
    return str(dt)


def _ol_color(step: str, stage: str) -> str:
    s = (step + " " + stage).lower()
    if "joined"  in s:  return "BBF7D0"
    if "offer"   in s:  return "DCFCE7"
    if "cleared" in s or "pass" in s or "select" in s: return "D1FAE5"
    if "reject"  in s or "fail" in s:  return "FEE2E2"
    if "pending" in s:  return "FEF9C3"
    if "not found" in s or "no application" in s: return "F1F5F9"
    return "F8FAFC"


def build_excel(rows: list[dict], out_path: Path):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Candidate OL Status"

    # title
    ws.merge_cells(f"A1:{get_column_letter(len(HEADERS))}1")
    tc = ws["A1"]
    tc.value = f"Candidate OL Status Report  ·  {datetime.now().strftime('%d %b %Y, %H:%M')}"
    tc.font  = Font(bold=True, size=13, color="1E3A8A")
    tc.alignment = CENTER
    ws.row_dimensions[1].height = 30

    # headers
    for col, h in enumerate(HEADERS, 1):
        cell = ws.cell(row=2, column=col, value=h)
        cell.font = HEADER_FONT; cell.fill = HEADER_FILL
        cell.alignment = CENTER; cell.border = BORDER
    ws.row_dimensions[2].height = 22
    ws.freeze_panes = "A3"

    for ri, row in enumerate(rows, 3):
        base_fill = ALT_FILL if ri % 2 == 0 else WHITE_FILL

        mrr_status_key   = (row.get("mrr_status") or "").lower()
        mrr_status_label = STATUS_LABELS.get(mrr_status_key, mrr_status_key.replace("_", " ").title())
        mrr_color        = STATUS_COLORS.get(mrr_status_key, "F8FAFC")

        sub_stage = (row.get("submission_stage") or "")
        sub_label = sub_stage.replace("_", " ").title() if sub_stage else "—"

        ol_step  = row.get("ol_step_name") or "—"
        ol_stage = row.get("ol_stage") or "—"
        ol_color = _ol_color(ol_step, ol_stage)

        row_data = [
            row.get("recruiter_name") or "—",
            row.get("candidate_name") or "—",
            row.get("candidate_email") or "—",
            row.get("ol_user_id") or "—",
            row.get("ol_job_id") or "—",
            row.get("client_name") or "—",
            row.get("role_title") or "—",
            mrr_status_label,
            sub_label,
            ol_step,
            ol_stage if ol_stage != "—" else "",
            _fmt(row.get("ol_updated_at")),
            _fmt(row.get("submitted_at")),
        ]

        for col, val in enumerate(row_data, 1):
            cell = ws.cell(row=ri, column=col, value=val)
            cell.border    = BORDER
            cell.alignment = LEFT_WRAP

            if col == 1:                    # Recruiter — bold blue tint
                cell.font = Font(bold=True, size=10)
                cell.fill = PatternFill("solid", fgColor="EFF6FF")
            elif col == 8:                  # MRR Status badge
                cell.fill = PatternFill("solid", fgColor=mrr_color)
                cell.font = Font(bold=True, size=10)
                cell.alignment = CENTER
            elif col in (10, 11):           # OL Step / Stage badge
                cell.fill = PatternFill("solid", fgColor=ol_color)
                cell.font = Font(bold=(col == 10), size=10)
                cell.alignment = CENTER if col == 11 else LEFT_WRAP
            elif col == 4:                  # OL User ID
                cell.fill = base_fill
                cell.font = Font(size=10, color="6B7280")
                cell.alignment = CENTER
            else:
                cell.fill = base_fill
                cell.font = Font(size=10)

        ws.row_dimensions[ri].height = 17

    for i, w in enumerate(COL_WIDTHS, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    # ── Summary tab ───────────────────────────────────────────────────────────
    from collections import Counter
    ws2 = wb.create_sheet("OL Status Summary")

    ol_counts = Counter(
        (row.get("ol_step_name") or "Not found in OL")
        for row in rows
    )

    ws2.merge_cells("A1:C1")
    ws2["A1"].value     = "OL Step Distribution"
    ws2["A1"].font      = Font(bold=True, size=12, color="1E3A8A")
    ws2["A1"].alignment = CENTER
    ws2.row_dimensions[1].height = 26

    for c, h in enumerate(["OL Step / Status", "Count", ""], 1):
        cell = ws2.cell(row=2, column=c, value=h)
        cell.font = HEADER_FONT; cell.fill = HEADER_FILL
        cell.border = BORDER;    cell.alignment = CENTER
    ws2.row_dimensions[2].height = 22

    for ri, (step, cnt) in enumerate(sorted(ol_counts.items(), key=lambda x: -x[1]), 3):
        c1 = ws2.cell(row=ri, column=1, value=step)
        c2 = ws2.cell(row=ri, column=2, value=cnt)
        fill_color = _ol_color(step, "")
        c1.fill = PatternFill("solid", fgColor=fill_color)
        c1.font = Font(size=10); c1.border = BORDER; c1.alignment = LEFT_WRAP
        c2.font = Font(bold=True, size=10); c2.border = BORDER; c2.alignment = CENTER

    ws2.column_dimensions["A"].width = 36
    ws2.column_dimensions["B"].width = 10

    out_path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out_path)
    print(f"✅  Saved → {out_path}  ({len(rows)} candidates)")


# ── main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Cross-DB candidate OL status report")
    parser.add_argument("--out", default=None, help="Output .xlsx path")
    args = parser.parse_args()

    out_path = (
        Path(args.out) if args.out
        else Path(__file__).parent.parent / "exports" /
             f"ol_candidate_status_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    )

    print("Connecting to MRR PostgreSQL…")
    pg = get_pg_conn()
    mrr_rows = fetch_mrr_candidates(pg)
    pg.close()
    print(f"  Fetched {len(mrr_rows)} candidates from MRR.")

    print("Connecting to OL MySQL…")
    ol = get_ol_conn()
    print(f"  Looking up {len(mrr_rows)} emails in OL (this may take a moment)…")
    enriched = enrich_with_ol(mrr_rows, ol)
    ol.close()

    found    = sum(1 for r in enriched if r.get("ol_user_id"))
    not_found = len(enriched) - found
    print(f"  OL match: {found} found, {not_found} not found in OL.")

    build_excel(enriched, out_path)


if __name__ == "__main__":
    main()
