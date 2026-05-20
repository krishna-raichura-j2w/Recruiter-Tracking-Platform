import { useEffect, useState, useMemo, useRef } from 'react';
import {
  Users, AlertTriangle, CheckCircle2, RefreshCw,
  Search, X, Calendar, ChevronUp, ChevronDown, ChevronsUpDown, Filter,
} from 'lucide-react';
import Layout from '../components/Layout';
import api from '../api/client';

// ════════════════════════════════════════════════════════════════════════════
//  Section 1 — Recruiter Leaderboard (per-recruiter daily metrics)
// ════════════════════════════════════════════════════════════════════════════

interface RecruiterRow {
  recruiter_id: number;
  recruiter_name: string;
  dl_name:   string | null;
  kam_names: string[];           // pod's KAMs — any of them may work with this recruiter's DL
  bh_name:   string | null;
  pod_name:  string | null;
  day_target: number;
  done: number;
  verified: number;
  pct: number;
  status: 'On Track' | 'Behind';
  rejections: number;
  ack_sent: number;
  performance: 'needs discussion' | 'below average' | 'average' | 'high' | 'good performance';
}

interface RecruiterTotals {
  day_target: number;
  done: number;
  verified: number;
  rejections: number;
  ack_sent: number;
  pct: number;
  status: 'On Track' | 'Behind';
}

interface RecruiterApiResponse {
  rows: RecruiterRow[];
  totals: RecruiterTotals;
  day_target: number;
  today: string;
}

const PERF_STYLES: Record<RecruiterRow['performance'], string> = {
  'needs discussion':  'text-red-600',
  'below average':     'text-orange-600',
  'average':           'text-slate-600',
  'high':              'text-emerald-600',
  'good performance':  'text-emerald-700 font-semibold',
};

const PERF_OPTIONS: RecruiterRow['performance'][] = [
  'needs discussion', 'below average', 'average', 'high', 'good performance',
];

function uniq(values: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const v of values) if (v) out.add(v);
  return [...out].sort();
}

function RecruiterLeaderboardSection() {
  const [data, setData]       = useState<RecruiterApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  // ── Filter state ──
  const [search, setSearch]     = useState('');
  const [fDl,  setFDl]          = useState('');
  const [fKam, setFKam]         = useState('');
  const [fBh,  setFBh]          = useState('');
  const [fPod, setFPod]         = useState('');
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

  // ── Filter-option lists derived from the data ──
  const dlOptions  = useMemo(() => uniq(data?.rows.map(r => r.dl_name)  ?? []), [data]);
  const kamOptions = useMemo(() => uniq((data?.rows ?? []).flatMap(r => r.kam_names)), [data]);
  const bhOptions  = useMemo(() => uniq(data?.rows.map(r => r.bh_name)  ?? []), [data]);
  const podOptions = useMemo(() => uniq(data?.rows.map(r => r.pod_name) ?? []), [data]);

  // ── Apply filters ──
  const filteredRows = useMemo(() => {
    const rows = data?.rows ?? [];
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (q && !r.recruiter_name.toLowerCase().includes(q)) return false;
      if (fDl  && r.dl_name  !== fDl)  return false;
      if (fKam && !r.kam_names.includes(fKam)) return false;
      if (fBh  && r.bh_name  !== fBh)  return false;
      if (fPod && r.pod_name !== fPod) return false;
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
        a.day_target += r.day_target;
        a.done       += r.done;
        a.verified   += r.verified;
        a.rejections += r.rejections;
        a.ack_sent   += r.ack_sent;
        return a;
      },
      { day_target: 0, done: 0, verified: 0, rejections: 0, ack_sent: 0 }
    );
    const pct = t.day_target ? Math.round((t.verified / t.day_target) * 100) : 0;
    return { ...t, pct, status: pct >= 75 ? 'On Track' as const : 'Behind' as const };
  }, [filteredRows, data]);

  const activeFilters = [search, fDl, fKam, fBh, fPod, fStatus, fPerf].filter(Boolean).length;
  const clearAll = () => { setSearch(''); setFDl(''); setFKam(''); setFBh(''); setFPod(''); setFStatus(''); setFPerf(''); };

  const selectCls = "text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-400 min-w-28 max-w-44";

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Users size={18} className="text-slate-500" />
          <h2 className="text-base font-bold text-slate-800">
            Recruiter Leaderboard — submissions today (live)
          </h2>
          {data && (
            <span className="ml-2 text-xs text-slate-400">{data.today}</span>
          )}
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold disabled:opacity-50"
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
            type="text" placeholder="Search recruiter…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="pl-7 pr-2.5 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-blue-400 w-44"
          />
        </div>

        <select value={fDl}  onChange={e => setFDl(e.target.value)}  className={selectCls}>
          <option value="">All DLs</option>
          {dlOptions.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={fKam} onChange={e => setFKam(e.target.value)} className={selectCls}>
          <option value="">All KAMs</option>
          {kamOptions.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={fBh}  onChange={e => setFBh(e.target.value)}  className={selectCls}>
          <option value="">All BHs</option>
          {bhOptions.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={fPod} onChange={e => setFPod(e.target.value)} className={selectCls}>
          <option value="">All Pods</option>
          {podOptions.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
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
          <table className="w-full text-sm" style={{ minWidth: 1200 }}>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Recruiter</th>
                <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Delivery Lead</th>
                <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">KAM</th>
                <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">BH</th>
                <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Pod</th>
                <th className="text-center py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Day target</th>
                <th className="text-center py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Done (subs)</th>
                <th className="text-center py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Verified by DL</th>
                <th className="text-center py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">% of target</th>
                <th className="text-center py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="text-center py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Rejections</th>
                <th className="text-center py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Ack sent</th>
                <th className="text-center py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Performance</th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-sm text-slate-400">Loading…</td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-sm text-slate-400">
                    {activeFilters > 0 ? 'No recruiters match these filters.' : 'No recruiters found.'}
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.recruiter_id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-medium text-slate-700 whitespace-nowrap">{row.recruiter_name}</td>
                    <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">{row.dl_name  ?? <span className="text-slate-300">—</span>}</td>
                    <td className="py-2.5 px-3 text-slate-600">{row.kam_names.length > 0 ? row.kam_names.join(', ') : <span className="text-slate-300">—</span>}</td>
                    <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">{row.bh_name  ?? <span className="text-slate-300">—</span>}</td>
                    <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">{row.pod_name ?? <span className="text-slate-300">—</span>}</td>
                    <td className="py-2.5 px-3 text-center text-slate-600">{row.day_target}</td>
                    <td className="py-2.5 px-3 text-center text-slate-700">{row.done || ''}</td>
                    <td className="py-2.5 px-3 text-center text-slate-700">{row.verified || ''}</td>
                    <td className="py-2.5 px-3 text-center text-slate-600">{row.pct}%</td>
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
                    <td className="py-2.5 px-3 text-center text-slate-700">{row.ack_sent || ''}</td>
                    <td className={`py-2.5 px-3 text-center text-xs capitalize ${PERF_STYLES[row.performance]}`}>
                      {row.performance}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {totals && filteredRows.length > 0 && (
              <tfoot>
                <tr className="bg-slate-100 font-bold text-slate-700">
                  <td className="py-2.5 px-3" colSpan={5}>
                    TOTAL ({filteredRows.length})
                  </td>
                  <td className="py-2.5 px-3 text-center">{totals.day_target}</td>
                  <td className="py-2.5 px-3 text-center">{totals.done}</td>
                  <td className="py-2.5 px-3 text-center">{totals.verified}</td>
                  <td className="py-2.5 px-3 text-center">{totals.pct}%</td>
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
                  <td className="py-2.5 px-3 text-center">{totals.ack_sent}</td>
                  <td className="py-2.5 px-3"></td>
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
  }, [data, search, sortKey, sortDir, compareDate]); // eslint-disable-line react-hooks/exhaustive-deps

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
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search BH, AM or client…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-blue-400 bg-white w-52"
            />
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
