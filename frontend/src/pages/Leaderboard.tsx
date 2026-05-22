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
  target:      number;          // ignored in UI now (daily target only) — kept for API compat
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
  day_target:  number;           // daily target (single number per day)
  done:        number;
  // Funnel (cumulative on today's sourced candidates): ack_sent ≥ submissions ≥ dl_verified
  ack_sent:    number;
  submissions: number;
  dl_verified: number;
  pct: number;                   // dl_verified / day_target × 100
  status: 'On Track' | 'Behind';
  rejections: number;
  performance: 'needs discussion' | 'below average' | 'average' | 'high' | 'good performance';
  hourly: HourlySlot[];          // per-hour breakdown of activity events
}

interface RecruiterTotals {
  day_target:  number;
  done:        number;
  ack_sent:    number;
  submissions: number;
  dl_verified: number;
  rejections:  number;
  pct:         number;
  status:     'On Track' | 'Behind';
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
        className="text-[12px] px-2.5 py-1.5 rounded-md min-w-32 max-w-44 flex items-center justify-between gap-1.5 transition-colors"
        style={{
          background: open ? 'var(--surface-muted)' : 'var(--surface-card)',
          border: `1px solid ${open || selected.size > 0 ? 'var(--ink-3)' : 'var(--border-hairline)'}`,
          color: 'var(--ink)',
        }}
      >
        <span className="truncate" style={{ color: selected.size > 0 ? 'var(--ink)' : 'var(--ink-3)', fontWeight: selected.size > 0 ? 600 : 400 }}>
          {summary}
        </span>
        <ChevronDown size={11} className="flex-shrink-0 transition-transform"
                     style={{ color: 'var(--ink-3)', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && (
        <div
          className="absolute z-30 mt-1.5 left-0 w-64 rounded-[12px] overflow-hidden animate-panel-in"
          style={{
            background: 'var(--surface-card)',
            border: '1px solid var(--border-hairline)',
            boxShadow: 'var(--shadow-pop)',
          }}
        >
          {/* Search */}
          <div className="p-2 pb-1.5" style={{ borderBottom: '1px solid var(--border-hairline)' }}>
            <div className="relative">
              <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--ink-4)' }} />
              <input
                autoFocus
                type="text"
                placeholder={`Filter ${label.toLowerCase()}…`}
                value={q}
                onChange={e => setQ(e.target.value)}
                className="w-full pl-7 pr-2 py-1.5 rounded-md text-[12px] focus:outline-none transition-colors"
                style={{ background: 'var(--surface-muted)', border: '1px solid transparent', color: 'var(--ink)' }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--border-hairline)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between px-3 py-1.5 text-[11px]" style={{ background: 'var(--surface-muted)', color: 'var(--ink-3)' }}>
            <span className="font-mono tabular-nums">{selected.size}/{options.length} selected</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => onChange(new Set(options))}
                className="font-medium transition-colors"
                style={{ color: 'var(--accent)' }}
              >Select all</button>
              <span style={{ color: 'var(--ink-4)' }}>·</span>
              <button
                onClick={() => onChange(new Set())}
                className="font-medium transition-colors"
                style={{ color: 'var(--ink-2)' }}
              >Clear</button>
            </div>
          </div>

          {/* Options */}
          <div className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="text-center text-[12px] py-4" style={{ color: 'var(--ink-4)' }}>No matches.</p>
            ) : filtered.map(o => {
              const isOn = selected.has(o);
              return (
                <label
                  key={o}
                  className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer transition-colors"
                  style={{ background: isOn ? 'var(--accent-soft)' : undefined }}
                  onMouseEnter={e => { if (!isOn) (e.currentTarget as HTMLElement).style.background = 'var(--surface-muted)'; }}
                  onMouseLeave={e => { if (!isOn) (e.currentTarget as HTMLElement).style.background = ''; }}
                >
                  <input type="checkbox" checked={isOn} onChange={() => toggle(o)} className="accent-[#2563EB]" />
                  <span className="text-[12.5px] truncate" style={{ color: isOn ? 'var(--ink)' : 'var(--ink-2)', fontWeight: isOn ? 500 : 400 }}>
                    {o}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Distribute a daily target *evenly* across the productive slots (slot 0 is
// the warm-up hour, kept clear). Each unit lands at slot
// `floor(i * productive / N) + 1`, so e.g. for N=4 across 8 productive slots
// the pattern is one every two hours — slots 1, 3, 5, 7 — and the whole day
// stays occupied instead of being front-loaded into the morning.
//   N=4  →  [0, 1, 0, 1, 0, 1, 0, 1, 0]
//   N=6  →  [0, 1, 1, 1, 0, 1, 1, 1, 0]
//   N=8  →  [0, 1, 1, 1, 1, 1, 1, 1, 1]
//   N=10 →  [0, 2, 1, 1, 1, 2, 1, 1, 1]   (stacking once productive slots fill)
function suggestedHourlySplit(dayTarget: number, slotCount: number): number[] {
  const out = new Array(slotCount).fill(0);
  const productive = slotCount - 1; // slot 0 is warm-up
  if (productive <= 0 || dayTarget <= 0) return out;
  for (let i = 0; i < dayTarget; i++) {
    const pos = Math.min(
      productive - 1,
      Math.floor((i * productive) / dayTarget),
    ) + 1;
    out[pos] += 1;
  }
  return out;
}

// Per-recruiter hourly activity grid. Three activity rows (Ack → Subs →
// Verified) plus a Suggested-pace row, all keyed to nine one-hour IST slots.
// Verified cells are colored against the suggested pace so under-paced hours
// stand out without screaming.
function HourlyActivity({ hourly, dayTarget }: { hourly: HourlySlot[]; dayTarget: number }) {
  const suggested = suggestedHourlySplit(dayTarget, hourly.length);

  // Shorter slot label: strip AM/PM, use en-dash, drop seconds — the table
  // header is dense enough that two extra letters per column matter.
  const shortLabel = (label: string) =>
    label.replace(' AM', '').replace(' PM', '').replace(' – ', '–');

  const rowNum = 'text-center px-2 py-1.5 font-mono text-[12px] tabular-nums';
  const rowLabel = 'text-left px-3 py-1.5 text-[11px] font-medium whitespace-nowrap';

  return (
    <div
      className="px-6 py-4"
      style={{
        background: 'linear-gradient(180deg, #FAFAF9 0%, #F5F5F4 100%)',
        borderTop: '1px solid var(--border-hairline)',
        borderBottom: '1px solid var(--border-hairline)',
      }}
    >
      {/* Header strip */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <span className="label-caps">Hourly activity</span>
          <span className="text-[10.5px]" style={{ color: 'var(--ink-4)' }}>· today, IST</span>
        </div>
        {dayTarget > 0 && (
          <div className="text-[11px] flex items-center gap-1.5" style={{ color: 'var(--ink-3)' }}>
            <span>Suggested pace —</span>
            <span className="px-1.5 py-0.5 rounded-md font-semibold font-mono tabular-nums"
                  style={{ background: 'var(--surface-card)', border: '1px solid var(--border-hairline)', color: 'var(--ink)' }}>
              {dayTarget}/day
            </span>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-[10px] border" style={{ background: 'var(--surface-card)', borderColor: 'var(--border-hairline)' }}>
        <table className="w-full border-collapse" style={{ fontSize: 11 }}>
          {/* Slot times — small monospaced chips; future-hour columns muted */}
          <thead>
            <tr style={{ background: 'var(--surface-muted)' }}>
              <th className="text-left px-3 py-1.5 label-caps">Hour</th>
              {hourly.map(s => (
                <th
                  key={s.slot_index}
                  className="text-center px-2 py-1.5 font-mono text-[10.5px] tabular-nums whitespace-nowrap"
                  style={{ color: s.completed ? 'var(--ink-3)' : 'var(--ink-4)' }}
                >
                  {shortLabel(s.label)}
                </th>
              ))}
              <th className="text-center px-3 py-1.5 label-caps" style={{ minWidth: 56 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {/* Ack sent */}
            <tr style={{ borderTop: '1px solid var(--border-hairline)' }} title="Ack mails sent to consultants in this hour">
              <td className={rowLabel} style={{ color: '#B45309' }}>
                <Mail size={11} className="inline mr-1.5 -mt-0.5" /> Ack sent
              </td>
              {hourly.map(s => (
                <td key={s.slot_index} className={rowNum}
                    style={{ background: s.ack_sent > 0 ? '#FEF3C7' : undefined, color: s.ack_sent > 0 ? '#92400E' : 'var(--ink-4)' }}>
                  {s.ack_sent || '·'}
                </td>
              ))}
              <td className={rowNum} style={{ fontWeight: 600, color: '#92400E', background: 'var(--surface-muted)' }}>
                {hourly.reduce((a, s) => a + s.ack_sent, 0) || '·'}
              </td>
            </tr>

            {/* Submissions */}
            <tr style={{ borderTop: '1px solid var(--border-hairline)' }} title="Candidates submitted to client this hour">
              <td className={rowLabel} style={{ color: '#6D28D9' }}>
                <Send size={11} className="inline mr-1.5 -mt-0.5" /> Submissions
              </td>
              {hourly.map(s => (
                <td key={s.slot_index} className={rowNum}
                    style={{ background: s.submissions > 0 ? '#EDE9FE' : undefined, color: s.submissions > 0 ? '#5B21B6' : 'var(--ink-4)' }}>
                  {s.submissions || '·'}
                </td>
              ))}
              <td className={rowNum} style={{ fontWeight: 600, color: '#5B21B6', background: 'var(--surface-muted)' }}>
                {hourly.reduce((a, s) => a + s.submissions, 0) || '·'}
              </td>
            </tr>

            {/* DL verified — color-graded against the pace */}
            <tr style={{ borderTop: '1px solid var(--border-hairline)' }} title="DL validations completed this hour. Green = on or above suggested pace; red = below.">
              <td className={rowLabel} style={{ color: '#047857' }}>
                <ShieldCheck size={11} className="inline mr-1.5 -mt-0.5" /> DL verified
              </td>
              {hourly.map((s, i) => {
                const want = suggested[i] ?? 0;
                const behind = s.completed && want > 0 && s.dl_verified < want;
                const met = want > 0 && s.dl_verified >= want;
                const bg = met ? '#D1FAE5' : behind ? '#FEE2E2' : (s.dl_verified > 0 ? '#ECFDF5' : undefined);
                const fg = met ? '#065F46' : behind ? '#B91C1C' : (s.dl_verified > 0 ? '#065F46' : 'var(--ink-4)');
                return (
                  <td key={s.slot_index} className={rowNum} style={{ background: bg, color: fg, fontWeight: met || behind ? 600 : 400 }}>
                    {s.dl_verified || '·'}
                  </td>
                );
              })}
              <td className={rowNum} style={{ fontWeight: 600, color: '#065F46', background: 'var(--surface-muted)' }}>
                {hourly.reduce((a, s) => a + s.dl_verified, 0) || '·'}
              </td>
            </tr>

            {/* Suggested pace */}
            {dayTarget > 0 && (
              <tr style={{ borderTop: '1px solid var(--border-hairline)', background: '#FAFAFA' }}
                  title="Suggested per-hour pace, spread evenly across the working day (warm-up hour skipped).">
                <td className={rowLabel} style={{ color: 'var(--ink-3)' }}>
                  <span className="inline-block w-2 h-2 rounded-full mr-2 align-middle" style={{ background: 'var(--ink-4)' }} />
                  Suggested
                </td>
                {suggested.map((v, i) => (
                  <td key={i} className={rowNum} style={{ color: v > 0 ? 'var(--ink-2)' : 'var(--ink-4)', fontStyle: v > 0 ? 'normal' : 'italic' }}>
                    {v || '·'}
                  </td>
                ))}
                <td className={rowNum} style={{ fontWeight: 600, color: 'var(--ink)', background: 'var(--surface-muted)' }}>
                  {suggested.reduce((a, v) => a + v, 0)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Funnel visual — three nested progress fills (Ack → Subs → Verified) on a
// shared baseline. Inverted from the previous overlay so each tier reads
// independently: the leftmost solid emerald is the "got all the way through"
// portion, the violet halo around it is "submitted but not yet verified",
// and the amber tail is "outreached, not yet submitted".
function FunnelBar({ ack, sub, ver }: { ack: number; sub: number; ver: number }) {
  const max = Math.max(ack, 1);
  const pAck = (ack / max) * 100;
  const pSub = (sub / max) * 100;
  const pVer = (ver / max) * 100;
  return (
    <div
      className="relative h-1.5 w-24 rounded-full overflow-hidden"
      style={{ background: 'var(--surface-muted)' }}
      title={`Ack ${ack} · Subs ${sub} · Verified ${ver}`}
    >
      <div className="absolute inset-y-0 left-0" style={{ width: `${pAck}%`, background: '#FDE68A' }} />
      <div className="absolute inset-y-0 left-0" style={{ width: `${pSub}%`, background: '#C4B5FD' }} />
      <div className="absolute inset-y-0 left-0" style={{ width: `${pVer}%`, background: '#10B981' }} />
    </div>
  );
}

function RecruiterLeaderboardSection() {
  const [data, setData]       = useState<RecruiterApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  // Hourly view expansion: rows are EXPANDED by default. `collapsed` tracks
  // rows the user has explicitly closed; `allCollapsed` is the master toggle.
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
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleAll = () => { setAllCollapsed(v => !v); setCollapsed(new Set()); };

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
        a.ack_sent      += r.ack_sent;
        a.submissions   += r.submissions;
        a.dl_verified   += r.dl_verified;
        a.rejections    += r.rejections;
        return a;
      },
      { day_target: 0, ack_sent: 0, submissions: 0, dl_verified: 0, rejections: 0 }
    );
    const pct = t.day_target ? Math.round((t.dl_verified / t.day_target) * 100) : 0;
    const status: 'On Track' | 'Behind' =
      t.day_target === 0 || pct >= 75 ? 'On Track' : 'Behind';
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

  const selectCls = "text-[12px] px-2.5 py-1.5 rounded-md min-w-28 max-w-44 transition-colors focus:outline-none";

  // Column count for spanning loading/empty rows (must match the header count).
  // Header columns: chevron + Recruiter + DL + KAM + BH/Pod + Ack + Subs +
  // DL Verified + Funnel + Daily target + % Done + Status + Rejections = 13.
  const COL_COUNT = 13;

  return (
    <div className="surface" style={{ padding: 0, overflow: 'hidden' }}>
      {/* ── Section header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3 px-6 py-4" style={{ borderBottom: '1px solid var(--border-hairline)' }}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0"
               style={{ background: 'var(--surface-muted)' }}>
            <Users size={15} style={{ color: 'var(--ink-2)' }} />
          </div>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold leading-tight" style={{ color: 'var(--ink)', letterSpacing: '-0.018em' }}>
              Recruiter Leaderboard
            </h2>
            <p className="text-[11.5px] leading-tight mt-0.5" style={{ color: 'var(--ink-3)' }}>
              Ack&nbsp;→&nbsp;Submissions&nbsp;→&nbsp;DL&nbsp;Verified · daily target funnel
              {data && <span className="font-mono ml-2 tabular-nums" style={{ color: 'var(--ink-4)' }}>{data.today}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleAll}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] rounded-md font-medium transition-colors"
            style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)', border: '1px solid var(--border-hairline)' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#E7E5E4')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
            title="Show or hide the per-hour activity grid under every row"
          >
            {allCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            {allCollapsed ? 'Show hourly' : 'Hide hourly'}
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] rounded-md font-medium transition-colors disabled:opacity-50"
            style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)', border: '1px solid var(--border-hairline)' }}
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Legend ── */}
      <div className="flex items-center flex-wrap gap-3 px-6 py-2.5 text-[11px]" style={{ background: 'var(--surface-muted)', color: 'var(--ink-3)' }}>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-[3px]" style={{ background: '#FDE68A' }} />
          <Mail size={10.5} style={{ color: '#B45309' }} />
          <span className="font-medium" style={{ color: 'var(--ink-2)' }}>Ack sent</span>
          <span style={{ color: 'var(--ink-4)' }}>— mail sent to consultant</span>
        </span>
        <span style={{ color: 'var(--ink-4)' }}>·</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-[3px]" style={{ background: '#C4B5FD' }} />
          <Send size={10.5} style={{ color: '#6D28D9' }} />
          <span className="font-medium" style={{ color: 'var(--ink-2)' }}>Submissions</span>
          <span style={{ color: 'var(--ink-4)' }}>— DL verification pending or done</span>
        </span>
        <span style={{ color: 'var(--ink-4)' }}>·</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-[3px]" style={{ background: '#10B981' }} />
          <ShieldCheck size={10.5} style={{ color: '#047857' }} />
          <span className="font-medium" style={{ color: 'var(--ink-2)' }}>DL verified</span>
          <span style={{ color: 'var(--ink-4)' }}>— validated by Delivery Lead</span>
        </span>
      </div>

      {/* ── Filter bar ── */}
      <div className="flex items-center flex-wrap gap-2 px-6 py-3" style={{ borderBottom: '1px solid var(--border-hairline)' }}>
        <Filter size={13} style={{ color: 'var(--ink-3)' }} />

        <div className="relative">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--ink-4)' }} />
          <input
            type="text" placeholder="Search recruiter…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="pl-7 pr-2.5 py-1.5 rounded-md text-[12px] w-48 transition-colors"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--border-hairline)', color: 'var(--ink)' }}
          />
        </div>

        <MultiSelectFilter label="DLs"  options={dlOptions}  selected={fDl}  onChange={setFDl} />
        <MultiSelectFilter label="KAMs" options={kamOptions} selected={fKam} onChange={setFKam} />
        <MultiSelectFilter label="BHs"  options={bhOptions}  selected={fBh}  onChange={setFBh} />
        <MultiSelectFilter label="Pods" options={podOptions} selected={fPod} onChange={setFPod} />
        <select value={fStatus} onChange={e => setFStatus(e.target.value)} className={selectCls}
                style={{ background: 'var(--surface-card)', border: '1px solid var(--border-hairline)', color: 'var(--ink)' }}>
          <option value="">Any status</option>
          <option value="On Track">On Track</option>
          <option value="Behind">Behind</option>
        </select>
        <select value={fPerf} onChange={e => setFPerf(e.target.value)} className={selectCls}
                style={{ background: 'var(--surface-card)', border: '1px solid var(--border-hairline)', color: 'var(--ink)' }}>
          <option value="">Any performance</option>
          {PERF_OPTIONS.map(v => <option key={v} value={v} className="capitalize">{v}</option>)}
        </select>

        {activeFilters > 0 && (
          <button
            onClick={clearAll}
            className="ml-auto flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[12px] font-medium transition-colors"
            style={{ background: 'var(--danger-soft)', border: '1px solid #FCA5A5', color: 'var(--danger)' }}
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
          <table className="w-full" style={{ minWidth: 1400, fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-hairline)', background: 'var(--surface-card)' }}>
                <th className="w-7 py-2.5 px-2" />
                <th className="text-left py-2.5 px-3 label-caps">Recruiter</th>
                <th className="text-left py-2.5 px-3 label-caps">Delivery Lead</th>
                <th className="text-left py-2.5 px-3 label-caps">KAM</th>
                <th className="text-left py-2.5 px-3 label-caps">BH / Pod</th>
                <th className="text-center py-2.5 px-3 label-caps" style={{ color: '#92400E' }}>
                  <Mail size={10.5} className="inline mr-1 -mt-0.5" />Ack&nbsp;sent
                </th>
                <th className="text-center py-2.5 px-3 label-caps" style={{ color: '#5B21B6' }}>
                  <Send size={10.5} className="inline mr-1 -mt-0.5" />Submissions
                </th>
                <th className="text-center py-2.5 px-3 label-caps" style={{ color: '#065F46' }}>
                  <ShieldCheck size={10.5} className="inline mr-1 -mt-0.5" />DL&nbsp;verified
                </th>
                <th className="text-center py-2.5 px-3 label-caps">Funnel</th>
                <th className="text-center py-2.5 px-3 label-caps" title="Daily target — number of DL-verifications expected for the day">Daily&nbsp;target</th>
                <th className="text-center py-2.5 px-3 label-caps">% Done</th>
                <th className="text-center py-2.5 px-3 label-caps">Status</th>
                <th className="text-center py-2.5 px-3 label-caps">Rejections</th>
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
                    className="cursor-pointer transition-colors"
                    style={{ borderBottom: '1px solid var(--border-hairline)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    <td className="py-2 px-2 text-center" style={{ color: 'var(--ink-4)' }}>
                      {open ? <ChevronDown size={14} className="inline" /> : <ChevronRight size={14} className="inline" />}
                    </td>
                    <td className="py-2 px-3 font-medium whitespace-nowrap" style={{ color: 'var(--ink)' }}>
                      {row.recruiter_name}
                    </td>
                    <td className="py-2 px-3 text-[12px]" style={{ color: 'var(--ink-2)' }}>
                      {row.dl_names.length === 0
                        ? <span style={{ color: 'var(--ink-4)' }}>—</span>
                        : row.dl_names.length === 1
                          ? row.dl_names[0]
                          : (
                            <span title={row.dl_names.join(', ')}>
                              {row.dl_names.join(', ')}
                              <span className="ml-1.5 px-1 py-0.5 rounded text-[9.5px] font-mono font-semibold"
                                    style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                                ×{row.dl_names.length}
                              </span>
                            </span>
                          )}
                    </td>
                    <td className="py-2 px-3 text-[12px]" style={{ color: 'var(--ink-2)' }}>
                      {row.kam_names.length > 0 ? row.kam_names.join(', ') : <span style={{ color: 'var(--ink-4)' }}>—</span>}
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap text-[12px]" style={{ color: 'var(--ink-2)' }}>
                      {row.bh_name  ?? <span style={{ color: 'var(--ink-4)' }}>—</span>}
                      {row.pod_name && <span style={{ color: 'var(--ink-4)' }}> · {row.pod_name}</span>}
                    </td>
                    {/* Funnel-color cells use a hairline left border to read as a column, not a heatmap */}
                    <td className="py-2 px-3 text-center font-mono font-semibold tabular-nums"
                        style={{ color: row.ack_sent > 0 ? '#92400E' : 'var(--ink-4)', background: row.ack_sent > 0 ? '#FEF7E0' : undefined }}>
                      {row.ack_sent || '·'}
                    </td>
                    <td className="py-2 px-3 text-center font-mono font-semibold tabular-nums"
                        style={{ color: row.submissions > 0 ? '#5B21B6' : 'var(--ink-4)', background: row.submissions > 0 ? '#F3EDFD' : undefined }}>
                      {row.submissions || '·'}
                    </td>
                    <td className="py-2 px-3 text-center font-mono font-semibold tabular-nums"
                        style={{ color: row.dl_verified > 0 ? '#065F46' : 'var(--ink-4)', background: row.dl_verified > 0 ? '#E7FAF0' : undefined }}>
                      {row.dl_verified || '·'}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <div className="inline-flex justify-center">
                        <FunnelBar ack={row.ack_sent} sub={row.submissions} ver={row.dl_verified} />
                      </div>
                    </td>
                    <td className="py-2 px-3 text-center font-mono font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                      {row.day_target || <span style={{ color: 'var(--ink-4)' }}>·</span>}
                    </td>
                    <td className="py-2 px-3 text-center font-mono font-semibold tabular-nums" style={{ color: 'var(--ink-2)' }}>
                      {row.day_target ? `${row.pct}%` : <span style={{ color: 'var(--ink-4)' }}>·</span>}
                    </td>
                    <td className="py-2 px-3 text-center">
                      {row.status === 'On Track' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded"
                              style={{ color: '#047857', background: 'var(--success-soft)', border: '1px solid #A7F3D0' }}>
                          <CheckCircle2 size={11} /> On track
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded"
                              style={{ color: 'var(--danger)', background: 'var(--danger-soft)', border: '1px solid #FCA5A5' }}>
                          <AlertTriangle size={11} /> Behind
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-center font-mono tabular-nums" style={{ color: row.rejections > 0 ? 'var(--ink-2)' : 'var(--ink-4)' }}>
                      {row.rejections || '·'}
                    </td>
                  </tr>
                  {open && row.hourly && row.hourly.length > 0 && (
                    <tr>
                      <td colSpan={COL_COUNT} className="p-0">
                        <HourlyActivity hourly={row.hourly} dayTarget={row.day_target} />
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
                <tr style={{ background: 'var(--surface-muted)', borderTop: '1px solid var(--border-strong)' }}>
                  <td className="py-2.5 px-2" />
                  <td className="py-2.5 px-3 label-caps" colSpan={4} style={{ color: 'var(--ink)' }}>
                    Total ({filteredRows.length})
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono font-bold tabular-nums" style={{ color: '#92400E' }}>{totals.ack_sent}</td>
                  <td className="py-2.5 px-3 text-center font-mono font-bold tabular-nums" style={{ color: '#5B21B6' }}>{totals.submissions}</td>
                  <td className="py-2.5 px-3 text-center font-mono font-bold tabular-nums" style={{ color: '#065F46' }}>{totals.dl_verified}</td>
                  <td className="py-2.5 px-3 text-center">
                    <div className="inline-flex justify-center">
                      <FunnelBar ack={totals.ack_sent} sub={totals.submissions} ver={totals.dl_verified} />
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{totals.day_target}</td>
                  <td className="py-2.5 px-3 text-center font-mono font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{totals.day_target ? `${totals.pct}%` : '—'}</td>
                  <td className="py-2.5 px-3 text-center">
                    {totals.status === 'On Track' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded"
                            style={{ color: '#047857', background: 'var(--surface-card)', border: '1px solid #A7F3D0' }}>
                        <CheckCircle2 size={11} /> Pod on track
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded" style={{ color: 'var(--danger)', background: 'var(--surface-card)', border: '1px solid #FCA5A5' }}>
                        <AlertTriangle size={11} /> Pod behind
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono font-bold tabular-nums" style={{ color: totals.rejections > 0 ? 'var(--ink)' : 'var(--ink-4)' }}>
                    {totals.rejections || '·'}
                  </td>
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
      <div className="mb-5" style={{ borderBottom: '1px solid var(--border-hairline)' }}>
        <div className="flex gap-0.5">
          {TABS.map(t => {
            const active = t.key === tab;
            return (
              <button
                key={t.key}
                onClick={() => openTab(t.key)}
                className="px-3.5 py-2.5 text-[13px] transition-colors relative"
                style={{
                  color: active ? 'var(--ink)' : 'var(--ink-3)',
                  fontWeight: active ? 600 : 500,
                  borderBottom: active ? '2px solid var(--ink)' : '2px solid transparent',
                  marginBottom: -1,
                  letterSpacing: '-0.01em',
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--ink-2)'; }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--ink-3)'; }}
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
