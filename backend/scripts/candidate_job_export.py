#!/usr/bin/env python3
"""
Export candidate emails with their associated OL job_ids from MRR database.

Joins candidates → jobs to produce: email, job_id (OL), client_name, role_title.
Outputs to both console and a timestamped CSV in the exports/ directory.

Usage:
    python scripts/candidate_job_export.py
    python scripts/candidate_job_export.py --client "mercedes benz"
    python scripts/candidate_job_export.py --csv-only
"""
import os
import sys
import csv
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

import psycopg2
import psycopg2.extras


def get_pg_conn():
    url = os.environ.get("DATABASE_URL", "") or os.environ.get("SUPABASE_DB_URL", "")
    if not url:
        print("[error] No DATABASE_URL found in env.")
        sys.exit(1)
    return psycopg2.connect(url, cursor_factory=psycopg2.extras.RealDictCursor)


def main():
    parser = argparse.ArgumentParser(description="Export candidate emails with OL job_ids")
    parser.add_argument("--client", type=str, default=None,
                        help="Filter by client/company name (case-insensitive partial match)")
    parser.add_argument("--csv-only", action="store_true",
                        help="Skip console output, only write CSV")
    args = parser.parse_args()

    now = datetime.now(timezone.utc)

    conn = get_pg_conn()
    try:
        cur = conn.cursor()

        query = """
            SELECT
                c.email,
                j.job_id,
                j.client_name,
                j.role_title,
                j.status AS job_status
            FROM candidates c
            JOIN jobs j ON j.id = c.job_id
            WHERE c.email IS NOT NULL AND c.email != ''
        """
        params = []

        if args.client:
            query += " AND j.client_name ILIKE %s"
            params.append(f"%{args.client}%")

        query += " ORDER BY j.client_name, j.job_id, c.email"

        cur.execute(query, params)
        rows = cur.fetchall()
    finally:
        conn.close()

    if not rows:
        print("No records found.")
        return

    # ── Console output ───────────────────────────────────────────────────
    if not args.csv_only:
        print(f"Run time  : {now.strftime('%Y-%m-%d %H:%M:%S')} UTC")
        if args.client:
            print(f"Filter    : client_name LIKE '%{args.client}%'")
        print(f"Total rows: {len(rows)}")
        print("=" * 90)
        print(f"{'Email':<40s} {'Job ID':<10s} {'Client':<20s} {'Role'}")
        print("-" * 90)
        for r in rows:
            print(f"{r['email']:<40s} {str(r['job_id'] or '-'):<10s} {(r['client_name'] or '-'):<20s} {r['role_title'] or '-'}")
        print("=" * 90)

    # ── CSV export ───────────────────────────────────────────────────────
    exports_dir = Path(__file__).parent.parent / "exports"
    exports_dir.mkdir(exist_ok=True)

    ts = now.strftime("%Y%m%d_%H%M%S")
    suffix = f"_{args.client.replace(' ', '_').lower()}" if args.client else ""
    csv_path = exports_dir / f"candidate_jobs{suffix}_{ts}.csv"

    with open(csv_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["email", "job_id", "client_name", "role_title", "job_status"])
        writer.writeheader()
        writer.writerows(rows)

    print(f"\nCSV exported: {csv_path}  ({len(rows)} rows)")


if __name__ == "__main__":
    main()
