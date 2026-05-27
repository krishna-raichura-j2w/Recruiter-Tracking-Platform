#!/usr/bin/env python3
"""
Backfill is_onboarded / is_benched on all existing candidates.

For each candidate with an email:
  Step 1 — check_onboarded.sql  → YES → is_onboarded=True,  is_benched=False
  Step 2 — check_benched.sql    → YES → is_onboarded=True,  is_benched=True
  Neither                            → is_onboarded=False, is_benched=False

Usage:
    python scripts/backfill_ol_flags.py
    python scripts/backfill_ol_flags.py --dry-run
"""
import os
import sys
import argparse
from pathlib import Path
from urllib.parse import unquote

# ── load .env ─────────────────────────────────────────────────────────────────
env_file = Path(__file__).parent.parent / ".env"
if env_file.exists():
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip().strip("'\""))

import psycopg2
import psycopg2.extras
import pymysql
import pymysql.cursors

# ── SQL files ─────────────────────────────────────────────────────────────────
_DB_DIR = Path(__file__).parent.parent / "db"

def _mrr_sql(name):  return (_DB_DIR / "mrr" / name).read_text().strip()
def _ol_sql(name):   return (_DB_DIR / "ol"  / name).read_text().strip()

SQL_ONBOARDED = _ol_sql("check_onboarded.sql")
SQL_BENCHED   = _ol_sql("check_benched.sql")

SQL_FETCH_CANDIDATES = """
    SELECT id, email FROM candidates
    WHERE email IS NOT NULL AND email != ''
    ORDER BY id
"""

SQL_UPDATE_FLAGS = """
    UPDATE candidates
    SET is_onboarded = %s, is_benched = %s
    WHERE id = %s
"""


# ── DB connections ─────────────────────────────────────────────────────────────

def _pg_conn():
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        sys.exit("ERROR: DATABASE_URL not set.")
    scheme_end = url.index("://") + 3
    if url[scheme_end:].count("@") > 1:
        last_at  = url.rfind("@")
        creds    = url[scheme_end:last_at]
        hostpart = url[last_at + 1:]
        colon    = creds.index(":")
        password = creds[colon + 1:].replace("@", "%40")
        url = f"{url[:scheme_end]}{creds[:colon]}:{password}@{hostpart}"
    return psycopg2.connect(url, cursor_factory=psycopg2.extras.RealDictCursor)


def _ol_conn():
    return pymysql.connect(
        host=os.environ.get("OL_REPLICA_HOST", ""),
        port=int(os.environ.get("OL_REPLICA_PORT", 3306)),
        user=os.environ.get("OL_REPLICA_USER", ""),
        password=os.environ.get("OL_REPLICA_PASSWORD", ""),
        database=os.environ.get("OL_REPLICA_DATABASE", "offerletter"),
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        connect_timeout=15,
        read_timeout=30,
    )


# ── check logic ───────────────────────────────────────────────────────────────

def check_flags(ol_cur, email: str) -> tuple[bool, bool]:
    ol_cur.execute(SQL_ONBOARDED, (email,))
    if (ol_cur.fetchone() or {}).get("is_present") == "YES":
        return True, False

    ol_cur.execute(SQL_BENCHED, (email,))
    if (ol_cur.fetchone() or {}).get("is_present") == "YES":
        return True, True

    return False, False


# ── main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Backfill OL flags on all candidates")
    parser.add_argument("--dry-run", action="store_true", help="Print changes without writing")
    args = parser.parse_args()

    print("Connecting to Postgres…")
    pg = _pg_conn()
    print("Connecting to OL MySQL…")
    ol = _ol_conn()

    try:
        with pg.cursor() as pg_cur:
            pg_cur.execute(SQL_FETCH_CANDIDATES)
            candidates = pg_cur.fetchall()

        print(f"Found {len(candidates)} candidates with email.\n")

        onboarded_count = benched_count = neither_count = 0

        with ol.cursor() as ol_cur:
            for i, cand in enumerate(candidates, 1):
                cid   = cand["id"]
                email = cand["email"]

                is_onboarded, is_benched = check_flags(ol_cur, email)

                if is_onboarded and not is_benched:
                    label = "ONBOARDED"
                    onboarded_count += 1
                elif is_onboarded and is_benched:
                    label = "BENCHED"
                    benched_count += 1
                else:
                    label = "—"
                    neither_count += 1

                print(f"[{i}/{len(candidates)}] id={cid:>5}  {label:<10}  {email}")

                if not args.dry_run:
                    with pg.cursor() as upd:
                        upd.execute(SQL_UPDATE_FLAGS, (is_onboarded, is_benched, cid))
                    pg.commit()

        print(f"\n{'DRY RUN — no changes written' if args.dry_run else 'Done.'}")
        print(f"  Onboarded : {onboarded_count}")
        print(f"  Benched   : {benched_count}")
        print(f"  Neither   : {neither_count}")
        print(f"  Total     : {len(candidates)}")

    finally:
        pg.close()
        ol.close()


if __name__ == "__main__":
    main()
