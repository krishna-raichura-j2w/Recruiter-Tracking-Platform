import React, { useEffect, useState, useMemo, useRef, Fragment } from 'react';
import {
  AlertTriangle, CheckCircle2, RefreshCw,
  Search, X, Calendar, ChevronUp, ChevronDown, ChevronsUpDown, Filter,
  Mail, Send, ShieldCheck, ChevronRight, CalendarOff,
} from 'lucide-react';
import LottieLib from 'lottie-react';
import leaderboardAnim from '../assets/lottie-leaderboard.json';
import Layout from '../components/Layout';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { podPlanApi, type BHLeaderboardResponse, type BHLeaderboardEntry } from '../api/podPlan';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Lottie: React.ComponentType<any> = (LottieLib as any).default ?? LottieLib;

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
  status: 'On Track' | 'Behind' | 'On Leave';
  is_on_leave: boolean;
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
  rows:         RecruiterRow[];
  totals:       RecruiterTotals;
  today:        string;
  period:       string;
  period_label: string;
  is_today:     boolean;
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

type Period = 'day' | 'week' | 'month';

function RecruiterLeaderboardSection() {
  const { user } = useAuth();
  const canMarkLeave = ['admin', 'coo', 'bh', 'kam', 'delivery_lead'].includes(user?.role ?? '');
  const [data, setData]       = useState<RecruiterApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [leavePending, setLeavePending] = useState<Set<number>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [allCollapsed, setAllCollapsed] = useState(true);

  // ── Period / date filter ──
  const [period, setPeriod]     = useState<Period>('day');
  const [selDate, setSelDate]   = useState(todayISO());   // YYYY-MM-DD

  // ── Filter state ──
  const [search, setSearch]     = useState('');
  const [fDl,  setFDl]          = useState<Set<string>>(new Set());
  const [fKam, setFKam]         = useState<Set<string>>(new Set());
  const [fBh,  setFBh]          = useState<Set<string>>(new Set());
  const [fPod, setFPod]         = useState<Set<string>>(new Set());
  const [fStatus, setFStatus]   = useState('');
  const [fPerf,   setFPerf]     = useState('');

  const fetchData = (p: Period = period, d: string = selDate) => {
    setLoading(true);
    api.get<RecruiterApiResponse>('/coo/recruiter-leaderboard', { params: { period: p, date: d } })
      .then((r) => { setData(r.data); setError(''); })
      .catch(() => setError('Failed to load recruiter leaderboard.'))
      .finally(() => setLoading(false));
  };

  const handlePeriodChange = (p: Period) => {
    setPeriod(p);
    fetchData(p, selDate);
  };

  const handleDateChange = (d: string) => {
    setSelDate(d);
    fetchData(period, d);
  };

  const toggleLeave = async (recruiterId: number, currentlyOnLeave: boolean) => {
    setLeavePending(prev => new Set(prev).add(recruiterId));
    try {
      if (currentlyOnLeave) {
        await api.delete(`/leaves/${recruiterId}/${selDate}`);
      } else {
        await api.post('/leaves', { user_id: recruiterId });
      }
      await fetchData(period, selDate);
    } catch {
      // silently ignore — row state will stay as-is
    } finally {
      setLeavePending(prev => { const n = new Set(prev); n.delete(recruiterId); return n; });
    }
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
        a.day_target    += r.day_target;   // already 0 for on-leave from backend
        if (!r.is_on_leave) {
          a.ack_sent    += r.ack_sent;
          a.submissions += r.submissions;
          a.dl_verified += r.dl_verified;
          a.rejections  += r.rejections;
        }
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
      <div className="flex items-center justify-between flex-wrap gap-3 px-6 py-3" style={{ borderBottom: '1px solid var(--border-hairline)' }}>
        <div className="flex items-center gap-3 min-w-0">
          <Lottie animationData={leaderboardAnim} loop style={{ width: 90, height: 90, flexShrink: 0 }} />
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold leading-tight" style={{ color: 'var(--ink)', letterSpacing: '-0.018em' }}>
              Recruiter Leaderboard
            </h2>
            <p className="text-[11.5px] leading-tight mt-0.5" style={{ color: 'var(--ink-3)' }}>
              Ack&nbsp;→&nbsp;Submissions&nbsp;→&nbsp;DL&nbsp;Verified · daily target funnel
              {data && (
                <span className="font-mono ml-2 tabular-nums" style={{ color: 'var(--ink-4)' }}>
                  {data.period_label}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* ── Period tabs ── */}
          <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-hairline)' }}>
            {(['day', 'week', 'month'] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => handlePeriodChange(p)}
                className="px-3 py-1.5 text-[12px] font-medium capitalize transition-colors"
                style={{
                  background: period === p ? '#1E3A5F' : 'var(--surface-card)',
                  color:      period === p ? 'white'    : 'var(--ink-2)',
                  borderRight: p !== 'month' ? '1px solid var(--border-hairline)' : 'none',
                }}
              >
                {p}
              </button>
            ))}
          </div>

          {/* ── Date input ── */}
          <div className="relative flex items-center gap-1">
            <Calendar size={12} style={{ color: 'var(--ink-3)', position: 'absolute', left: 8, pointerEvents: 'none' }} />
            <input
              type={period === 'month' ? 'month' : period === 'week' ? 'week' : 'date'}
              value={
                period === 'month' ? selDate.slice(0, 7) :
                period === 'week'  ? (() => {
                  // Convert YYYY-MM-DD to YYYY-Www for week input
                  const d = new Date(selDate);
                  const jan4 = new Date(d.getFullYear(), 0, 4);
                  const week = Math.ceil(((d.getTime() - jan4.getTime()) / 86400000 + jan4.getDay() + 1) / 7);
                  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
                })() :
                selDate
              }
              max={period === 'month' ? todayISO().slice(0, 7) : period === 'week' ? (() => {
                const d = new Date(); const jan4 = new Date(d.getFullYear(), 0, 4);
                const w = Math.ceil(((d.getTime() - jan4.getTime()) / 86400000 + jan4.getDay() + 1) / 7);
                return `${d.getFullYear()}-W${String(w).padStart(2, '0')}`;
              })() : todayISO()}
              onChange={e => {
                let val = e.target.value;
                if (period === 'month') val = val + '-01';
                else if (period === 'week') {
                  // Parse YYYY-Www → Monday date
                  const [yr, wk] = val.split('-W').map(Number);
                  const jan4 = new Date(yr, 0, 4);
                  const monday = new Date(jan4.getTime() + ((wk - 1) * 7 - jan4.getDay() + 1) * 86400000);
                  val = monday.toLocaleDateString('en-CA');
                }
                if (val) handleDateChange(val);
              }}
              className="pl-7 pr-2 py-1.5 text-[12px] rounded-md"
              style={{ background: 'var(--surface-card)', border: '1px solid var(--border-hairline)', color: 'var(--ink)', width: period === 'week' ? 130 : period === 'month' ? 110 : 120 }}
            />
          </div>

          {/* Today shortcut */}
          {selDate !== todayISO() && (
            <button
              onClick={() => handleDateChange(todayISO())}
              className="px-2.5 py-1.5 text-[12px] rounded-md font-medium transition-colors"
              style={{ background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }}
            >
              Today
            </button>
          )}

          {period === 'day' && (
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
          )}
          <button
            onClick={() => fetchData()}
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
          <option value="On Leave">Absent</option>
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
                  const onLeave = row.is_on_leave;
                  const leaveBusy = leavePending.has(row.recruiter_id);
                  return (
                  <Fragment key={row.recruiter_id}>
                  <tr
                    onClick={() => period === 'day' && toggleRow(row.recruiter_id)}
                    className={period === 'day' ? 'cursor-pointer transition-colors' : 'transition-colors'}
                    style={{
                      borderBottom: '1px solid var(--border-hairline)',
                      background: onLeave ? '#FFFBEB' : undefined,
                      opacity: onLeave ? 0.75 : 1,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = onLeave ? '#FEF3C7' : 'var(--surface-muted)')}
                    onMouseLeave={e => (e.currentTarget.style.background = onLeave ? '#FFFBEB' : '')}
                  >
                    <td className="py-2 px-2 text-center" style={{ color: 'var(--ink-4)' }}>
                      {period === 'day' && (open ? <ChevronDown size={14} className="inline" /> : <ChevronRight size={14} className="inline" />)}
                    </td>
                    <td className="py-2 px-3 font-medium whitespace-nowrap" style={{ color: 'var(--ink)' }}>
                      <div className="flex items-center gap-2">
                        <span>{row.recruiter_name}</span>
                        {canMarkLeave && data?.is_today && (
                          <button
                            onClick={e => { e.stopPropagation(); toggleLeave(row.recruiter_id, onLeave); }}
                            disabled={leaveBusy}
                            title={onLeave ? 'Mark as present' : 'Mark as absent'}
                            className="flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-semibold transition-colors disabled:opacity-40"
                            style={onLeave
                              ? { background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }
                              : { background: 'var(--surface-muted)', color: 'var(--ink-3)', border: '1px solid var(--border-hairline)' }
                            }
                          >
                            <CalendarOff size={10} />
                            {onLeave ? 'Absent' : 'Mark absent'}
                          </button>
                        )}
                      </div>
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
                      {row.status === 'On Leave' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded"
                              style={{ color: '#92400E', background: '#FEF3C7', border: '1px solid #FDE68A' }}>
                          <CalendarOff size={11} /> Absent
                        </span>
                      ) : row.status === 'On Track' ? (
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
                  {period === 'day' && open && row.hourly && row.hourly.length > 0 && (
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
//  Section 2 — Client Pipeline (from OL replica, day-wise)
// ════════════════════════════════════════════════════════════════════════════

interface ClientPipelineRow {
  client_name: string;
  bh_name:     string;
  cols:        Record<string, { day: number }>;
}

interface ColDef { key: string; label: string; }

interface ClientPipelineApiResponse {
  rows:    ClientPipelineRow[];
  columns: ColDef[];
  date:    string;
}

// Color by step label keywords — covers all dynamic steps
function pal(label: string) {
  const l = label.toLowerCase();
  if (/reject|no show|fail|closed|declined|withdrawn|not finalized/.test(l))
    return { hdr: '#991B1B', cell: '#FEE2E2' };
  if (/select|accept|approv|onboard|induction complet|bgv clear|bgv complete|joined/.test(l))
    return { hdr: '#166534', cell: '#DCFCE7' };
  if (/offer|bgv|joining|induction|confirm|doj/.test(l))
    return { hdr: '#0F766E', cell: '#CCFBF1' };
  if (/schedule|reschedule/.test(l))
    return { hdr: '#B45309', cell: '#FEF3C7' };
  if (/submit/.test(l))
    return { hdr: '#1E40AF', cell: '#DBEAFE' };
  if (/hold|postponed|panel unavailable|duplicate|no feedback/.test(l))
    return { hdr: '#6B7280', cell: '#F3F4F6' };
  return { hdr: '#475569', cell: '#F1F5F9' };
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

function ClientPipelineSection() {
  const [data, setData]       = useState<ClientPipelineApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [search, setSearch]   = useState('');
  const [fBh, setFBh]         = useState<Set<string>>(new Set());
  const [selDate, setSelDate] = useState(todayISO());
  const [sortKey, setSortKey] = useState('');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const fetchData = (d = selDate) => {
    setLoading(true);
    setError('');
    api.get<ClientPipelineApiResponse>('/coo/client-pipeline', { params: { date: d } })
      .then(r => setData(r.data))
      .catch(e => {
        const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        setError(msg || 'Failed to load client pipeline.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDateChange = (val: string) => { setSelDate(val); fetchData(val); };

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const bhOptions = useMemo(
    () => uniq((data?.rows ?? []).map(r => r.bh_name || 'Unknown').sort()),
    [data]
  );

  const filteredRows = useMemo(() => {
    if (!data) return [];
    let rows = data.rows;
    if (fBh.size) rows = rows.filter(r => fBh.has(r.bh_name || 'Unknown'));
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(r => r.client_name.toLowerCase().includes(q));
    }
    if (sortKey) {
      rows = [...rows].sort((a, b) => {
        if (sortKey === 'bh') {
          const cmp = (a.bh_name || '').localeCompare(b.bh_name || '');
          return sortDir === 'desc' ? -cmp : cmp;
        }
        if (sortKey === 'client') {
          const cmp = a.client_name.localeCompare(b.client_name);
          return sortDir === 'desc' ? -cmp : cmp;
        }
        const av = a.cols[sortKey]?.day ?? 0;
        const bv = b.cols[sortKey]?.day ?? 0;
        return sortDir === 'desc' ? bv - av : av - bv;
      });
    }
    return rows;
  }, [data, fBh, search, sortKey, sortDir]);

  const dayTotals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const col of (data?.columns ?? []))
      t[col.key] = filteredRows.reduce((s, r) => s + (r.cols[col.key]?.day ?? 0), 0);
    return t;
  }, [filteredRows, data]);

  const cols      = data?.columns ?? [];
  const totalCols = 2 + cols.length; // BH + Client + stages
  const dayLabel  = selDate === todayISO() ? 'Today' : fmtDate(selDate);

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-base font-bold text-slate-800">
          Client Pipeline&nbsp;
          <span className="text-slate-400 font-normal text-sm">— {dayLabel}</span>
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600">
            <Calendar size={12} className="text-blue-500" />
            <input
              type="date"
              max={todayISO()}
              value={selDate}
              onChange={e => e.target.value && handleDateChange(e.target.value)}
              className="border-none outline-none text-xs font-semibold text-slate-700 bg-transparent cursor-pointer"
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

      {/* ── Filter bar ── */}
      <div className="flex items-center flex-wrap gap-2 mb-3 px-3 py-2 rounded-xl bg-slate-50 border border-slate-100">
        <Filter size={13} className="text-slate-400" />
        <MultiSelectFilter label="BH" options={bhOptions} selected={fBh} onChange={setFBh} />
        <div className="relative">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search client…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-7 pr-2.5 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-blue-400 w-44 bg-white"
          />
        </div>
        {(fBh.size > 0 || search) && (
          <button
            onClick={() => { setFBh(new Set()); setSearch(''); }}
            className="ml-auto flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-50 border border-red-100 text-red-600 text-xs font-semibold hover:bg-red-100"
          >
            <X size={11} /> Clear
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-medium">{error}</div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm" style={{ minWidth: Math.max(600, 320 + cols.length * 90) }}>
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
                    <th className="text-left py-3 px-3 text-xs font-bold text-white whitespace-nowrap cursor-pointer select-none border-r border-indigo-700"
                      style={{ background: '#3730A3', minWidth: 130 }}
                      onClick={() => handleSort('bh')}>
                      <span className="flex items-center gap-1">BH <SortIcon active={sortKey === 'bh'} dir={sortDir} /></span>
                    </th>
                    <th className="text-left py-3 px-3 text-xs font-bold text-white whitespace-nowrap cursor-pointer select-none border-r border-green-700"
                      style={{ background: '#15803D', minWidth: 140 }}
                      onClick={() => handleSort('client')}>
                      <span className="flex items-center gap-1">Client <SortIcon active={sortKey === 'client'} dir={sortDir} /></span>
                    </th>
                    {cols.map(col => {
                      const p = pal(col.label);
                      return (
                        <th key={col.key}
                          className="text-center py-2 px-2 text-[10px] font-bold border-r border-white/30 whitespace-nowrap cursor-pointer select-none"
                          style={{ background: p.hdr, color: '#fff', maxWidth: 90 }}
                          onClick={() => handleSort(col.key)}>
                          <span className="flex items-center justify-center gap-1">
                            {col.label} <SortIcon active={sortKey === col.key} dir={sortDir} />
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={totalCols} className="py-14 text-center text-sm text-slate-400">
                        {search || fBh.size ? 'No matches found.' : 'No data available.'}
                      </td>
                    </tr>
                  ) : (
                    <>
                      {filteredRows.map((row, ri) => (
                        <tr key={row.client_name} className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors">
                          <td className="py-2.5 px-3 text-xs font-semibold border-r border-indigo-100 whitespace-nowrap"
                            style={{ color: '#3730A3', background: ri % 2 === 0 ? '#EEF2FF' : '#E0E7FF' }}>
                            {row.bh_name || <span className="text-slate-400 italic">—</span>}
                          </td>
                          <td className="py-2.5 px-3 text-xs font-semibold border-r border-slate-200 whitespace-nowrap"
                            style={{ color: '#15803D', background: ri % 2 === 0 ? '#F0FDF4' : '#ECFDF5' }}>
                            {row.client_name}
                          </td>
                          {cols.map(col => {
                            const dv = row.cols[col.key]?.day ?? 0;
                            const p  = pal(col.label);
                            return (
                              <td key={col.key} className="text-center text-xs font-bold py-2.5 px-2 border-r border-slate-100"
                                style={{ background: dv ? p.cell : undefined }}>
                                {dv ? <span style={{ color: p.hdr }}>{dv}</span> : <span className="text-slate-300">—</span>}
                              </td>
                            );
                          })}
                        </tr>
                      ))}

                      <tr className="border-t-2 border-slate-300">
                        <td colSpan={2} className="py-3 px-3 text-xs font-black border-r border-slate-200 whitespace-nowrap" style={{ color: '#15803D', background: '#D1FAE5' }}>
                          TOTAL&nbsp;({filteredRows.length} clients)
                        </td>
                        {cols.map(col => {
                          const v = dayTotals[col.key] ?? 0;
                          const p = pal(col.label);
                          return (
                            <td key={col.key} className="text-center text-xs font-black py-3 px-2 border-r border-slate-200"
                              style={{ color: p.hdr, background: p.cell }}>
                              {v || '—'}
                            </td>
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
//  BH Target Tracking Section
// ════════════════════════════════════════════════════════════════════════════

function pct(actual: number, target: number) {
  if (!target) return null;
  const p = Math.round((actual / target) * 100);
  const color = p >= 90 ? '#16a34a' : p >= 60 ? '#d97706' : '#dc2626';
  return <span style={{ fontSize: 11, fontWeight: 700, color, marginLeft: 4 }}>({p}%)</span>;
}

function actVsTarget(actual: number, target: number, highlight?: boolean) {
  const met = actual >= target;
  return (
    <td style={{
      padding: '6px 10px', border: '1px solid #e5e7eb', textAlign: 'center',
      background: highlight ? (met ? '#f0fdf4' : actual > 0 ? '#fff7ed' : '#fff') : '#fff',
    }}>
      <span style={{ fontWeight: 700, color: met ? '#16a34a' : actual > 0 ? '#d97706' : '#374151' }}>{actual}</span>
      {target > 0 && <span style={{ color: '#9ca3af', fontSize: 11 }}>/{target}</span>}
      {target > 0 && pct(actual, target)}
    </td>
  );
}

function BHTargetsSection() {
  const [data, setData] = useState<BHLeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selDate, setSelDate] = useState(todayISO());
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  useEffect(() => {
    setLoading(true);
    podPlanApi.getBHLeaderboard(selDate)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [selDate]);

  const toggleBH = (podId: number) =>
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(podId) ? next.delete(podId) : next.add(podId);
      return next;
    });

  const totals = (bh: BHLeaderboardEntry) => {
    const sum = (f: keyof typeof bh.customers[0]) =>
      bh.customers.reduce((s, c) => s + (Number(c[f]) || 0), 0);
    return {
      daily_subs_target: sum('daily_subs_target'),
      daily_int_target: sum('daily_int_target'),
      actual_subs: sum('actual_subs'),
      dl_subs: sum('dl_subs'),
      actual_int: sum('actual_int'),
      actual_sel: sum('actual_sel'),
      actual_obs: sum('actual_obs'),
      monthly_subs: sum('monthly_subs'),
      monthly_int: sum('monthly_int'),
      mtd_subs: sum('mtd_subs'),
      mtd_int: sum('mtd_int'),
    };
  };

  const COLS = ['Customer', 'Subs T/Day', 'DL Subs', 'Actual Subs', 'Int T/Day', 'Actual Int', 'Sel T/Day', 'Actual Sel', 'OBs T/Day', 'Actual OBs', 'Month Subs', 'MTD Subs', 'Month Int', 'MTD Int'];

  return (
    <div>
      {/* Date bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Date:</span>
        <input type="date" value={selDate} max={todayISO()} onChange={e => setSelDate(e.target.value)}
          style={{ padding: '5px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, fontWeight: 600 }} />
        {selDate !== todayISO() && (
          <button onClick={() => setSelDate(todayISO())}
            style={{ padding: '5px 12px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            Today
          </button>
        )}
        {data && (
          <span style={{ fontSize: 12, color: '#9ca3af' }}>
            {data.month} · {data.bhs.length} BH pods
          </span>
        )}
      </div>

      {loading && <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading…</div>}
      {!loading && (!data || data.bhs.length === 0) && (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No pod setups found for this month.</div>
      )}

      {data && data.bhs.map(bh => {
        const t = totals(bh);
        const isCollapsed = collapsed.has(bh.pod_id);
        return (
          <div key={bh.pod_id} style={{ marginBottom: 20, border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
            {/* BH header */}
            <div onClick={() => toggleBH(bh.pod_id)} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 18px', background: 'linear-gradient(90deg,#1e3a5f,#2563eb)',
              cursor: 'pointer',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>{bh.bh_name}</span>
                <span style={{ fontSize: 12, color: '#93c5fd' }}>{bh.customers.length} customers · {bh.month}</span>
              </div>
              <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                {/* Summary chips */}
                {[
                  { label: 'Subs', actual: t.actual_subs, target: t.daily_subs_target },
                  { label: 'Int', actual: t.actual_int, target: t.daily_int_target },
                  { label: 'MTD Subs', actual: t.mtd_subs, target: t.monthly_subs },
                ].map(({ label, actual, target }) => {
                  const met = target > 0 && actual >= target;
                  return (
                    <div key={label} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: '#93c5fd', fontWeight: 600 }}>{label}</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: met ? '#4ade80' : actual > 0 ? '#fbbf24' : '#fff' }}>
                        {actual}<span style={{ fontSize: 11, color: '#93c5fd', fontWeight: 400 }}>/{target}</span>
                      </div>
                    </div>
                  );
                })}
                <span style={{ color: '#93c5fd' }}>{isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}</span>
              </div>
            </div>

            {/* Customer table */}
            {!isCollapsed && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      {COLS.map(h => (
                        <th key={h} style={{
                          padding: '7px 10px', border: '1px solid #e5e7eb', fontWeight: 700, whiteSpace: 'nowrap', fontSize: 11,
                          textAlign: h === 'Customer' ? 'left' : 'center',
                          background: h.startsWith('Actual') ? '#eff6ff' : h.startsWith('DL') ? '#f0fdf4' : h.startsWith('MTD') ? '#fdf4ff' : '#f8fafc',
                          color: h.startsWith('Actual') ? '#1d4ed8' : h.startsWith('DL') ? '#15803d' : h.startsWith('MTD') ? '#7c3aed' : '#374151',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bh.customers.map(c => (
                      <tr key={c.customer_target_id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', fontWeight: 600, whiteSpace: 'nowrap' }}>{c.customer_name}</td>
                        {/* Subs T/Day */}
                        <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', textAlign: 'center', color: '#6b7280' }}>{c.daily_subs_target || '—'}</td>
                        {/* DL Subs */}
                        <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#f0fdf4', fontWeight: 700, color: c.dl_subs > 0 ? '#15803d' : '#9ca3af' }}>{c.dl_subs || '—'}</td>
                        {/* Actual Subs */}
                        {actVsTarget(c.actual_subs, c.daily_subs_target, true)}
                        {/* Int T/Day */}
                        <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', textAlign: 'center', color: '#6b7280' }}>{c.daily_int_target || '—'}</td>
                        {/* Actual Int */}
                        {actVsTarget(c.actual_int, c.daily_int_target, true)}
                        {/* Sel T/Day */}
                        <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', textAlign: 'center', color: '#6b7280' }}>{c.daily_sel_target || '—'}</td>
                        {/* Actual Sel */}
                        {actVsTarget(c.actual_sel, c.daily_sel_target)}
                        {/* OBs T/Day */}
                        <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', textAlign: 'center', color: '#6b7280' }}>{c.daily_obs_target || '—'}</td>
                        {/* Actual OBs */}
                        {actVsTarget(c.actual_obs, c.daily_obs_target)}
                        {/* Month Subs */}
                        <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', textAlign: 'center', color: '#6b7280' }}>{c.monthly_subs || '—'}</td>
                        {/* MTD Subs */}
                        {actVsTarget(c.mtd_subs, c.monthly_subs)}
                        {/* Month Int */}
                        <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', textAlign: 'center', color: '#6b7280' }}>{c.monthly_int || '—'}</td>
                        {/* MTD Int */}
                        {actVsTarget(c.mtd_int, c.monthly_int)}
                      </tr>
                    ))}
                    {/* BH subtotal row */}
                    <tr style={{ background: '#f0f9ff', fontWeight: 800 }}>
                      <td style={{ padding: '7px 10px', border: '1px solid #e5e7eb', fontWeight: 800, color: '#1e3a5f' }}>Total</td>
                      <td style={{ padding: '7px 10px', border: '1px solid #e5e7eb', textAlign: 'center' }}>{t.daily_subs_target}</td>
                      <td style={{ padding: '7px 10px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#f0fdf4', color: '#15803d' }}>{t.dl_subs || '—'}</td>
                      <td style={{ padding: '7px 10px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#eff6ff', color: t.actual_subs >= t.daily_subs_target ? '#16a34a' : '#1d4ed8', fontWeight: 800 }}>{t.actual_subs}</td>
                      <td style={{ padding: '7px 10px', border: '1px solid #e5e7eb', textAlign: 'center' }}>{t.daily_int_target}</td>
                      <td style={{ padding: '7px 10px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#eff6ff', color: t.actual_int >= t.daily_int_target ? '#16a34a' : '#1d4ed8', fontWeight: 800 }}>{t.actual_int}</td>
                      <td colSpan={2} style={{ padding: '7px 10px', border: '1px solid #e5e7eb', textAlign: 'center', color: '#6b7280' }}>—</td>
                      <td colSpan={2} style={{ padding: '7px 10px', border: '1px solid #e5e7eb', textAlign: 'center', color: '#6b7280' }}>—</td>
                      <td style={{ padding: '7px 10px', border: '1px solid #e5e7eb', textAlign: 'center', color: '#6b7280' }}>{t.monthly_subs}</td>
                      <td style={{ padding: '7px 10px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#fdf4ff', color: '#7c3aed', fontWeight: 800 }}>{t.mtd_subs}<span style={{ color: '#c4b5fd', fontWeight: 400, fontSize: 11 }}>/{t.monthly_subs}</span></td>
                      <td style={{ padding: '7px 10px', border: '1px solid #e5e7eb', textAlign: 'center', color: '#6b7280' }}>{t.monthly_int}</td>
                      <td style={{ padding: '7px 10px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#fdf4ff', color: '#7c3aed', fontWeight: 800 }}>{t.mtd_int}<span style={{ color: '#c4b5fd', fontWeight: 400, fontSize: 11 }}>/{t.monthly_int}</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Page — internal tabs, BH/Client tab loads only when first opened
// ════════════════════════════════════════════════════════════════════════════

type LbTab = 'recruiter' | 'pipeline' | 'bh-targets';

const TABS: { key: LbTab; label: string }[] = [
  { key: 'recruiter',  label: 'Recruiter Dashboard' },
  { key: 'pipeline',   label: 'Client Pipeline' },
  { key: 'bh-targets', label: 'BH Target Tracking' },
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

      {/* Client Pipeline — mounts (and fetches) only after user opens it */}
      <div style={{ display: tab === 'pipeline' ? 'block' : 'none' }}>
        {visited.has('pipeline') && <ClientPipelineSection />}
      </div>

      {/* BH Target Tracking — mounts (and fetches) only after user opens it */}
      <div style={{ display: tab === 'bh-targets' ? 'block' : 'none' }}>
        {visited.has('bh-targets') && <BHTargetsSection />}
      </div>
    </Layout>
  );
}
