#!/usr/bin/env python3
"""
Look up candidate_work_flow_statuses for a user by email from the OL Replica DB.

Usage:
    python scripts/ol_workflow_lookup.py <email>
    python scripts/ol_workflow_lookup.py ramesh.venkataraman2910@gmail.com
"""
import os
import sys
from pathlib import Path

# Load .env from backend root so OL_REPLICA_* vars are available
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


def get_conn() -> pymysql.connections.Connection:
    host     = os.environ.get("OL_REPLICA_HOST", "")
    port     = int(os.environ.get("OL_REPLICA_PORT", "3306"))
    user     = os.environ.get("OL_REPLICA_USER", "")
    password = os.environ.get("OL_REPLICA_PASSWORD", "")
    database = os.environ.get("OL_REPLICA_DATABASE", "offerletter")

    missing = [k for k, v in {
        "OL_REPLICA_HOST": host, "OL_REPLICA_USER": user,
        "OL_REPLICA_PASSWORD": password,
    }.items() if not v]
    if missing:
        print(f"[error] Missing env vars: {', '.join(missing)}")
        sys.exit(1)

    return pymysql.connect(
        host=host, port=port, user=user, password=password,
        database=database, charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        connect_timeout=10,
    )


QUERY = """
SELECT cws.*
FROM users u
JOIN candidate_work_flow_statuses cws
    ON u.id = cws.user_id
WHERE u.email = %s
"""


def print_row(row: dict) -> None:
    col_width = max(len(k) for k in row) + 2
    for key, val in row.items():
        print(f"  {key:<{col_width}} {val}")


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python scripts/ol_workflow_lookup.py <email>")
        print("Example: python scripts/ol_workflow_lookup.py user@example.com")
        sys.exit(1)

    email = sys.argv[1].strip()
    print(f"\nConnecting to OL Replica DB...")

    try:
        conn = get_conn()
    except Exception as e:
        print(f"[error] Could not connect: {e}")
        sys.exit(1)

    try:
        with conn.cursor() as cur:
            cur.execute(QUERY, (email,))
            rows = cur.fetchall()
    finally:
        conn.close()

    if not rows:
        print(f"\nNo workflow records found for: {email}")
        return

    print(f"\nFound {len(rows)} record(s) for: {email}\n")
    print("=" * 70)
    for i, row in enumerate(rows, 1):
        print(f"\n--- Record {i} ---")
        print_row(row)
    print("\n" + "=" * 70)


if __name__ == "__main__":
    main()
