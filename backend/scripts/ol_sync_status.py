#!/usr/bin/env python3
"""
Bulk-sync candidate interview stages from OL → MRR PostgreSQL.

Strategy:
  1. Query OL applied_jobs updated in the last 24 hours (or --hours N)
  2. For each OL candidate email, check if they exist in MRR candidates
  3. If they have a submission, map OL current_step → MRR InterviewStage
  4. UPDATE submissions.current_stage + updated_at (only if stage changed)
  5. INSERT submission_timeline row with timestamp (audit trail)

Usage:
    python scripts/ol_sync_status.py              # last 24 hours (default)
    python scripts/ol_sync_status.py --hours 48   # last 48 hours
    python scripts/ol_sync_status.py --email shivaraj.gowda4@gmail.com  # single candidate
"""
import os
import sys
import argparse
from datetime import datetime, timezone
from pathlib import Path

env_file = Path(__file__).parent.parent / ".env"
if env_file.exists():
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        val = val.strip().strip("'\"")
        os.environ.setdefault(key.strip(), val)

import pymysql
import pymysql.cursors
import psycopg2
import psycopg2.extras


# ---------------------------------------------------------------------------
# DB connections
# ---------------------------------------------------------------------------

def _fix_pg_url(url: str) -> str:
    scheme_end = url.index("://") + 3
    if url[scheme_end:].count("@") <= 1:
        return url
    last_at = url.rfind("@")
    credentials = url[scheme_end:last_at]
    host_part = url[last_at + 1:]
    colon_pos = credentials.index(":")
    password = credentials[colon_pos + 1:].replace("@", "%40")
    return f"{url[:scheme_end]}{credentials[:colon_pos]}:{password}@{host_part}"


def get_pg_conn():
    url = os.environ.get("DATABASE_URL", "") or os.environ.get("SUPABASE_DB_URL", "")
    if not url:
        print("[error] No PostgreSQL URL found.")
        sys.exit(1)
    if "sslmode" not in url and "supabase" in url:
        url += "?sslmode=require"
    return psycopg2.connect(_fix_pg_url(url), cursor_factory=psycopg2.extras.RealDictCursor)


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
        print(f"[error] Missing env vars: {', '.join(missing)}")
        sys.exit(1)
    return pymysql.connect(
        host=host, port=port, user=user, password=password,
        database=database, charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        connect_timeout=10, read_timeout=30,
    )


# ---------------------------------------------------------------------------
# OL stage → MRR InterviewStage mapping
# ---------------------------------------------------------------------------

def map_ol_to_interview_stage(workflow_step: str, stage: str) -> str:
    step = (workflow_step or "").lower()
    stg  = (stage or "").lower()

    if "joined" in step:
        return "joined"
    if "no show" in step or "no-show" in step:
        return "no_show"

    if "offer" in stg or "offer" in step:
        if "accept" in step:
            return "offer_accepted"
        if "decline" in step or "reject" in step:
            return "offer_declined"
        return "offer_rolled_out"

    if "final" in step:
        if "reject" in step or "fail" in step:
            return "final_rejected"
        if "clear" in step or "pass" in step or "select" in step:
            return "final_cleared"
        if "pending" in step:
            return "final_feedback_pending"
        return "final_scheduled"

    if "l2" in step:
        if "reject" in step or "fail" in step:
            return "l2_rejected"
        if "clear" in step or "pass" in step or "select" in step:
            return "l2_cleared"
        if "pending" in step:
            return "l2_feedback_pending"
        return "l2_scheduled"

    if "l1" in step:
        if "reject" in step or "fail" in step:
            return "l1_rejected"
        if "clear" in step or "pass" in step or "select" in step:
            return "l1_cleared"
        if "pending" in step:
            return "l1_feedback_pending"
        return "l1_scheduled"

    if "shortlist" in step:
        return "shortlisted"

    if "hm" in step or "hiring manager" in step:
        if "reject" in step:
            return "hm_rejected"
        return "hm_review"

    if ("ta " in step or step.startswith("ta") or "tech assess" in step) and "reject" in step:
        return "ta_rejected"

    return "submitted"


# ---------------------------------------------------------------------------
# Fetch recently updated OL applications
# ---------------------------------------------------------------------------

def fetch_ol_recent(hours: int, email_filter: str | None = None) -> list[dict]:
    """
    Returns one row per candidate (most recently updated application only).
    If multiple jobs updated in the window, we take the latest updated_at.
    """
    ol = get_ol_conn()
    try:
        with ol.cursor() as cur:
            if email_filter:
                cur.execute(
                    "SELECT id, CONCAT(first_name, ' ', last_name) AS full_name, email"
                    " FROM users WHERE email = %s LIMIT 1",
                    (email_filter,),
                )
                users = cur.fetchall()
            else:
                # Get distinct users who had an applied_job updated in the window
                cur.execute(f"""
                    SELECT DISTINCT u.id, CONCAT(u.first_name, ' ', u.last_name) AS full_name, u.email
                    FROM applied_jobs aj
                    JOIN users u ON u.id = aj.user_id
                    WHERE aj.updated_at >= NOW() - INTERVAL {int(hours)} HOUR
                      AND u.email IS NOT NULL AND u.email != ''
                """)
                users = cur.fetchall()

            if not users:
                return []

            results = []
            for u in users:
                # For each user, take the most recently updated application in the window
                cur.execute("""
                    SELECT
                        aj.job_posting_id,
                        jp.title         AS job_title,
                        c.company_name   AS client_name,
                        aj.current_step,
                        cwf.workflow_step AS step_name,
                        cwf.stage         AS stage,
                        aj.updated_at    AS last_updated
                    FROM applied_jobs aj
                    JOIN job_postings jp ON jp.id = aj.job_posting_id
                    JOIN clients c       ON c.user_id = jp.client_id
                    LEFT JOIN candidate_work_flows cwf ON cwf.step_id = aj.current_step
                    WHERE aj.user_id = %s
                    ORDER BY aj.updated_at DESC
                    LIMIT 1
                """, (u["id"],))
                latest = cur.fetchone()
                if not latest:
                    continue
                results.append({
                    "ol_id":       u["id"],
                    "ol_name":     (u["full_name"] or "").strip() or u["email"],
                    "email":       u["email"],
                    "job_posting_id": latest["job_posting_id"],
                    "job_title":   latest["job_title"] or "—",
                    "client_name": latest["client_name"] or "—",
                    "current_step": latest["current_step"],
                    "step_name":   latest["step_name"] or "",
                    "stage":       latest["stage"] or "",
                    "last_updated": latest["last_updated"],
                })
            return results
    finally:
        ol.close()


# ---------------------------------------------------------------------------
# Sync one candidate into MRR
# ---------------------------------------------------------------------------

def sync_candidate(pg_cur, row: dict, now: datetime) -> str:
    """
    Returns one of: 'updated', 'no_change', 'no_candidate', 'no_submission'
    """
    email = row["email"]

    pg_cur.execute(
        "SELECT id FROM candidates WHERE email = %s LIMIT 1",
        (email,),
    )
    mrr_cand = pg_cur.fetchone()
    if not mrr_cand:
        return "no_candidate"

    pg_cur.execute(
        "SELECT id, current_stage FROM submissions WHERE candidate_id = %s LIMIT 1",
        (mrr_cand["id"],),
    )
    submission = pg_cur.fetchone()
    if not submission:
        return "no_submission"

    mrr_stage = map_ol_to_interview_stage(row["step_name"], row["stage"])
    if submission["current_stage"] == mrr_stage:
        return "no_change"

    # Update stage + timestamp
    pg_cur.execute(
        "UPDATE submissions SET current_stage = %s, updated_at = %s WHERE id = %s",
        (mrr_stage, now, submission["id"]),
    )

    # Insert timeline entry
    stage_label = (
        f"{row['step_name']}  [{row['stage']}]" if row["stage"] else row["step_name"]
    ) or mrr_stage
    pg_cur.execute(
        """
        INSERT INTO submission_timeline
            (submission_id, stage, stage_label, note, created_at)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (
            submission["id"],
            mrr_stage,
            stage_label,
            f"OL sync: Step {row['current_step']} — {row['step_name']}",
            now,
        ),
    )
    return "updated"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--hours", type=int, default=24,
                        help="Sync candidates updated in last N hours (default: 24)")
    parser.add_argument("--email", type=str, default=None,
                        help="Sync a single candidate by email")
    args = parser.parse_args()

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    if args.email:
        print(f"Mode         : single candidate ({args.email})")
    else:
        print(f"Mode         : bulk — OL updates in last {args.hours} hour(s)")
    print(f"Run time     : {now.strftime('%Y-%m-%d %H:%M:%S')} UTC")
    print("=" * 60)

    # ── Fetch from OL ────────────────────────────────────────────────────────
    ol_rows = fetch_ol_recent(args.hours, email_filter=args.email)
    if not ol_rows:
        print("No OL updates found in the window.")
        return

    print(f"OL candidates with recent updates: {len(ol_rows)}\n")

    # ── Sync into MRR ────────────────────────────────────────────────────────
    counts = {"updated": 0, "no_change": 0, "no_candidate": 0, "no_submission": 0}

    pg = get_pg_conn()
    try:
        with pg.cursor() as cur:
            for row in ol_rows:
                result = sync_candidate(cur, row, now)
                counts[result] += 1

                mrr_stage = map_ol_to_interview_stage(row["step_name"], row["stage"])
                ol_step   = f"Step {row['current_step']} — {row['step_name']}  [{row['stage']}]"

                if result == "updated":
                    status_str = f"UPDATED  → {mrr_stage}"
                elif result == "no_change":
                    status_str = f"no change  (already '{mrr_stage}')"
                elif result == "no_candidate":
                    status_str = "skipped  (not in MRR)"
                else:
                    status_str = "skipped  (no submission row)"

                print(f"  {row['ol_name']:<30}  {status_str}")
                if result in ("updated", "no_change"):
                    print(f"    OL : {ol_step}")
                    print(f"    Job: {row['job_posting_id']} — {row['job_title']} ({row['client_name']})")
                    print(f"    Updated at: {row['last_updated']}")
                print()

        pg.commit()
    finally:
        pg.close()

    print("=" * 60)
    print(f"Updated      : {counts['updated']}")
    print(f"No change    : {counts['no_change']}")
    print(f"Not in MRR   : {counts['no_candidate']}")
    print(f"No submission: {counts['no_submission']}")
    print(f"\nDone. {now.strftime('%Y-%m-%d %H:%M:%S')} UTC")


if __name__ == "__main__":
    main()
