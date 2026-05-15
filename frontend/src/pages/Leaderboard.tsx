import { useEffect, useState, useMemo } from 'react';
import { RefreshCw, Trophy, TrendingUp, Users, Briefcase, ChevronUp, ChevronDown, ChevronsUpDown, Activity } from 'lucide-react';
import Layout from '../components/Layout';
import api from '../api/client';

// ── Types (mirrors backend pod-report response) ────────────────────────────────
interface CandidateRow {
  sourcing_date: string;
  full_name: string;
  status: string;
  overall_score: string;
  dl_validated: boolean;
  submitted_to_client: boolean;
  current_stage: string;
  job_client: string;
  job_title: string;
}
interface JobData {
  id: number;
  client_name: string;
  client_job_id: string;
  role_title: string;
  headcount: number;
  status: string;
  created_at: string;
  deadline: string;
  sourcing_target: number | null;
  kam_name: string;
  dl_name: string;
  bh_name: string;
  sourcer_names: string[];
  caller_names: string[];
  total_sourced: number;
  validated: number;
  total_submitted: number;
  l1_count: number;
  l2_count: number;
  selections: number;
  rejections: number;
  today_subs: number;
  d1_subs: number;
  d2_subs: number;
}
interface RecruiterData {
  id: number;
  name: string;
  recruiter_type: string;
  dl_name: string;
  sourcing_load: number;
  calling_load: number;
  assigned_jobs: JobData[];
  candidates: CandidateRow[];
}
interface DLTeam { dl_name: string; recruiters: string[]; demands: JobData[]; }
interface KAMData { kam_name: string; demands: JobData[]; }
interface PodReport {
  jobs: JobData[];
  recruiters: RecruiterData[];
  dl_teams: DLTeam[];
  kam_data: KAMData[];
  pod_stats: {
    report_date: string; total_demands: number; total_sourced: number;
    total_validated: number; total_submitted: number; total_l1: number;
    total_l2: number; total_selections: number; today_subs: number; recruiters_count: number;
  };
}

interface UserActivity {
  id: number;
  name: string;
  role: string;
  secondary_role: string | null;
  last_login_at: string | null;
  last_action: {
    action: string;
    description: string;
    entity_type: string | null;
    entity_id: number | null;
    at: string;
  } | null;
}

const ACTION_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  login:              { label: 'Logged in',          color: '#64748b', bg: '#f1f5f9' },
  sourced_candidate:  { label: 'Sourced candidate',  color: '#0284c7', bg: '#e0f2fe' },
  saved_assessment:   { label: 'Saved assessment',   color: '#7c3aed', bg: '#ede9fe' },
  validated_candidate:{ label: 'Validated',          color: '#059669', bg: '#dcfce7' },
  submitted_to_client:{ label: 'Submitted to client',color: '#1d4ed8', bg: '#dbeafe' },
  updated_stage:      { label: 'Updated stage',      color: '#d97706', bg: '#fef3c7' },
  created_job:        { label: 'Created JD',         color: '#dc2626', bg: '#fee2e2' },
  confirmed_jd:       { label: 'Confirmed JD',       color: '#0f766e', bg: '#ccfbf1' },
};

function timeAgo(isoStr: string | null): string {
  if (!isoStr) return 'Never';
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(isoStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function ActionBadge({ action }: { action: string }) {
  const meta = ACTION_LABELS[action] ?? { label: action.replace(/_/g, ' '), color: '#475569', bg: '#f1f5f9' };
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
      style={{ background: meta.bg, color: meta.color }}>
      {meta.label}
    </span>
  );
}

// ── Date filter helpers ────────────────────────────────────────────────────────
type Period = 'today' | 'yesterday' | 'week' | 'month' | 'all';
const PERIOD_LABELS: Record<Period, string> = {
  today: 'Today', yesterday: 'Yesterday', week: 'This Week', month: 'This Month', all: 'All Time',
};

function periodRange(period: Period): { from: Date | null; to: Date | null } {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (period === 'all') return { from: null, to: null };
  if (period === 'today') { const d = startOfDay(now); return { from: d, to: now }; }
  if (period === 'yesterday') {
    const d = startOfDay(now); d.setDate(d.getDate() - 1);
    const e = startOfDay(now); return { from: d, to: e };
  }
  if (period === 'week') {
    const d = startOfDay(now); d.setDate(d.getDate() - d.getDay()); return { from: d, to: now };
  }
  if (period === 'month') {
    const d = new Date(now.getFullYear(), now.getMonth(), 1); return { from: d, to: now };
  }
  return { from: null, to: null };
}

function inRange(dateStr: string, from: Date | null, to: Date | null): boolean {
  if (!from && !to) return true;
  if (!dateStr || dateStr === '—') return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

// ── Sorting helpers ────────────────────────────────────────────────────────────
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
  if (!active || dir === null) return <ChevronsUpDown size={12} className="opacity-30 ml-1 inline" />;
  return dir === 'asc'
    ? <ChevronUp size={12} className="text-blue-300 ml-1 inline" />
    : <ChevronDown size={12} className="text-blue-300 ml-1 inline" />;
}

function sortRows<T>(rows: T[], col: string, dir: SortDir): T[] {
  if (!dir || !col) return rows;
  return [...rows].sort((a, b) => {
    const av = (a as Record<string, unknown>)[col];
    const bv = (b as Record<string, unknown>)[col];
    const an = typeof av === 'number' ? av : parseFloat(String(av ?? 0));
    const bn = typeof bv === 'number' ? bv : parseFloat(String(bv ?? 0));
    if (!isNaN(an) && !isNaN(bn)) return dir === 'asc' ? an - bn : bn - an;
    return dir === 'asc'
      ? String(av ?? '').localeCompare(String(bv ?? ''))
      : String(bv ?? '').localeCompare(String(av ?? ''));
  });
}

// ── Styling helpers ────────────────────────────────────────────────────────────
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const scoreBg = (v: string | number) => {
  const n = Number(v); if (isNaN(n)) return '#f1f5f9';
  return n >= 4 ? '#dcfce7' : n >= 3.25 ? '#fef9c3' : '#fee2e2';
};
const pctBg = (p: number) => p >= 60 ? '#dcfce7' : p >= 30 ? '#fef9c3' : p > 0 ? '#fee2e2' : '#f1f5f9';

const MEDALS = ['🥇', '🥈', '🥉'];
const RANK_COLORS = ['#fde68a', '#e2e8f0', '#fed7aa'];

// ── Shared table header ────────────────────────────────────────────────────────
function TH({
  children, onClick, sortKey, sortState, right = false, center = false,
}: {
  children: React.ReactNode; onClick?: () => void; sortKey?: string;
  sortState?: ReturnType<typeof useSortState>; right?: boolean; center?: boolean;
}) {
  const active = sortState && sortKey ? sortState.col === sortKey : false;
  const dir = active ? sortState!.dir : null;
  return (
    <th
      onClick={onClick}
      style={{
        padding: '9px 12px', background: '#1e293b', color: '#94a3b8', fontSize: '11px',
        fontWeight: 700, border: '1px solid #334155', whiteSpace: 'nowrap', letterSpacing: '0.4px',
        textAlign: right ? 'right' : center ? 'center' : 'left',
        cursor: onClick ? 'pointer' : 'default', userSelect: 'none',
      }}
      className={onClick ? 'hover:bg-slate-700 transition-colors' : ''}
    >
      {children}
      {sortKey && sortState && <SortIcon active={active} dir={dir} />}
    </th>
  );
}
function TD({ children, bg, bold, right, center, mono }: {
  children: React.ReactNode; bg?: string; bold?: boolean; right?: boolean; center?: boolean; mono?: boolean;
}) {
  return (
    <td style={{
      padding: '8px 12px', border: '1px solid #e2e8f0', backgroundColor: bg ?? '#ffffff',
      fontWeight: bold ? 700 : 400, fontSize: '13px', textAlign: right ? 'right' : center ? 'center' : 'left',
      whiteSpace: 'nowrap', fontFamily: mono ? 'monospace' : undefined,
    }}>
      {children ?? '—'}
    </td>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────────
function KPI({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col gap-1">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
      <p className="text-3xl font-bold" style={{ color }}>{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

// ── Funnel bar ────────────────────────────────────────────────────────────────
function FunnelBar({ sourced, validated, submitted, l1, l2, sel }: {
  sourced: number; validated: number; submitted: number; l1: number; l2: number; sel: number;
}) {
  const steps = [
    { label: 'Sourced', val: sourced, color: '#60a5fa' },
    { label: 'Validated', val: validated, color: '#34d399' },
    { label: 'Submitted', val: submitted, color: '#818cf8' },
    { label: 'L1', val: l1, color: '#fb923c' },
    { label: 'L2', val: l2, color: '#f59e0b' },
    { label: 'Selections', val: sel, color: '#22c55e' },
  ];
  const max = Math.max(...steps.map(s => s.val), 1);
  return (
    <div className="flex items-end gap-1.5 h-10">
      {steps.map(s => (
        <div key={s.label} className="flex flex-col items-center gap-0.5" title={`${s.label}: ${s.val}`}>
          <div style={{ width: 20, height: Math.max(4, (s.val / max) * 36), background: s.color, borderRadius: 3 }} />
        </div>
      ))}
    </div>
  );
}

// ── Recruiter Leaderboard tab ─────────────────────────────────────────────────
function RecruiterTab({ data, range, activities }: { data: PodReport; range: { from: Date | null; to: Date | null }; activities: UserActivity[] }) {
  const sort = useSortState('sourced');

  const activityMap = useMemo(() => {
    const m: Record<number, UserActivity> = {};
    activities.forEach(a => { m[a.id] = a; });
    return m;
  }, [activities]);

  const rows = useMemo(() => {
    return data.recruiters.map(r => {
      const filtered = r.candidates.filter(c => inRange(c.sourcing_date, range.from, range.to));
      const sourced   = filtered.length;
      const validated = filtered.filter(c => c.dl_validated).length;
      const submitted = filtered.filter(c => c.submitted_to_client).length;
      const l1 = filtered.filter(c => ['l1_scheduled','l1_feedback_pending','l1_cleared','l2_scheduled','l2_feedback_pending','l2_cleared','final_scheduled','final_cleared'].some(s => c.current_stage.toLowerCase().includes(s.split('_')[0]))).length;
      const sel = filtered.filter(c => ['joined','offer_accepted','final_cleared'].some(s => c.current_stage.toLowerCase().includes(s))).length;
      const scores = filtered.map(c => parseFloat(c.overall_score)).filter(n => !isNaN(n));
      const avgScore = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length) : null;
      const act = activityMap[r.id];
      const lastSeen = act?.last_action?.at ?? act?.last_login_at ?? null;
      const isOnline = lastSeen ? Date.now() - new Date(lastSeen).getTime() < 30 * 60 * 1000 : false;
      return {
        id: r.id, name: r.name, dl: r.dl_name,
        type: r.recruiter_type === 'sourcer' ? 'S' : r.recruiter_type === 'caller' ? 'C' : 'S+C',
        demands: r.assigned_jobs.length,
        sourced, validated, submitted, l1, sel,
        avgScore: avgScore !== null ? avgScore.toFixed(2) : '—',
        convPct: pct(submitted, sourced),
        selPct: pct(sel, submitted),
        lastAction: act?.last_action ?? null,
        lastSeen,
        isOnline,
      };
    });
  }, [data, range, activityMap]);

  const sorted = useMemo(() => sortRows(rows, sort.col, sort.dir), [rows, sort.col, sort.dir]);

  const th = (key: string, label: string, right = true) => (
    <TH sortKey={key} sortState={sort} onClick={() => sort.toggle(key)} right={right}>{label}</TH>
  );

  return (
    <div className="overflow-auto rounded-xl border border-slate-200" style={{ maxHeight: 'calc(100vh - 340px)' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}><tr>
          <TH>Rank</TH>
          <TH sortKey="name" sortState={sort} onClick={() => sort.toggle('name')}>Recruiter</TH>
          <TH>Type</TH>
          <TH sortKey="dl" sortState={sort} onClick={() => sort.toggle('dl')}>Pod (DL)</TH>
          {th('demands', 'Demands')}
          {th('sourced', 'Sourced')}
          {th('validated', 'Validated')}
          {th('submitted', 'Submitted')}
          {th('l1', 'In L1/L2')}
          {th('sel', 'Selections')}
          {th('avgScore', 'Avg Score')}
          {th('convPct', 'Conv %')}
          {th('selPct', 'Sel %')}
          <TH center>Funnel</TH>
          <TH sortKey="lastSeen" sortState={sort} onClick={() => sort.toggle('lastSeen')} center>Last Seen</TH>
          <TH>Last Action</TH>
        </tr></thead>
        <tbody>
          {sorted.length === 0 && (
            <tr><td colSpan={14} style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 14 }}>No data for this period</td></tr>
          )}
          {sorted.map((r, i) => {
            const rank = i + 1;
            const rowBg = rank <= 3 ? RANK_COLORS[rank - 1] + '55' : i % 2 === 0 ? '#fff' : '#f8fafc';
            return (
              <tr key={r.id} style={{ background: rowBg }}>
                <TD bg={rowBg} center bold={rank <= 3}>
                  {rank <= 3 ? MEDALS[rank - 1] : rank}
                </TD>
                <TD bg={rowBg} bold={rank <= 3}>{r.name}</TD>
                <TD bg={rowBg} center>
                  <span className="px-1.5 py-0.5 rounded text-xs font-semibold" style={{ background: '#e0e7ff', color: '#3730a3' }}>{r.type}</span>
                </TD>
                <TD bg={rowBg}>{r.dl || '—'}</TD>
                <TD bg={rowBg} center>{r.demands}</TD>
                <TD bg={r.sourced > 0 ? '#dbeafe' : rowBg} center bold>{r.sourced}</TD>
                <TD bg={r.validated > 0 ? '#dcfce7' : rowBg} center>{r.validated}</TD>
                <TD bg={r.submitted > 0 ? '#ede9fe' : rowBg} center>{r.submitted}</TD>
                <TD bg={r.l1 > 0 ? '#fef3c7' : rowBg} center>{r.l1}</TD>
                <TD bg={r.sel > 0 ? '#bbf7d0' : rowBg} center bold={r.sel > 0}>{r.sel}</TD>
                <TD bg={r.avgScore !== '—' ? scoreBg(r.avgScore) : rowBg} center mono>{r.avgScore}</TD>
                <TD bg={pctBg(r.convPct)} center>{r.convPct}%</TD>
                <TD bg={pctBg(r.selPct)} center>{r.selPct}%</TD>
                <td style={{ padding: '4px 12px', border: '1px solid #e2e8f0', background: rowBg }}>
                  <FunnelBar sourced={r.sourced} validated={r.validated} submitted={r.submitted} l1={r.l1} l2={0} sel={r.sel} />
                </td>
                <td style={{ padding: '8px 12px', border: '1px solid #e2e8f0', background: rowBg, textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="flex items-center gap-1 text-xs font-semibold"
                      style={{ color: r.isOnline ? '#059669' : '#64748b' }}>
                      <span className="w-1.5 h-1.5 rounded-full inline-block"
                        style={{ background: r.isOnline ? '#22c55e' : '#cbd5e1' }} />
                      {timeAgo(r.lastSeen)}
                    </span>
                    {r.lastSeen && (
                      <span className="text-[10px] text-slate-400">
                        {new Date(r.lastSeen).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                </td>
                <td style={{ padding: '8px 12px', border: '1px solid #e2e8f0', background: rowBg, maxWidth: 200 }}>
                  {r.lastAction ? (
                    <div className="flex flex-col gap-0.5">
                      <ActionBadge action={r.lastAction.action} />
                      <p className="text-[10px] text-slate-400 truncate mt-0.5" title={r.lastAction.description}>
                        {r.lastAction.description}
                      </p>
                    </div>
                  ) : <span className="text-xs text-slate-300">No activity yet</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Delivery Lead tab ─────────────────────────────────────────────────────────
function DLTab({ data, range }: { data: PodReport; range: { from: Date | null; to: Date | null } }) {
  const sort = useSortState('totalSourced');

  const rows = useMemo(() => {
    return data.dl_teams.map(dl => {
      const periodDemands = range.from === null
        ? dl.demands
        : dl.demands; // demands don't have per-period filter, use full

      // Get recruiter candidates in period
      const teamRecruiters = data.recruiters.filter(r => r.dl_name === dl.dl_name);
      const periodCands = teamRecruiters.flatMap(r =>
        r.candidates.filter(c => inRange(c.sourcing_date, range.from, range.to))
      );

      const totalSourced  = periodCands.length;
      const totalValidated = periodCands.filter(c => c.dl_validated).length;
      const totalSubmitted = periodCands.filter(c => c.submitted_to_client).length;
      const totalL1 = periodDemands.reduce((s, d) => s + d.l1_count, 0);
      const totalL2 = periodDemands.reduce((s, d) => s + d.l2_count, 0);
      const totalSel = periodDemands.reduce((s, d) => s + d.selections, 0);
      const todaySubs = periodDemands.reduce((s, d) => s + d.today_subs, 0);
      const target = periodDemands.reduce((s, d) => s + (d.sourcing_target ?? 0), 0);

      return {
        dlName: dl.dl_name,
        teamSize: dl.recruiters.length,
        demands: periodDemands.length,
        target,
        totalSourced,
        totalValidated,
        totalSubmitted,
        totalL1, totalL2, totalSel,
        todaySubs,
        targetPct: pct(totalSourced, target),
        convPct: pct(totalSubmitted, totalSourced),
      };
    });
  }, [data, range]);

  const sorted = useMemo(() => sortRows(rows, sort.col, sort.dir), [rows, sort.col, sort.dir]);

  const th = (key: string, label: string) => (
    <TH sortKey={key} sortState={sort} onClick={() => sort.toggle(key)} center>{label}</TH>
  );

  return (
    <div className="overflow-auto rounded-xl border border-slate-200" style={{ maxHeight: 'calc(100vh - 340px)' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}><tr>
          <TH sortKey="dlName" sortState={sort} onClick={() => sort.toggle('dlName')}>Delivery Lead</TH>
          {th('teamSize', 'Team Size')}
          {th('demands', 'Demands')}
          {th('target', 'Target')}
          {th('totalSourced', 'Sourced')}
          {th('targetPct', 'vs Target')}
          {th('totalValidated', 'Validated')}
          {th('totalSubmitted', 'Submitted')}
          {th('totalL1', 'L1')}
          {th('totalL2', 'L2')}
          {th('totalSel', 'Selections')}
          {th('todaySubs', "Today's Subs")}
          {th('convPct', 'Conv %')}
        </tr></thead>
        <tbody>
          {sorted.map((dl, i) => {
            const rowBg = i % 2 === 0 ? '#fff' : '#f8fafc';
            return (
              <tr key={dl.dlName}>
                <TD bg={rowBg} bold>{dl.dlName}</TD>
                <TD bg={rowBg} center>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: '#dbeafe', color: '#1d4ed8' }}>
                    <Users size={11} />{dl.teamSize}
                  </span>
                </TD>
                <TD bg={rowBg} center>{dl.demands}</TD>
                <TD bg={rowBg} center>{dl.target > 0 ? dl.target : '—'}</TD>
                <TD bg={dl.totalSourced > 0 ? '#dbeafe' : rowBg} center bold>{dl.totalSourced}</TD>
                <TD bg={dl.target > 0 ? pctBg(dl.targetPct) : rowBg} center>
                  {dl.target > 0 ? `${dl.targetPct}%` : '—'}
                </TD>
                <TD bg={dl.totalValidated > 0 ? '#dcfce7' : rowBg} center>{dl.totalValidated}</TD>
                <TD bg={dl.totalSubmitted > 0 ? '#ede9fe' : rowBg} center>{dl.totalSubmitted}</TD>
                <TD bg={dl.totalL1 > 0 ? '#fef9c3' : rowBg} center>{dl.totalL1}</TD>
                <TD bg={dl.totalL2 > 0 ? '#fde68a' : rowBg} center>{dl.totalL2}</TD>
                <TD bg={dl.totalSel > 0 ? '#bbf7d0' : rowBg} center bold={dl.totalSel > 0}>{dl.totalSel}</TD>
                <TD bg={dl.todaySubs > 0 ? '#dcfce7' : rowBg} center bold={dl.todaySubs > 0}>{dl.todaySubs}</TD>
                <TD bg={pctBg(dl.convPct)} center>{dl.convPct}%</TD>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* DL detail cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-4 border-t border-slate-100 bg-slate-50">
        {data.dl_teams.map(dl => (
          <div key={dl.dl_name} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-sm font-bold text-slate-800 mb-2">{dl.dl_name}</p>
            <p className="text-xs text-slate-500 mb-3">Team: {dl.recruiters.join(', ') || 'No members'}</p>
            <div className="grid grid-cols-3 gap-2">
              {dl.demands.map(d => (
                <div key={d.id} className="rounded-lg p-2 border border-slate-100 bg-slate-50 text-center">
                  <p className="text-[10px] font-semibold text-slate-500 truncate">{d.client_name}</p>
                  <p className="text-[9px] text-slate-400 truncate mb-1">{d.role_title}</p>
                  <div className="flex justify-center gap-2 text-xs">
                    <span className="text-blue-600 font-bold">{d.total_sourced}S</span>
                    <span className="text-purple-600 font-bold">{d.total_submitted}Sub</span>
                    <span className="text-green-600 font-bold">{d.selections}Sel</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── KAM tab ───────────────────────────────────────────────────────────────────
function KAMTab({ data }: { data: PodReport }) {
  const sort = useSortState('totalSourced');

  const rows = useMemo(() => {
    return data.kam_data.map(k => {
      const demands      = k.demands;
      const totalSourced  = demands.reduce((s, d) => s + d.total_sourced, 0);
      const totalValidated = demands.reduce((s, d) => s + d.validated, 0);
      const totalSubmitted = demands.reduce((s, d) => s + d.total_submitted, 0);
      const totalL1 = demands.reduce((s, d) => s + d.l1_count, 0);
      const totalL2 = demands.reduce((s, d) => s + d.l2_count, 0);
      const totalSel = demands.reduce((s, d) => s + d.selections, 0);
      const todaySubs = demands.reduce((s, d) => s + d.today_subs, 0);
      const totalHC = demands.reduce((s, d) => s + d.headcount, 0);
      const fillPct = pct(totalSel, totalHC);
      return {
        kamName: k.kam_name, demandCount: demands.length, totalHC,
        totalSourced, totalValidated, totalSubmitted, totalL1, totalL2, totalSel, todaySubs, fillPct,
        convPct: pct(totalSubmitted, totalSourced),
      };
    });
  }, [data]);

  const sorted = useMemo(() => sortRows(rows, sort.col, sort.dir), [rows, sort.col, sort.dir]);

  const th = (key: string, label: string) => (
    <TH sortKey={key} sortState={sort} onClick={() => sort.toggle(key)} center>{label}</TH>
  );

  return (
    <div className="space-y-4">
      <div className="overflow-auto rounded-xl border border-slate-200" style={{ maxHeight: 'calc(100vh - 400px)' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}><tr>
            <TH sortKey="kamName" sortState={sort} onClick={() => sort.toggle('kamName')}>KAM</TH>
            {th('demandCount', 'Demands')}
            {th('totalHC', 'Headcount')}
            {th('totalSourced', 'Sourced')}
            {th('totalValidated', 'Validated')}
            {th('totalSubmitted', 'Submitted')}
            {th('totalL1', 'L1')}
            {th('totalL2', 'L2')}
            {th('totalSel', 'Selections')}
            {th('fillPct', 'Fill Rate')}
            {th('todaySubs', "Today's Subs")}
            {th('convPct', 'Conv %')}
          </tr></thead>
          <tbody>
            {sorted.map((k, i) => {
              const rowBg = i % 2 === 0 ? '#fff' : '#f8fafc';
              return (
                <tr key={k.kamName}>
                  <TD bg={rowBg} bold>{k.kamName}</TD>
                  <TD bg={rowBg} center>{k.demandCount}</TD>
                  <TD bg={rowBg} center>{k.totalHC}</TD>
                  <TD bg={k.totalSourced > 0 ? '#dbeafe' : rowBg} center bold>{k.totalSourced}</TD>
                  <TD bg={k.totalValidated > 0 ? '#dcfce7' : rowBg} center>{k.totalValidated}</TD>
                  <TD bg={k.totalSubmitted > 0 ? '#ede9fe' : rowBg} center>{k.totalSubmitted}</TD>
                  <TD bg={k.totalL1 > 0 ? '#fef9c3' : rowBg} center>{k.totalL1}</TD>
                  <TD bg={k.totalL2 > 0 ? '#fde68a' : rowBg} center>{k.totalL2}</TD>
                  <TD bg={k.totalSel > 0 ? '#bbf7d0' : rowBg} center bold={k.totalSel > 0}>{k.totalSel}</TD>
                  <TD bg={pctBg(k.fillPct)} center bold>{k.fillPct}%</TD>
                  <TD bg={k.todaySubs > 0 ? '#dcfce7' : rowBg} center bold={k.todaySubs > 0}>{k.todaySubs}</TD>
                  <TD bg={pctBg(k.convPct)} center>{k.convPct}%</TD>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Per-KAM demand breakdown */}
      <div className="space-y-3">
        {data.kam_data.map(k => (
          <details key={k.kam_name} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <summary className="px-5 py-3 cursor-pointer font-semibold text-sm text-slate-700 flex items-center justify-between"
              style={{ listStyle: 'none' }}>
              <span>📋 {k.kam_name} — {k.demands.length} demands</span>
              <span className="text-xs text-slate-400">click to expand</span>
            </summary>
            <div className="overflow-auto">
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12px' }}>
                <thead><tr style={{ background: '#f8fafc' }}>
                  {['Demand ID','Client','Role','HC','Sourced','Validated','Submitted','L1','L2','Sel','Today Subs','DL','Sourcers'].map(h => (
                    <th key={h} style={{ padding: '7px 10px', border: '1px solid #e2e8f0', fontWeight: 600, whiteSpace: 'nowrap', color: '#475569', textAlign: 'left' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {k.demands.map((d, i) => (
                    <tr key={d.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                      <td style={{ padding: '6px 10px', border: '1px solid #e2e8f0', fontFamily: 'monospace', fontSize: '11px' }}>{d.client_job_id || d.id}</td>
                      <td style={{ padding: '6px 10px', border: '1px solid #e2e8f0', fontWeight: 600 }}>{d.client_name}</td>
                      <td style={{ padding: '6px 10px', border: '1px solid #e2e8f0' }}>{d.role_title}</td>
                      <td style={{ padding: '6px 10px', border: '1px solid #e2e8f0', textAlign: 'center' }}>{d.headcount}</td>
                      <td style={{ padding: '6px 10px', border: '1px solid #e2e8f0', textAlign: 'center', background: d.total_sourced > 0 ? '#dbeafe' : undefined }}>{d.total_sourced}</td>
                      <td style={{ padding: '6px 10px', border: '1px solid #e2e8f0', textAlign: 'center', background: d.validated > 0 ? '#dcfce7' : undefined }}>{d.validated}</td>
                      <td style={{ padding: '6px 10px', border: '1px solid #e2e8f0', textAlign: 'center', background: d.total_submitted > 0 ? '#ede9fe' : undefined }}>{d.total_submitted}</td>
                      <td style={{ padding: '6px 10px', border: '1px solid #e2e8f0', textAlign: 'center', background: d.l1_count > 0 ? '#fef9c3' : undefined }}>{d.l1_count}</td>
                      <td style={{ padding: '6px 10px', border: '1px solid #e2e8f0', textAlign: 'center', background: d.l2_count > 0 ? '#fde68a' : undefined }}>{d.l2_count}</td>
                      <td style={{ padding: '6px 10px', border: '1px solid #e2e8f0', textAlign: 'center', fontWeight: d.selections > 0 ? 700 : 400, background: d.selections > 0 ? '#bbf7d0' : undefined }}>{d.selections}</td>
                      <td style={{ padding: '6px 10px', border: '1px solid #e2e8f0', textAlign: 'center', fontWeight: d.today_subs > 0 ? 700 : 400, background: d.today_subs > 0 ? '#dcfce7' : undefined }}>{d.today_subs}</td>
                      <td style={{ padding: '6px 10px', border: '1px solid #e2e8f0' }}>{d.dl_name || '—'}</td>
                      <td style={{ padding: '6px 10px', border: '1px solid #e2e8f0', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.sourcer_names.join(', ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

// ── Demand Health tab ─────────────────────────────────────────────────────────
function DemandTab({ data }: { data: PodReport }) {
  const sort = useSortState('total_sourced');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const statuses = useMemo(() => [...new Set(data.jobs.map(j => j.status))], [data]);

  const rows = useMemo(() => {
    let jobs = data.jobs;
    if (search) {
      const q = search.toLowerCase();
      jobs = jobs.filter(j => j.client_name.toLowerCase().includes(q) || j.role_title.toLowerCase().includes(q) || (j.client_job_id || '').toLowerCase().includes(q));
    }
    if (statusFilter) jobs = jobs.filter(j => j.status === statusFilter);
    return jobs.map(j => {
      const flag = j.selections > 0 ? '✓ Selections logged'
        : j.l2_count > 0 ? '~ In L2'
        : j.l1_count > 0 ? '⚠ L1 feedback pending'
        : j.total_submitted > 0 ? '⚠ Sub→L1 breach'
        : j.total_sourced === 0 ? '🔴 No sourcing yet'
        : '○ Sourced, not submitted';
      const flagBg = flag.startsWith('✓') ? '#dcfce7' : flag.startsWith('⚠') ? '#fee2e2' : flag.startsWith('~') ? '#fef9c3' : flag.startsWith('🔴') ? '#fecaca' : '#f8fafc';
      const today = new Date(); const opened = j.created_at ? new Date(j.created_at) : null;
      const daysOpen = opened ? Math.floor((today.getTime() - opened.getTime()) / 86400000) : null;
      return { ...j, flag, flagBg, daysOpen };
    });
  }, [data, search, statusFilter]);

  const sorted = useMemo(() => sortRows(rows, sort.col, sort.dir), [rows, sort.col, sort.dir]);

  const th = (key: string, label: string, c = true) => (
    <TH sortKey={key} sortState={sort} onClick={() => sort.toggle(key)} center={c}>{label}</TH>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search client / role / demand ID…"
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 w-72" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400">
          <option value="">All Statuses</option>
          {statuses.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <span className="text-sm text-slate-400">{sorted.length} demands</span>
      </div>
      <div className="overflow-auto rounded-xl border border-slate-200" style={{ maxHeight: 'calc(100vh - 400px)' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}><tr>
            <TH sortKey="client_job_id" sortState={sort} onClick={() => sort.toggle('client_job_id')}>Demand ID</TH>
            <TH sortKey="client_name" sortState={sort} onClick={() => sort.toggle('client_name')}>Client</TH>
            <TH sortKey="role_title" sortState={sort} onClick={() => sort.toggle('role_title')}>Role</TH>
            {th('headcount', 'HC')}
            {th('daysOpen', 'Days Open')}
            <TH>Status</TH>
            <TH>KAM</TH>
            <TH>DL</TH>
            {th('total_sourced', 'Sourced')}
            {th('validated', 'Validated')}
            {th('total_submitted', 'Submitted')}
            {th('l1_count', 'L1')}
            {th('l2_count', 'L2')}
            {th('selections', 'Sel')}
            {th('today_subs', 'Today')}
            {th('d1_subs', 'Yest.')}
            <TH>Health</TH>
          </tr></thead>
          <tbody>
            {sorted.map((j, i) => {
              const rowBg = i % 2 === 0 ? '#fff' : '#f8fafc';
              const daysColor = j.daysOpen !== null && j.daysOpen > 30 ? '#fee2e2' : j.daysOpen !== null && j.daysOpen > 14 ? '#fef9c3' : rowBg;
              return (
                <tr key={j.id}>
                  <TD bg={rowBg} mono>{j.client_job_id || j.id}</TD>
                  <TD bg={rowBg} bold>{j.client_name}</TD>
                  <TD bg={rowBg}>{j.role_title}</TD>
                  <TD bg={rowBg} center>{j.headcount}</TD>
                  <TD bg={daysColor} center>{j.daysOpen ?? '—'}</TD>
                  <TD bg={rowBg}>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#e2e8f0', color: '#475569' }}>
                      {j.status.replace(/_/g, ' ')}
                    </span>
                  </TD>
                  <TD bg={rowBg}>{j.kam_name || '—'}</TD>
                  <TD bg={rowBg}>{j.dl_name || '—'}</TD>
                  <TD bg={j.total_sourced > 0 ? '#dbeafe' : rowBg} center bold>{j.total_sourced}</TD>
                  <TD bg={j.validated > 0 ? '#dcfce7' : rowBg} center>{j.validated}</TD>
                  <TD bg={j.total_submitted > 0 ? '#ede9fe' : rowBg} center>{j.total_submitted}</TD>
                  <TD bg={j.l1_count > 0 ? '#fef9c3' : rowBg} center>{j.l1_count}</TD>
                  <TD bg={j.l2_count > 0 ? '#fde68a' : rowBg} center>{j.l2_count}</TD>
                  <TD bg={j.selections > 0 ? '#bbf7d0' : rowBg} center bold={j.selections > 0}>{j.selections}</TD>
                  <TD bg={j.today_subs > 0 ? '#dcfce7' : rowBg} center bold={j.today_subs > 0}>{j.today_subs}</TD>
                  <TD bg={j.d1_subs > 0 ? '#f0fdf4' : rowBg} center>{j.d1_subs}</TD>
                  <td style={{ padding: '6px 12px', border: '1px solid #e2e8f0', background: j.flagBg, fontSize: '11px', fontWeight: 500, whiteSpace: 'nowrap' }}>{j.flag}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Activity Feed tab ─────────────────────────────────────────────────────────
function ActivityTab({ activities }: { activities: UserActivity[] }) {
  const sort = useSortState('last_seen', 'desc');
  const [roleFilter, setRoleFilter] = useState('');
  const [search, setSearch] = useState('');

  const rows = useMemo(() => {
    return activities
      .filter(u => !roleFilter || u.role === roleFilter || u.secondary_role === roleFilter)
      .filter(u => !search || u.name.toLowerCase().includes(search.toLowerCase()))
      .map(u => {
        const lastSeen = u.last_action?.at ?? u.last_login_at;
        const lastSeenMs = lastSeen ? new Date(lastSeen).getTime() : 0;
        const loginMs = u.last_login_at ? new Date(u.last_login_at).getTime() : 0;
        const isOnline = lastSeenMs > Date.now() - 30 * 60 * 1000; // active in last 30 min
        return { ...u, lastSeen, lastSeenMs, loginMs, isOnline };
      });
  }, [activities, roleFilter, search]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (sort.col === 'last_seen') return sort.dir === 'asc' ? a.lastSeenMs - b.lastSeenMs : b.lastSeenMs - a.lastSeenMs;
      if (sort.col === 'name') return sort.dir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      return 0;
    });
  }, [rows, sort.col, sort.dir]);

  const roles = ['admin', 'kam', 'delivery_lead', 'recruiter'];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search user…"
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 w-56" />
        <div className="flex items-center gap-1 bg-white rounded-xl border border-slate-200 p-1">
          <button onClick={() => setRoleFilter('')}
            className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
            style={roleFilter === '' ? { background: '#3b82f6', color: '#fff' } : { color: '#64748b' }}>
            All
          </button>
          {roles.map(r => (
            <button key={r} onClick={() => setRoleFilter(r === roleFilter ? '' : r)}
              className="px-3 py-1 rounded-lg text-xs font-medium transition-all capitalize"
              style={roleFilter === r ? { background: '#3b82f6', color: '#fff' } : { color: '#64748b' }}>
              {r.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-400">{sorted.length} users</span>
        <span className="text-xs text-green-600 font-semibold">● {sorted.filter(u => u.isOnline).length} online in last 30m</span>
      </div>

      {/* Table */}
      <div className="overflow-auto rounded-xl border border-slate-200" style={{ maxHeight: 'calc(100vh - 400px)' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}><tr>
            <TH sortKey="name" sortState={sort} onClick={() => sort.toggle('name')}>User</TH>
            <TH>Role</TH>
            <TH sortKey="last_seen" sortState={sort} onClick={() => sort.toggle('last_seen')} center>Last Seen</TH>
            <TH center>Last Login</TH>
            <TH>Last Action</TH>
            <TH>Details</TH>
            <TH center>Status</TH>
          </tr></thead>
          <tbody>
            {sorted.map((u, i) => {
              const rowBg = i % 2 === 0 ? '#fff' : '#f8fafc';
              const act = u.last_action;
              return (
                <tr key={u.id} style={{ background: rowBg }}>
                  <TD bg={rowBg} bold>{u.name}</TD>
                  <TD bg={rowBg}>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold capitalize inline-block"
                        style={{ background: '#e0e7ff', color: '#3730a3', width: 'fit-content' }}>
                        {u.role.replace(/_/g, ' ')}
                      </span>
                      {u.secondary_role && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold capitalize inline-block"
                          style={{ background: '#fef9c3', color: '#92400e', width: 'fit-content' }}>
                          +{u.secondary_role.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                  </TD>
                  <td style={{ padding: '8px 12px', border: '1px solid #e2e8f0', background: rowBg, textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-sm font-semibold" style={{ color: u.isOnline ? '#059669' : '#64748b' }}>
                        {timeAgo(u.lastSeen ?? null)}
                      </span>
                      {u.lastSeen && (
                        <span className="text-[10px] text-slate-400">
                          {new Date(u.lastSeen).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '8px 12px', border: '1px solid #e2e8f0', background: rowBg, textAlign: 'center', whiteSpace: 'nowrap' }}>
                    {u.last_login_at ? (
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-sm text-slate-600">{timeAgo(u.last_login_at)}</span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(u.last_login_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ) : <span className="text-xs text-slate-400">Never</span>}
                  </td>
                  <TD bg={rowBg}>
                    {act ? <ActionBadge action={act.action} /> : <span className="text-xs text-slate-300">No activity</span>}
                  </TD>
                  <td style={{ padding: '8px 12px', border: '1px solid #e2e8f0', background: rowBg, maxWidth: 320, overflow: 'hidden' }}>
                    <p className="text-xs text-slate-600 truncate" title={act?.description}>
                      {act?.description ?? '—'}
                    </p>
                    {act?.at && (
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {new Date(act.at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </td>
                  <td style={{ padding: '8px 12px', border: '1px solid #e2e8f0', background: rowBg, textAlign: 'center' }}>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold"
                      style={{ color: u.isOnline ? '#059669' : '#94a3b8' }}>
                      <span className="w-2 h-2 rounded-full inline-block"
                        style={{ background: u.isOnline ? '#22c55e' : '#cbd5e1' }} />
                      {u.isOnline ? 'Online' : 'Offline'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Activity log legend */}
      <div className="bg-white rounded-xl border border-slate-100 p-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Action Types</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(ACTION_LABELS).map(([key, meta]) => (
            <span key={key} className="px-2.5 py-1 rounded-full text-xs font-medium"
              style={{ background: meta.bg, color: meta.color }}>
              {meta.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Leaderboard page ──────────────────────────────────────────────────────
type Tab = 'recruiters' | 'dl' | 'kam' | 'demands' | 'activity';
const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'recruiters', label: 'Recruiter Rankings', icon: <Trophy size={15} /> },
  { id: 'dl',         label: 'Delivery Leads',     icon: <Users size={15} /> },
  { id: 'kam',        label: 'KAM Accountability', icon: <Briefcase size={15} /> },
  { id: 'demands',    label: 'Demand Health',       icon: <TrendingUp size={15} /> },
  { id: 'activity',   label: 'User Activity',       icon: <Activity size={15} /> },
];

export default function Leaderboard() {
  const [data, setData] = useState<PodReport | null>(null);
  const [activities, setActivities] = useState<UserActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('recruiters');
  const [period, setPeriod] = useState<Period>('all');
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

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
      setError('Failed to load leaderboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const range = useMemo(() => periodRange(period), [period]);

  // Period-filtered KPIs
  const kpis = useMemo(() => {
    if (!data) return null;
    const ps = data.pod_stats;
    if (period === 'all') {
      return {
        demands: ps.total_demands, sourced: ps.total_sourced,
        submitted: ps.total_submitted, selections: ps.total_selections,
        todaySubs: ps.today_subs, recruiterCount: ps.recruiters_count,
      };
    }
    const periodCands = data.recruiters.flatMap(r =>
      r.candidates.filter(c => inRange(c.sourcing_date, range.from, range.to))
    );
    return {
      demands: ps.total_demands,
      sourced: periodCands.length,
      submitted: periodCands.filter(c => c.submitted_to_client).length,
      selections: data.jobs.reduce((s, j) => s + j.selections, 0),
      todaySubs: ps.today_subs,
      recruiterCount: ps.recruiters_count,
    };
  }, [data, period, range]);

  return (
    <Layout title="Performance Leaderboard">
      <div className="space-y-5">

        {/* Header controls */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 bg-white rounded-xl border border-slate-200 p-1 shadow-sm">
            {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                style={period === p
                  ? { background: '#3b82f6', color: '#fff' }
                  : { color: '#64748b' }
                }
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            {lastFetched && (
              <span className="text-xs text-slate-400">
                Updated {lastFetched.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
        )}

        {/* Loading skeleton */}
        {loading && !data && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-24 rounded-2xl bg-slate-100 animate-pulse" />
              ))}
            </div>
            <div className="h-96 rounded-2xl bg-slate-100 animate-pulse" />
          </div>
        )}

        {/* Main content */}
        {data && kpis && (
          <>
            {/* KPI row */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
              <KPI label="Active Demands"  value={kpis.demands}       color="#1d4ed8" sub={`${kpis.recruiterCount} recruiters`} />
              <KPI label={`Sourced${period !== 'all' ? ` (${PERIOD_LABELS[period]})` : ''}`} value={kpis.sourced} color="#0284c7" />
              <KPI label={`Submitted${period !== 'all' ? ` (${PERIOD_LABELS[period]})` : ''}`} value={kpis.submitted} color="#7c3aed" />
              <KPI label="Today's Subs"   value={kpis.todaySubs}      color="#059669" sub="submissions today" />
              <KPI label="Selections"      value={kpis.selections}     color="#15803d" sub="all time" />
              <KPI label="Fill Rate"       value={`${pct(kpis.selections, data.jobs.reduce((s,j)=>s+j.headcount,0))}%`} color="#b45309" sub="sel / headcount" />
            </div>

            {/* Pod summary bar */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Pipeline Overview — All Demands</p>
              <div className="flex items-center gap-0 overflow-x-auto">
                {[
                  { label: 'Sourced', val: data.pod_stats.total_sourced, color: '#3b82f6', bg: '#dbeafe' },
                  { label: 'Validated', val: data.pod_stats.total_validated, color: '#10b981', bg: '#dcfce7' },
                  { label: 'Submitted', val: data.pod_stats.total_submitted, color: '#8b5cf6', bg: '#ede9fe' },
                  { label: 'L1', val: data.pod_stats.total_l1, color: '#f59e0b', bg: '#fef3c7' },
                  { label: 'L2', val: data.pod_stats.total_l2, color: '#f97316', bg: '#ffedd5' },
                  { label: 'Selections', val: data.pod_stats.total_selections, color: '#22c55e', bg: '#bbf7d0' },
                ].map((step, i, arr) => (
                  <div key={step.label} className="flex items-center">
                    <div className="flex flex-col items-center px-5 py-2 rounded-xl min-w-[90px]" style={{ background: step.bg }}>
                      <span className="text-2xl font-black" style={{ color: step.color }}>{step.val}</span>
                      <span className="text-xs font-semibold" style={{ color: step.color }}>{step.label}</span>
                      {i > 0 && (
                        <span className="text-[10px] text-slate-400 mt-0.5">
                          {pct(step.val, arr[i-1].val)}% of prev
                        </span>
                      )}
                    </div>
                    {i < arr.length - 1 && (
                      <div className="flex-shrink-0 text-slate-300 mx-1 text-lg font-light">›</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Tabs */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Tab bar */}
              <div className="flex border-b border-slate-200 bg-slate-50">
                {TABS.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className="flex items-center gap-2 px-5 py-3.5 text-sm font-semibold transition-all border-b-2"
                    style={tab === t.id
                      ? { color: '#3b82f6', borderColor: '#3b82f6', background: '#fff' }
                      : { color: '#64748b', borderColor: 'transparent' }
                    }
                  >
                    {t.icon}{t.label}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="p-5">
                {tab === 'recruiters' && <RecruiterTab data={data} range={range} activities={activities} />}
                {tab === 'dl'         && <DLTab data={data} range={range} />}
                {tab === 'kam'        && <KAMTab data={data} />}
                {tab === 'demands'    && <DemandTab data={data} />}
                {tab === 'activity'   && <ActivityTab activities={activities} />}
              </div>
            </div>

            {/* Footer note */}
            <p className="text-xs text-slate-400 text-center">
              Data as of {data.pod_stats.report_date} · Sourced/Validated counts reflect selected period filter · Submissions, L1/L2, Selections are all-time figures
            </p>
          </>
        )}
      </div>
    </Layout>
  );
}
