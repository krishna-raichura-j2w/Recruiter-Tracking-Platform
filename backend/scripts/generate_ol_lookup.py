#!/usr/bin/env python3
"""
Generate a self-contained HTML file that lets you search candidates
and see their full OL (OfferLetter) application data.

Steps at generation time:
  1. Fetch all candidates from MRR PostgreSQL
  2. For each email → look up OL MySQL users table → get user_id
  3. Fetch all applied_jobs rows for that user_id (with job title, client, step)
  4. Embed everything as JSON into a single HTML file

Usage:
    python scripts/generate_ol_lookup.py
    python scripts/generate_ol_lookup.py --out /tmp/ol_lookup.html
"""
import os, sys, json, argparse
from datetime import datetime, date
from pathlib import Path
from urllib.parse import unquote

env_file = Path(__file__).parent.parent / ".env"
if env_file.exists():
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line: continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip().strip("'\""))

import psycopg2, psycopg2.extras
import pymysql, pymysql.cursors


# ── connections ───────────────────────────────────────────────────────────────

def get_pg_conn():
    url = os.environ.get("DATABASE_URL", "")
    if not url: sys.exit("ERROR: DATABASE_URL not set.")
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
    return pymysql.connect(
        host=os.environ.get("OL_REPLICA_HOST",""),
        port=int(os.environ.get("OL_REPLICA_PORT", 3306)),
        user=os.environ.get("OL_REPLICA_USER",""),
        password=os.environ.get("OL_REPLICA_PASSWORD",""),
        database=os.environ.get("OL_REPLICA_DATABASE","offerletter"),
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        connect_timeout=15, read_timeout=60,
    )


# ── fetch MRR candidates ──────────────────────────────────────────────────────

def fetch_mrr_candidates(pg) -> list[dict]:
    with pg.cursor() as cur:
        cur.execute("""
            SELECT
                c.id           AS mrr_id,
                c.full_name    AS name,
                c.email,
                c.mobile,
                c.status       AS mrr_status,
                c.sourced_at,
                j.id           AS mrr_job_id,
                j.job_id       AS ol_job_id,
                j.client_name,
                j.role_title,
                r.name         AS recruiter_name,
                s.current_stage,
                s.submitted_at
            FROM candidates c
            JOIN jobs j        ON j.id = c.job_id
            LEFT JOIN users r  ON r.id = c.sourced_by_id
            LEFT JOIN submissions s ON s.candidate_id = c.id
            WHERE c.email IS NOT NULL AND c.email != ''
            ORDER BY c.full_name
        """)
        rows = cur.fetchall()
    # serialize datetimes
    result = []
    for row in rows:
        d = dict(row)
        for k, v in d.items():
            if isinstance(v, (datetime, date)):
                d[k] = v.strftime("%d %b %Y %H:%M") if isinstance(v, datetime) else v.strftime("%d %b %Y")
        result.append(d)
    return result


# ── fetch OL data per email ───────────────────────────────────────────────────

def fetch_ol_data(ol, candidates: list[dict]) -> dict:
    """Returns { email: { user: {...}, applied_jobs: [...] } }"""
    result = {}
    with ol.cursor() as cur:
        for i, cand in enumerate(candidates):
            email = cand.get("email", "")
            if not email:
                continue
            if (i + 1) % 50 == 0:
                print(f"  OL lookup: {i+1}/{len(candidates)}…")

            # find OL user
            cur.execute("""
                SELECT id, CONCAT(first_name,' ',COALESCE(middle_name,''),' ',last_name) AS full_name,
                       email, role_id, type, reporting_to,
                       official_mail_id, mrr_candidate_id, created_at, confirmed_at
                FROM users WHERE email = %s LIMIT 1
            """, (email,))
            ol_user = cur.fetchone()

            if not ol_user:
                result[email] = {"user": None, "applied_jobs": []}
                continue

            uid = ol_user["id"]
            ol_user_clean = {}
            for k, v in ol_user.items():
                ol_user_clean[k] = v.strftime("%d %b %Y %H:%M") if isinstance(v, (datetime, date)) else v

            # fetch all applied_jobs for this user
            cur.execute("""
                SELECT
                    aj.id,
                    aj.job_posting_id,
                    jp.title           AS job_title,
                    cl.company_name    AS client_name,
                    aj.status          AS application_status,
                    aj.current_step,
                    cwf.workflow_step  AS step_name,
                    cwf.stage          AS step_stage,
                    aj.prev_step,
                    aj.note,
                    aj.self_applied,
                    aj.created_at,
                    aj.updated_at
                FROM applied_jobs aj
                LEFT JOIN job_postings jp   ON jp.id = aj.job_posting_id
                LEFT JOIN clients cl        ON cl.user_id = jp.client_id
                LEFT JOIN candidate_work_flows cwf ON cwf.step_id = aj.current_step
                WHERE aj.user_id = %s
                ORDER BY aj.updated_at DESC
            """, (uid,))
            jobs = cur.fetchall()

            jobs_clean = []
            for job in jobs:
                jd = dict(job)
                for k, v in jd.items():
                    if isinstance(v, (datetime, date)):
                        jd[k] = v.strftime("%d %b %Y %H:%M") if isinstance(v, datetime) else v.strftime("%d %b %Y")
                    elif v is None:
                        jd[k] = ""
                jobs_clean.append(jd)

            result[email] = {"user": ol_user_clean, "applied_jobs": jobs_clean}

    return result


# ── HTML template ─────────────────────────────────────────────────────────────

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>OL Candidate Lookup</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         background: #f1f5f9; color: #1e293b; height: 100vh; display: flex; flex-direction: column; }
  /* Header */
  .header { background: linear-gradient(135deg,#1e3a8a,#3b82f6);
             padding: 14px 24px; display: flex; align-items: center;
             justify-content: space-between; flex-shrink: 0; }
  .header h1 { color: #fff; font-size: 16px; font-weight: 700; letter-spacing: 0.02em; }
  .header .meta { color: rgba(255,255,255,0.65); font-size: 12px; }
  /* Layout */
  .layout { display: flex; flex: 1; overflow: hidden; }
  /* Left panel */
  .left { width: 320px; flex-shrink: 0; background: #fff;
           border-right: 1px solid #e2e8f0; display: flex; flex-direction: column; }
  .search-wrap { padding: 12px; border-bottom: 1px solid #f1f5f9; }
  .search-wrap input { width: 100%; padding: 8px 12px; border: 1px solid #e2e8f0;
    border-radius: 8px; font-size: 13px; outline: none; background: #f8fafc; }
  .search-wrap input:focus { border-color: #3b82f6; background: #fff; }
  .count-bar { padding: 6px 12px 0; font-size: 11px; color: #94a3b8; }
  .list { flex: 1; overflow-y: auto; }
  .cand-item { padding: 10px 14px; border-bottom: 1px solid #f1f5f9;
               cursor: pointer; transition: background 0.1s; }
  .cand-item:hover { background: #eff6ff; }
  .cand-item.active { background: #eff6ff; border-left: 3px solid #3b82f6; }
  .cand-item .cname { font-weight: 600; font-size: 13px; color: #1e293b; }
  .cand-item .cemail { font-size: 11px; color: #64748b; margin-top: 2px; }
  .cand-item .ctag { display: inline-block; margin-top: 4px; font-size: 10px;
                     font-weight: 700; padding: 1px 7px; border-radius: 20px; }
  /* Right panel */
  .right { flex: 1; overflow-y: auto; padding: 20px 24px; }
  .placeholder { display: flex; flex-direction: column; align-items: center;
                 justify-content: center; height: 100%; gap: 12px; opacity: 0.5; }
  .placeholder svg { width: 64px; height: 64px; stroke: #94a3b8; }
  .placeholder p { color: #94a3b8; font-size: 14px; }
  /* Card */
  .card { background: #fff; border-radius: 12px; border: 1px solid #e2e8f0;
          margin-bottom: 16px; overflow: hidden; }
  .card-header { padding: 12px 18px; background: #f8fafc;
                 border-bottom: 1px solid #e2e8f0; display: flex;
                 align-items: center; gap: 10px; }
  .card-header .icon { width: 32px; height: 32px; border-radius: 8px;
                       display: flex; align-items: center; justify-content: center;
                       font-size: 16px; flex-shrink: 0; }
  .card-header h2 { font-size: 13px; font-weight: 700; color: #1e293b; }
  .card-header .sub { font-size: 11px; color: #64748b; margin-top: 1px; }
  .card-body { padding: 16px 18px; }
  /* KV grid */
  .kv-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px,1fr)); gap: 12px; }
  .kv { background: #f8fafc; border-radius: 8px; padding: 10px 12px; }
  .kv .label { font-size: 10px; font-weight: 700; color: #94a3b8;
               text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 3px; }
  .kv .value { font-size: 13px; color: #1e293b; font-weight: 500; word-break: break-all; }
  .kv .value.missing { color: #cbd5e1; font-style: italic; font-weight: 400; }
  /* Badge */
  .badge { display: inline-block; font-size: 11px; font-weight: 700;
           padding: 3px 10px; border-radius: 20px; }
  /* Applied jobs table */
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #1e3a8a; color: #fff; padding: 9px 12px;
       text-align: left; font-weight: 600; white-space: nowrap; }
  td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #f8fafc; }
  tr:nth-child(even) td { background: #fafafa; }
  tr:nth-child(even):hover td { background: #f1f5f9; }
  /* Not found */
  .not-found { background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px;
               padding: 16px 20px; display: flex; gap: 12px; align-items: flex-start; }
  .not-found .icon { font-size: 22px; }
  .not-found h3 { font-size: 13px; font-weight: 700; color: #991b1b; }
  .not-found p  { font-size: 12px; color: #b91c1c; margin-top: 4px; }
  /* No jobs */
  .no-jobs { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 10px;
             padding: 16px 20px; text-align: center; }
  .no-jobs p { font-size: 12px; color: #c2410c; }
  /* Scrollbar */
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
</style>
</head>
<body>

<div class="header">
  <h1>🔍 OL Candidate Lookup</h1>
  <span class="meta">Generated __GENERATED_AT__ &nbsp;·&nbsp; __TOTAL__ candidates</span>
</div>

<div class="layout">
  <!-- Left: candidate list -->
  <div class="left">
    <div class="search-wrap">
      <input type="text" id="search" placeholder="Search name or email…" oninput="filterList()"/>
    </div>
    <div class="count-bar" id="count-bar"></div>
    <div class="list" id="cand-list"></div>
  </div>

  <!-- Right: detail -->
  <div class="right" id="detail">
    <div class="placeholder">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <p>Select a candidate from the list</p>
    </div>
  </div>
</div>

<script>
const DATA = __DATA_JSON__;
const OL   = __OL_JSON__;

const STATUS_COLORS = {
  sourced:'#dbeafe',submitted_to_client:'#d1fae5',interview_stage:'#fef9c3',
  offer_rolled_out:'#dcfce7',joined:'#bbf7d0',rejected:'#fee2e2',backed_out:'#fee2e2',
  validated:'#e0f2fe',needs_rework:'#fef3c7',on_hold:'#f3f4f6',
  call_in_progress:'#ede9fe',ready_for_validation:'#fce7f3',
  handed_to_recruiter:'#f1f5f9',
};
const STATUS_TEXT = {
  sourced:'Sourced',submitted_to_client:'Submitted to Client',interview_stage:'Interview Stage',
  offer_rolled_out:'Offer Rolled Out',joined:'Joined',rejected:'Rejected',backed_out:'Backed Out',
  validated:'Validated',needs_rework:'Needs Rework',on_hold:'On Hold',
  call_in_progress:'Call In Progress',ready_for_validation:'Ready for Validation',
  handed_to_recruiter:'Handed to Recruiter',
};

function statusBadge(s) {
  const bg  = STATUS_COLORS[s] || '#f1f5f9';
  const lbl = STATUS_TEXT[s] || (s||'').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  return `<span class="badge" style="background:${bg};color:#1e293b">${lbl}</span>`;
}

function olStageBadge(step, stage) {
  const s = (step+' '+stage).toLowerCase();
  let bg = '#f1f5f9';
  if (s.includes('joined'))  bg = '#bbf7d0';
  else if (s.includes('offer')) bg = '#dcfce7';
  else if (s.includes('clear')||s.includes('pass')||s.includes('select')) bg = '#d1fae5';
  else if (s.includes('reject')||s.includes('fail')) bg = '#fee2e2';
  else if (s.includes('pending')) bg = '#fef9c3';
  const lbl = step || stage || '—';
  return `<span class="badge" style="background:${bg};color:#1e293b">${lbl}</span>`;
}

function val(v) {
  if (v===null||v===undefined||v==='') return '<span class="value missing">—</span>';
  return `<span class="value">${v}</span>`;
}

function kv(label, value, raw) {
  const display = (raw===null||raw===undefined||raw==='')
    ? '<span class="value missing">Not available</span>'
    : `<span class="value">${value||raw}</span>`;
  return `<div class="kv"><div class="label">${label}</div>${display}</div>`;
}

let activeIdx = -1;

function renderList(items) {
  const ul = document.getElementById('cand-list');
  document.getElementById('count-bar').textContent = items.length + ' candidates';
  ul.innerHTML = items.map((c,i) => {
    const s  = c.mrr_status || '';
    const bg = STATUS_COLORS[s] || '#f1f5f9';
    const lbl = STATUS_TEXT[s] || s.replace(/_/g,' ');
    return `<div class="cand-item" data-idx="${c._idx}" onclick="selectCandidate(${c._idx})">
      <div class="cname">${c.name||'Unknown'}</div>
      <div class="cemail">${c.email}</div>
      <span class="ctag" style="background:${bg};color:#1e293b">${lbl}</span>
    </div>`;
  }).join('');
}

let filtered = [];

function filterList() {
  const q = document.getElementById('search').value.toLowerCase();
  filtered = DATA.filter(c =>
    (c.name||'').toLowerCase().includes(q) ||
    (c.email||'').toLowerCase().includes(q) ||
    (c.client_name||'').toLowerCase().includes(q) ||
    (c.role_title||'').toLowerCase().includes(q)
  );
  renderList(filtered);
}

function selectCandidate(idx) {
  // highlight
  document.querySelectorAll('.cand-item').forEach(el => el.classList.remove('active'));
  const el = document.querySelector(`.cand-item[data-idx="${idx}"]`);
  if (el) el.classList.add('active');

  const c   = DATA[idx];
  const ol  = OL[c.email] || null;
  const det = document.getElementById('detail');

  let html = '';

  // ── MRR Candidate info ────────────────────────────────────────────────────
  html += `
  <div class="card">
    <div class="card-header">
      <div class="icon" style="background:#eff6ff">👤</div>
      <div>
        <h2>${c.name || 'Unknown'}</h2>
        <div class="sub">${c.email} ${c.mobile ? '· '+c.mobile : ''}</div>
      </div>
      <div style="margin-left:auto">${statusBadge(c.mrr_status)}</div>
    </div>
    <div class="card-body">
      <div class="kv-grid">
        ${kv('MRR Candidate ID', c.mrr_id, c.mrr_id)}
        ${kv('Client', c.client_name, c.client_name)}
        ${kv('Role / JD', c.role_title, c.role_title)}
        ${kv('MRR Job ID', c.mrr_job_id, c.mrr_job_id)}
        ${kv('OL Job ID', c.ol_job_id, c.ol_job_id)}
        ${kv('Recruiter', c.recruiter_name, c.recruiter_name)}
        ${kv('Sourced At', c.sourced_at, c.sourced_at)}
        ${kv('Submitted At', c.submitted_at, c.submitted_at)}
        ${kv('Submission Stage', c.current_stage ? c.current_stage.replace(/_/g,' ') : null, c.current_stage)}
      </div>
    </div>
  </div>`;

  // ── OL User info ──────────────────────────────────────────────────────────
  if (!ol || !ol.user) {
    html += `
    <div class="not-found">
      <div class="icon">⚠️</div>
      <div>
        <h3>Not found in OfferLetter system</h3>
        <p>No user with email <strong>${c.email}</strong> exists in the OL users table.</p>
      </div>
    </div>`;
  } else {
    const u = ol.user;
    html += `
    <div class="card">
      <div class="card-header">
        <div class="icon" style="background:#d1fae5">🔗</div>
        <div>
          <h2>OfferLetter Profile</h2>
          <div class="sub">Matched via email → OL User ID: <strong>${u.id}</strong></div>
        </div>
      </div>
      <div class="card-body">
        <div class="kv-grid">
          ${kv('OL User ID', u.id, u.id)}
          ${kv('Full Name (OL)', u.full_name, u.full_name)}
          ${kv('Email (OL)', u.email, u.email)}
          ${kv('Official Email', u.official_mail_id, u.official_mail_id)}
          ${kv('MRR Candidate ID (OL)', u.mrr_candidate_id, u.mrr_candidate_id)}
          ${kv('Role ID', u.role_id, u.role_id)}
          ${kv('User Type', u.type, u.type)}
          ${kv('Reporting To', u.reporting_to, u.reporting_to)}
          ${kv('Registered At', u.created_at, u.created_at)}
          ${kv('Confirmed At', u.confirmed_at, u.confirmed_at)}
        </div>
      </div>
    </div>`;

    // ── Applied Jobs ──────────────────────────────────────────────────────────
    const jobs = ol.applied_jobs || [];
    if (jobs.length === 0) {
      html += `
      <div class="no-jobs">
        <p>⚠️ OL user <strong>${u.id}</strong> exists but has <strong>no entries</strong> in <code>applied_jobs</code>.</p>
      </div>`;
    } else {
      html += `
      <div class="card">
        <div class="card-header">
          <div class="icon" style="background:#fef9c3">📋</div>
          <div>
            <h2>Applied Jobs in OL</h2>
            <div class="sub">${jobs.length} application${jobs.length>1?'s':''} found</div>
          </div>
        </div>
        <div class="card-body" style="padding:0">
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Applied Job ID</th>
                  <th>OL Job Posting ID</th>
                  <th>Job Title</th>
                  <th>Client</th>
                  <th>Application Status</th>
                  <th>Current Step</th>
                  <th>Step Name</th>
                  <th>Stage</th>
                  <th>Prev Step</th>
                  <th>Self Applied</th>
                  <th>Note</th>
                  <th>Applied At</th>
                  <th>Last Updated</th>
                </tr>
              </thead>
              <tbody>
                ${jobs.map((j,i)=>`
                <tr>
                  <td style="color:#94a3b8;font-weight:600">${i+1}</td>
                  <td><strong>${j.id||'—'}</strong></td>
                  <td>${j.job_posting_id||'—'}</td>
                  <td>${j.job_title||'<span style="color:#cbd5e1">—</span>'}</td>
                  <td>${j.client_name||'<span style="color:#cbd5e1">—</span>'}</td>
                  <td>${j.application_status||'<span style="color:#cbd5e1">—</span>'}</td>
                  <td style="color:#64748b">${j.current_step||'—'}</td>
                  <td>${j.step_name ? olStageBadge(j.step_name, j.step_stage||'') : '<span style="color:#cbd5e1">—</span>'}</td>
                  <td>${j.step_stage ? `<span class="badge" style="background:#ede9fe;color:#1e293b">${j.step_stage}</span>` : '<span style="color:#cbd5e1">—</span>'}</td>
                  <td style="color:#94a3b8">${j.prev_step||'—'}</td>
                  <td>${j.self_applied=='1'||j.self_applied===1?'✅ Yes':'—'}</td>
                  <td style="max-width:160px;word-break:break-word;font-size:11px;color:#64748b">${j.note||'—'}</td>
                  <td style="white-space:nowrap;color:#64748b">${j.created_at||'—'}</td>
                  <td style="white-space:nowrap;color:#64748b">${j.updated_at||'—'}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
    }
  }

  det.innerHTML = html;
}

// init
DATA.forEach((c,i) => c._idx = i);
filtered = DATA.slice();
renderList(filtered);
</script>
</body>
</html>"""


# ── main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Generate OL candidate lookup HTML")
    parser.add_argument("--out", default=None, help="Output .html path")
    args = parser.parse_args()

    out_path = (
        Path(args.out) if args.out
        else Path(__file__).parent.parent / "exports" /
             f"ol_lookup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.html"
    )

    print("Connecting to MRR PostgreSQL…")
    pg = get_pg_conn()
    candidates = fetch_mrr_candidates(pg)
    pg.close()
    print(f"  Fetched {len(candidates)} candidates.")

    print("Connecting to OL MySQL…")
    ol = get_ol_conn()
    print(f"  Looking up {len(candidates)} emails in OL…")
    ol_data = fetch_ol_data(ol, candidates)
    ol.close()

    found     = sum(1 for v in ol_data.values() if v.get("user"))
    not_found = len(ol_data) - found
    print(f"  OL match: {found} found, {not_found} not found.")

    html = (HTML_TEMPLATE
        .replace("__DATA_JSON__", json.dumps(candidates, default=str))
        .replace("__OL_JSON__",   json.dumps(ol_data, default=str))
        .replace("__GENERATED_AT__", datetime.now().strftime("%d %b %Y %H:%M"))
        .replace("__TOTAL__", str(len(candidates)))
    )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html, encoding="utf-8")
    print(f"✅  Saved → {out_path}")
    print(f"   Open in browser: file://{out_path.resolve()}")


if __name__ == "__main__":
    main()
