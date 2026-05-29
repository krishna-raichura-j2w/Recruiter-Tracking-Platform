"""
Report: Today's DL-Verified candidates from Mehr's pod
- Reads consultant_mails.dl_verified_at (proper timestamp) for today
- Filters by Mehr's pod (pod_id=1 OR pod name ILIKE 'mehr')
- Checks each candidate+job against OL MySQL applied_jobs table
- Outputs HTML report
"""

import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import psycopg2
import pymysql
from datetime import date
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env'))

PG_DSN  = os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL")
OL_HOST = os.getenv("OL_REPLICA_HOST")
OL_PORT = int(os.getenv("OL_REPLICA_PORT", 3306))
OL_DB   = os.getenv("OL_REPLICA_DATABASE", "offerletter")
OL_USER = os.getenv("OL_REPLICA_USER")
OL_PASS = os.getenv("OL_REPLICA_PASSWORD")

TODAY = date.today().isoformat()

# ── 1. Find Mehr's pod IDs ────────────────────────────────────────────────────
pg = psycopg2.connect(PG_DSN)
cur = pg.cursor()

cur.execute("SELECT id, name FROM pods WHERE name ILIKE '%mehr%'")
mehr_pods = cur.fetchall()
if not mehr_pods:
    print("ERROR: No pod found with 'mehr' in the name.")
    sys.exit(1)

mehr_pod_ids = [r[0] for r in mehr_pods]
print(f"Mehr's pod(s): {mehr_pods}")

# ── 2. Query today's DL-verified candidates in Mehr's pod ────────────────────
cur.execute("""
    SELECT
        c.id                                                        AS candidate_id,
        TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,''))
                                                                    AS candidate_name,
        c.email                                                     AS candidate_email,
        cm.dl_verified_at                                           AS dl_verified_at,
        j.id                                                        AS pg_job_id,
        j.job_id                                                    AS ol_job_posting_id,
        j.role_title                                                AS job_title,
        j.client_name                                               AS client_name,
        u.name                                                      AS delivery_lead,
        p.name                                                      AS pod_name
    FROM consultant_mails cm
    JOIN candidates c         ON c.id = cm.candidate_id
    JOIN submissions s        ON s.candidate_id = c.id
    JOIN jobs j               ON j.id = s.job_id
    JOIN users u              ON u.id = s.delivery_lead_id
    LEFT JOIN pods p          ON p.id = u.pod_id
    WHERE cm.dl_verified = true
      AND DATE(cm.dl_verified_at) = %s
      AND u.pod_id = ANY(%s)
    ORDER BY cm.dl_verified_at DESC
""", (TODAY, mehr_pod_ids))

rows = cur.fetchall()
cols = [d[0] for d in cur.description]
candidates = [dict(zip(cols, r)) for r in rows]

cur.close()
pg.close()

print(f"\nFound {len(candidates)} DL-verified today ({TODAY}) in Mehr's pod")

# ── 3. Check OL MySQL for each candidate ─────────────────────────────────────
def check_ol(email, ol_job_posting_id):
    if not email:
        return "N/A", "No candidate email"
    if not ol_job_posting_id:
        return "N/A", "No OL job posting ID on this job"
    try:
        conn = pymysql.connect(
            host=OL_HOST, port=OL_PORT, db=OL_DB,
            user=OL_USER, password=OL_PASS,
            connect_timeout=6, read_timeout=6
        )
        with conn.cursor() as c:
            c.execute("""
                SELECT IF(COUNT(*) > 0, 'YES', 'NO') AS is_mapped
                FROM applied_jobs aj
                JOIN users u ON u.id = aj.user_id
                WHERE u.email = %s
                  AND aj.job_posting_id = %s
            """, (email, ol_job_posting_id))
            result = c.fetchone()
        conn.close()
        return result[0], ""
    except Exception as e:
        return "ERROR", str(e)[:80]

for c in candidates:
    c["ol_mapped"], c["ol_error"] = check_ol(c["candidate_email"], c["ol_job_posting_id"])

# ── 4. Build HTML ─────────────────────────────────────────────────────────────
yes_count = sum(1 for c in candidates if c["ol_mapped"] == "YES")
no_count  = sum(1 for c in candidates if c["ol_mapped"] == "NO")
na_count  = sum(1 for c in candidates if c["ol_mapped"] == "N/A")
err_count = sum(1 for c in candidates if c["ol_mapped"] == "ERROR")

BADGE = {
    "YES":   ("background:#dcfce7;color:#15803d;border:1px solid #bbf7d0", "✅ YES"),
    "NO":    ("background:#fee2e2;color:#b91c1c;border:1px solid #fecaca", "❌ NO"),
    "N/A":   ("background:#f1f5f9;color:#64748b;border:1px solid #e2e8f0", "— N/A"),
    "ERROR": ("background:#fef3c7;color:#b45309;border:1px solid #fde68a", "⚠️ ERR"),
}

rows_html = ""
for i, c in enumerate(candidates, 1):
    style, label = BADGE.get(c["ol_mapped"], ("", c["ol_mapped"]))
    err_html = f'<div style="font-size:10px;color:#dc2626;margin-top:3px;">{c["ol_error"]}</div>' if c["ol_error"] else ""
    ts = str(c["dl_verified_at"])[:16] if c["dl_verified_at"] else "—"
    rows_html += f"""
    <tr>
      <td style="color:#94a3b8;font-size:12px;">{i}</td>
      <td><strong>{c["candidate_name"] or "—"}</strong></td>
      <td style="font-size:12px;color:#475569;">{c["candidate_email"] or "—"}</td>
      <td>{c["client_name"] or "—"}</td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;">{c["job_title"] or "—"}</td>
      <td style="text-align:right;font-size:12px;">{c["pg_job_id"]}</td>
      <td style="text-align:right;font-size:12px;">{c["ol_job_posting_id"] or "—"}</td>
      <td style="font-size:12px;">{c["delivery_lead"] or "—"}</td>
      <td style="font-size:12px;">{c["pod_name"] or "—"}</td>
      <td style="text-align:center;font-size:12px;color:#64748b;">{ts}</td>
      <td style="text-align:center;">
        <span style="padding:3px 10px;border-radius:99px;font-size:12px;font-weight:700;{style}">{label}</span>
        {err_html}
      </td>
    </tr>"""

no_data_row = '<tr><td colspan="11" style="text-align:center;padding:40px;color:#94a3b8;font-style:italic;">No DL-verified candidates found today in Mehr\'s pod</td></tr>'

html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>DL Verified — Mehr's Pod — {TODAY}</title>
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: system-ui,-apple-system,sans-serif; background:#f0f4f8; padding:32px; color:#1e293b; font-size:14px; }}
  h1 {{ font-size:20px; font-weight:900; margin-bottom:4px; }}
  .sub {{ font-size:13px; color:#64748b; margin-bottom:24px; }}
  .summary {{ display:flex; gap:14px; margin-bottom:28px; flex-wrap:wrap; }}
  .kpi {{ background:#fff; border:1px solid #e2e8f0; border-radius:14px; padding:14px 22px;
          box-shadow:0 1px 3px rgba(0,0,0,.04); }}
  .kpi-label {{ font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:.06em; margin-bottom:4px; }}
  .kpi-value {{ font-size:30px; font-weight:900; line-height:1; }}
  .wrap {{ background:#fff; border-radius:16px; border:1px solid #e2e8f0;
           box-shadow:0 1px 4px rgba(0,0,0,.05); overflow:hidden; }}
  table {{ width:100%; border-collapse:collapse; }}
  thead th {{ background:#f8fafc; padding:10px 14px; text-align:left; font-size:11px;
              font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:.05em;
              border-bottom:2px solid #e2e8f0; white-space:nowrap; }}
  tbody td {{ padding:9px 14px; border-bottom:1px solid #f1f5f9; white-space:nowrap; }}
  tbody tr:last-child td {{ border-bottom:none; }}
  tbody tr:hover td {{ background:#f8fafc; }}
  .legend {{ margin-top:20px; font-size:11px; color:#94a3b8; }}
</style>
</head>
<body>

<h1>🔍 DL Verified Candidates — Mehr's Pod</h1>
<div class="sub">
  Date: <strong>{TODAY}</strong> &nbsp;·&nbsp;
  Pod: <strong>{", ".join(r[1] for r in mehr_pods)}</strong> &nbsp;·&nbsp;
  Total verified today: <strong>{len(candidates)}</strong>
</div>

<div class="summary">
  <div class="kpi">
    <div class="kpi-label">Total DL Verified</div>
    <div class="kpi-value" style="color:#2563eb;">{len(candidates)}</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Mapped in OL DB</div>
    <div class="kpi-value" style="color:#16a34a;">{yes_count}</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">NOT in OL DB</div>
    <div class="kpi-value" style="color:#dc2626;">{no_count}</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">No OL Job ID</div>
    <div class="kpi-value" style="color:#64748b;">{na_count}</div>
  </div>
  {"" if not err_count else f'<div class="kpi"><div class="kpi-label">OL Errors</div><div class="kpi-value" style="color:#d97706;">{err_count}</div></div>'}
</div>

<div class="wrap">
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Candidate Name</th>
        <th>Email</th>
        <th>Client</th>
        <th>Job Title</th>
        <th style="text-align:right;">PG Job ID</th>
        <th style="text-align:right;">OL Job Posting ID</th>
        <th>Delivery Lead</th>
        <th>Pod</th>
        <th style="text-align:center;">DL Verified At</th>
        <th style="text-align:center;">In OL DB?</th>
      </tr>
    </thead>
    <tbody>
      {rows_html if rows_html else no_data_row}
    </tbody>
  </table>
</div>

<div class="legend">
  ✅ YES = candidate email + OL job_posting_id found in applied_jobs &nbsp;|&nbsp;
  ❌ NO = not mapped &nbsp;|&nbsp;
  — N/A = job has no OL job_posting_id or candidate has no email &nbsp;|&nbsp;
  PG Job ID = postgres jobs.id &nbsp;|&nbsp;
  OL Job Posting ID = jobs.job_id (OL system reference)
</div>

</body>
</html>"""

out_path = os.path.join(os.path.dirname(__file__), f"mehr_dl_verified_{TODAY}.html")
with open(out_path, "w") as f:
    f.write(html)

print(f"\nReport → {out_path}")
print(f"Summary: ✅ {yes_count} in OL  |  ❌ {no_count} not in OL  |  — {na_count} no OL ID  |  ⚠️ {err_count} errors\n")
for c in candidates:
    print(f"  [{c['ol_mapped']:>5}]  {(c['candidate_name'] or '—'):<32}  {(c['candidate_email'] or '—'):<38}  OL_job={c['ol_job_posting_id']}")
