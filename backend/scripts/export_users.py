#!/usr/bin/env python3
"""
Export all users from the MRR database to an Excel file.

Columns: ID, Name, Email, Role, Pod Name, Pod BH, Reports To, Active?, Created At

Usage:
    python scripts/export_users.py
    python scripts/export_users.py --out /tmp/users.xlsx
"""
import os
import sys
import argparse
from datetime import datetime
from pathlib import Path

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

try:
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter
except ImportError:
    print("Installing openpyxl…")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "openpyxl", "-q"])
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter


# ── DB ────────────────────────────────────────────────────────────────────────

def get_db_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("ERROR: DATABASE_URL not set in environment / .env")
    return url


def _parse_url(url: str) -> dict:
    """Parse postgres DSN, handling passwords that contain '@'."""
    from urllib.parse import urlparse, unquote
    # Replace scheme so urlparse handles it
    p = urlparse(url)
    # netloc may be wrong if password has '@'; re-split from the right
    # Format: user:password@host:port
    userinfo, _, hostinfo = url[len(p.scheme) + 3:].rpartition("@")
    host_port, _, dbname = hostinfo.partition("/")
    dbname = dbname.split("?")[0]
    host, _, port = host_port.partition(":")
    user, _, password = userinfo.partition(":")
    return {
        "host": host,
        "port": int(port) if port else 5432,
        "dbname": dbname,
        "user": unquote(user),
        "password": unquote(password),
        "connect_timeout": 15,
        "sslmode": "require" if "supabase" in host else "prefer",
    }


def fetch_users(url: str) -> list[dict]:
    conn = psycopg2.connect(**_parse_url(url))
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    u.id,
                    u.name,
                    u.email,
                    u.role,
                    u.secondary_role,
                    u.recruiter_type,
                    u.is_active,
                    p.name           AS pod_name,
                    bh.name          AS pod_bh_name,
                    parent.name      AS parent_user_name,
                    parent.role      AS parent_user_role,
                    u.created_at
                FROM users u
                LEFT JOIN pods p        ON p.id   = u.pod_id
                LEFT JOIN users bh      ON bh.id  = p.bh_user_id
                LEFT JOIN users parent  ON parent.id = u.parent_user_id
                ORDER BY u.role, u.name
            """)
            cols = [d[0] for d in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]
    finally:
        conn.close()


# ── Excel ─────────────────────────────────────────────────────────────────────

HEADER_FILL  = PatternFill("solid", fgColor="1E3A8A")
ALT_FILL     = PatternFill("solid", fgColor="EFF6FF")
WHITE_FILL   = PatternFill("solid", fgColor="FFFFFF")
HEADER_FONT  = Font(bold=True, color="FFFFFF", size=11)
THIN         = Side(style="thin", color="CBD5E1")
BORDER       = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
CENTER       = Alignment(horizontal="center", vertical="center", wrap_text=True)
LEFT_ALIGN   = Alignment(horizontal="left",   vertical="center", wrap_text=True)

ROLE_COLORS = {
    "admin":         "FEE2E2",
    "bh":            "D1FAE5",
    "kam":           "EDE9FE",
    "delivery_lead": "FEF3C7",
    "recruiter":     "DBEAFE",
    "coo":           "E0F2FE",
    "hrbp":          "FCE7F3",
    "ops_head":      "F3F4F6",
}

ROLE_LABELS = {
    "admin":         "Admin",
    "bh":            "Business Head",
    "kam":           "KAM",
    "delivery_lead": "Delivery Lead",
    "recruiter":     "Recruiter",
    "coo":           "COO",
    "hrbp":          "HRBP",
    "ops_head":      "Ops Head",
}


def build_excel(users: list[dict], out_path: Path):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "All Users"

    # title
    ws.merge_cells("A1:K1")
    tc = ws["A1"]
    tc.value = f"J2W — User Directory   (exported {datetime.now().strftime('%d %b %Y, %H:%M')})"
    tc.font  = Font(bold=True, size=13, color="1E3A8A")
    tc.alignment = CENTER
    ws.row_dimensions[1].height = 30

    # headers
    headers = [
        "User ID", "Name", "Email", "Role", "Recruiter Type",
        "Pod Name", "Pod Business Head", "Reports To", "Reports To Role",
        "Active?", "Created At",
    ]
    for col, h in enumerate(headers, 1):
        cell = ws.cell(row=2, column=col, value=h)
        cell.font      = HEADER_FONT
        cell.fill      = HEADER_FILL
        cell.alignment = CENTER
        cell.border    = BORDER
    ws.row_dimensions[2].height = 22
    ws.freeze_panes = "A3"

    # data
    for ri, u in enumerate(users, 3):
        role_key   = (u.get("role") or "").lower()
        role_label = ROLE_LABELS.get(role_key, u.get("role") or "")
        if u.get("secondary_role"):
            role_label += f" / {ROLE_LABELS.get(u['secondary_role'], u['secondary_role'])}"

        rec_type = (u.get("recruiter_type") or "").capitalize() if role_key == "recruiter" else "—"
        created  = u["created_at"].strftime("%d %b %Y") if u.get("created_at") else "—"
        parent_role = ROLE_LABELS.get((u.get("parent_user_role") or "").lower(), u.get("parent_user_role") or "")
        fill = ALT_FILL if ri % 2 == 0 else WHITE_FILL

        row_data = [
            u["id"],
            u["name"],
            u["email"] or "—",
            role_label,
            rec_type,
            u.get("pod_name") or "—",
            u.get("pod_bh_name") or "—",
            u.get("parent_user_name") or "—",
            parent_role or "—",
            "Yes" if u.get("is_active") else "No",
            created,
        ]

        for col, val in enumerate(row_data, 1):
            cell = ws.cell(row=ri, column=col, value=val)
            cell.border    = BORDER
            cell.alignment = LEFT_ALIGN

            if col == 4:  # Role — colour badge
                cell.fill = PatternFill("solid", fgColor=ROLE_COLORS.get(role_key, "F8FAFC"))
                cell.font = Font(bold=True, size=10)
            elif col == 10:  # Active
                cell.alignment = CENTER
                active = val == "Yes"
                cell.fill = PatternFill("solid", fgColor="DCFCE7" if active else "FEE2E2")
                cell.font = Font(bold=True, size=10, color="166534" if active else "991B1B")
            elif col in (1, 2):
                cell.fill = fill
                cell.font = Font(bold=True, size=10)
            else:
                cell.fill = fill
                cell.font = Font(size=10)

        ws.row_dimensions[ri].height = 18

    # column widths
    for i, w in enumerate([8, 26, 34, 22, 15, 22, 22, 22, 16, 9, 14], 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    # ── Summary sheet ──────────────────────────────────────────────────────────
    from collections import Counter
    ws2 = wb.create_sheet("Summary")

    ws2.merge_cells("A1:B1")
    ws2["A1"].value     = "Users by Role"
    ws2["A1"].font      = Font(bold=True, size=12, color="1E3A8A")
    ws2["A1"].alignment = CENTER
    ws2.row_dimensions[1].height = 26

    for c, h in enumerate(["Role", "Count"], 1):
        cell = ws2.cell(row=2, column=c, value=h)
        cell.font = HEADER_FONT; cell.fill = HEADER_FILL
        cell.border = BORDER;    cell.alignment = CENTER

    role_counts = Counter(
        ROLE_LABELS.get((u.get("role") or "").lower(), u.get("role") or "Unknown")
        for u in users
    )
    for ri, (role, cnt) in enumerate(sorted(role_counts.items()), 3):
        c1 = ws2.cell(row=ri, column=1, value=role)
        c2 = ws2.cell(row=ri, column=2, value=cnt)
        for c in (c1, c2):
            c.border = BORDER; c.font = Font(size=10)
        c2.alignment = CENTER
        fill_color = next(
            (ROLE_COLORS[k] for k, v in ROLE_LABELS.items() if v == role),
            "F8FAFC"
        )
        c1.fill = PatternFill("solid", fgColor=fill_color)

    total_row = 3 + len(role_counts)
    ws2.cell(row=total_row, column=1, value="TOTAL").font = Font(bold=True, size=10)
    ws2.cell(row=total_row, column=2, value=len(users)).font = Font(bold=True, size=10)
    for c in (ws2.cell(row=total_row, column=1), ws2.cell(row=total_row, column=2)):
        c.border = BORDER
    ws2.cell(row=total_row, column=2).alignment = CENTER

    ws2.column_dimensions["A"].width = 20
    ws2.column_dimensions["B"].width = 10

    out_path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out_path)
    print(f"✅  Saved → {out_path}  ({len(users)} users)")


# ── main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Export all users to Excel")
    parser.add_argument("--out", default=None, help="Output .xlsx path")
    args = parser.parse_args()

    out_path = (
        Path(args.out) if args.out
        else Path(__file__).parent.parent / "exports" / f"users_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    )

    print("Connecting to database…")
    users = fetch_users(get_db_url())
    print(f"Fetched {len(users)} users.")
    build_excel(users, out_path)


if __name__ == "__main__":
    main()
