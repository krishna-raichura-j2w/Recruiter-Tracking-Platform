"""
OL Candidate Lookup — integrated into the main backend.

Routes:
  GET /api/ol-lookup          → interactive HTML UI
  GET /api/ol-lookup/candidates  → live list from MRR Postgres
  GET /api/ol-lookup/ol/{email}  → OL MySQL profile + applied_jobs
"""
import os
from datetime import datetime, date

import psycopg2
import psycopg2.extras
import pymysql
import pymysql.cursors
from fastapi import APIRouter
from fastapi.responses import HTMLResponse, JSONResponse

router = APIRouter(prefix="/ol-lookup", tags=["ol-lookup"])


# ── DB helpers ────────────────────────────────────────────────────────────────

def _get_pg_conn():
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        raise RuntimeError("DATABASE_URL not set")
    scheme_end = url.index("://") + 3
    if url[scheme_end:].count("@") > 1:
        last_at  = url.rfind("@")
        creds    = url[scheme_end:last_at]
        hostpart = url[last_at + 1:]
        colon    = creds.index(":")
        password = creds[colon + 1:].replace("@", "%40")
        url = f"{url[:scheme_end]}{creds[:colon]}:{password}@{hostpart}"
    return psycopg2.connect(url, cursor_factory=psycopg2.extras.RealDictCursor)


def _get_ol_conn():
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


def _ser(v):
    if isinstance(v, datetime):
        return v.strftime("%d %b %Y %H:%M")
    if isinstance(v, date):
        return v.strftime("%d %b %Y")
    return v


def _serialize(row: dict) -> dict:
    return {k: _ser(v) for k, v in row.items()}


# ── API endpoints ─────────────────────────────────────────────────────────────

@router.get("/candidates")
def get_candidates():
    pg = _get_pg_conn()
    try:
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
            rows = [_serialize(dict(r)) for r in cur.fetchall()]
        return JSONResponse(content=rows)
    finally:
        pg.close()


@router.get("/ol/{email:path}")
def get_ol_data(email: str):
    ol = _get_ol_conn()
    try:
        with ol.cursor() as cur:
            cur.execute("""
                SELECT id,
                       CONCAT(first_name,' ',COALESCE(middle_name,''),' ',last_name) AS full_name,
                       email, role_id, type, reporting_to,
                       official_mail_id, mrr_candidate_id, created_at, confirmed_at
                FROM users WHERE email = %s LIMIT 1
            """, (email,))
            ol_user = cur.fetchone()

            if not ol_user:
                return JSONResponse(content={"user": None, "applied_jobs": []})

            user = _serialize(dict(ol_user))
            uid  = ol_user["id"]

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
            jobs = [_serialize(dict(j)) for j in cur.fetchall()]

        return JSONResponse(content={"user": user, "applied_jobs": jobs})
    finally:
        ol.close()


# ── HTML UI ───────────────────────────────────────────────────────────────────

_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>OL Candidate Lookup</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         background: #f1f5f9; color: #1e293b; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }

  .header { background: linear-gradient(135deg,#1e3a8a,#3b82f6); padding: 12px 20px;
             display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
  .header h1 { color: #fff; font-size: 15px; font-weight: 700; }
  .header .right-meta { display: flex; align-items: center; gap: 12px; }
  .header .meta { color: rgba(255,255,255,0.65); font-size: 11px; }
  .btn-refresh { background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3);
                 color: #fff; padding: 5px 14px; border-radius: 7px; font-size: 12px;
                 font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px; }
  .btn-refresh:hover { background: rgba(255,255,255,0.25); }
  .btn-refresh.spinning .icon { display: inline-block; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .layout { display: flex; flex: 1; overflow: hidden; }

  .left { width: 300px; flex-shrink: 0; background: #fff;
           border-right: 1px solid #e2e8f0; display: flex; flex-direction: column; }
  .search-wrap { padding: 10px; border-bottom: 1px solid #f1f5f9; }
  .search-wrap input { width: 100%; padding: 8px 12px; border: 1px solid #e2e8f0;
    border-radius: 8px; font-size: 12px; outline: none; background: #f8fafc; }
  .search-wrap input:focus { border-color: #3b82f6; background: #fff; }
  .list-header { padding: 6px 12px 4px; font-size: 10px; font-weight: 700;
                 color: #94a3b8; text-transform: uppercase; letter-spacing: 0.06em;
                 display: flex; justify-content: space-between; align-items: center; }
  .list { flex: 1; overflow-y: auto; }
  .cand-item { padding: 9px 12px; border-bottom: 1px solid #f8fafc;
               cursor: pointer; transition: background 0.1s; }
  .cand-item:hover { background: #f8fafc; }
  .cand-item.active { background: #eff6ff; border-left: 3px solid #3b82f6; }
  .cand-item .cname { font-weight: 600; font-size: 12px; color: #1e293b; }
  .cand-item .cmeta { font-size: 10px; color: #94a3b8; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ctag { display: inline-block; margin-top: 3px; font-size: 10px; font-weight: 700;
          padding: 1px 7px; border-radius: 20px; }

  .right { flex: 1; overflow-y: auto; padding: 16px 20px; }
  .placeholder { display: flex; flex-direction: column; align-items: center;
                 justify-content: center; height: 100%; gap: 10px; }
  .placeholder svg { width: 56px; height: 56px; opacity: 0.25; }
  .placeholder p { color: #94a3b8; font-size: 13px; }

  .loading-overlay { display: flex; align-items: center; justify-content: center;
                     height: 100%; gap: 10px; }
  .spinner { width: 28px; height: 28px; border: 3px solid #e2e8f0;
             border-top-color: #3b82f6; border-radius: 50%;
             animation: spin 0.7s linear infinite; }
  .loading-overlay p { font-size: 13px; color: #64748b; }

  .card { background: #fff; border-radius: 10px; border: 1px solid #e2e8f0;
          margin-bottom: 14px; overflow: hidden; }
  .card-header { padding: 11px 16px; background: #f8fafc;
                 border-bottom: 1px solid #e2e8f0; display: flex;
                 align-items: center; gap: 10px; }
  .card-icon { width: 30px; height: 30px; border-radius: 8px;
               display: flex; align-items: center; justify-content: center;
               font-size: 15px; flex-shrink: 0; }
  .card-header h2 { font-size: 12px; font-weight: 700; color: #1e293b; }
  .card-header .sub { font-size: 10px; color: #64748b; margin-top: 1px; }
  .card-body { padding: 14px 16px; }

  .kv-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px,1fr)); gap: 10px; }
  .kv { background: #f8fafc; border-radius: 7px; padding: 8px 11px; }
  .kv .label { font-size: 9px; font-weight: 700; color: #94a3b8;
               text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 3px; }
  .kv .value { font-size: 12px; color: #1e293b; font-weight: 500; word-break: break-all; }
  .kv .value.missing { color: #cbd5e1; font-style: italic; font-weight: 400; font-size: 11px; }

  .badge { display: inline-block; font-size: 10px; font-weight: 700;
           padding: 2px 9px; border-radius: 20px; }

  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { background: #1e3a8a; color: #fff; padding: 8px 10px;
       text-align: left; font-weight: 600; white-space: nowrap; font-size: 11px; }
  td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #f8fafc; }
  tr:nth-child(even) td { background: #fafafa; }
  tr:nth-child(even):hover td { background: #f1f5f9; }

  .alert { border-radius: 9px; padding: 14px 16px;
           display: flex; gap: 10px; align-items: flex-start; margin-bottom: 14px; }
  .alert.red  { background: #fef2f2; border: 1px solid #fecaca; }
  .alert.amber { background: #fff7ed; border: 1px solid #fed7aa; }
  .alert .ai { font-size: 20px; }
  .alert h3 { font-size: 12px; font-weight: 700; }
  .alert p  { font-size: 11px; margin-top: 3px; color: #64748b; }
  .alert.red h3 { color: #991b1b; }
  .alert.amber h3 { color: #c2410c; }

  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
</style>
</head>
<body>

<div class="header">
  <h1>🔍 OL Candidate Lookup &nbsp;<span style="opacity:0.5;font-weight:400;font-size:12px">Live</span></h1>
  <div class="right-meta">
    <span class="meta" id="last-updated"></span>
    <button class="btn-refresh" onclick="loadCandidates()">
      <span class="icon">↻</span> Refresh
    </button>
  </div>
</div>

<div class="layout">
  <div class="left">
    <div class="search-wrap">
      <input type="text" id="search" placeholder="Search name, email, client…" oninput="filterList()"/>
    </div>
    <div class="list-header">
      <span id="count-bar">Loading…</span>
    </div>
    <div class="list" id="cand-list">
      <div style="padding:24px;text-align:center">
        <div class="spinner" style="margin:0 auto 8px"></div>
        <p style="font-size:12px;color:#94a3b8">Loading candidates…</p>
      </div>
    </div>
  </div>

  <div class="right" id="detail">
    <div class="placeholder">
      <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.5"
           stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <p>Select a candidate from the list</p>
    </div>
  </div>
</div>

<script>
const BASE = '/api/ol-lookup';
const STATUS_COLORS = {
  sourced:'#dbeafe',submitted_to_client:'#d1fae5',interview_stage:'#fef9c3',
  offer_rolled_out:'#dcfce7',joined:'#bbf7d0',rejected:'#fee2e2',backed_out:'#fee2e2',
  validated:'#e0f2fe',needs_rework:'#fef3c7',on_hold:'#f3f4f6',
  call_in_progress:'#ede9fe',ready_for_validation:'#fce7f3',
  handed_to_recruiter:'#f1f5f9',
};
const STATUS_TEXT = {
  sourced:'Sourced',submitted_to_client:'Submitted to Client',
  interview_stage:'Interview Stage',offer_rolled_out:'Offer Rolled Out',
  joined:'Joined',rejected:'Rejected',backed_out:'Backed Out',
  validated:'Validated',needs_rework:'Needs Rework',on_hold:'On Hold',
  call_in_progress:'Call In Progress',ready_for_validation:'Ready for Validation',
  handed_to_recruiter:'Handed to Recruiter',
};

function statusBadge(s) {
  const bg  = STATUS_COLORS[s] || '#f1f5f9';
  const lbl = STATUS_TEXT[s] || (s||'').replace(/_/g,' ').replace(/\\b\\w/g,c=>c.toUpperCase());
  return `<span class="badge" style="background:${bg};color:#1e293b">${lbl}</span>`;
}
function olBadge(step, stage) {
  const s = (step+' '+stage).toLowerCase();
  let bg = '#f1f5f9';
  if(s.includes('joined')) bg='#bbf7d0';
  else if(s.includes('offer')) bg='#dcfce7';
  else if(s.includes('clear')||s.includes('pass')||s.includes('select')) bg='#d1fae5';
  else if(s.includes('reject')||s.includes('fail')) bg='#fee2e2';
  else if(s.includes('pending')) bg='#fef9c3';
  return `<span class="badge" style="background:${bg};color:#1e293b">${step||stage||'—'}</span>`;
}
function kv(label, raw) {
  const empty = raw===null||raw===undefined||raw==='';
  const display = empty
    ? '<span class="value missing">Not available</span>'
    : `<span class="value">${raw}</span>`;
  return `<div class="kv"><div class="label">${label}</div>${display}</div>`;
}

let ALL = [];
let activeEmail = null;

async function loadCandidates() {
  const btn = document.querySelector('.btn-refresh');
  btn.classList.add('spinning');
  document.getElementById('count-bar').textContent = 'Loading…';
  document.getElementById('cand-list').innerHTML = `
    <div style="padding:24px;text-align:center">
      <div class="spinner" style="margin:0 auto 8px"></div>
      <p style="font-size:12px;color:#94a3b8">Fetching from database…</p>
    </div>`;
  try {
    const res = await fetch(BASE + '/candidates');
    ALL = await res.json();
    document.getElementById('last-updated').textContent =
      'Updated ' + new Date().toLocaleTimeString();
    filterList();
    if (activeEmail) {
      const match = ALL.find(c => c.email === activeEmail);
      if (match) renderDetail(match);
    }
  } catch(e) {
    document.getElementById('cand-list').innerHTML =
      '<div style="padding:16px;color:#ef4444;font-size:12px">Failed to load candidates.</div>';
  } finally {
    btn.classList.remove('spinning');
  }
}

function filterList() {
  const q = document.getElementById('search').value.toLowerCase();
  const filtered = ALL.filter(c =>
    (c.name||'').toLowerCase().includes(q) ||
    (c.email||'').toLowerCase().includes(q) ||
    (c.client_name||'').toLowerCase().includes(q) ||
    (c.role_title||'').toLowerCase().includes(q) ||
    (c.recruiter_name||'').toLowerCase().includes(q)
  );
  document.getElementById('count-bar').textContent = `${filtered.length} of ${ALL.length} candidates`;
  const ul = document.getElementById('cand-list');
  ul.innerHTML = filtered.map(c => {
    const s   = c.mrr_status || '';
    const bg  = STATUS_COLORS[s] || '#f1f5f9';
    const lbl = STATUS_TEXT[s] || s.replace(/_/g,' ');
    const isActive = c.email === activeEmail;
    return `<div class="cand-item${isActive?' active':''}" onclick="selectCandidate('${c.email.replace(/'/g,"\\'")}')">
      <div class="cname">${c.name||'Unknown'}</div>
      <div class="cmeta">${c.email}</div>
      <div class="cmeta">${c.client_name||''} ${c.role_title ? '· '+c.role_title : ''}</div>
      <span class="ctag" style="background:${bg};color:#1e293b">${lbl}</span>
    </div>`;
  }).join('');
}

async function selectCandidate(email) {
  activeEmail = email;
  filterList();
  const c = ALL.find(x => x.email === email);
  if (!c) return;

  document.getElementById('detail').innerHTML = `
    <div class="loading-overlay">
      <div class="spinner"></div>
      <p>Fetching OL data for <strong>${c.email}</strong>…</p>
    </div>`;

  let ol = { user: null, applied_jobs: [] };
  try {
    const res = await fetch(BASE + '/ol/' + encodeURIComponent(email));
    ol = await res.json();
  } catch(e) {
    document.getElementById('detail').innerHTML =
      '<div class="alert red" style="margin:16px"><div class="ai">⚠️</div><div><h3>OL fetch failed</h3><p>'+e.message+'</p></div></div>';
    return;
  }

  renderDetail(c, ol);
}

function renderDetail(c, ol) {
  if (!ol) ol = { user: null, applied_jobs: [] };
  let html = '';

  html += `
  <div class="card">
    <div class="card-header">
      <div class="card-icon" style="background:#eff6ff">👤</div>
      <div style="flex:1">
        <h2>${c.name||'Unknown'}</h2>
        <div class="sub">${c.email}${c.mobile?' · '+c.mobile:''}</div>
      </div>
      <div>${statusBadge(c.mrr_status)}</div>
    </div>
    <div class="card-body">
      <div class="kv-grid">
        ${kv('MRR Candidate ID', c.mrr_id)}
        ${kv('Client', c.client_name)}
        ${kv('Role / JD', c.role_title)}
        ${kv('MRR Job ID', c.mrr_job_id)}
        ${kv('OL Job ID', c.ol_job_id)}
        ${kv('Recruiter', c.recruiter_name)}
        ${kv('Sourced At', c.sourced_at)}
        ${kv('Submitted At', c.submitted_at)}
        ${kv('Submission Stage', c.current_stage ? c.current_stage.replace(/_/g,' ') : null)}
      </div>
    </div>
  </div>`;

  if (!ol.user) {
    html += `
    <div class="alert red">
      <div class="ai">⚠️</div>
      <div>
        <h3>Not found in OfferLetter</h3>
        <p>No user with email <strong>${c.email}</strong> exists in the OL users table.</p>
      </div>
    </div>`;
  } else {
    const u = ol.user;
    html += `
    <div class="card">
      <div class="card-header">
        <div class="card-icon" style="background:#d1fae5">🔗</div>
        <div>
          <h2>OfferLetter Profile</h2>
          <div class="sub">Matched via email → OL User ID: <strong>${u.id}</strong></div>
        </div>
      </div>
      <div class="card-body">
        <div class="kv-grid">
          ${kv('OL User ID', u.id)}
          ${kv('Full Name (OL)', u.full_name)}
          ${kv('Email (OL)', u.email)}
          ${kv('Official Email', u.official_mail_id)}
          ${kv('MRR Candidate ID (OL)', u.mrr_candidate_id)}
          ${kv('Role ID', u.role_id)}
          ${kv('User Type', u.type)}
          ${kv('Reporting To', u.reporting_to)}
          ${kv('Registered At', u.created_at)}
          ${kv('Confirmed At', u.confirmed_at)}
        </div>
      </div>
    </div>`;

    const jobs = ol.applied_jobs || [];
    if (jobs.length === 0) {
      html += `
      <div class="alert amber">
        <div class="ai">📭</div>
        <div>
          <h3>No Applied Jobs in OL</h3>
          <p>OL user <strong>${u.id}</strong> exists but has no entries in <code>applied_jobs</code>.</p>
        </div>
      </div>`;
    } else {
      html += `
      <div class="card">
        <div class="card-header">
          <div class="card-icon" style="background:#fef9c3">📋</div>
          <div>
            <h2>Applied Jobs in OL</h2>
            <div class="sub">${jobs.length} application${jobs.length>1?'s':''} found</div>
          </div>
        </div>
        <div class="card-body" style="padding:0">
          <div class="table-wrap">
            <table>
              <thead><tr>
                <th>#</th><th>Applied Job ID</th><th>OL Job Posting ID</th>
                <th>Job Title</th><th>Client</th><th>App Status</th>
                <th>Current Step</th><th>Step Name</th><th>Stage</th>
                <th>Prev Step</th><th>Self Applied</th><th>Note</th>
                <th>Applied At</th><th>Last Updated</th>
              </tr></thead>
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
                  <td>${j.step_name ? olBadge(j.step_name, j.step_stage||'') : '<span style="color:#cbd5e1">—</span>'}</td>
                  <td>${j.step_stage ? `<span class="badge" style="background:#ede9fe;color:#1e293b">${j.step_stage}</span>` : '<span style="color:#cbd5e1">—</span>'}</td>
                  <td style="color:#94a3b8">${j.prev_step||'—'}</td>
                  <td>${j.self_applied=='1'||j.self_applied===1?'✅':'—'}</td>
                  <td style="max-width:160px;word-break:break-word;font-size:10px;color:#64748b">${j.note||'—'}</td>
                  <td style="white-space:nowrap;color:#64748b;font-size:10px">${j.created_at||'—'}</td>
                  <td style="white-space:nowrap;color:#64748b;font-size:10px">${j.updated_at||'—'}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
    }
  }

  document.getElementById('detail').innerHTML = html;
}

loadCandidates();
</script>
</body>
</html>"""


@router.get("", response_class=HTMLResponse)
def ol_lookup_ui():
    return _HTML
