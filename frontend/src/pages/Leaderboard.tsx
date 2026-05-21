import { useEffect, useState, useMemo, useRef, Fragment } from 'react';
import {
  Users, AlertTriangle, CheckCircle2, RefreshCw,
  Search, X, Calendar, ChevronUp, ChevronDown, ChevronsUpDown, Filter,
  Mail, Send, ShieldCheck, ChevronRight,
} from 'lucide-react';
import Layout from '../components/Layout';
import api from '../api/client';

// ════════════════════════════════════════════════════════════════════════════
//  Section 1 — Recruiter Leaderboard (per-recruiter daily metrics)
// ════════════════════════════════════════════════════════════════════════════

interface HourlySlot {
  slot_index:  number;
  label:       string;
  target:      number;
  ack_sent:    number;
  submissions: number;
  dl_verified: number;
  completed:   boolean;
}

interface RecruiterRow {
  recruiter_id: number;
  recruiter_name: string;
  dl_names:  string[];           // all DLs this recruiter rolls up to (multi-team support)
  kam_names: string[];           // pod's KAMs — any of them may work with this recruiter's DL
  bh_name:   string | null;
  pod_name:  string | null;
  day_target:    number;         // sum of all hourly slot targets for today
  target_so_far: number;         // cumulative target the user should have reached by now
  done:        number;
  // Funnel (cumulative on today's sourced candidates): ack_sent ≥ submissions ≥ dl_verified
  ack_sent:    number;
  submissions: number;
  dl_verified: number;
  pct: number;                   // dl_verified / target_so_far × 100
  status: 'On Track' | 'Behind';
  rejections: number;
  performance: 'needs discussion' | 'below average' | 'average' | 'high' | 'good performance';
  hourly: HourlySlot[];
}

interface RecruiterTotals {
  day_target:    number;
  target_so_far: number;
  done:          number;
  ack_sent:      number;
  submissions:   number;
  dl_verified:   number;
  rejections:    number;
  pct:           number;
  status:       'On Track' | 'Behind';
  hourly:       HourlySlot[];
}

interface RecruiterApiResponse {
  rows:   RecruiterRow[];
  totals: RecruiterTotals;
  today:  string;
}

const PERF_OPTIONS: RecruiterRow['performance'][] = [
  'needs discussion', 'below average', 'average', 'high', 'good performance',
];

function uniq(values: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const v of values) if (v) out.add(v);
  return [...out].sort();
}

// ── MultiSelect filter — searchable, with select-all / clear ──
function MultiSelectFilter({
  label, options, selected, onChange,
}: {
  label: string;
  options: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const filtered = useMemo(
    () => q.trim() ? options.filter(o => o.toLowerCase().includes(q.trim().toLowerCase())) : options,
    [q, options]
  );

  const toggle = (v: string) => {
    const next = new Set(selected);
    next.has(v) ? next.delete(v) : next.add(v);
    onChange(next);
  };

  const summary = selected.size === 0
    ? `All ${label}`
    : selected.size === 1
      ? [...selected][0]
      : `${selected.size} ${label}`;

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-400 min-w-32 max-w-44 flex items-center justify-between gap-1 hover:bg-slate-50"
      >
        <span className={`truncate ${selected.size > 0 ? 'font-semibold text-slate-800' : 'text-slate-500'}`}>{summary}</span>
        <ChevronDown size={11} className="text-slate-400 flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 left-0 w-60 bg-white rounded-xl border border-slate-200 shadow-lg p-2">
          <div className="relative mb-1.5">
            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              type="text"
              placeholder="Search…"
              value={q}
              onChange={e => setQ(e.target.value)}
              className="w-full pl-6 pr-2 py-1.5 rounded-md border border-slate-200 text-xs focus:outline-none focus:border-blue-400"
            />
          </div>
          <div className="flex items-center justify-between px-1 mb-1">
            <button
              onClick={() => onChange(new Set(options))}
              className="text-[11px] font-semibold text-blue-600 hover:underline"
            >Select all ({options.length})</button>
            <button
              onClick={() => onChange(new Set())}
              className="text-[11px] font-semibold text-slate-500 hover:underline"
            >Clear</button>
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-center text-xs text-slate-400 py-3">No matches.</p>
            ) : filtered.map(o => (
              <label
                key={o}
                className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-slate-50"
              >
                <input type="checkbox" checked={selected.has(o)} onChange={() => toggle(o)} className="accent-blue-500" />
                <span className="text-xs text-slate-700 truncate">{o}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Funnel visual: small horizontal stack showing Ack → Submissions → Verified.
function FunnelBar({ ack, sub, ver }: { ack: number; sub: number; ver: number }) {
  const total = Math.max(ack, 1);
  const wAck = 100;
  const wSub = Math.round((sub / total) * 100);
  const wVer = Math.round((ver / total) * 100);
  return (
    <div className="flex items-center gap-0.5 h-2 w-24" title={`Ack ${ack} · Subs ${sub} · Verified ${ver}`}>
      <div className="rounded-l-sm bg-amber-200" style={{ width: `${wAck}%` }} />
      <div className="bg-violet-300" style={{ width: `${wSub}%`, marginLeft: '-100%' }} />
      <div className="rounded-r-sm bg-emerald-500" style={{ width: `${wVer}%`, marginLeft: '-100%' }} />
    </div>
  );
}

// One-row hourly drill-down rendered as a nested table.
function HourlyDrillDown({ hourly }: { hourly: HourlySlot[] }) {
  return (
    <div className="bg-slate-50 px-6 py-3">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="text-slate-500">
            <th className="text-left py-1 px-2 font-semibold">Hour</th>
            {hourly.map(s => (
              <th key={s.slot_index}
                  className={`text-center py-1 px-2 font-semibold whitespace-nowrap ${s.completed ? '' : 'text-slate-300'}`}>
                {s.label.replace(' AM', '').replace(' PM', '').replace(' – ', '–')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="py-1 px-2 font-semibold text-slate-600 whitespace-nowrap">Target</td>
            {hourly.map(s => (
              <td key={s.slot_index} className="text-center py-1 px-2 text-slate-500">{s.target || '—'}</td>
            ))}
          </tr>
          <tr title="Acknowledgment sent — mails sent to consultants this hour">
            <td className="py-1 px-2 font-semibold whitespace-nowrap" style={{ color: '#B45309' }}>
              <Mail size={11} className="inline mr-1" /> Ack sent
            </td>
            {hourly.map(s => (
              <td key={s.slot_index} className="text-center py-1 px-2"
                  style={{ background: s.ack_sent > 0 ? '#FEF3C7' : undefined }}>
                {s.ack_sent || ''}
              </td>
            ))}
          </tr>
          <tr title="Submissions — candidates submitted to client this hour">
            <td className="py-1 px-2 font-semibold whitespace-nowrap" style={{ color: '#6D28D9' }}>
              <Send size={11} className="inline mr-1" /> Submissions
            </td>
            {hourly.map(s => (
              <td key={s.slot_index} className="text-center py-1 px-2"
                  style={{ background: s.submissions > 0 ? '#EDE9FE' : undefined }}>
                {s.submissions || ''}
              </td>
            ))}
          </tr>
          <tr title="DL verified — validations completed this hour">
            <td className="py-1 px-2 font-semibold whitespace-nowrap" style={{ color: '#047857' }}>
              <ShieldCheck size={11} className="inline mr-1" /> DL verified
            </td>
            {hourly.map(s => {
              const met = s.target > 0 && s.dl_verified >= s.target;
              return (
                <td key={s.slot_index} className="text-center py-1 px-2 font-semibold"
                    style={{
                      background: s.dl_verified > 0 ? (met ? '#D1FAE5' : '#FEE2E2') : undefined,
                      color:      s.dl_verified > 0 ? (met ? '#047857' : '#B91C1C') : undefined,
                    }}>
                  {s.dl_verified || ''}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function RecruiterLeaderboardSection() {
  const [data, setData]       = useState<RecruiterApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  // Hourly view: collapsed = unique IDs that were closed.  All rows are
  // EXPANDED by default so the hourly grid is visible immediately.
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [allCollapsed, setAllCollapsed] = useState(false);

  // ── Filter state — multi-select where it matters ──
  const [search, setSearch]     = useState('');
  const [fDl,  setFDl]          = useState<Set<string>>(new Set());
  const [fKam, setFKam]         = useState<Set<string>>(new Set());
  const [fBh,  setFBh]          = useState<Set<string>>(new Set());
  const [fPod, setFPod]         = useState<Set<string>>(new Set());
  const [fStatus, setFStatus]   = useState('');
  const [fPerf,   setFPerf]     = useState('');

  const fetchData = () => {
    setLoading(true);
    api.get<RecruiterApiResponse>('/coo/recruiter-leaderboard')
      .then((r) => { setData(r.data); setError(''); })
      .catch(() => setError('Failed to load recruiter leaderboard.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const isOpen = (id: number) => !allCollapsed && !collapsed.has(id);

  const toggleRow = (id: number) => {
    if (allCollapsed) {
      // Coming out of "collapse all" — open just this one and clear the master.
      setAllCollapsed(false);
      setCollapsed(prev => {
        const next = new Set(prev);
        (data?.rows ?? []).forEach(r => { if (r.recruiter_id !== id) next.add(r.recruiter_id); });
        return next;
      });
      return;
    }
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setAllCollapsed(v => !v);
    setCollapsed(new Set());
  };

  // ── Filter-option lists derived from the data ──
  const dlOptions  = useMemo(() => uniq((data?.rows ?? []).flatMap(r => r.dl_names)),  [data]);
  const kamOptions = useMemo(() => uniq((data?.rows ?? []).flatMap(r => r.kam_names)), [data]);
  const bhOptions  = useMemo(() => uniq(data?.rows.map(r => r.bh_name)  ?? []), [data]);
  const podOptions = useMemo(() => uniq(data?.rows.map(r => r.pod_name) ?? []), [data]);

  // ── Apply filters ──
  // Multi-select filters match if ANY of the row's values is selected — so
  // a recruiter on two DL teams shows up when either DL is picked.
  const filteredRows = useMemo(() => {
    const rows = data?.rows ?? [];
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (q && !r.recruiter_name.toLowerCase().includes(q)) return false;
      if (fDl.size  && !r.dl_names.some(n => fDl.has(n)))  return false;
      if (fKam.size && !r.kam_names.some(n => fKam.has(n))) return false;
      if (fBh.size  && !(r.bh_name  && fBh.has(r.bh_name)))  return false;
      if (fPod.size && !(r.pod_name && fPod.has(r.pod_name))) return false;
      if (fStatus && r.status      !== fStatus) return false;
      if (fPerf   && r.performance !== fPerf)   return false;
      return true;
    });
  }, [data, search, fDl, fKam, fBh, fPod, fStatus, fPerf]);

  // ── Totals from the filtered rows so footer matches what user sees ──
  const totals = useMemo(() => {
    if (!data) return null;
    const t = filteredRows.reduce(
      (a, r) => {
        a.day_target    += r.day_target;
        a.target_so_far += r.target_so_far;
        a.ack_sent      += r.ack_sent;
        a.submissions   += r.submissions;
        a.dl_verified   += r.dl_verified;
        a.rejections    += r.rejections;
        return a;
      },
      { day_target: 0, target_so_far: 0, ack_sent: 0, submissions: 0, dl_verified: 0, rejections: 0 }
    );
    const pct = t.target_so_far ? Math.round((t.dl_verified / t.target_so_far) * 100) : 0;
    const status: 'On Track' | 'Behind' =
      t.target_so_far === 0 || pct >= 75 ? 'On Track' : 'Behind';
    return { ...t, pct, status };
  }, [filteredRows, data]);

  const activeFilters =
    (search ? 1 : 0)
    + (fDl.size ? 1 : 0) + (fKam.size ? 1 : 0)
    + (fBh.size ? 1 : 0) + (fPod.size ? 1 : 0)
    + (fStatus ? 1 : 0) + (fPerf ? 1 : 0);
  const clearAll = () => {
    setSearch('');
    setFDl(new Set()); setFKam(new Set()); setFBh(new Set()); setFPod(new Set());
    setFStatus(''); setFPerf('');
  };

  const selectCls = "text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-400 min-w-28 max-w-44";

  // Column count for spanning loading/empty rows (must match the header count).
  const COL_COUNT = 14;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Users size={18} className="text-slate-500" />
          <h2 className="text-base font-bold text-slate-800">
            Recruiter Leaderboard
          </h2>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-semibold">
            Ack → Submissions → DL Verified
          </span>
          {data && (
            <span className="ml-2 text-xs text-slate-400">{data.today}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleAll}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold"
            title="Show or hide the hourly split for all recruiters"
          >
            {allCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            {allCollapsed ? 'Show hourly' : 'Hide hourly'}
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Legend ── */}
      <div className="flex items-center flex-wrap gap-3 mb-3 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-300" />
          <Mail size={11} /> Ack sent
          <span className="text-slate-400">— mail sent to consultant</span>
        </span>
        <span className="text-slate-300">›</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-violet-400" />
          <Send size={11} /> Submissions
          <span className="text-slate-400">— sent to client, DL verification pending or done</span>
        </span>
        <span className="text-slate-300">›</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500" />
          <ShieldCheck size={11} /> DL verified
          <span className="text-slate-400">— validated by Delivery Lead</span>
        </span>
        <span className="ml-auto text-slate-400">Click a row to see the hourly split.</span>
      </div>

      {/* ── Filter bar ── */}
      <div className="flex items-center flex-wrap gap-2 mb-4 px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-100">
        <Filter size={13} className="text-slate-400 ml-1" />

        <div className="relative">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text" placeholder="Search recruiter…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="pl-7 pr-2.5 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-blue-400 w-44"
          />
        </div>

        <MultiSelectFilter label="DLs"  options={dlOptions}  selected={fDl}  onChange={setFDl} />
        <MultiSelectFilter label="KAMs" options={kamOptions} selected={fKam} onChange={setFKam} />
        <MultiSelectFilter label="BHs"  options={bhOptions}  selected={fBh}  onChange={setFBh} />
        <MultiSelectFilter label="Pods" options={podOptions} selected={fPod} onChange={setFPod} />
        <select value={fStatus} onChange={e => setFStatus(e.target.value)} className={selectCls}>
          <option value="">Any status</option>
          <option value="On Track">On Track</option>
          <option value="Behind">Behind</option>
        </select>
        <select value={fPerf} onChange={e => setFPerf(e.target.value)} className={selectCls}>
          <option value="">Any performance</option>
          {PERF_OPTIONS.map(v => <option key={v} value={v} className="capitalize">{v}</option>)}
        </select>

        {activeFilters > 0 && (
          <button
            onClick={clearAll}
            className="ml-auto flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-50 border border-red-100 text-red-600 text-xs font-semibold hover:bg-red-100"
          >
            <X size={11} /> Clear ({activeFilters})
          </button>
        )}
      </div>

      {error && (
        <div className="text-sm text-red-600 py-8 text-center">{error}</div>
      )}

      {!error && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 1400 }}>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="w-6 py-2.5 px-2" />
                <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Recruiter</th>
                <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Delivery Lead</th>
                <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">KAM</th>
                <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">BH / Pod</th>
                <th className="text-center py-2.5 px-3 text-xs font-bold uppercase tracking-wider" style={{ background: '#FEF3C7', color: '#92400E' }}>
                  <Mail size={11} className="inline mr-1" /> Ack sent
                </th>
                <th className="text-center py-2.5 px-3 text-xs font-bold uppercase tracking-wider" style={{ background: '#EDE9FE', color: '#5B21B6' }}>
                  <Send size={11} className="inline mr-1" /> Submissions
                </th>
                <th className="text-center py-2.5 px-3 text-xs font-bold uppercase tracking-wider" style={{ background: '#D1FAE5', color: '#065F46' }}>
                  <ShieldCheck size={11} className="inline mr-1" /> DL verified
                </th>
                <th className="text-center py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Funnel</th>
                <th className="text-center py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider" title="Cumulative hourly target the user should have hit by now">Target so far</th>
                <th className="text-center py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Day target</th>
                <th className="text-center py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">% so far</th>
                <th className="text-center py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="text-center py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Rejections</th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <tr>
                  <td colSpan={COL_COUNT} className="py-12 text-center text-sm text-slate-400">Loading…</td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={COL_COUNT} className="py-12 text-center text-sm text-slate-400">
                    {activeFilters > 0 ? 'No recruiters match these filters.' : 'No recruiters found.'}
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const open = isOpen(row.recruiter_id);
                  return (
                  <Fragment key={row.recruiter_id}>
                    <tr
                        onClick={() => toggleRow(row.recruiter_id)}
                        className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer">
                      <td className="py-2.5 px-2 text-center text-slate-400">
                        {open ? <ChevronDown size={14} className="inline" /> : <ChevronRight size={14} className="inline" />}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-800 whitespace-nowrap">{row.recruiter_name}</td>
                      <td className="py-2.5 px-3 text-slate-600 text-xs">
                        {row.dl_names.length === 0
                          ? <span className="text-slate-300">—</span>
                          : row.dl_names.length === 1
                            ? row.dl_names[0]
                            : (
                              <span title={row.dl_names.join(', ')}>
                                {row.dl_names.join(', ')}
                                <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-700">×{row.dl_names.length}</span>
                              </span>
                            )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 text-xs">{row.kam_names.length > 0 ? row.kam_names.join(', ') : <span className="text-slate-300">—</span>}</td>
                      <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap text-xs">
                        {row.bh_name  ?? <span className="text-slate-300">—</span>}
                        {row.pod_name && <span className="text-slate-400"> · {row.pod_name}</span>}
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold" style={{ background: row.ack_sent > 0 ? '#FFFBEB' : undefined, color: '#92400E' }}>
                        {row.ack_sent || <span className="text-slate-300 font-normal">—</span>}
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold" style={{ background: row.submissions > 0 ? '#F5F3FF' : undefined, color: '#5B21B6' }}>
                        {row.submissions || <span className="text-slate-300 font-normal">—</span>}
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold" style={{ background: row.dl_verified > 0 ? '#ECFDF5' : undefined, color: '#065F46' }}>
                        {row.dl_verified || <span className="text-slate-300 font-normal">—</span>}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <FunnelBar ack={row.ack_sent} sub={row.submissions} ver={row.dl_verified} />
                      </td>
                      <td className="py-2.5 px-3 text-center font-semibold text-slate-800">{row.target_so_far || <span className="text-slate-300">—</span>}</td>
                      <td className="py-2.5 px-3 text-center text-slate-500">{row.day_target || <span className="text-slate-300">—</span>}</td>
                      <td className="py-2.5 px-3 text-center text-slate-700 font-semibold">{row.target_so_far ? `${row.pct}%` : <span className="text-slate-300 font-normal">—</span>}</td>
                      <td className="py-2.5 px-3 text-center">
                        {row.status === 'On Track' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold text-xs">
                            <CheckCircle2 size={12} /> On Track
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-600 font-semibold text-xs">
                            <AlertTriangle size={12} /> Behind
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center text-slate-700">{row.rejections || ''}</td>
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={COL_COUNT} className="p-0">
                          <HourlyDrillDown hourly={row.hourly} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                  );
                })
              )}
            </tbody>
            {totals && filteredRows.length > 0 && (
              <tfoot>
                <tr className="bg-slate-100 font-bold text-slate-700">
                  <td className="py-2.5 px-2" />
                  <td className="py-2.5 px-3" colSpan={4}>
                    TOTAL ({filteredRows.length})
                  </td>
                  <td className="py-2.5 px-3 text-center" style={{ color: '#92400E' }}>{totals.ack_sent}</td>
                  <td className="py-2.5 px-3 text-center" style={{ color: '#5B21B6' }}>{totals.submissions}</td>
                  <td className="py-2.5 px-3 text-center" style={{ color: '#065F46' }}>{totals.dl_verified}</td>
                  <td className="py-2.5 px-3 text-center">
                    <FunnelBar ack={totals.ack_sent} sub={totals.submissions} ver={totals.dl_verified} />
                  </td>
                  <td className="py-2.5 px-3 text-center">{totals.target_so_far}</td>
                  <td className="py-2.5 px-3 text-center text-slate-500">{totals.day_target}</td>
                  <td className="py-2.5 px-3 text-center">{totals.target_so_far ? `${totals.pct}%` : '—'}</td>
                  <td className="py-2.5 px-3 text-center">
                    {totals.status === 'On Track' ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 text-xs">
                        <CheckCircle2 size={12} /> Pod on track
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-600 text-xs">
                        <AlertTriangle size={12} /> Pod behind
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-center">{totals.rejections}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Section 2 — Pipeline activity by Business Head & Client
// ════════════════════════════════════════════════════════════════════════════

interface ColCounts { total: number; today: number; compare: number; }

interface PipelineRow {
  bh_name:     string;
  am_name:     string;
  client_name: string;
  cols:        Record<string, ColCounts>;
}

interface ColDef { key: string; label: string; }

interface PipelineApiResponse {
  rows:         PipelineRow[];
  columns:      ColDef[];
  today:        string;
  compare_date: string | null;
}

const COL_PALETTE: Record<string, { hdr: string; cellTotal: string; cellToday: string }> = {
  submission:    { hdr: '#1E40AF', cellTotal: '#EFF6FF', cellToday: '#DBEAFE' },
  screen_reject: { hdr: '#991B1B', cellTotal: '#FEF2F2', cellToday: '#FEE2E2' },
  l1_reject:     { hdr: '#C2410C', cellTotal: '#FFF7ED', cellToday: '#FFEDD5' },
  l1_accept:     { hdr: '#166534', cellTotal: '#F0FDF4', cellToday: '#DCFCE7' },
  l2_reject:     { hdr: '#B45309', cellTotal: '#FFFBEB', cellToday: '#FEF3C7' },
  l2_accept:     { hdr: '#15803D', cellTotal: '#ECFDF5', cellToday: '#D1FAE5' },
  l3_reject:     { hdr: '#9F1239', cellTotal: '#FFF1F2', cellToday: '#FFE4E6' },
  l3_accept:     { hdr: '#047857', cellTotal: '#D1FAE5', cellToday: '#A7F3D0' },
  selection:     { hdr: '#0F766E', cellTotal: '#F0FDFA', cellToday: '#CCFBF1' },
  onboarding:    { hdr: '#065F46', cellTotal: '#ECFDF5', cellToday: '#6EE7B7' },
};

function pal(key: string) {
  return COL_PALETTE[key] ?? { hdr: '#475569', cellTotal: '#F8FAFC', cellToday: '#F1F5F9' };
}

function todayISO() { return new Date().toISOString().slice(0, 10); }

function fmtDate(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

type SortDir = 'desc' | 'asc';

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronsUpDown size={9} className="opacity-40 flex-shrink-0" />;
  return dir === 'desc'
    ? <ChevronDown size={9} className="flex-shrink-0" />
    : <ChevronUp   size={9} className="flex-shrink-0" />;
}

function PipelineLeaderboardSection() {
  const [data, setData]               = useState<PipelineApiResponse | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [search, setSearch]           = useState('');
  const [fBh,  setFBh]                = useState<Set<string>>(new Set());
  const [fAm,  setFAm]                = useState<Set<string>>(new Set());
  const [fClient, setFClient]         = useState<Set<string>>(new Set());
  const [onlyActive, setOnlyActive]   = useState(false);
  const [compareDate, setCompareDate] = useState('');
  const [pickerOpen, setPickerOpen]   = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [sortKey, setSortKey]         = useState('');
  const [sortDir, setSortDir]         = useState<SortDir>('desc');
  const dateInputRef = useRef<HTMLInputElement>(null);

  const fetchData = (cmpDate = compareDate) => {
    setLoading(true);
    setError('');
    api.get<PipelineApiResponse>('/coo/leaderboard', {
      params: cmpDate ? { compare_date: cmpDate } : undefined,
    })
      .then(r => { setData(r.data); setLastRefresh(new Date()); })
      .catch(e => {
        const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        setError(msg || 'Failed to load leaderboard.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (pickerOpen) dateInputRef.current?.showPicker?.(); }, [pickerOpen]);

  const handleDatePick = (val: string) => {
    setPickerOpen(false);
    if (!val) return;
    setCompareDate(val);
    fetchData(val);
  };

  const clearCompare = () => { setCompareDate(''); fetchData(''); };

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const rowValue = (row: PipelineRow, key: string): string | number => {
    if (key === 'bh')     return row.bh_name;
    if (key === 'am')     return row.am_name;
    if (key === 'client') return row.client_name;
    const [colKey, side] = key.split('.');
    const c = row.cols[colKey];
    if (side === 'today') return c?.today   ?? 0;
    if (side === 'left')  return compareDate ? (c?.compare ?? 0) : (c?.total ?? 0);
    return 0;
  };

  // Filter-option lists derived from the data.
  const bhOptions     = useMemo(() => uniq((data?.rows ?? []).map(r => r.bh_name)),     [data]);
  const amOptions     = useMemo(() => uniq((data?.rows ?? []).map(r => r.am_name)),     [data]);
  const clientOptions = useMemo(() => uniq((data?.rows ?? []).map(r => r.client_name)), [data]);

  const rowHasTodayActivity = (r: PipelineRow): boolean => {
    for (const col of data?.columns ?? []) {
      if ((r.cols[col.key]?.today ?? 0) > 0) return true;
    }
    return false;
  };

  const filteredRows = useMemo(() => {
    if (!data) return [];
    let rows = data.rows;
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        r.bh_name.toLowerCase().includes(q) ||
        r.am_name.toLowerCase().includes(q) ||
        r.client_name.toLowerCase().includes(q)
      );
    }
    if (fBh.size)     rows = rows.filter(r => fBh.has(r.bh_name));
    if (fAm.size)     rows = rows.filter(r => r.am_name && fAm.has(r.am_name));
    if (fClient.size) rows = rows.filter(r => fClient.has(r.client_name));
    if (onlyActive)   rows = rows.filter(rowHasTodayActivity);
    if (sortKey) {
      rows = [...rows].sort((a, b) => {
        const av = rowValue(a, sortKey);
        const bv = rowValue(b, sortKey);
        const cmp = typeof av === 'string'
          ? av.localeCompare(bv as string)
          : (av as number) - (bv as number);
        return sortDir === 'desc' ? -cmp : cmp;
      });
    }
    return rows;
  }, [data, search, fBh, fAm, fClient, onlyActive, sortKey, sortDir, compareDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeFilters =
    (search ? 1 : 0)
    + (fBh.size ? 1 : 0) + (fAm.size ? 1 : 0) + (fClient.size ? 1 : 0)
    + (onlyActive ? 1 : 0);
  const clearAllFilters = () => {
    setSearch('');
    setFBh(new Set()); setFAm(new Set()); setFClient(new Set());
    setOnlyActive(false);
  };

  const totals = useMemo(() => {
    const t: Record<string, ColCounts> = {};
    for (const col of (data?.columns ?? [])) {
      t[col.key] = { total: 0, today: 0, compare: 0 };
      for (const r of filteredRows) {
        t[col.key].total   += r.cols[col.key]?.total   ?? 0;
        t[col.key].today   += r.cols[col.key]?.today   ?? 0;
        t[col.key].compare += r.cols[col.key]?.compare ?? 0;
      }
    }
    return t;
  }, [filteredRows, data]);

  const cols      = data?.columns ?? [];
  const totalCols = 3 + cols.length * 2;
  const leftLabel = compareDate ? fmtDate(compareDate) : 'Total';

  const fixedThCls = "text-left py-3 px-4 text-xs font-bold text-white whitespace-nowrap cursor-pointer select-none";

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h2 className="text-base font-bold text-slate-800">Pipeline activity by Business Head &amp; Client</h2>
          {lastRefresh && (
            <span className="text-[11px] text-slate-400">
              Updated {lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <button
          onClick={() => fetchData()}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* ── Filter bar ── */}
      <div className="flex items-center flex-wrap gap-2 mb-4 px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-100">
        <Filter size={13} className="text-slate-400 ml-1" />

        <div className="relative">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search BH, AM or client…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-7 pr-2.5 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-blue-400 w-52"
          />
        </div>

        <MultiSelectFilter label="BHs"       options={bhOptions}     selected={fBh}     onChange={setFBh} />
        <MultiSelectFilter label="AMs"       options={amOptions}     selected={fAm}     onChange={setFAm} />
        <MultiSelectFilter label="Customers" options={clientOptions} selected={fClient} onChange={setFClient} />

        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white cursor-pointer hover:bg-slate-100">
          <input
            type="checkbox"
            checked={onlyActive}
            onChange={e => setOnlyActive(e.target.checked)}
            className="accent-blue-500"
          />
          Active today only
        </label>

        {activeFilters > 0 && (
          <button
            onClick={clearAllFilters}
            className="ml-auto flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-50 border border-red-100 text-red-600 text-xs font-semibold hover:bg-red-100"
          >
            <X size={11} /> Clear ({activeFilters})
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-medium">
          {error}
        </div>
      )}

      <input
        ref={dateInputRef}
        type="date"
        max={todayISO()}
        className="sr-only"
        onChange={e => handleDatePick(e.target.value)}
        onBlur={() => setPickerOpen(false)}
      />

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table
            className="w-full border-collapse text-sm"
            style={{ minWidth: Math.max(800, 380 + cols.length * 130) }}
          >
            {loading ? (
              <tbody>
                <tr>
                  <td colSpan={totalCols} className="py-16 text-center text-slate-400">
                    <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-slate-300" />
                    Loading…
                  </td>
                </tr>
              </tbody>
            ) : (
              <>
                <thead>
                  <tr>
                    <th
                      rowSpan={2}
                      className={`${fixedThCls} border-r border-green-800`}
                      style={{ background: '#14532D', minWidth: 130 }}
                      onClick={() => handleSort('bh')}
                    >
                      <span className="flex items-center gap-1">
                        Business Head
                        <SortIcon active={sortKey === 'bh'} dir={sortDir} />
                      </span>
                    </th>
                    <th
                      rowSpan={2}
                      className={`${fixedThCls} border-r border-green-700`}
                      style={{ background: '#166534', minWidth: 110 }}
                      onClick={() => handleSort('am')}
                    >
                      <span className="flex items-center gap-1">
                        Account Manager
                        <SortIcon active={sortKey === 'am'} dir={sortDir} />
                      </span>
                    </th>
                    <th
                      rowSpan={2}
                      className={`${fixedThCls} border-r border-green-700`}
                      style={{ background: '#15803D', minWidth: 120 }}
                      onClick={() => handleSort('client')}
                    >
                      <span className="flex items-center gap-1">
                        Customer
                        <SortIcon active={sortKey === 'client'} dir={sortDir} />
                      </span>
                    </th>
                    {cols.map(col => (
                      <th
                        key={col.key}
                        colSpan={2}
                        className="text-center py-2 px-2 text-[11px] font-bold border-r border-white/30 whitespace-nowrap"
                        style={{ background: pal(col.key).hdr, color: '#fff' }}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>

                  <tr>
                    {cols.map(col => {
                      const p        = pal(col.key);
                      const leftKey  = `${col.key}.left`;
                      const todayKey = `${col.key}.today`;
                      const leftActive  = sortKey === leftKey;
                      const todayActive = sortKey === todayKey;
                      return (
                        <>
                          <th
                            key={leftKey}
                            className="text-center py-1.5 px-3 text-[10px] border-r border-white/20 whitespace-nowrap cursor-pointer select-none"
                            style={{
                              background: p.hdr,
                              color: leftActive ? '#fff' : 'rgba(255,255,255,0.82)',
                              borderTop: '1px solid rgba(255,255,255,0.25)',
                            }}
                            onClick={() => {
                              if (!compareDate) setPickerOpen(true);
                              handleSort(leftKey);
                            }}
                          >
                            {compareDate ? (
                              <span className="flex items-center justify-center gap-1 font-semibold">
                                {leftLabel}
                                <button
                                  onClick={e => { e.stopPropagation(); clearCompare(); }}
                                  className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full hover:bg-white/20"
                                  title="Back to Total"
                                >
                                  <X size={8} />
                                </button>
                                <SortIcon active={leftActive} dir={sortDir} />
                              </span>
                            ) : (
                              <span className="flex items-center justify-center gap-1 font-semibold hover:text-white">
                                Total
                                <Calendar size={9} className="opacity-60" />
                                <SortIcon active={leftActive} dir={sortDir} />
                              </span>
                            )}
                          </th>
                          <th
                            key={todayKey}
                            className="text-center py-1.5 px-2 text-[10px] font-black border-r border-white/30 whitespace-nowrap cursor-pointer select-none"
                            style={{
                              background: p.hdr,
                              color: '#fff',
                              borderTop: '1px solid rgba(255,255,255,0.25)',
                            }}
                            onClick={() => handleSort(todayKey)}
                          >
                            <span className="flex items-center justify-center gap-1">
                              Today
                              <SortIcon active={todayActive} dir={sortDir} />
                            </span>
                          </th>
                        </>
                      );
                    })}
                  </tr>
                </thead>

                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={totalCols} className="py-14 text-center text-sm text-slate-400">
                        {search ? 'No matches found.' : 'No data available.'}
                      </td>
                    </tr>
                  ) : (
                    <>
                      {filteredRows.map((row, ri) => (
                        <tr
                          key={`${row.bh_name}-${row.am_name}-${row.client_name}`}
                          className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors"
                        >
                          <td
                            className="py-2.5 px-4 text-xs font-semibold border-r border-slate-200 whitespace-nowrap"
                            style={{ color: '#14532D', background: ri % 2 === 0 ? '#F0FDF4' : '#ECFDF5' }}
                          >
                            {row.bh_name}
                          </td>
                          <td
                            className="py-2.5 px-4 text-xs text-slate-600 border-r border-slate-200 whitespace-nowrap"
                            style={{ background: ri % 2 === 0 ? '#F0FDF4' : '#ECFDF5' }}
                          >
                            {row.am_name || <span className="text-slate-300">—</span>}
                          </td>
                          <td
                            className="py-2.5 px-4 text-xs text-slate-700 border-r border-slate-200 whitespace-nowrap"
                            style={{ background: ri % 2 === 0 ? '#F0FDF4' : '#ECFDF5' }}
                          >
                            {row.client_name}
                          </td>
                          {cols.map(col => {
                            const c  = row.cols[col.key];
                            const lv = compareDate ? (c?.compare ?? 0) : (c?.total ?? 0);
                            const dv = c?.today ?? 0;
                            const p  = pal(col.key);
                            return (
                              <>
                                <td
                                  key={`${col.key}-l`}
                                  className="text-center text-xs font-medium py-2.5 px-3 border-r border-white/50"
                                  style={{ background: p.cellTotal }}
                                >
                                  {lv || <span className="text-slate-300">—</span>}
                                </td>
                                <td
                                  key={`${col.key}-r`}
                                  className="text-center text-xs font-bold py-2.5 px-3 border-r border-slate-200"
                                  style={{ background: p.cellToday }}
                                >
                                  {dv || <span className="text-slate-300">—</span>}
                                </td>
                              </>
                            );
                          })}
                        </tr>
                      ))}

                      <tr className="border-t-2 border-slate-300">
                        <td
                          colSpan={3}
                          className="py-3 px-4 text-xs font-black border-r border-slate-200 whitespace-nowrap"
                          style={{ color: '#14532D', background: '#D1FAE5' }}
                        >
                          TOTAL&nbsp;({filteredRows.length})
                        </td>
                        {cols.map(col => {
                          const t  = totals[col.key];
                          const lv = compareDate ? (t?.compare ?? 0) : (t?.total ?? 0);
                          const p  = pal(col.key);
                          return (
                            <>
                              <td
                                key={`${col.key}-tot-l`}
                                className="text-center text-xs font-bold py-3 px-3 border-r border-white/50"
                                style={{ color: p.hdr, background: p.cellTotal }}
                              >
                                {lv || '—'}
                              </td>
                              <td
                                key={`${col.key}-tot-r`}
                                className="text-center text-xs font-black py-3 px-3 border-r border-slate-200"
                                style={{ color: p.hdr, background: p.cellToday }}
                              >
                                {t?.today || '—'}
                              </td>
                            </>
                          );
                        })}
                      </tr>
                    </>
                  )}
                </tbody>
              </>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Page — internal tabs, BH/Client tab loads only when first opened
// ════════════════════════════════════════════════════════════════════════════

type LbTab = 'recruiter' | 'pipeline';

const TABS: { key: LbTab; label: string }[] = [
  { key: 'recruiter', label: 'Recruiter Dashboard' },
  { key: 'pipeline',  label: 'BH Dashboard' },
];

export default function Leaderboard() {
  const [tab, setTab] = useState<LbTab>('recruiter');
  // Track which tabs the user has opened, so each fetches only once and
  // preserves its internal state (search, sort, compare date) across switches.
  const [visited, setVisited] = useState<Set<LbTab>>(() => new Set(['recruiter']));

  const openTab = (k: LbTab) => {
    setTab(k);
    setVisited(prev => (prev.has(k) ? prev : new Set([...prev, k])));
  };

  return (
    <Layout title="Leaderboard" subtitle="Recruiter activity and pipeline by Business Head & Client">
      {/* Tab bar */}
      <div className="border-b border-slate-200 mb-5">
        <div className="flex gap-1">
          {TABS.map(t => {
            const active = t.key === tab;
            return (
              <button
                key={t.key}
                onClick={() => openTab(t.key)}
                className="px-4 py-2.5 text-sm font-semibold transition-colors"
                style={{
                  color: active ? '#2563EB' : '#64748B',
                  borderBottom: active ? '2px solid #2563EB' : '2px solid transparent',
                  marginBottom: -1,
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Recruiter Dashboard — mounted on first load */}
      <div style={{ display: tab === 'recruiter' ? 'block' : 'none' }}>
        {visited.has('recruiter') && <RecruiterLeaderboardSection />}
      </div>

      {/* BH Dashboard — mounts (and fetches) only after user opens it */}
      <div style={{ display: tab === 'pipeline' ? 'block' : 'none' }}>
        {visited.has('pipeline') && <PipelineLeaderboardSection />}
      </div>
    </Layout>
  );
}
