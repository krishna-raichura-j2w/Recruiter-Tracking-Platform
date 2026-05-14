import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, RefreshCw, Filter, Users, FileSpreadsheet, X } from 'lucide-react';
import Layout from '../components/Layout';
import api from '../api/client';
import { generatePodReport, type PodReport } from '../utils/podReport';

// ── Types ──────────────────────────────────────────────────────────────────────

interface BH { id: number; name: string; email: string | null; phone: string | null; }

interface ExportRow {
  business_head: string; client_name: string; job_title: string; job_status: string;
  candidate_name: string; mobile: string; email: string; linkedin: string; city: string;
  current_company: string; candidate_status: string; lead_source: string;
  sourced_by: string; caller: string; sourcing_date: string;
  total_exp: string; relevant_exp: string; skills: string;
  current_ctc: string; expected_ctc: string; hike_pct: string;
  notice_period: string; last_working_day: string; deploying_client: string;
  reason_for_change: string; offers_in_hand: string; current_city: string;
  comm_score: string; tech_score: string; soft_skill_score: string;
  overall_score: string; auto_recommendation: string; pass_to_validation: string;
}

const COLUMNS: { key: keyof ExportRow; label: string; width: number; group?: string }[] = [
  { key: 'business_head',      label: 'Business Head',    width: 140, group: 'JD Info' },
  { key: 'client_name',        label: 'Client',           width: 100, group: 'JD Info' },
  { key: 'job_title',          label: 'Role',             width: 160, group: 'JD Info' },
  { key: 'candidate_name',     label: 'Candidate Name',   width: 150, group: 'Candidate' },
  { key: 'mobile',             label: 'Phone',            width: 110, group: 'Candidate' },
  { key: 'email',              label: 'Email',            width: 160, group: 'Candidate' },
  { key: 'city',               label: 'City',             width: 100, group: 'Candidate' },
  { key: 'current_company',    label: 'Current Company',  width: 150, group: 'Candidate' },
  { key: 'candidate_status',   label: 'Status',           width: 130, group: 'Candidate' },
  { key: 'sourced_by',         label: 'Sourced By',       width: 110, group: 'Team' },
  { key: 'caller',             label: 'Caller',           width: 110, group: 'Team' },
  { key: 'sourcing_date',      label: 'Sourcing Date',    width: 110, group: 'Team' },
  { key: 'total_exp',          label: 'Total Exp',        width: 90,  group: 'Profile' },
  { key: 'relevant_exp',       label: 'Relevant Exp',     width: 100, group: 'Profile' },
  { key: 'skills',             label: 'Skills',           width: 200, group: 'Profile' },
  { key: 'current_ctc',        label: 'Current CTC',      width: 100, group: 'CTC' },
  { key: 'expected_ctc',       label: 'Expected CTC',     width: 100, group: 'CTC' },
  { key: 'hike_pct',           label: 'Hike %',           width: 80,  group: 'CTC' },
  { key: 'notice_period',      label: 'Notice Period',    width: 110, group: 'Profile' },
  { key: 'last_working_day',   label: 'LWD',              width: 100, group: 'Profile' },
  { key: 'deploying_client',   label: 'Deploying Client', width: 130, group: 'Profile' },
  { key: 'reason_for_change',  label: 'Reason for Change',width: 160, group: 'Profile' },
  { key: 'offers_in_hand',     label: 'Offers in Hand',   width: 110, group: 'Profile' },
  { key: 'overall_score',      label: 'Overall Score',    width: 100, group: 'Score' },
  { key: 'tech_score',         label: 'Tech Score',       width: 90,  group: 'Score' },
  { key: 'soft_skill_score',   label: 'Soft Score',       width: 90,  group: 'Score' },
  { key: 'auto_recommendation',label: 'Recommendation',   width: 130, group: 'Score' },
  { key: 'pass_to_validation', label: 'Verdict',          width: 120, group: 'Score' },
];

const STATUS_COLORS: Record<string, string> = {
  sourced: '#e0f2fe', pool_verified: '#f0fdf4', handed_to_recruiter: '#fef9c3',
  call_in_progress: '#fef3c7', ready_for_validation: '#e0e7ff', validated: '#dcfce7',
  needs_rework: '#fee2e2', on_hold: '#f1f5f9', rejected: '#fecaca',
  submitted_to_client: '#dbeafe', interview_stage: '#ede9fe',
  offer_rolled_out: '#d1fae5', joined: '#bbf7d0', backed_out: '#f8fafc',
};
const SCORE_COLOR = (s: string) => { const n = parseFloat(s); return isNaN(n) ? '' : n >= 4 ? '#dcfce7' : n >= 3.25 ? '#fef9c3' : '#fee2e2'; };

// ── Pod view helpers ───────────────────────────────────────────────────────────

const TH = ({ children, bg = '#f1f5f9', color = '#374151', center = false }: { children: React.ReactNode; bg?: string; color?: string; center?: boolean }) => (
  <th style={{ padding: '6px 10px', background: bg, color, fontWeight: 'bold', fontSize: '11px', border: '1px solid #cbd5e1', textAlign: center ? 'center' : 'left', whiteSpace: 'nowrap' }}>
    {children}
  </th>
);
const TD = ({ children, bg = '#ffffff', bold = false, center = false }: { children: React.ReactNode; bg?: string; bold?: boolean; center?: boolean }) => (
  <td style={{ padding: '5px 10px', border: '1px solid #e2e8f0', backgroundColor: bg, fontWeight: bold ? 'bold' : 'normal', fontSize: '12px', textAlign: center ? 'center' : 'left', whiteSpace: 'nowrap' }}>
    {children ?? '—'}
  </td>
);
const SubtotalRow = ({ label, cols }: { label: string; cols: (string | number)[] }) => (
  <tr style={{ background: '#fde68a' }}>
    <TD bg="#fde68a" bold>{label}</TD>
    {cols.map((v, i) => <TD key={i} bg="#fde68a" bold center>{v}</TD>)}
  </tr>
);

const statusBg: Record<string, string> = {
  'Sourced': '#e0f2fe', 'Validated': '#dcfce7', 'Submitted To Client': '#dbeafe',
  'Interview Stage': '#ede9fe', 'Joined': '#bbf7d0', 'Rejected': '#fecaca',
  'Backed Out': '#f8fafc', 'Offer Rolled Out': '#d1fae5',
};
const scoreBg = (v: string | number) => { const n = Number(v); return isNaN(n) ? '#fff' : n >= 4 ? '#dcfce7' : n >= 3.25 ? '#fef9c3' : '#fee2e2'; };
const bottleneckBg = (f: string) => f.startsWith('✓') ? '#dcfce7' : f.startsWith('⚠') ? '#fee2e2' : f.startsWith('~') ? '#fef9c3' : '#fff';
const rowBg = (i: number) => i % 2 === 0 ? '#ffffff' : '#f8fafc';

// ── Leaderboard view ──────────────────────────────────────────────────────────
function LeaderboardView({ data }: { data: PodReport }) {
  const ps = data.pod_stats;
  return (
    <div className="space-y-6">
      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Open Demands', val: ps.total_demands, bg: '#1e40af' },
          { label: 'Total Sourced', val: ps.total_sourced, bg: '#0f766e' },
          { label: 'Submitted MTD', val: ps.total_submitted, bg: '#7c3aed' },
          { label: 'Today Subs', val: ps.today_subs, bg: '#166534' },
          { label: 'L1 MTD', val: ps.total_l1, bg: '#b45309' },
          { label: 'L2 MTD', val: ps.total_l2, bg: '#c2410c' },
          { label: 'Selections', val: ps.total_selections, bg: '#be185d' },
          { label: 'Recruiters', val: ps.recruiters_count, bg: '#374151' },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3 text-white" style={{ background: s.bg }}>
            <p className="text-xs opacity-75 font-medium">{s.label}</p>
            <p className="text-2xl font-bold mt-0.5">{s.val}</p>
          </div>
        ))}
      </div>

      {/* Recruiter table */}
      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Recruiter Leaderboard</p>
        <div className="overflow-auto rounded-xl border border-slate-200">
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12px', fontFamily: 'Arial' }}>
            <thead><tr>
              <TH bg="#0f766e" color="#fff">Recruiter</TH>
              <TH bg="#0f766e" color="#fff" center>Type</TH>
              <TH bg="#0f766e" color="#fff">DL</TH>
              <TH bg="#0f766e" color="#fff" center>Active Calls</TH>
              <TH bg="#0f766e" color="#fff" center>Sourced MTD</TH>
              <TH bg="#0f766e" color="#fff" center>Submitted MTD</TH>
              <TH bg="#0f766e" color="#fff" center>L1 MTD</TH>
              <TH bg="#0f766e" color="#fff" center>Selections</TH>
              <TH bg="#0f766e" color="#fff" center>Avg Score</TH>
              <TH bg="#0f766e" color="#fff" center>Status</TH>
            </tr></thead>
            <tbody>
              {data.recruiters.map((r, i) => {
                const scores = r.candidates.map(c => parseFloat(c.overall_score)).filter(n => !isNaN(n));
                const avg = scores.length ? (scores.reduce((a,b) => a+b,0)/scores.length).toFixed(2) : '—';
                const submitted = r.candidates.filter(c => c.submitted_to_client).length;
                const l1 = r.candidates.filter(c => ['l1_scheduled','l1_cleared','l1_feedback_pending','l1_rejected','l2_scheduled','l2_cleared','l2_rejected','final_scheduled','final_cleared','final_rejected','offer_rolled_out','joined'].includes(c.current_stage)).length;
                const sels = r.candidates.filter(c => ['joined','final_cleared','offer_accepted'].includes(c.current_stage)).length;
                const status = r.candidates.length >= 5 ? '✓ Active' : r.candidates.length >= 2 ? '~ Building' : '○ Not started';
                const statusBgColor = status.startsWith('✓') ? '#dcfce7' : status.startsWith('~') ? '#fef9c3' : '#f1f5f9';
                return (
                  <tr key={r.id} style={{ background: rowBg(i) }}>
                    <TD bold>{r.name}</TD>
                    <TD center>{r.recruiter_type}</TD>
                    <TD>{r.dl_name}</TD>
                    <TD center>{r.calling_load}</TD>
                    <TD center>{r.candidates.length}</TD>
                    <TD center>{submitted}</TD>
                    <TD center>{l1}</TD>
                    <TD center bg={sels > 0 ? '#dcfce7' : rowBg(i)}>{sels}</TD>
                    <TD center bg={isNaN(parseFloat(avg)) ? rowBg(i) : scoreBg(avg)}>{avg}</TD>
                    <TD center bg={statusBgColor}>{status}</TD>
                  </tr>
                );
              })}
              <SubtotalRow label="POD TOTAL" cols={['', '', ps.recruiters_count, ps.total_sourced, ps.total_submitted, ps.total_l1, ps.total_selections, '']} />
            </tbody>
          </table>
        </div>
      </div>

      {/* KAM summary */}
      {data.kam_data.length > 0 && (
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">KAM Summary</p>
          <div className="overflow-auto rounded-xl border border-slate-200">
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12px', fontFamily: 'Arial' }}>
              <thead><tr>
                {['KAM','Demands','Sourced','Submitted','→ L1','→ L2','Selections','% Sub→L1','% L1→L2'].map(h => <TH key={h} bg="#6d28d9" color="#fff" center={h !== 'KAM'}>{h}</TH>)}
              </tr></thead>
              <tbody>
                {data.kam_data.map((k, i) => {
                  const subs = k.demands.reduce((s,d)=>s+d.total_submitted,0);
                  const l1   = k.demands.reduce((s,d)=>s+d.l1_count,0);
                  const l2   = k.demands.reduce((s,d)=>s+d.l2_count,0);
                  const sel  = k.demands.reduce((s,d)=>s+d.selections,0);
                  const src  = k.demands.reduce((s,d)=>s+d.total_sourced,0);
                  return (
                    <tr key={k.kam_name} style={{ background: rowBg(i) }}>
                      <TD bold>{k.kam_name}</TD>
                      <TD center>{k.demands.length}</TD>
                      <TD center>{src}</TD>
                      <TD center>{subs}</TD>
                      <TD center>{l1}</TD>
                      <TD center>{l2}</TD>
                      <TD center bg={sel > 0 ? '#dcfce7' : rowBg(i)}>{sel}</TD>
                      <TD center>{subs ? `${Math.round(l1/subs*100)}%` : '—'}</TD>
                      <TD center>{l1 ? `${Math.round(l2/l1*100)}%` : '—'}</TD>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Demand Status view ────────────────────────────────────────────────────────
function DemandStatusView({ data }: { data: PodReport }) {
  const [clientFilter, setClientFilter] = useState('');
  const clients = [...new Set(data.jobs.map(j => j.client_name))].sort();
  const jobs = clientFilter ? data.jobs.filter(j => j.client_name === clientFilter) : data.jobs;
  let prevClient = '';

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <select value={clientFilter} onChange={e => setClientFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400">
          <option value="">All Clients ({data.jobs.length})</option>
          {clients.map(c => <option key={c} value={c}>{c} ({data.jobs.filter(j=>j.client_name===c).length})</option>)}
        </select>
        <span className="text-xs text-slate-400">{jobs.length} demands</span>
      </div>
      <div className="overflow-auto rounded-xl border border-slate-200" style={{ maxHeight: 'calc(100vh - 320px)' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12px', fontFamily: 'Arial' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}><tr>
            {[
              ['Customer','#0f766e'],['Demand ID','#0f766e'],['Type','#0f766e'],
              ['Role','#0f766e'],['Headcount','#0f766e'],['KAM','#6d28d9'],
              ['DL','#6d28d9'],['Sourcers','#6d28d9'],
              ['Sourced','#1e40af'],['Validated','#1e40af'],['Submitted','#1e40af'],
              ['→ L1','#b45309'],['→ L2','#b45309'],['Selections','#166534'],
              ['Target','#374151'],['Status','#374151'],['Bottleneck','#991b1b'],
            ].map(([h,bg]) => <TH key={h} bg={bg as string} color="#fff" center={['Headcount','Sourced','Validated','Submitted','→ L1','→ L2','Selections','Target'].includes(h)}>{h}</TH>)}
          </tr></thead>
          <tbody>
            {jobs.map((j, i) => {
              const isNewClient = j.client_name !== prevClient;
              prevClient = j.client_name;
              const bg = isNewClient ? '#dbeafe' : rowBg(i);
              const bottleneck = j.selections > 0 ? '✓ Selections logged'
                               : j.l2_count > 0   ? '~ In L2 stage'
                               : j.l1_count > 0   ? `⚠ L1 awaiting feedback`
                               : j.total_submitted > 0 ? '⚠ Subs awaiting feedback'
                               : j.total_sourced > 0 ? '~ Sourced, not submitted'
                               : '○ No subs yet';
              return (
                <tr key={j.id}>
                  <TD bg={bg} bold={isNewClient}>{j.client_name}</TD>
                  <TD bg={bg}>{j.client_job_id}</TD>
                  <TD bg={bg}>{j.demand_type}</TD>
                  <TD bg={bg}>{j.role_title}</TD>
                  <TD bg={bg} center>{j.headcount}</TD>
                  <TD bg={bg}>{j.kam_name}</TD>
                  <TD bg={bg}>{j.dl_name}</TD>
                  <TD bg={bg}>{j.sourcer_names.join(', ')}</TD>
                  <TD center>{j.total_sourced}</TD>
                  <TD center>{j.validated}</TD>
                  <TD center bg={j.total_submitted > 0 ? '#dbeafe' : '#fff'}>{j.total_submitted}</TD>
                  <TD center bg={j.l1_count > 0 ? '#fef9c3' : '#fff'}>{j.l1_count}</TD>
                  <TD center bg={j.l2_count > 0 ? '#fde68a' : '#fff'}>{j.l2_count}</TD>
                  <TD center bg={j.selections > 0 ? '#dcfce7' : '#fff'}>{j.selections}</TD>
                  <TD center>{j.sourcing_target ?? '—'}</TD>
                  <TD>{j.status.replace(/_/g,' ')}</TD>
                  <TD bg={bottleneckBg(bottleneck)}>{bottleneck}</TD>
                </tr>
              );
            })}
            <SubtotalRow label="POD TOTAL" cols={['','','','',data.pod_stats.total_sourced,data.pod_stats.total_validated,data.pod_stats.total_submitted,data.pod_stats.total_l1,data.pod_stats.total_l2,data.pod_stats.total_selections,'','']} />
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── KAM Accountability view ───────────────────────────────────────────────────
function KAMView({ data }: { data: PodReport }) {
  const [kamFilter, setKamFilter] = useState('');
  const kams = kamFilter ? data.kam_data.filter(k => k.kam_name === kamFilter) : data.kam_data;
  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <select value={kamFilter} onChange={e => setKamFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400">
          <option value="">All KAMs</option>
          {data.kam_data.map(k => <option key={k.kam_name} value={k.kam_name}>{k.kam_name} ({k.demands.length})</option>)}
        </select>
      </div>
      <div className="overflow-auto rounded-xl border border-slate-200" style={{ maxHeight: 'calc(100vh - 320px)' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12px', fontFamily: 'Arial' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}><tr>
            {['Demand ID','Customer','Skill / Role','Sourcers','D-2 Subs','D-1 Subs','Today Subs','Total Subs','Sub Rej','→ L1','→ L2','Selections','Bottleneck'].map(h =>
              <TH key={h} bg="#6d28d9" color="#fff" center={['D-2 Subs','D-1 Subs','Today Subs','Total Subs','Sub Rej','→ L1','→ L2','Selections'].includes(h)}>{h}</TH>)}
          </tr></thead>
          <tbody>
            {kams.map(k => {
              const totSubs = k.demands.reduce((s,d)=>s+d.total_submitted,0);
              const totL1   = k.demands.reduce((s,d)=>s+d.l1_count,0);
              const totL2   = k.demands.reduce((s,d)=>s+d.l2_count,0);
              const totSel  = k.demands.reduce((s,d)=>s+d.selections,0);
              return [
                <tr key={`hdr-${k.kam_name}`}>
                  <td colSpan={13} style={{ padding:'7px 12px', background:'#6d28d9', color:'#fff', fontWeight:'bold', fontSize:'12px' }}>
                    ▼  KAM: {k.kam_name}  ({k.demands.length} demands)
                  </td>
                </tr>,
                ...k.demands.map((d, di) => {
                  const bg = rowBg(di);
                  const bottleneck = d.selections > 0 ? '✓ Selection logged'
                                   : d.l2_count > 0 ? '~ In L2 stage'
                                   : d.l1_count > 0 ? `⚠ L1 awaiting feedback (${d.l1_count})`
                                   : d.total_submitted > 0 ? `⚠ Subs awaiting feedback (${d.total_submitted})`
                                   : '○ No subs yet';
                  return (
                    <tr key={d.id}>
                      <TD bg={bg}>{d.client_job_id}</TD>
                      <TD bg={bg} bold>{d.client_name}</TD>
                      <TD bg={bg}>{d.role_title}</TD>
                      <TD bg={bg}>{d.sourcer_names?.join(', ')}</TD>
                      <TD center>{d.d2_subs}</TD>
                      <TD center>{d.d1_subs}</TD>
                      <TD center bg={d.today_subs > 0 ? '#dcfce7' : '#fff'}>{d.today_subs}</TD>
                      <TD center bg={d.total_submitted > 0 ? '#dbeafe' : '#fff'}>{d.total_submitted}</TD>
                      <TD center bg={d.rejections > 0 ? '#fee2e2' : '#fff'}>{d.rejections}</TD>
                      <TD center bg={d.l1_count > 0 ? '#fef9c3' : '#fff'}>{d.l1_count}</TD>
                      <TD center bg={d.l2_count > 0 ? '#fde68a' : '#fff'}>{d.l2_count}</TD>
                      <TD center bg={d.selections > 0 ? '#dcfce7' : '#fff'}>{d.selections}</TD>
                      <TD bg={bottleneckBg(bottleneck)}>{bottleneck}</TD>
                    </tr>
                  );
                }),
                <tr key={`tot-${k.kam_name}`} style={{ background: '#fde68a' }}>
                  <td colSpan={4} style={{ padding:'5px 10px', fontWeight:'bold', fontSize:'12px', border:'1px solid #e2e8f0', background:'#fde68a' }}>{k.kam_name} TOTAL</td>
                  <TD center bold bg="#fde68a">{''}</TD><TD center bold bg="#fde68a">{''}</TD><TD center bold bg="#fde68a">{''}</TD>
                  <TD center bold bg="#fde68a">{totSubs}</TD>
                  <TD center bold bg="#fde68a">{''}</TD>
                  <TD center bold bg="#fde68a">{totL1}</TD>
                  <TD center bold bg="#fde68a">{totL2}</TD>
                  <TD center bold bg="#fde68a">{totSel}</TD>
                  <TD bg="#fde68a">{''}</TD>
                </tr>,
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── DL Allocation view ────────────────────────────────────────────────────────
function DLView({ data }: { data: PodReport }) {
  const [dlFilter, setDlFilter] = useState('');
  const teams = dlFilter ? data.dl_teams.filter(t => t.dl_name === dlFilter) : data.dl_teams;
  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <select value={dlFilter} onChange={e => setDlFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400">
          <option value="">All DLs</option>
          {data.dl_teams.map(t => <option key={t.dl_name} value={t.dl_name}>{t.dl_name} ({t.demands.length})</option>)}
        </select>
      </div>
      <div className="overflow-auto rounded-xl border border-slate-200" style={{ maxHeight: 'calc(100vh - 320px)' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12px', fontFamily: 'Arial' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}><tr>
            {['Customer','Role','Sourcers','Callers','Target','Sourced','Submitted','Status'].map(h =>
              <TH key={h} bg="#0f766e" color="#fff" center={['Target','Sourced','Submitted'].includes(h)}>{h}</TH>)}
          </tr></thead>
          <tbody>
            {teams.map(dl => {
              const totTarget = dl.demands.reduce((s,d)=>s+(d.sourcing_target??0),0);
              const totSourced = dl.demands.reduce((s,d)=>s+d.total_sourced,0);
              const totSub = dl.demands.reduce((s,d)=>s+d.total_submitted,0);
              return [
                <tr key={`hdr-${dl.dl_name}`}>
                  <td colSpan={8} style={{ padding:'7px 12px', background:'#0f766e', color:'#fff', fontWeight:'bold', fontSize:'12px' }}>
                    ▼  DL: {dl.dl_name}  ·  Team: {dl.recruiters.join(', ')}  ({dl.demands.length} demands)
                  </td>
                </tr>,
                ...dl.demands.map((d, di) => {
                  const bg = rowBg(di);
                  const status = d.selections > 0 ? '✓ Done' : d.total_submitted > 0 ? '~ Active' : d.total_sourced > 0 ? '⚠ Behind' : '○ Not started';
                  return (
                    <tr key={d.id}>
                      <TD bg={bg} bold>{d.client_name}</TD>
                      <TD bg={bg}>{d.role_title}</TD>
                      <TD bg={bg}>{d.sourcer_names.join(', ')}</TD>
                      <TD bg={bg}>{d.caller_names.join(', ')}</TD>
                      <TD center>{d.sourcing_target ?? '—'}</TD>
                      <TD center>{d.total_sourced}</TD>
                      <TD center bg={d.total_submitted > 0 ? '#dbeafe' : '#fff'}>{d.total_submitted}</TD>
                      <TD bg={bottleneckBg(status)}>{status}</TD>
                    </tr>
                  );
                }),
                <SubtotalRow key={`tot-${dl.dl_name}`} label={`${dl.dl_name} Total`} cols={['','',totTarget,totSourced,totSub,'']} />,
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Recruiter Workspace view ──────────────────────────────────────────────────
function RecruiterView({ data }: { data: PodReport }) {
  const [selected, setSelected] = useState(data.recruiters[0]?.name ?? '');
  const recruiter = data.recruiters.find(r => r.name === selected);

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <label className="text-xs font-semibold text-slate-500">Recruiter</label>
        <select value={selected} onChange={e => setSelected(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 min-w-[200px]">
          {data.recruiters.map(r => <option key={r.id} value={r.name}>{r.name} ({r.candidates.length} candidates)</option>)}
        </select>
        {recruiter && (
          <span className="text-xs text-slate-400">DL: {recruiter.dl_name}  ·  Type: {recruiter.recruiter_type}</span>
        )}
      </div>

      {!recruiter ? (
        <p className="text-slate-400 text-sm text-center py-10">Select a recruiter above.</p>
      ) : (
        <div className="space-y-5">
          {/* Assigned Demands */}
          {recruiter.assigned_jobs.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">▼ MY DEMANDS — today's allocations</p>
              <div className="overflow-auto rounded-xl border border-slate-200">
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12px', fontFamily: 'Arial' }}>
                  <thead><tr>
                    {['#','Demand ID','Customer','Skill / Role','KAM','Target','Sourced','Submitted','Status'].map(h =>
                      <TH key={h} bg="#0f766e" color="#fff" center={['#','Target','Sourced','Submitted'].includes(h)}>{h}</TH>)}
                  </tr></thead>
                  <tbody>
                    {recruiter.assigned_jobs.map((j, i) => {
                      const status = j.selections > 0 ? '✓ Done' : j.total_submitted > 0 ? '~ Active' : j.total_sourced > 0 ? '⚠ Behind' : '○ Not started';
                      return (
                        <tr key={j.id} style={{ background: rowBg(i) }}>
                          <TD center>{i+1}</TD>
                          <TD>{j.client_job_id}</TD>
                          <TD bold>{j.client_name}</TD>
                          <TD>{j.role_title}</TD>
                          <TD>{j.kam_name}</TD>
                          <TD center>{j.sourcing_target ?? '—'}</TD>
                          <TD center>{j.total_sourced}</TD>
                          <TD center bg={j.total_submitted > 0 ? '#dbeafe' : '#fff'}>{j.total_submitted}</TD>
                          <TD bg={bottleneckBg(status)}>{status}</TD>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Candidate Pool */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">▼ POOL BLOCK — candidate profiles ({recruiter.candidates.length})</p>
            {recruiter.candidates.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-6 bg-slate-50 rounded-xl">No candidates yet.</p>
            ) : (
              <div className="overflow-auto rounded-xl border border-slate-200" style={{ maxHeight: 'calc(100vh - 420px)' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12px', fontFamily: 'Arial' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                    <tr>
                      {[
                        ['Sourcing Date','#6d28d9'],['Pool Verified','#6d28d9'],['Name','#6d28d9'],
                        ['Mobile','#6d28d9'],['Email','#6d28d9'],['City','#6d28d9'],
                        ['Education','#6d28d9'],['Exp Range','#6d28d9'],['Company','#6d28d9'],
                        ['Skills','#6d28d9'],['Demand','#0f766e'],['Client','#0f766e'],
                        ['Total Exp','#b45309'],['CTC Curr','#b45309'],['CTC Exp','#b45309'],
                        ['Notice (wks)','#b45309'],['LWD','#b45309'],
                        ['Comm','#1e40af'],['Tech','#1e40af'],['Soft','#1e40af'],['Overall','#1e40af'],
                        ['Verdict','#1e40af'],['DL Valid','#166534'],['Submitted','#166534'],['Stage','#166534'],
                      ].map(([h,bg]) => <TH key={h} bg={bg as string} color="#fff">{h}</TH>)}
                    </tr>
                  </thead>
                  <tbody>
                    {recruiter.candidates.map((c, i) => (
                      <tr key={i} style={{ background: rowBg(i) }}>
                        <TD>{c.sourcing_date}</TD>
                        <TD center bg={c.pool_verified === 'Yes' ? '#dcfce7' : rowBg(i)}>{c.pool_verified}</TD>
                        <TD bold>{c.full_name}</TD>
                        <TD>{c.mobile}</TD>
                        <TD>{c.email}</TD>
                        <TD>{c.city}</TD>
                        <TD>{c.education}</TD>
                        <TD>{c.exp_range}</TD>
                        <TD>{c.current_company}</TD>
                        <TD>{c.skills}</TD>
                        <TD>{c.demand_id}</TD>
                        <TD bold>{c.job_client}</TD>
                        <TD center>{c.total_exp}</TD>
                        <TD center>{c.current_ctc}</TD>
                        <TD center>{c.expected_ctc}</TD>
                        <TD center>{c.notice_period_weeks}</TD>
                        <TD center>{c.last_working_day}</TD>
                        <TD center bg={scoreBg(c.comm_score)}>{c.comm_score}</TD>
                        <TD center bg={scoreBg(c.tech_score)}>{c.tech_score}</TD>
                        <TD center bg={scoreBg(c.soft_skill_score)}>{c.soft_skill_score}</TD>
                        <TD center bg={scoreBg(c.overall_score)}>{c.overall_score}</TD>
                        <TD bg={c.pass_to_validation?.startsWith('YES') ? '#dcfce7' : c.pass_to_validation?.startsWith('NO') ? '#fee2e2' : '#fef9c3'}>{c.pass_to_validation}</TD>
                        <TD center bg={c.dl_validated ? '#dcfce7' : '#fef9c3'}>{c.dl_validated ? 'Approved' : 'Pending'}</TD>
                        <TD center bg={c.submitted_to_client ? '#dbeafe' : rowBg(i)}>{c.submitted_to_client ? 'Yes' : 'No'}</TD>
                        <TD bg={statusBg[c.status] ?? rowBg(i)}>{c.status}</TD>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Bottleneck view ───────────────────────────────────────────────────────────
function BottleneckView({ data }: { data: PodReport }) {
  const today = new Date().toISOString().slice(0,10);
  return (
    <div className="overflow-auto rounded-xl border border-slate-200" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12px', fontFamily: 'Arial' }}>
        <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}><tr>
          {['Demand ID','Customer','Role','Date Opened','Days Open','Status','Bottleneck Flag'].map(h =>
            <TH key={h} bg="#991b1b" color="#fff">{h}</TH>)}
        </tr></thead>
        <tbody>
          {data.jobs.map((j, i) => {
            const days = j.created_at ? Math.floor((Date.parse(today)-Date.parse(j.created_at))/86400000) : '';
            const flag = j.selections > 0 ? '✓ Selections logged'
                       : j.l2_count > 0   ? '~ In L2 stage'
                       : j.l1_count > 0   ? '⚠ L1 awaiting feedback'
                       : j.total_sourced === 0 ? '⚠ NO SUBS yet'
                       : j.total_submitted > 0 ? '⚠ Sub→L1 SLA breach'
                       : '○ Sourced, not submitted';
            return (
              <tr key={j.id} style={{ background: rowBg(i) }}>
                <TD>{j.client_job_id}</TD>
                <TD bold>{j.client_name}</TD>
                <TD>{j.role_title}</TD>
                <TD>{j.created_at}</TD>
                <TD center>{days}</TD>
                <TD>{j.status.replace(/_/g,' ')}</TD>
                <TD bg={bottleneckBg(flag)}>{flag}</TD>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

type PodTab = 'leaderboard' | 'demand_status' | 'kam' | 'dl_allocation' | 'recruiter' | 'bottleneck';

const POD_TABS: { key: PodTab; label: string; color: string }[] = [
  { key: 'leaderboard',   label: '1. Leaderboard',     color: '#1e40af' },
  { key: 'demand_status', label: '2a. Demand Status',  color: '#0f766e' },
  { key: 'kam',           label: '6. KAM Acct.',       color: '#6d28d9' },
  { key: 'dl_allocation', label: '5. DL Allocation',   color: '#0f766e' },
  { key: 'recruiter',     label: 'Recruiter Workspace',color: '#7c3aed' },
  { key: 'bottleneck',    label: 'Bottleneck',         color: '#991b1b' },
];

export default function Export() {
  const [bhs, setBhs]               = useState<BH[]>([]);
  const [rows, setRows]             = useState<ExportRow[]>([]);
  const [loading, setLoading]       = useState(false);
  const [selectedAm, setSelectedAm] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');

  const [podData,    setPodData]    = useState<PodReport | null>(null);
  const [podLoading, setPodLoading] = useState(false);
  const [podTab,     setPodTab]     = useState<PodTab>('leaderboard');
  const [podView,    setPodView]    = useState(false);

  useEffect(() => {
    api.get<BH[]>('/business-heads').then(r => setBhs(r.data)).catch(() => {});
    fetchData();
  }, []);

  const fetchData = async (amId?: string, status?: string) => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (amId) params.business_head_id = amId;
      if (status) params.status = status;
      const { data } = await api.get<ExportRow[]>('/export/candidates', { params });
      setRows(data);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  const loadPodReport = async () => {
    if (podData) { setPodView(true); return; }
    setPodLoading(true);
    try {
      const { data } = await api.get<PodReport>('/export/pod-report');
      setPodData(data);
      setPodView(true);
    } catch { alert('Failed to load pod report.'); }
    finally { setPodLoading(false); }
  };

  const refreshPodReport = async () => {
    setPodLoading(true);
    try {
      const { data } = await api.get<PodReport>('/export/pod-report');
      setPodData(data);
    } catch { alert('Failed to refresh.'); }
    finally { setPodLoading(false); }
  };

  const downloadExcel = async () => {
    if (!podData) return;
    await generatePodReport(podData);
  };

  const onFilter = () => fetchData(selectedAm, selectedStatus);

  const exportFlatExcel = () => {
    const headers = COLUMNS.map(c => c.label);
    const data = rows.map(r => COLUMNS.map(c => r[c.key]));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    ws['!cols'] = COLUMNS.map(c => ({ wch: Math.round(c.width / 7) }));
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, ws, 'Candidates');
    XLSX.writeFile(wb, `J2W_Candidates_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const groups = COLUMNS.reduce<Record<string, typeof COLUMNS>>((acc, col) => {
    const g = col.group ?? 'Other';
    if (!acc[g]) acc[g] = [];
    acc[g].push(col);
    return acc;
  }, {});

  return (
    <Layout title={podView ? 'Pod Report' : 'Export & Reports'}>

      {/* ── Pod Report View ───────────────────────────────────────────────── */}
      {podView && podData ? (
        <div>
          {/* Top bar */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <button onClick={() => setPodView(false)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              <X size={13} /> Back to Flat View
            </button>
            <span className="text-xs text-slate-400">Report date: <strong>{podData.pod_stats.report_date}</strong></span>
            <button onClick={refreshPodReport} disabled={podLoading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60">
              <RefreshCw size={13} className={podLoading ? 'animate-spin' : ''} /> Refresh
            </button>
            <div className="ml-auto">
              <button onClick={downloadExcel}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90"
                style={{ backgroundColor: '#166534' }}>
                <Download size={14} /> Download Excel
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-4 flex-wrap">
            {POD_TABS.map(t => (
              <button key={t.key} onClick={() => setPodTab(t.key)}
                className="px-4 py-2 rounded-xl text-xs font-bold transition-all"
                style={{
                  background: podTab === t.key ? t.color : '#f1f5f9',
                  color:      podTab === t.key ? '#fff'   : '#475569',
                }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            {podTab === 'leaderboard'   && <LeaderboardView   data={podData} />}
            {podTab === 'demand_status' && <DemandStatusView  data={podData} />}
            {podTab === 'kam'           && <KAMView           data={podData} />}
            {podTab === 'dl_allocation' && <DLView            data={podData} />}
            {podTab === 'recruiter'     && <RecruiterView     data={podData} />}
            {podTab === 'bottleneck'    && <BottleneckView    data={podData} />}
          </div>
        </div>

      ) : (
        <>
          {/* ── Flat view ────────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-3 mb-5 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
            <Filter size={15} className="text-slate-400 flex-shrink-0" />
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-500 whitespace-nowrap">Business Head</label>
              <select value={selectedAm} onChange={e => setSelectedAm(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 min-w-[160px]">
                <option value="">All</option>
                {bhs.map(bh => <option key={bh.id} value={String(bh.id)}>{bh.name}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-500 whitespace-nowrap">Status</label>
              <select value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 min-w-[160px]">
                <option value="">All</option>
                {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <button onClick={onFilter}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90"
              style={{ backgroundColor: '#1a2744' }}>
              <RefreshCw size={13} /> Apply
            </button>
            <div className="ml-auto flex items-center gap-3">
              <span className="text-xs text-slate-400"><Users size={12} className="inline mr-1" />{rows.length} candidates</span>
              <button onClick={exportFlatExcel} disabled={rows.length === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 disabled:opacity-40"
                style={{ backgroundColor: '#16a34a' }}>
                <Download size={14} /> Export Flat Excel
              </button>
              <button onClick={loadPodReport} disabled={podLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 disabled:opacity-40"
                style={{ backgroundColor: '#7c3aed' }}>
                <FileSpreadsheet size={14} /> {podLoading ? 'Loading…' : 'View Pod Report'}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20 text-slate-400">
              <RefreshCw size={24} className="animate-spin mr-3" /> Loading data…
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <Users size={44} className="opacity-20 mb-3" />
              <p className="font-medium text-slate-500">No candidates match the selected filters.</p>
            </div>
          ) : (
            <div className="overflow-auto rounded-2xl border border-slate-200 shadow-sm" style={{ maxHeight: 'calc(100vh - 220px)' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: '12px', fontFamily: 'Arial, sans-serif', whiteSpace: 'nowrap' }}>
                <thead>
                  <tr>
                    {Object.entries(groups).map(([group, cols]) => (
                      <th key={group} colSpan={cols.length} style={{
                        padding: '6px 10px', color: '#fff', fontWeight: 'bold', fontSize: '11px',
                        textAlign: 'center', position: 'sticky', top: 0, zIndex: 20,
                        borderRight: '2px solid rgba(255,255,255,0.2)', letterSpacing: '0.5px',
                        background: group === 'JD Info' ? '#1a2744' : group === 'Candidate' ? '#1e40af' :
                                    group === 'Team' ? '#0f766e' : group === 'CTC' ? '#b45309' :
                                    group === 'Score' ? '#6d28d9' : '#374151',
                      }}>{group}</th>
                    ))}
                  </tr>
                  <tr>
                    {COLUMNS.map((col) => (
                      <th key={col.key} style={{
                        padding: '6px 10px', background: '#f1f5f9', color: '#374151',
                        fontWeight: 'bold', fontSize: '11px', textAlign: 'left',
                        position: 'sticky', top: 30, zIndex: 15,
                        border: '1px solid #cbd5e1', minWidth: col.width,
                      }}>{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, ri) => {
                    const isNewAm = ri === 0 || rows[ri-1].business_head !== row.business_head;
                    const isNewClient = ri === 0 || rows[ri-1].client_name !== row.client_name || rows[ri-1].business_head !== row.business_head;
                    return (
                      <tr key={ri} style={{ backgroundColor: ri % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                        {COLUMNS.map((col, ci) => {
                          const val = row[col.key];
                          let bg = ri % 2 === 0 ? '#ffffff' : '#f8fafc';
                          if (col.key === 'business_head' && isNewAm) bg = '#dbeafe';
                          if (col.key === 'client_name' && isNewClient) bg = '#eff6ff';
                          if (col.key === 'candidate_status') bg = STATUS_COLORS[val.replace(/ /g,'_')] ?? bg;
                          if (['overall_score','tech_score','soft_skill_score'].includes(col.key)) bg = SCORE_COLOR(val) || bg;
                          return (
                            <td key={col.key} style={{
                              padding: '5px 10px', border: '1px solid #e2e8f0', backgroundColor: bg,
                              maxWidth: col.width, overflow: 'hidden', textOverflow: 'ellipsis',
                              fontWeight: col.key === 'candidate_name' ? 'bold' : 'normal',
                              color: col.key === 'business_head' ? '#1e40af' : '#1a202c',
                              borderLeft: ci === 0 ? '1px solid #e2e8f0' :
                                (col.key === 'candidate_name' || col.key === 'total_exp' ||
                                 col.key === 'current_ctc' || col.key === 'overall_score' ||
                                 col.key === 'sourced_by') ? '2px solid #cbd5e1' : '1px solid #e2e8f0',
                            }}>{val}</td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
