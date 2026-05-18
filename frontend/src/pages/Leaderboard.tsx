import { useEffect, useState, useMemo } from 'react';
import {
  RefreshCw, Trophy, TrendingUp, Users, Briefcase,
  ChevronUp, ChevronDown, ChevronsUpDown, Activity,
  Building2, CheckCircle, Target, AlertCircle, UserCheck,
} from 'lucide-react';
import Layout from '../components/Layout';
import api from '../api/client';

// ── Types ─────────────────────────────────────────────────────────────────────
interface CandidateRow {
  sourcing_date: string; full_name: string; status: string;
  overall_score: string; dl_validated: boolean; submitted_to_client: boolean;
  current_stage: string; job_client: string; job_title: string;
}
interface JobData {
  id: number; client_name: string; client_job_id: string; role_title: string;
  headcount: number; status: string; created_at: string; deadline: string;
  sourcing_target: number | null; kam_name: string; dl_name: string; bh_name: string;
  sourcer_names: string[]; caller_names: string[];
  total_sourced: number; validated: number; total_submitted: number;
  l1_count: number; l2_count: number; selections: number; rejections: number;
  today_subs: number; d1_subs: number; d2_subs: number;
}
interface RecruiterData {
  id: number; name: string; recruiter_type: string; dl_name: string;
  sourcing_load: number; calling_load: number;
  assigned_jobs: JobData[]; candidates: CandidateRow[];
}
interface DLTeam { dl_name: string; recruiters: string[]; demands: JobData[]; }
interface KAMData { kam_name: string; demands: JobData[]; }
interface PodReport {
  jobs: JobData[]; recruiters: RecruiterData[]; dl_teams: DLTeam[]; kam_data: KAMData[];
  pod_stats: {
    report_date: string; total_demands: number; total_sourced: number;
    total_validated: number; total_submitted: number; total_l1: number;
    total_l2: number; total_selections: number; today_subs: number; recruiters_count: number;
  };
}
interface UserActivity {
  id: number; name: string; role: string; secondary_role: string | null;
  last_login_at: string | null;
  last_action: { action: string; description: string; entity_type: string | null; entity_id: number | null; at: string; } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const MEDALS = ['🥇', '🥈', '🥉'];

type Period = 'today' | 'yesterday' | 'week' | 'month' | 'all';
const PERIOD_LABELS: Record<Period, string> = {
  today: 'Today', yesterday: 'Yesterday', week: 'This Week', month: 'This Month', all: 'All Time',
};
function periodRange(period: Period) {
  const now = new Date();
  const sod = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (period === 'all')       return { from: null as Date | null, to: null as Date | null };
  if (period === 'today')     { const d = sod(now); return { from: d, to: now }; }
  if (period === 'yesterday') { const s = sod(now); s.setDate(s.getDate()-1); return { from: s, to: sod(now) }; }
  if (period === 'week')      { const s = sod(now); s.setDate(s.getDate()-s.getDay()); return { from: s, to: now }; }
  const s = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: s, to: now };
}
function inRange(dateStr: string, from: Date | null, to: Date | null) {
  if (!from && !to) return true;
  if (!dateStr || dateStr === '—') return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  if (from && d < from) return false;
  if (to   && d > to)   return false;
  return true;
}
function timeAgo(isoStr: string | null) {
  if (!isoStr) return 'Never';
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(isoStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

// ── Sort ──────────────────────────────────────────────────────────────────────
type SortDir = 'asc' | 'desc' | null;
function useSortState(defaultCol: string, defaultDir: SortDir = 'desc') {
  const [col, setCol] = useState(defaultCol);
  const [dir, setDir] = useState<SortDir>(defaultDir);
  const toggle = (c: string) => {
    if (col === c) setDir(d => d === 'desc' ? 'asc' : d === 'asc' ? null : 'desc');
    else { setCol(c); setDir('desc'); }
  };
  return { col, dir, toggle };
}
function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active || !dir) return <ChevronsUpDown size={11} className="opacity-30 ml-0.5 inline" />;
  return dir === 'asc'
    ? <ChevronUp   size={11} className="text-blue-300 ml-0.5 inline" />
    : <ChevronDown size={11} className="text-blue-300 ml-0.5 inline" />;
}
function sortRows<T>(rows: T[], col: string, dir: SortDir): T[] {
  if (!dir || !col) return rows;
  return [...rows].sort((a, b) => {
    const av = (a as Record<string, unknown>)[col];
    const bv = (b as Record<string, unknown>)[col];
    const an = parseFloat(String(av ?? 0));
    const bn = parseFloat(String(bv ?? 0));
    if (!isNaN(an) && !isNaN(bn)) return dir === 'asc' ? an - bn : bn - an;
    return dir === 'asc' ? String(av ?? '').localeCompare(String(bv ?? '')) : String(bv ?? '').localeCompare(String(av ?? ''));
  });
}

// ── Status badge (On Target / On Pace / Behind / Not Started) ─────────────────
function StatusBadge({ done, target }: { done: number; target: number }) {
  if (target === 0) return <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-slate-100 text-slate-400">—</span>;
  if (done === 0)   return <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-slate-100 text-slate-500">Not started</span>;
  const p = pct(done, target);
  if (p >= 100) return <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-700">✓ On target</span>;
  if (p >= 70)  return <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-700">~ On pace</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-red-100 text-red-600 flex items-center gap-1 w-fit"><AlertCircle size={10} /> Behind</span>;
}

// ── Table primitives ──────────────────────────────────────────────────────────
function TH({ children, onClick, sortKey, sortState, right, center }: {
  children: React.ReactNode; onClick?: () => void; sortKey?: string;
  sortState?: ReturnType<typeof useSortState>; right?: boolean; center?: boolean;
}) {
  const active = sortState && sortKey ? sortState.col === sortKey : false;
  return (
    <th onClick={onClick} style={{
      padding: '8px 12px', background: '#1e293b', color: '#94a3b8', fontSize: '11px',
      fontWeight: 700, borderBottom: '1px solid #334155', whiteSpace: 'nowrap',
      textAlign: right ? 'right' : center ? 'center' : 'left',
      cursor: onClick ? 'pointer' : 'default', letterSpacing: '0.3px',
    }} className={onClick ? 'hover:bg-slate-700 transition-colors' : ''}>
      {children}
      {sortKey && sortState && <SortIcon active={active} dir={active ? sortState.dir : null} />}
    </th>
  );
}
function TD({ children, bg, bold, right, center, mono, color }: {
  children: React.ReactNode; bg?: string; bold?: boolean; right?: boolean;
  center?: boolean; mono?: boolean; color?: string;
}) {
  return (
    <td style={{
      padding: '8px 12px', borderBottom: '1px solid #f1f5f9', backgroundColor: bg ?? '#fff',
      fontWeight: bold ? 700 : 400, fontSize: '13px', color: color,
      textAlign: right ? 'right' : center ? 'center' : 'left',
      whiteSpace: 'nowrap', fontFamily: mono ? 'JetBrains Mono, monospace' : undefined,
    }}>{children ?? '—'}</td>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────────
function KPI({ label, value, sub, color, icon }: {
  label: string; value: string | number; sub?: string; color: string; icon?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        {icon && <span style={{ color }}>{icon}</span>}
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
      </div>
      <p className="text-2xl font-black tabular-nums" style={{ color }}>{value}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ icon, title, sub }: { icon: React.ReactNode; title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0 text-slate-500">
        {icon}
      </div>
      <div>
        <p className="text-sm font-bold text-slate-800">{title}</p>
        {sub && <p className="text-xs text-slate-400">{sub}</p>}
      </div>
    </div>
  );
}

// ── TODAY'S FOCUS TAB ─────────────────────────────────────────────────────────
function TodayTab({ data }: { data: PodReport }) {
  const today = useMemo(() => periodRange('today'), []);
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  // ── Recruiter rows ──
  const recruiterRows = useMemo(() => {
    return data.recruiters.map(r => {
      const todayCands   = r.candidates.filter(c => inRange(c.sourcing_date, today.from, today.to));
      const sourced      = todayCands.length;
      const dlVerified   = todayCands.filter(c => c.dl_validated).length;
      // Today's submissions = sum of today_subs from assigned jobs
      const todaySubs    = r.assigned_jobs.reduce((s, j) => s + j.today_subs, 0);
      // Day target: sourcing_target / 30 as a rough daily rate, times assigned jobs
      const totalTarget  = r.assigned_jobs.reduce((s, j) => s + (j.sourcing_target ?? 0), 0);
      const dayTarget    = totalTarget > 0 ? Math.max(1, Math.round(totalTarget / 30)) : 0;
      return {
        id: r.id, name: r.name, dl: r.dl_name,
        jds: r.assigned_jobs.length, sourced, dlVerified, todaySubs, dayTarget,
        pctDone: pct(todaySubs, dayTarget),
      };
    }).sort((a, b) => b.todaySubs - a.todaySubs);
  }, [data, today]);

  // ── DL rows ──
  const dlRows = useMemo(() => {
    return data.dl_teams.map(dl => {
      const demands   = dl.demands;
      const todaySubs = demands.reduce((s, d) => s + d.today_subs, 0);
      // DL verified today = candidates validated today (approx: dl_validated cands sourced today)
      const teamRecruiters = data.recruiters.filter(r => r.dl_name === dl.dl_name);
      const dlVerifiedToday = teamRecruiters.flatMap(r =>
        r.candidates.filter(c => inRange(c.sourcing_date, today.from, today.to) && c.dl_validated)
      ).length;
      const totalDemands = demands.length;
      const sentToCustomer = todaySubs;
      return {
        dlName: dl.dl_name, teamSize: dl.recruiters.length,
        demands: totalDemands, dlVerifiedToday, sentToCustomer, todaySubs,
        pctVerified: pct(dlVerifiedToday, todaySubs),
      };
    }).sort((a, b) => b.todaySubs - a.todaySubs);
  }, [data, today]);

  // ── KAM rows ──
  const kamRows = useMemo(() => {
    return data.kam_data.map(k => {
      const demands        = k.demands;
      const openDemands    = demands.filter(d => d.status === 'open').length;
      const awaitingFdbk   = demands.reduce((s, d) => s + d.l1_count, 0); // subs awaiting L1 feedback
      const todayL1        = 0; // would need daily L1 tracking — not in current data
      const todayL2        = 0;
      const todaySel       = demands.reduce((s, d) => s + d.selections, 0);
      const todaySubs      = demands.reduce((s, d) => s + d.today_subs, 0);
      return {
        kamName: k.kam_name, openDemands, awaitingFdbk, todayL1, todayL2, todaySel, todaySubs,
        totalHC: demands.reduce((s, d) => s + d.headcount, 0),
      };
    }).sort((a, b) => b.todaySubs - a.todaySubs);
  }, [data]);

  const ps = data.pod_stats;

  return (
    <div className="space-y-8">
      {/* Pod-level today headline */}
      <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(135deg, #0B1437 0%, #1E3A5F 100%)' }}>
        <p className="text-white/60 text-xs font-bold uppercase tracking-widest mb-3">
          Pod total — today's submissions
        </p>
        <div className="flex items-end gap-4">
          <div>
            <p className="text-5xl font-black text-white tabular-nums">{ps.today_subs}</p>
            <p className="text-white/50 text-xs mt-1">submissions sent to clients today</p>
          </div>
          <div className="grid grid-cols-3 gap-3 ml-8">
            <div className="bg-white/10 rounded-xl px-4 py-2 text-center">
              <p className="text-white text-lg font-black">{ps.total_demands}</p>
              <p className="text-white/50 text-[10px] font-semibold uppercase tracking-wide">Open JDs</p>
            </div>
            <div className="bg-white/10 rounded-xl px-4 py-2 text-center">
              <p className="text-white text-lg font-black">{ps.total_validated}</p>
              <p className="text-white/50 text-[10px] font-semibold uppercase tracking-wide">DL Verified</p>
            </div>
            <div className="bg-white/10 rounded-xl px-4 py-2 text-center">
              <p className="text-white text-lg font-black">{ps.total_selections}</p>
              <p className="text-white/50 text-[10px] font-semibold uppercase tracking-wide">Selections</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recruiter section */}
      <div>
        <SectionHeader icon={<Users size={16} />} title="Recruiter Leaderboard" sub="Today's submissions · DL-verified · vs daily target" />
        <div className="overflow-auto rounded-xl border border-slate-100" style={{ background: '#fff' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr style={{ background: '#1e293b' }}>
              <TH>Rank</TH>
              <TH>Recruiter</TH>
              <TH>Pod (DL)</TH>
              <TH center>JDs Assigned</TH>
              <TH center>Sourced Today</TH>
              <TH center>DL Verified</TH>
              <TH center>Submitted Today</TH>
              <TH center>Day Target</TH>
              <TH center>% Done</TH>
              <TH center>Status</TH>
            </tr></thead>
            <tbody>
              {recruiterRows.length === 0 && (
                <tr><td colSpan={10} className="text-center py-10 text-slate-400 text-sm">No recruiters found</td></tr>
              )}
              {recruiterRows.map((r, i) => {
                const rank = i + 1;
                const pctDone = r.pctDone;
                const doneBg  = pctDone >= 100 ? '#f0fdf4' : pctDone >= 70 ? '#fffbeb' : pctDone > 0 ? '#fef2f2' : '#fff';
                return (
                  <tr key={r.id} style={{ background: rank <= 3 ? ['#fefce8','#f8fafc','#fff7ed'][rank-1] : i%2===0 ? '#fff' : '#fafafa' }}>
                    <TD center bold={rank<=3}>{rank <= 3 ? MEDALS[rank-1] : rank}</TD>
                    <TD bold>{r.name}</TD>
                    <TD>{r.dl || '—'}</TD>
                    <TD center>{r.jds}</TD>
                    <TD bg={r.sourced > 0 ? '#eff6ff' : undefined} center bold>{r.sourced}</TD>
                    <TD bg={r.dlVerified > 0 ? '#f0fdf4' : undefined} center>{r.dlVerified}</TD>
                    <TD bg={r.todaySubs > 0 ? '#f5f3ff' : undefined} center bold>{r.todaySubs}</TD>
                    <TD center color="#64748b">{r.dayTarget > 0 ? r.dayTarget : '—'}</TD>
                    <TD bg={r.dayTarget > 0 ? doneBg : undefined} center bold={r.pctDone > 0}>
                      {r.dayTarget > 0 ? `${r.pctDone}%` : '—'}
                    </TD>
                    <td style={{ padding: '6px 12px', borderBottom: '1px solid #f1f5f9' }}>
                      <StatusBadge done={r.todaySubs} target={r.dayTarget} />
                    </td>
                  </tr>
                );
              })}
              {/* Pod total row */}
              <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                <TD bold center colSpan={4}>POD TOTAL</TD>
                <TD bold center>{recruiterRows.reduce((s,r)=>s+r.sourced,0)}</TD>
                <TD bold center>{recruiterRows.reduce((s,r)=>s+r.dlVerified,0)}</TD>
                <TD bold center>{ps.today_subs}</TD>
                <TD bold center color="#64748b">{recruiterRows.reduce((s,r)=>s+r.dayTarget,0)}</TD>
                <TD bold center>{pct(ps.today_subs, recruiterRows.reduce((s,r)=>s+r.dayTarget,0))}%</TD>
                <td style={{ padding: '6px 12px', borderBottom: '1px solid #f1f5f9' }}>
                  <StatusBadge done={ps.today_subs} target={recruiterRows.reduce((s,r)=>s+r.dayTarget,0)} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* DL section */}
      <div>
        <SectionHeader icon={<UserCheck size={16} />} title="Delivery Lead Leaderboard" sub="Demands owned · Verifications · Sent to customer today" />
        <div className="overflow-auto rounded-xl border border-slate-100">
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr style={{ background: '#1e293b' }}>
              <TH>Delivery Lead</TH>
              <TH center>Team Size</TH>
              <TH center>Demands Owned</TH>
              <TH center>DL Verified Today</TH>
              <TH center>Sent to Customer</TH>
              <TH center>% Verified</TH>
              <TH center>Status</TH>
            </tr></thead>
            <tbody>
              {dlRows.map((dl, i) => (
                <tr key={dl.dlName} style={{ background: i%2===0 ? '#fff' : '#fafafa' }}>
                  <TD bold>{dl.dlName}</TD>
                  <TD center>
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">{dl.teamSize} recruiters</span>
                  </TD>
                  <TD center>{dl.demands}</TD>
                  <TD bg={dl.dlVerifiedToday > 0 ? '#f0fdf4' : undefined} center bold>{dl.dlVerifiedToday}</TD>
                  <TD bg={dl.sentToCustomer > 0 ? '#f5f3ff' : undefined} center bold>{dl.sentToCustomer}</TD>
                  <TD bg={dl.pctVerified > 0 ? (dl.pctVerified >= 80 ? '#f0fdf4' : '#fffbeb') : undefined} center>
                    {dl.todaySubs > 0 ? `${dl.pctVerified}%` : '—'}
                  </TD>
                  <td style={{ padding: '6px 12px', borderBottom: '1px solid #f1f5f9' }}>
                    <StatusBadge done={dl.sentToCustomer} target={Math.max(1, Math.round(dl.demands * 0.5))} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* KAM section */}
      <div>
        <SectionHeader icon={<Briefcase size={16} />} title="KAM Leaderboard" sub="Open demands · Subs awaiting feedback · Today's activity" />
        <div className="overflow-auto rounded-xl border border-slate-100">
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr style={{ background: '#1e293b' }}>
              <TH>KAM</TH>
              <TH center>Open Demands</TH>
              <TH center>Total HC</TH>
              <TH center>Subs Awaiting L1 Fdbk</TH>
              <TH center>Selections (All Time)</TH>
              <TH center>Today's Subs</TH>
              <TH center>Submitted (Total)</TH>
            </tr></thead>
            <tbody>
              {kamRows.map((k, i) => (
                <tr key={k.kamName} style={{ background: i%2===0 ? '#fff' : '#fafafa' }}>
                  <TD bold>{k.kamName}</TD>
                  <TD center>{k.openDemands}</TD>
                  <TD center>{k.totalHC}</TD>
                  <TD bg={k.awaitingFdbk > 0 ? '#fffbeb' : undefined} center bold>{k.awaitingFdbk}</TD>
                  <TD bg={k.todaySel > 0 ? '#bbf7d0' : undefined} center bold={k.todaySel > 0}>{k.todaySel}</TD>
                  <TD bg={k.todaySubs > 0 ? '#f0fdf4' : undefined} center bold={k.todaySubs > 0}>{k.todaySubs}</TD>
                  <TD bg={k.todaySubs > 0 ? '#f5f3ff' : undefined} center>{data.jobs.filter(j=>j.kam_name===k.kamName).reduce((s,j)=>s+j.total_submitted,0)}</TD>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── BY CLIENT (BH-WISE) TAB ───────────────────────────────────────────────────
function ClientTab({ data }: { data: PodReport }) {
  const sort = useSortState('totalSubmitted');

  // Group jobs by bh_name (business head = client account)
  const groups = useMemo(() => {
    const map: Record<string, JobData[]> = {};
    for (const j of data.jobs) {
      const key = j.bh_name || 'Unassigned';
      if (!map[key]) map[key] = [];
      map[key].push(j);
    }
    return Object.entries(map).map(([bh, jobs]) => {
      // Also group by client_name within BH
      const clients: Record<string, JobData[]> = {};
      for (const j of jobs) {
        if (!clients[j.client_name]) clients[j.client_name] = [];
        clients[j.client_name].push(j);
      }
      return {
        bh,
        totalDemands:    jobs.length,
        totalHC:         jobs.reduce((s, j) => s + j.headcount, 0),
        totalSourced:    jobs.reduce((s, j) => s + j.total_sourced, 0),
        totalValidated:  jobs.reduce((s, j) => s + j.validated, 0),
        totalSubmitted:  jobs.reduce((s, j) => s + j.total_submitted, 0),
        totalL1:         jobs.reduce((s, j) => s + j.l1_count, 0),
        totalL2:         jobs.reduce((s, j) => s + j.l2_count, 0),
        totalSel:        jobs.reduce((s, j) => s + j.selections, 0),
        todaySubs:       jobs.reduce((s, j) => s + j.today_subs, 0),
        clients: Object.entries(clients).map(([client, cjobs]) => ({
          client,
          demands:   cjobs.length,
          hc:        cjobs.reduce((s,j)=>s+j.headcount,0),
          sourced:   cjobs.reduce((s,j)=>s+j.total_sourced,0),
          validated: cjobs.reduce((s,j)=>s+j.validated,0),
          submitted: cjobs.reduce((s,j)=>s+j.total_submitted,0),
          l1:        cjobs.reduce((s,j)=>s+j.l1_count,0),
          l2:        cjobs.reduce((s,j)=>s+j.l2_count,0),
          sel:       cjobs.reduce((s,j)=>s+j.selections,0),
          today:     cjobs.reduce((s,j)=>s+j.today_subs,0),
          dls:       [...new Set(cjobs.map(j=>j.dl_name).filter(Boolean))],
          kams:      [...new Set(cjobs.map(j=>j.kam_name).filter(Boolean))],
        })),
      };
    });
  }, [data]);

  const sorted = useMemo(() => sortRows(groups, sort.col, sort.dir), [groups, sort.col, sort.dir]);

  const PS_COLORS = ['#2563EB','#0891B2','#7C3AED','#F59E0B','#EF4444','#10B981','#EC4899'];

  return (
    <div className="space-y-5">
      {/* Summary table */}
      <div className="overflow-auto rounded-xl border border-slate-100">
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead><tr style={{ background: '#1e293b' }}>
            <TH sortKey="bh" sortState={sort} onClick={() => sort.toggle('bh')}>Business Head</TH>
            <TH sortKey="totalDemands" sortState={sort} onClick={() => sort.toggle('totalDemands')} center>Demands</TH>
            <TH sortKey="totalHC" sortState={sort} onClick={() => sort.toggle('totalHC')} center>Headcount</TH>
            <TH sortKey="totalSourced" sortState={sort} onClick={() => sort.toggle('totalSourced')} center>Sourced</TH>
            <TH sortKey="totalValidated" sortState={sort} onClick={() => sort.toggle('totalValidated')} center>DL Verified</TH>
            <TH sortKey="totalSubmitted" sortState={sort} onClick={() => sort.toggle('totalSubmitted')} center>Submitted</TH>
            <TH sortKey="totalL1" sortState={sort} onClick={() => sort.toggle('totalL1')} center>L1</TH>
            <TH sortKey="totalL2" sortState={sort} onClick={() => sort.toggle('totalL2')} center>L2</TH>
            <TH sortKey="totalSel" sortState={sort} onClick={() => sort.toggle('totalSel')} center>Selections</TH>
            <TH sortKey="todaySubs" sortState={sort} onClick={() => sort.toggle('todaySubs')} center>Today's Subs</TH>
            <TH center>Fill Rate</TH>
          </tr></thead>
          <tbody>
            {sorted.map((g, i) => (
              <tr key={g.bh} style={{ background: i%2===0 ? '#fff' : '#fafafa' }}>
                <td style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, fontSize: 13 }}>
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-xl flex items-center justify-center text-white text-[10px] font-black flex-shrink-0"
                      style={{ background: PS_COLORS[i % PS_COLORS.length] }}>
                      {g.bh.slice(0,2).toUpperCase()}
                    </div>
                    {g.bh}
                  </div>
                </td>
                <TD center>{g.totalDemands}</TD>
                <TD center>{g.totalHC}</TD>
                <TD bg={g.totalSourced > 0 ? '#eff6ff' : undefined} center bold>{g.totalSourced}</TD>
                <TD bg={g.totalValidated > 0 ? '#f0fdf4' : undefined} center>{g.totalValidated}</TD>
                <TD bg={g.totalSubmitted > 0 ? '#f5f3ff' : undefined} center bold>{g.totalSubmitted}</TD>
                <TD bg={g.totalL1 > 0 ? '#fffbeb' : undefined} center>{g.totalL1}</TD>
                <TD bg={g.totalL2 > 0 ? '#fefce8' : undefined} center>{g.totalL2}</TD>
                <TD bg={g.totalSel > 0 ? '#f0fdf4' : undefined} center bold={g.totalSel > 0}>{g.totalSel}</TD>
                <TD bg={g.todaySubs > 0 ? '#f0fdf4' : undefined} center bold={g.todaySubs > 0}>{g.todaySubs}</TD>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9', textAlign: 'center' }}>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{ background: pct(g.totalSel, g.totalHC) > 50 ? '#dcfce7' : pct(g.totalSel, g.totalHC) > 20 ? '#fef9c3' : '#f1f5f9',
                             color:      pct(g.totalSel, g.totalHC) > 50 ? '#15803d' : pct(g.totalSel, g.totalHC) > 20 ? '#92400e' : '#64748b' }}>
                    {pct(g.totalSel, g.totalHC)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Per-BH client breakdown cards */}
      <div className="space-y-4">
        {sorted.map((g, gi) => (
          <details key={g.bh} className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm" open={gi === 0}>
            <summary className="px-5 py-4 cursor-pointer flex items-center justify-between" style={{ listStyle: 'none' }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-black"
                  style={{ background: PS_COLORS[gi % PS_COLORS.length] }}>
                  {g.bh.slice(0,2).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">{g.bh}</p>
                  <p className="text-xs text-slate-400">{g.totalDemands} demands · {g.clients.length} clients · HC {g.totalHC}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-blue-700 font-bold">{g.totalSourced} sourced</span>
                <span className="text-violet-700 font-bold">{g.totalSubmitted} submitted</span>
                <span className="text-emerald-700 font-bold">{g.totalSel} sel</span>
              </div>
            </summary>
            <div className="px-5 pb-5">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {g.clients.map(c => (
                  <div key={c.client} className="rounded-xl border border-slate-100 p-4 bg-slate-50/50">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="text-sm font-bold text-slate-800">{c.client}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {c.demands} JD{c.demands!==1?'s':''} · HC {c.hc}
                          {c.kams.length > 0 && ` · KAM: ${c.kams[0]}`}
                        </p>
                      </div>
                      {c.today > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                          +{c.today} today
                        </span>
                      )}
                    </div>
                    {/* Pipeline mini-funnel */}
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'Sourced',   val: c.sourced,   color: '#2563EB', bg: '#eff6ff' },
                        { label: 'Submitted', val: c.submitted, color: '#7C3AED', bg: '#f5f3ff' },
                        { label: 'Selected',  val: c.sel,       color: '#059669', bg: '#f0fdf4' },
                      ].map(s => (
                        <div key={s.label} className="rounded-lg p-2 text-center" style={{ background: s.bg }}>
                          <p className="text-lg font-black tabular-nums" style={{ color: s.color }}>{s.val}</p>
                          <p className="text-[9px] font-semibold" style={{ color: s.color }}>{s.label}</p>
                        </div>
                      ))}
                    </div>
                    {c.dls.length > 0 && (
                      <p className="text-[10px] text-slate-400 mt-2">DL: {c.dls.join(', ')}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

// ── RECRUITER RANKINGS TAB ────────────────────────────────────────────────────
function RecruiterTab({ data, range, activities }: {
  data: PodReport; range: { from: Date | null; to: Date | null }; activities: UserActivity[];
}) {
  const sort = useSortState('submitted');
  const actMap = useMemo(() => {
    const m: Record<number, UserActivity> = {};
    activities.forEach(a => { m[a.id] = a; });
    return m;
  }, [activities]);

  const rows = useMemo(() => data.recruiters.map(r => {
    const fc = r.candidates.filter(c => inRange(c.sourcing_date, range.from, range.to));
    const sourced    = fc.length;
    const validated  = fc.filter(c => c.dl_validated).length;
    const submitted  = fc.filter(c => c.submitted_to_client).length;
    const scores     = fc.map(c => parseFloat(c.overall_score)).filter(n => !isNaN(n));
    const avgScore   = scores.length ? scores.reduce((a,b)=>a+b,0)/scores.length : null;
    const act        = actMap[r.id];
    const lastSeen   = act?.last_action?.at ?? act?.last_login_at ?? null;
    const isOnline   = lastSeen ? Date.now() - new Date(lastSeen).getTime() < 30*60*1000 : false;
    const l1 = r.assigned_jobs.reduce((s,j)=>s+j.l1_count,0);
    const sel= r.assigned_jobs.reduce((s,j)=>s+j.selections,0);
    return {
      id: r.id, name: r.name, dl: r.dl_name,
      type: r.recruiter_type === 'sourcer' ? 'S' : r.recruiter_type === 'caller' ? 'C' : 'S+C',
      demands: r.assigned_jobs.length, sourced, validated, submitted, l1, sel,
      avgScore: avgScore !== null ? avgScore.toFixed(2) : '—',
      convPct: pct(submitted, sourced), selPct: pct(sel, submitted),
      lastSeen, isOnline, lastAction: act?.last_action ?? null,
    };
  }), [data, range, actMap]);

  const sorted = useMemo(() => sortRows(rows, sort.col, sort.dir), [rows, sort.col, sort.dir]);

  const ACTION_LABELS: Record<string, { label: string; color: string; bg: string }> = {
    sourced_candidate:  { label: 'Sourced',      color: '#0284c7', bg: '#e0f2fe' },
    saved_assessment:   { label: 'Assessment',   color: '#7c3aed', bg: '#ede9fe' },
    validated_candidate:{ label: 'Validated',    color: '#059669', bg: '#dcfce7' },
    submitted_to_client:{ label: 'Submitted',    color: '#1d4ed8', bg: '#dbeafe' },
    login:              { label: 'Logged in',    color: '#64748b', bg: '#f1f5f9' },
  };

  return (
    <div className="overflow-auto rounded-xl border border-slate-100">
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead><tr style={{ background: '#1e293b' }}>
          <TH>Rank</TH>
          <TH sortKey="name" sortState={sort} onClick={()=>sort.toggle('name')}>Recruiter</TH>
          <TH sortKey="dl" sortState={sort} onClick={()=>sort.toggle('dl')}>Pod (DL)</TH>
          <TH center>Type</TH>
          <TH sortKey="demands" sortState={sort} onClick={()=>sort.toggle('demands')} center>JDs</TH>
          <TH sortKey="sourced"   sortState={sort} onClick={()=>sort.toggle('sourced')}   center>Sourced</TH>
          <TH sortKey="validated" sortState={sort} onClick={()=>sort.toggle('validated')} center>DL Verified</TH>
          <TH sortKey="submitted" sortState={sort} onClick={()=>sort.toggle('submitted')} center>Submitted</TH>
          <TH sortKey="l1"        sortState={sort} onClick={()=>sort.toggle('l1')}        center>In L1/L2</TH>
          <TH sortKey="sel"       sortState={sort} onClick={()=>sort.toggle('sel')}       center>Selections</TH>
          <TH sortKey="convPct"   sortState={sort} onClick={()=>sort.toggle('convPct')}   center>Conv %</TH>
          <TH center>Online</TH>
          <TH>Last Action</TH>
        </tr></thead>
        <tbody>
          {sorted.length === 0 && <tr><td colSpan={13} className="text-center py-10 text-slate-400 text-sm">No data for this period</td></tr>}
          {sorted.map((r, i) => {
            const rank = i+1;
            const rb = rank<=3 ? ['#fefce855','#f8fafc','#fff7ed'][rank-1] : i%2===0?'#fff':'#fafafa';
            const meta = r.lastAction ? (ACTION_LABELS[r.lastAction.action] ?? { label: r.lastAction.action.replace(/_/g,' '), color:'#475569', bg:'#f1f5f9' }) : null;
            return (
              <tr key={r.id} style={{ background: rb }}>
                <TD center bold={rank<=3}>{rank<=3 ? MEDALS[rank-1] : rank}</TD>
                <TD bold={rank<=3}>{r.name}</TD>
                <TD>{r.dl||'—'}</TD>
                <TD center>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background:'#e0e7ff', color:'#3730a3' }}>{r.type}</span>
                </TD>
                <TD center>{r.demands}</TD>
                <TD bg={r.sourced>0?'#eff6ff':rb} center bold>{r.sourced}</TD>
                <TD bg={r.validated>0?'#f0fdf4':rb} center>{r.validated}</TD>
                <TD bg={r.submitted>0?'#f5f3ff':rb} center bold={r.submitted>0}>{r.submitted}</TD>
                <TD bg={r.l1>0?'#fffbeb':rb} center>{r.l1}</TD>
                <TD bg={r.sel>0?'#dcfce7':rb} center bold={r.sel>0}>{r.sel}</TD>
                <TD bg={r.convPct>0?(r.convPct>=60?'#f0fdf4':r.convPct>=30?'#fffbeb':'#fef2f2'):rb} center>{r.convPct}%</TD>
                <td style={{ padding:'8px 12px', borderBottom:'1px solid #f1f5f9', textAlign:'center' }}>
                  <span className="flex items-center gap-1 text-xs justify-center" style={{ color: r.isOnline?'#059669':'#94a3b8' }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: r.isOnline?'#22c55e':'#cbd5e1' }} />
                    {timeAgo(r.lastSeen)}
                  </span>
                </td>
                <td style={{ padding:'8px 12px', borderBottom:'1px solid #f1f5f9' }}>
                  {meta ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                      style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>
                  ) : <span className="text-xs text-slate-300">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── DEMAND HEALTH TAB (unchanged core) ───────────────────────────────────────
function DemandTab({ data }: { data: PodReport }) {
  const sort = useSortState('total_sourced');
  const [search, setSearch] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [bhFilter, setBhFilter] = useState('');

  const clients = useMemo(() => [...new Set(data.jobs.map(j => j.client_name))].sort(), [data]);
  const bhs = useMemo(() => [...new Set(data.jobs.map(j => j.bh_name || 'Unassigned'))].sort(), [data]);

  const rows = useMemo(() => {
    let jobs = data.jobs;
    if (search)       jobs = jobs.filter(j => `${j.client_name} ${j.role_title} ${j.client_job_id}`.toLowerCase().includes(search.toLowerCase()));
    if (clientFilter) jobs = jobs.filter(j => j.client_name === clientFilter);
    if (bhFilter)     jobs = jobs.filter(j => (j.bh_name || 'Unassigned') === bhFilter);
    const today = new Date();
    return jobs.map(j => {
      const opened = j.created_at ? new Date(j.created_at) : null;
      const daysOpen = opened ? Math.floor((today.getTime() - opened.getTime()) / 86400000) : null;
      const health = j.selections > 0 ? { label: '✓ Has selections',   bg: '#dcfce7' }
        : j.l2_count > 0              ? { label: '~ In L2',            bg: '#fef9c3' }
        : j.l1_count > 0              ? { label: '~ L1 pending fdbk',  bg: '#fef3c7' }
        : j.total_submitted > 0       ? { label: '⚠ Sub → L1 gap',     bg: '#fee2e2' }
        : j.total_sourced === 0       ? { label: '🔴 No sourcing',      bg: '#fecaca' }
        :                               { label: '○ In progress',       bg: '#f1f5f9' };
      return { ...j, daysOpen, health };
    });
  }, [data, search, clientFilter, bhFilter]);

  const sorted = useMemo(() => sortRows(rows, sort.col, sort.dir), [rows, sort.col, sort.dir]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search client / role / ID…"
            className="pl-3 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 w-64" />
        </div>
        <select value={bhFilter} onChange={e => setBhFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none">
          <option value="">All Business Heads</option>
          {bhs.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={clientFilter} onChange={e => setClientFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none">
          <option value="">All Clients</option>
          {clients.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="text-xs text-slate-400 font-medium">{sorted.length} demands</span>
      </div>
      <div className="overflow-auto rounded-xl border border-slate-100" style={{ maxHeight: 'calc(100vh - 400px)' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}><tr style={{ background: '#1e293b' }}>
            <TH sortKey="client_job_id" sortState={sort} onClick={()=>sort.toggle('client_job_id')}>ID</TH>
            <TH sortKey="bh_name"       sortState={sort} onClick={()=>sort.toggle('bh_name')}>BH</TH>
            <TH sortKey="client_name"   sortState={sort} onClick={()=>sort.toggle('client_name')}>Client</TH>
            <TH sortKey="role_title"    sortState={sort} onClick={()=>sort.toggle('role_title')}>Role</TH>
            <TH sortKey="daysOpen"      sortState={sort} onClick={()=>sort.toggle('daysOpen')} center>Days Open</TH>
            <TH>KAM</TH><TH>DL</TH>
            <TH sortKey="total_sourced"   sortState={sort} onClick={()=>sort.toggle('total_sourced')}   center>Sourced</TH>
            <TH sortKey="validated"       sortState={sort} onClick={()=>sort.toggle('validated')}       center>Verified</TH>
            <TH sortKey="total_submitted" sortState={sort} onClick={()=>sort.toggle('total_submitted')} center>Submitted</TH>
            <TH sortKey="l1_count"        sortState={sort} onClick={()=>sort.toggle('l1_count')}        center>L1</TH>
            <TH sortKey="l2_count"        sortState={sort} onClick={()=>sort.toggle('l2_count')}        center>L2</TH>
            <TH sortKey="selections"      sortState={sort} onClick={()=>sort.toggle('selections')}      center>Sel</TH>
            <TH sortKey="today_subs"      sortState={sort} onClick={()=>sort.toggle('today_subs')}      center>Today</TH>
            <TH>Health</TH>
          </tr></thead>
          <tbody>
            {sorted.map((j, i) => {
              const rb = i%2===0 ? '#fff' : '#fafafa';
              const dc = j.daysOpen != null && j.daysOpen > 30 ? '#fee2e2' : j.daysOpen != null && j.daysOpen > 14 ? '#fffbeb' : undefined;
              return (
                <tr key={j.id}>
                  <TD mono>{j.client_job_id || String(j.id)}</TD>
                  <TD bold>{j.bh_name || '—'}</TD>
                  <TD bold>{j.client_name}</TD>
                  <TD>{j.role_title}</TD>
                  <TD bg={dc} center>{j.daysOpen ?? '—'}</TD>
                  <TD>{j.kam_name || '—'}</TD>
                  <TD>{j.dl_name || '—'}</TD>
                  <TD bg={j.total_sourced>0?'#eff6ff':rb} center bold>{j.total_sourced}</TD>
                  <TD bg={j.validated>0?'#f0fdf4':rb} center>{j.validated}</TD>
                  <TD bg={j.total_submitted>0?'#f5f3ff':rb} center bold>{j.total_submitted}</TD>
                  <TD bg={j.l1_count>0?'#fffbeb':rb} center>{j.l1_count}</TD>
                  <TD bg={j.l2_count>0?'#fefce8':rb} center>{j.l2_count}</TD>
                  <TD bg={j.selections>0?'#dcfce7':rb} center bold={j.selections>0}>{j.selections}</TD>
                  <TD bg={j.today_subs>0?'#f0fdf4':rb} center bold={j.today_subs>0}>{j.today_subs}</TD>
                  <td style={{ padding:'6px 12px', borderBottom:'1px solid #f1f5f9', background: j.health.bg, fontSize:11, fontWeight:500, whiteSpace:'nowrap' }}>
                    {j.health.label}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── ACTIVITY TAB ──────────────────────────────────────────────────────────────
function ActivityTab({ activities }: { activities: UserActivity[] }) {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const ACTION_LABELS: Record<string, { label: string; color: string; bg: string }> = {
    login:              { label: 'Logged in',    color: '#64748b', bg: '#f1f5f9' },
    sourced_candidate:  { label: 'Sourced',      color: '#0284c7', bg: '#e0f2fe' },
    saved_assessment:   { label: 'Assessment',   color: '#7c3aed', bg: '#ede9fe' },
    validated_candidate:{ label: 'Validated',    color: '#059669', bg: '#dcfce7' },
    submitted_to_client:{ label: 'Submitted',    color: '#1d4ed8', bg: '#dbeafe' },
    updated_stage:      { label: 'Stage update', color: '#d97706', bg: '#fef3c7' },
    created_job:        { label: 'Created JD',   color: '#dc2626', bg: '#fee2e2' },
    confirmed_jd:       { label: 'Confirmed JD', color: '#0f766e', bg: '#ccfbf1' },
  };

  const rows = useMemo(() => activities
    .filter(u => !roleFilter || u.role === roleFilter || u.secondary_role === roleFilter)
    .filter(u => !search || u.name.toLowerCase().includes(search.toLowerCase()))
    .map(u => {
      const lastSeen  = u.last_action?.at ?? u.last_login_at;
      const lastSeenMs = lastSeen ? new Date(lastSeen).getTime() : 0;
      return { ...u, lastSeen, lastSeenMs, isOnline: lastSeenMs > Date.now() - 30*60*1000 };
    })
    .sort((a,b) => b.lastSeenMs - a.lastSeenMs),
  [activities, roleFilter, search]);

  const roles = ['admin','kam','delivery_lead','recruiter'];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Search user…"
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none w-52" />
        <div className="flex items-center gap-1 bg-white rounded-xl border border-slate-200 p-1">
          <button onClick={()=>setRoleFilter('')}
            className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
            style={roleFilter===''?{background:'#2563EB',color:'#fff'}:{color:'#64748b'}}>All</button>
          {roles.map(r => (
            <button key={r} onClick={()=>setRoleFilter(r===roleFilter?'':r)}
              className="px-3 py-1 rounded-lg text-xs font-medium transition-all capitalize"
              style={roleFilter===r?{background:'#2563EB',color:'#fff'}:{color:'#64748b'}}>
              {r.replace(/_/g,' ')}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-400">{rows.length} users</span>
        <span className="text-xs font-semibold" style={{ color:'#059669' }}>
          ● {rows.filter(u=>u.isOnline).length} online now
        </span>
      </div>
      <div className="overflow-auto rounded-xl border border-slate-100" style={{ maxHeight: 'calc(100vh - 400px)' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}><tr style={{ background: '#1e293b' }}>
            <TH>User</TH><TH>Role</TH>
            <TH center>Status</TH>
            <TH center>Last Seen</TH>
            <TH>Last Action</TH>
            <TH>Description</TH>
          </tr></thead>
          <tbody>
            {rows.map((u, i) => {
              const rb = i%2===0 ? '#fff' : '#fafafa';
              const act = u.last_action;
              const meta = act ? (ACTION_LABELS[act.action] ?? { label: act.action.replace(/_/g,' '), color:'#475569', bg:'#f1f5f9' }) : null;
              return (
                <tr key={u.id} style={{ background: rb }}>
                  <TD bold>{u.name}</TD>
                  <td style={{ padding:'8px 12px', borderBottom:'1px solid #f1f5f9' }}>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold capitalize inline-block w-fit" style={{ background:'#e0e7ff', color:'#3730a3' }}>
                        {u.role.replace(/_/g,' ')}
                      </span>
                      {u.secondary_role && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold capitalize inline-block w-fit" style={{ background:'#fef9c3', color:'#92400e' }}>
                          +{u.secondary_role.replace(/_/g,' ')}
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding:'8px 12px', borderBottom:'1px solid #f1f5f9', textAlign:'center' }}>
                    <span className="flex items-center gap-1 text-xs justify-center font-semibold" style={{ color: u.isOnline?'#059669':'#94a3b8' }}>
                      <span className="w-2 h-2 rounded-full" style={{ background: u.isOnline?'#22c55e':'#e2e8f0' }} />
                      {u.isOnline ? 'Online' : 'Offline'}
                    </span>
                  </td>
                  <td style={{ padding:'8px 12px', borderBottom:'1px solid #f1f5f9', textAlign:'center', whiteSpace:'nowrap' }}>
                    <p className="text-xs font-semibold" style={{ color: u.isOnline?'#059669':'#475569' }}>{timeAgo(u.lastSeen??null)}</p>
                    {u.lastSeen && <p className="text-[10px] text-slate-400">{new Date(u.lastSeen).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</p>}
                  </td>
                  <td style={{ padding:'8px 12px', borderBottom:'1px solid #f1f5f9' }}>
                    {meta
                      ? <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background:meta.bg, color:meta.color }}>{meta.label}</span>
                      : <span className="text-xs text-slate-300">No activity</span>}
                  </td>
                  <td style={{ padding:'8px 12px', borderBottom:'1px solid #f1f5f9', maxWidth:280, overflow:'hidden' }}>
                    <p className="text-xs text-slate-600 truncate">{act?.description ?? '—'}</p>
                    {act?.at && <p className="text-[10px] text-slate-400 mt-0.5">{new Date(act.at).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</p>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
type Tab = 'today' | 'client' | 'recruiters' | 'demands' | 'activity';
const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'today',      label: "Today's Focus",       icon: <Target    size={14} /> },
  { id: 'client',     label: 'By Client (BH-wise)',  icon: <Building2 size={14} /> },
  { id: 'recruiters', label: 'Recruiter Rankings',  icon: <Trophy    size={14} /> },
  { id: 'demands',    label: 'Demand Health',        icon: <TrendingUp size={14} /> },
  { id: 'activity',   label: 'User Activity',        icon: <Activity  size={14} /> },
];

export default function Leaderboard() {
  const [data,       setData]       = useState<PodReport | null>(null);
  const [activities, setActivities] = useState<UserActivity[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [tab,        setTab]        = useState<Tab>('today');
  const [period,     setPeriod]     = useState<Period>('all');
  const [lastFetched,setLastFetched]= useState<Date | null>(null);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [podRes, actRes] = await Promise.all([
        api.get('/export/pod-report'),
        api.get('/users/activity-summary'),
      ]);
      setData(podRes.data);
      setActivities(actRes.data);
      setLastFetched(new Date());
    } catch {
      setError('Failed to load leaderboard data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const range = useMemo(() => periodRange(period), [period]);
  const ps    = data?.pod_stats;

  return (
    <Layout title="Leaderboard" subtitle={ps ? `${new Date(ps.report_date).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}` : undefined}>
      <div className="space-y-5">

        {/* Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 p-1 rounded-xl overflow-x-auto" style={{ background: '#E8EDF3' }}>
            {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap"
                style={period === p ? { background:'#fff', color:'#0F172A', boxShadow:'0 1px 4px rgba(0,0,0,0.08)' } : { color:'#64748B' }}>
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            {lastFetched && (
              <span className="text-[10px] text-slate-400 font-medium">
                Updated {lastFetched.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}
              </span>
            )}
            <button onClick={load} disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-colors disabled:opacity-50">
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>

        {error && <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm">{error}</div>}

        {loading && !data && (
          <div className="space-y-4 animate-pulse">
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
              {[...Array(6)].map((_,i) => <div key={i} className="h-24 rounded-2xl bg-slate-100" />)}
            </div>
            <div className="h-80 rounded-2xl bg-slate-100" />
          </div>
        )}

        {data && ps && (
          <>
            {/* KPI row */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              <KPI label="Active Demands"  value={ps.total_demands}   color="#2563EB" icon={<Briefcase size={14}/>}   sub={`${ps.recruiters_count} recruiters`} />
              <KPI label="Sourced"         value={ps.total_sourced}   color="#0891B2" icon={<Users size={14}/>}       sub="all time" />
              <KPI label="DL Verified"     value={ps.total_validated} color="#7C3AED" icon={<CheckCircle size={14}/>} sub="ready to submit" />
              <KPI label="Submitted"        value={ps.total_submitted} color="#7C3AED" icon={<TrendingUp size={14}/>} sub="to clients" />
              <KPI label="Today's Subs"    value={ps.today_subs}      color="#059669" icon={<Target size={14}/>}     sub="sent today" />
              <KPI label="Selections"       value={ps.total_selections}color="#15803d" icon={<Trophy size={14}/>}    sub="all time" />
            </div>

            {/* Pipeline flow bar */}
            <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm overflow-x-auto">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Pipeline — {PERIOD_LABELS[period]}</p>
              <div className="flex items-stretch gap-0">
                {[
                  { label:'Sourced',   val: ps.total_sourced,    color:'#2563EB', bg:'#eff6ff' },
                  { label:'Verified',  val: ps.total_validated,  color:'#0891B2', bg:'#e0f2fe' },
                  { label:'Submitted', val: ps.total_submitted,  color:'#7C3AED', bg:'#f5f3ff' },
                  { label:'L1',        val: ps.total_l1,         color:'#D97706', bg:'#fffbeb' },
                  { label:'L2',        val: ps.total_l2,         color:'#EA580C', bg:'#fff7ed' },
                  { label:'Selected',  val: ps.total_selections, color:'#059669', bg:'#f0fdf4' },
                ].map((s, i, arr) => (
                  <div key={s.label} className="flex items-center flex-shrink-0">
                    <div className="flex flex-col items-center px-5 py-3 rounded-xl" style={{ background: s.bg, minWidth: 80 }}>
                      <span className="text-2xl font-black tabular-nums" style={{ color: s.color }}>{s.val}</span>
                      <span className="text-[10px] font-bold mt-0.5" style={{ color: s.color }}>{s.label}</span>
                      {i > 0 && <span className="text-[9px] text-slate-400 mt-0.5">{pct(s.val, arr[i-1].val)}% of prev</span>}
                    </div>
                    {i < arr.length - 1 && <span className="text-slate-300 mx-1 text-lg">›</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Tabs */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="flex border-b border-slate-100 overflow-x-auto" style={{ background: '#FAFAFA' }}>
                {TABS.map(t => (
                  <button key={t.id} onClick={() => setTab(t.id)}
                    className="flex items-center gap-2 px-5 py-3.5 text-xs font-bold transition-all border-b-2 whitespace-nowrap"
                    style={tab === t.id
                      ? { color:'#2563EB', borderColor:'#2563EB', background:'#fff' }
                      : { color:'#64748B', borderColor:'transparent' }
                    }>
                    {t.icon}{t.label}
                  </button>
                ))}
              </div>
              <div className="p-5">
                {tab === 'today'      && <TodayTab      data={data} />}
                {tab === 'client'     && <ClientTab     data={data} />}
                {tab === 'recruiters' && <RecruiterTab  data={data} range={range} activities={activities} />}
                {tab === 'demands'    && <DemandTab     data={data} />}
                {tab === 'activity'   && <ActivityTab   activities={activities} />}
              </div>
            </div>

            <p className="text-[10px] text-slate-400 text-center">
              Report date: {ps.report_date} · Period filter applies to sourcing/validation counts only
            </p>
          </>
        )}
      </div>
    </Layout>
  );
}
