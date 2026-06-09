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
import { podPlanApi, type BHInfo, type BHDetailResponse, type BHLeaderboardCustomer, type OlOnlyBH } from '../api/podPlan';

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

// ── Week math (UTC-based to match the plain YYYY-MM-DD IST date strings) ───────
function isoUTC(d: Date) { return d.toISOString().slice(0, 10); }
function addDaysUTC(dateStr: string, n: number) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return isoUTC(d);
}
function mondayOfUTC(dateStr: string) {
  const dow = new Date(dateStr + 'T00:00:00Z').getUTCDay(); // 0=Sun..6=Sat
  return addDaysUTC(dateStr, -((dow + 6) % 7));             // back to Monday
}
// Mon–Sat (inclusive) window containing dateStr.
function weekMonSat(dateStr: string) {
  const mon = mondayOfUTC(dateStr);
  return { start: mon, end: addDaysUTC(mon, 5) };
}
function fmtDayMon(dateStr: string) {
  return new Date(dateStr + 'T00:00:00Z').toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', timeZone: 'UTC',
  });
}

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
      background: highlight ? (met ? '#f0fdf4' : actual > 0 ? '#fff7ed' : 'transparent') : 'transparent',
    }}>
      <span style={{ fontWeight: 700, color: met ? '#16a34a' : actual > 0 ? '#d97706' : '#374151' }}>{actual}</span>
      {target > 0 && <span style={{ color: '#9ca3af', fontSize: 11 }}>/{target}</span>}
      {target > 0 && pct(actual, target)}
    </td>
  );
}

function bhTotals(customers: BHLeaderboardCustomer[]) {
  const sum = (f: keyof BHLeaderboardCustomer) =>
    customers.reduce((s, c) => s + (Number(c[f]) || 0), 0);
  return {
    target_demands: sum('target_demands'),
    actual_demands: sum('actual_demands'),
    mtd_demands: sum('mtd_demands'),
    target_po: sum('target_po'),
    actual_po: sum('actual_po'),
    mtd_po: sum('mtd_po'),
    actual_po_margin: sum('actual_po_margin'),
    mtd_po_margin: sum('mtd_po_margin'),
    daily_subs_target: sum('daily_subs_target'),
    daily_int_target: sum('daily_int_target'),
    daily_sel_target: sum('daily_sel_target'),
    daily_obs_target: sum('daily_obs_target'),
    actual_subs: sum('actual_subs'),
    dl_subs: sum('dl_subs'),
    actual_int: sum('actual_int'),
    actual_sel: sum('actual_sel'),
    actual_obs: sum('actual_obs'),
    monthly_subs: sum('monthly_subs'),
    monthly_int: sum('monthly_int'),
    mtd_subs: sum('mtd_subs'),
    mtd_int: sum('mtd_int'),
    selects_needed: sum('selects_needed'),
    obs_needed: sum('obs_needed'),
    mtd_sel: sum('mtd_sel'),
    mtd_obs: sum('mtd_obs'),
  };
}

const BH_COLS = ['Customer', 'Subs T/Day', 'DL Subs', 'Actual Subs', 'Int T/Day', 'Actual Int', 'Sel T/Day', 'Actual Sel', 'OBs T/Day', 'Actual OBs', 'Month Subs', 'MTD Subs', 'Month Int', 'MTD Int', 'Month Sel', 'MTD Sel', 'Month OBs', 'MTD OBs'];

// Overview business-line grouping. Captives = these BHs; Services = everyone else.
const CAPTIVE_MATCHERS = ['anuradha', 'sadh', 'deepak', 'mehr'];
const isCaptiveBH = (name: string) => CAPTIVE_MATCHERS.some(m => name.toLowerCase().includes(m));

// Field key per BH_COLS column (1:1), used for click-to-sort.
const BH_FIELDS: (keyof BHLeaderboardCustomer)[] = [
  'customer_name', 'daily_subs_target', 'dl_subs', 'actual_subs', 'daily_int_target', 'actual_int',
  'daily_sel_target', 'actual_sel', 'daily_obs_target', 'actual_obs',
  'monthly_subs', 'mtd_subs', 'monthly_int', 'mtd_int', 'selects_needed', 'mtd_sel', 'obs_needed', 'mtd_obs',
];

// Demand & PO columns shown at the front of per-BH overview rows (showDemandPo).
// PO/Margin columns are in Lakhs (L); demand columns are counts.
const DP_COLS = ['Target Dem', 'New Dem', 'MTD Dem', 'Target PO (L)', 'PO Add (L)', 'MTD PO (L)', 'PO Margin (L)', 'MTD Margin (L)'];
// Lakhs display: round to ≤2 decimals (avoids float noise from client-side summing).
const lk = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const DP_FIELDS: (keyof BHLeaderboardCustomer)[] = [
  'target_demands', 'actual_demands', 'mtd_demands', 'target_po', 'actual_po', 'mtd_po', 'actual_po_margin', 'mtd_po_margin',
];

function BHCustomerTable({ customers, month, firstColLabel = 'Customer', countLabel = 'customers', showDemandPo = false, weekly = false }: { customers: BHLeaderboardCustomer[]; month: string; firstColLabel?: string; countLabel?: string; showDemandPo?: boolean; weekly?: boolean }) {
  const t = bhTotals(customers);
  const baseCols = showDemandPo ? [firstColLabel, ...DP_COLS, ...BH_COLS.slice(1)] : [firstColLabel, ...BH_COLS.slice(1)];
  // In week view the daily-target columns are weekly sums → relabel "T/Day" → "T/Wk".
  const cols = weekly ? baseCols.map(h => h.replace('T/Day', 'T/Wk')) : baseCols;
  const fields = showDemandPo ? [BH_FIELDS[0], ...DP_FIELDS, ...BH_FIELDS.slice(1)] : BH_FIELDS;
  const [sort, setSort] = useState<{ field: keyof BHLeaderboardCustomer; dir: 'asc' | 'desc' } | null>({ field: 'actual_subs', dir: 'desc' });
  const toggleSort = (field: keyof BHLeaderboardCustomer) =>
    setSort(s => (s && s.field === field ? { field, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { field, dir: 'desc' }));
  const rows = sort
    ? [...customers].sort((a, b) => {
        const f = sort.field;
        const cmp = f === 'customer_name'
          ? String(a[f]).localeCompare(String(b[f]))
          : Number(a[f]) - Number(b[f]);
        return sort.dir === 'desc' ? -cmp : cmp;
      })
    : customers;
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ padding: '6px 14px', background: '#f0f9ff', fontSize: 11, color: '#6b7280' }}>{month} · {customers.length} {countLabel}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#f8fafc' }}>
            {cols.map((h, i) => {
              const field = fields[i];
              const isSorted = sort?.field === field;
              return (
              <th key={h} onClick={() => toggleSort(field)} title="Sort"
                style={{
                padding: '7px 10px', border: '1px solid #e5e7eb', fontWeight: 700, whiteSpace: 'nowrap', fontSize: 11, cursor: 'pointer',
                textAlign: i === 0 ? 'left' : 'center',
                background: i === 0 ? '#eef2ff' : isSorted ? '#dbeafe' : h.startsWith('Actual') ? '#eff6ff' : h.startsWith('DL') ? '#f0fdf4' : h.startsWith('MTD') ? '#fdf4ff' : '#f8fafc',
                color: h.startsWith('Actual') ? '#1d4ed8' : h.startsWith('DL') ? '#15803d' : h.startsWith('MTD') ? '#7c3aed' : '#374151',
                ...(i === 0 ? { position: 'sticky' as const, left: 0, zIndex: 3, boxShadow: '2px 0 4px -2px rgba(0,0,0,.12)' } : {}),
              }}>{h}{isSorted ? (sort!.dir === 'desc' ? ' ▼' : ' ▲') : ''}</th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((c, idx) => (
            <tr key={c.customer_target_id} style={{ borderBottom: '1px solid #f3f4f6', background: idx % 2 ? '#f9fafb' : '#fff' }}>
              <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', fontWeight: 700, whiteSpace: 'nowrap', background: '#eef2ff', borderLeft: '4px solid #2563eb', position: 'sticky', left: 0, zIndex: 1, boxShadow: '2px 0 4px -2px rgba(0,0,0,.12)' }}>{c.customer_name}</td>
              {showDemandPo && (<>
                <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', textAlign: 'center', color: '#6b7280' }}>{c.target_demands || '—'}</td>
                <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#eff6ff', fontWeight: 700, color: (c.actual_demands ?? 0) > 0 ? '#1d4ed8' : '#9ca3af' }}>{c.actual_demands || '—'}</td>
                {actVsTarget(Number(c.mtd_demands) || 0, Number(c.target_demands) || 0)}
                <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', textAlign: 'center', color: '#6b7280' }}>{c.target_po || '—'}</td>
                <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#eff6ff', fontWeight: 700, color: (c.actual_po ?? 0) > 0 ? '#1d4ed8' : '#9ca3af' }}>{lk(c.actual_po ?? 0) || '—'}</td>
                {actVsTarget(lk(Number(c.mtd_po) || 0), Number(c.target_po) || 0)}
                <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#eff6ff', fontWeight: 700, color: (c.actual_po_margin ?? 0) > 0 ? '#1d4ed8' : '#9ca3af' }}>{lk(c.actual_po_margin ?? 0) || '—'}</td>
                <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#fdf4ff', fontWeight: 700, color: (c.mtd_po_margin ?? 0) > 0 ? '#7c3aed' : '#9ca3af' }}>{lk(c.mtd_po_margin ?? 0) || '—'}</td>
              </>)}
              <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', textAlign: 'center', color: '#6b7280' }}>{c.daily_subs_target || '—'}</td>
              <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#f0fdf4', fontWeight: 700, color: c.dl_subs > 0 ? '#15803d' : '#9ca3af' }}>{c.dl_subs || '—'}</td>
              {actVsTarget(c.actual_subs, c.daily_subs_target, true)}
              <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', textAlign: 'center', color: '#6b7280' }}>{c.daily_int_target || '—'}</td>
              {actVsTarget(c.actual_int, c.daily_int_target, true)}
              <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', textAlign: 'center', color: '#6b7280' }}>{c.daily_sel_target || '—'}</td>
              {actVsTarget(c.actual_sel, c.daily_sel_target)}
              <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', textAlign: 'center', color: '#6b7280' }}>{c.daily_obs_target || '—'}</td>
              {actVsTarget(c.actual_obs, c.daily_obs_target)}
              <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', textAlign: 'center', color: '#6b7280' }}>{c.monthly_subs || '—'}</td>
              {actVsTarget(c.mtd_subs, c.monthly_subs)}
              <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', textAlign: 'center', color: '#6b7280' }}>{c.monthly_int || '—'}</td>
              {actVsTarget(c.mtd_int, c.monthly_int)}
              <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', textAlign: 'center', color: '#6b7280' }}>{c.selects_needed || '—'}</td>
              {actVsTarget(c.mtd_sel, c.selects_needed)}
              <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', textAlign: 'center', color: '#6b7280' }}>{c.obs_needed || '—'}</td>
              {actVsTarget(c.mtd_obs, c.obs_needed)}
            </tr>
          ))}
          <tr style={{ background: '#f0f9ff', fontWeight: 800 }}>
            <td style={{ padding: '7px 10px', border: '1px solid #e5e7eb', fontWeight: 800, color: '#1e3a5f', background: '#e0e7ff', position: 'sticky', left: 0, zIndex: 1, boxShadow: '2px 0 4px -2px rgba(0,0,0,.12)' }}>Total</td>
            {showDemandPo && (<>
              <td style={{ padding: '7px 10px', border: '1px solid #e5e7eb', textAlign: 'center', color: '#6b7280' }}>{t.target_demands}</td>
              <td style={{ padding: '7px 10px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#eff6ff', color: '#1d4ed8', fontWeight: 800 }}>{t.actual_demands}</td>
              <td style={{ padding: '7px 10px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#fdf4ff', color: '#7c3aed', fontWeight: 800 }}>{t.mtd_demands}<span style={{ color: '#c4b5fd', fontWeight: 400, fontSize: 11 }}>/{t.target_demands}</span></td>
              <td style={{ padding: '7px 10px', border: '1px solid #e5e7eb', textAlign: 'center', color: '#6b7280' }}>{t.target_po}</td>
              <td style={{ padding: '7px 10px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#eff6ff', color: '#1d4ed8', fontWeight: 800 }}>{lk(t.actual_po)}</td>
              <td style={{ padding: '7px 10px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#fdf4ff', color: '#7c3aed', fontWeight: 800 }}>{lk(t.mtd_po)}<span style={{ color: '#c4b5fd', fontWeight: 400, fontSize: 11 }}>/{t.target_po}</span></td>
              <td style={{ padding: '7px 10px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#eff6ff', color: '#1d4ed8', fontWeight: 800 }}>{lk(t.actual_po_margin)}</td>
              <td style={{ padding: '7px 10px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#fdf4ff', color: '#7c3aed', fontWeight: 800 }}>{lk(t.mtd_po_margin)}</td>
            </>)}
            <td style={{ padding: '7px 10px', border: '1px solid #e5e7eb', textAlign: 'center' }}>{t.daily_subs_target}</td>
            <td style={{ padding: '7px 10px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#f0fdf4', color: '#15803d' }}>{t.dl_subs || '—'}</td>
            <td style={{ padding: '7px 10px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#eff6ff', color: t.actual_subs >= t.daily_subs_target ? '#16a34a' : '#1d4ed8', fontWeight: 800 }}>{t.actual_subs}</td>
            <td style={{ padding: '7px 10px', border: '1px solid #e5e7eb', textAlign: 'center' }}>{t.daily_int_target}</td>
            <td style={{ padding: '7px 10px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#eff6ff', color: t.actual_int >= t.daily_int_target ? '#16a34a' : '#1d4ed8', fontWeight: 800 }}>{t.actual_int}</td>
            <td style={{ padding: '7px 10px', border: '1px solid #e5e7eb', textAlign: 'center' }}>{t.daily_sel_target}</td>
            <td style={{ padding: '7px 10px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#eff6ff', color: t.actual_sel >= t.daily_sel_target ? '#16a34a' : '#1d4ed8', fontWeight: 800 }}>{t.actual_sel}</td>
            <td style={{ padding: '7px 10px', border: '1px solid #e5e7eb', textAlign: 'center' }}>{t.daily_obs_target}</td>
            <td style={{ padding: '7px 10px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#eff6ff', color: t.actual_obs >= t.daily_obs_target ? '#16a34a' : '#1d4ed8', fontWeight: 800 }}>{t.actual_obs}</td>
            <td style={{ padding: '7px 10px', border: '1px solid #e5e7eb', textAlign: 'center', color: '#6b7280' }}>{t.monthly_subs}</td>
            <td style={{ padding: '7px 10px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#fdf4ff', color: '#7c3aed', fontWeight: 800 }}>{t.mtd_subs}<span style={{ color: '#c4b5fd', fontWeight: 400, fontSize: 11 }}>/{t.monthly_subs}</span></td>
            <td style={{ padding: '7px 10px', border: '1px solid #e5e7eb', textAlign: 'center', color: '#6b7280' }}>{t.monthly_int}</td>
            <td style={{ padding: '7px 10px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#fdf4ff', color: '#7c3aed', fontWeight: 800 }}>{t.mtd_int}<span style={{ color: '#c4b5fd', fontWeight: 400, fontSize: 11 }}>/{t.monthly_int}</span></td>
            <td style={{ padding: '7px 10px', border: '1px solid #e5e7eb', textAlign: 'center', color: '#6b7280' }}>{t.selects_needed}</td>
            <td style={{ padding: '7px 10px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#fdf4ff', color: '#7c3aed', fontWeight: 800 }}>{t.mtd_sel}<span style={{ color: '#c4b5fd', fontWeight: 400, fontSize: 11 }}>/{t.selects_needed}</span></td>
            <td style={{ padding: '7px 10px', border: '1px solid #e5e7eb', textAlign: 'center', color: '#6b7280' }}>{t.obs_needed}</td>
            <td style={{ padding: '7px 10px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#fdf4ff', color: '#7c3aed', fontWeight: 800 }}>{t.mtd_obs}<span style={{ color: '#c4b5fd', fontWeight: 400, fontSize: 11 }}>/{t.obs_needed}</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function BHTargetsSection() {
  const [selDate, setSelDate] = useState(todayISO());
  // 'today' = single day = selDate; 'week' = Mon–Sat window of selDate.
  const [periodMode, setPeriodMode] = useState<'today' | 'week'>('today');
  const period = periodMode === 'week'
    ? weekMonSat(selDate)
    : { start: selDate, end: selDate };
  const weekly = period.start !== period.end;
  const periodKey = `${period.start}|${period.end}`;
  // "Last Week" = the completed Mon–Sat before this week (dynamic vs real today).
  const lastWeek = weekMonSat(addDaysUTC(todayISO(), -7));
  const isLastWeek = weekly && period.start === lastWeek.start && period.end === lastWeek.end;
  const [bhList, setBhList] = useState<BHInfo[]>([]);
  const [listLoading, setListLoading] = useState(true);
  // 'overview' = all-BH combined view; number = pod setup_id; {olBh} = OL-only BH (no pod plan).
  const [view, setView] = useState<'overview' | number | { olBh: string }>('overview');
  // cache: setupId → detail. Cleared on date change.
  const detailCache = useRef<Map<number, BHDetailResponse>>(new Map());
  const [detail, setDetail] = useState<BHDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [overview, setOverview] = useState<BHLeaderboardCustomer[] | null>(null);
  // OL-only BHs (target not set) — fetched once per date, drives buttons + overview 2nd table + detail
  const [olOnly, setOlOnly] = useState<OlOnlyBH[] | null>(null);
  const [month, setMonth] = useState('');

  // Fetch BH list on mount / period change. date = period end so month aligns.
  useEffect(() => {
    setListLoading(true);
    detailCache.current = new Map();
    setDetail(null);
    setView('overview');
    podPlanApi.getBHList(period.end)
      .then(r => {
        setBhList(r.bhs);
        setMonth(r.month);
      })
      .catch(() => setBhList([]))
      .finally(() => setListLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodKey]);

  // Sequential OL loader: overview first, then ol-only — never concurrent (avoids OL overload).
  // Serves all 4 Overview tables + the OL-only selector buttons/detail.
  useEffect(() => {
    let cancelled = false;
    setOverview(null);
    setOlOnly(null);
    (async () => {
      try { const ov = await podPlanApi.getBHOverview(period.end, period.start, period.end); if (!cancelled) setOverview(ov.rows); }
      catch { if (!cancelled) setOverview([]); }
      try { const ol = await podPlanApi.getOlOnly(period.end, period.start, period.end); if (!cancelled) setOlOnly(ol.bhs); }
      catch { if (!cancelled) setOlOnly([]); }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodKey]);

  // Fetch detail when a specific BH is the active view
  useEffect(() => {
    if (typeof view !== 'number') return;
    const cached = detailCache.current.get(view);
    if (cached) { setDetail(cached); return; }
    setDetailLoading(true);
    podPlanApi.getBHDetail(view, period.end, period.start, period.end)
      .then(r => {
        detailCache.current.set(view, r);
        setDetail(r);
      })
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, periodKey]);

  const selectBH = (setupId: number) => {
    setView(setupId);
  };

  return (
    <div>
      {/* Date / period bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {/* Today | Last Week toggles */}
        {([
          { key: 'today', label: 'Today', active: periodMode === 'today',
            onClick: () => { setPeriodMode('today'); setSelDate(todayISO()); } },
          { key: 'lastweek', label: 'Last Week', active: isLastWeek,
            onClick: () => { setSelDate(lastWeek.start); setPeriodMode('week'); } },
        ] as const).map(b => (
          <button key={b.key} onClick={b.onClick}
            style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              border: b.active ? '2px solid #2563eb' : '1px solid #e5e7eb',
              background: b.active ? 'linear-gradient(90deg,#1e3a5f,#2563eb)' : '#fff',
              color: b.active ? '#fff' : '#374151',
            }}>
            {b.label}
          </button>
        ))}
        <span style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginLeft: 6 }}>Week of:</span>
        <input type="date" value={selDate} max={todayISO()}
          onChange={e => { setSelDate(e.target.value); setPeriodMode('week'); }}
          style={{ padding: '5px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, fontWeight: 600 }} />
        {weekly && (
          <span style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 7, padding: '4px 10px' }}>
            {fmtDayMon(period.start)} – {fmtDayMon(period.end)}
          </span>
        )}
        {month && <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 'auto' }}>{month} · {bhList.length} BH pods</span>}
      </div>

      {listLoading && <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading BH list…</div>}

      {!listLoading && bhList.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No pod setups found for this month.</div>
      )}

      {!listLoading && bhList.length > 0 && (
        <>
          {/* BH selector tabs */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            {(() => {
              const active = view === 'overview';
              return (
                <button onClick={() => setView('overview')}
                  style={{
                    padding: '8px 16px', borderRadius: 10, border: active ? '2px solid #2563eb' : '1px solid #e5e7eb',
                    background: active ? 'linear-gradient(90deg,#1e3a5f,#2563eb)' : '#fff',
                    color: active ? '#fff' : '#374151',
                    fontWeight: active ? 700 : 600, fontSize: 13, cursor: 'pointer',
                    boxShadow: active ? '0 2px 8px #2563eb33' : 'none',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  }}>
                  <span>Overview</span>
                  <span style={{ fontSize: 10, color: active ? '#93c5fd' : '#9ca3af', fontWeight: 400 }}>all pods</span>
                </button>
              );
            })()}
            {bhList.map(bh => {
              const active = bh.setup_id === view;
              const cached = detailCache.current.has(bh.setup_id);
              const bhDetail = detailCache.current.get(bh.setup_id);
              const t = bhDetail ? bhTotals(bhDetail.customers) : null;
              return (
                <button key={bh.setup_id} onClick={() => selectBH(bh.setup_id)}
                  style={{
                    padding: '8px 16px', borderRadius: 10, border: active ? '2px solid #2563eb' : '1px solid #e5e7eb',
                    background: active ? 'linear-gradient(90deg,#1e3a5f,#2563eb)' : '#fff',
                    color: active ? '#fff' : '#374151',
                    fontWeight: active ? 700 : 500, fontSize: 13, cursor: 'pointer',
                    boxShadow: active ? '0 2px 8px #2563eb33' : 'none',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  }}>
                  <span>{bh.bh_name}</span>
                  {cached && t && (
                    <span style={{ fontSize: 10, color: active ? '#93c5fd' : '#6b7280', fontWeight: 400 }}>
                      Subs {t.actual_subs}/{t.daily_subs_target} · Int {t.actual_int}/{t.daily_int_target}
                    </span>
                  )}
                  {!cached && <span style={{ fontSize: 10, color: active ? '#93c5fd' : '#d1d5db' }}>click to load</span>}
                </button>
              );
            })}
            {(olOnly ?? []).map(b => {
              const active = typeof view === 'object' && view.olBh === b.bh_name;
              return (
                <button key={b.bh_name} onClick={() => setView({ olBh: b.bh_name })}
                  style={{
                    padding: '8px 16px', borderRadius: 10, border: active ? '2px solid #b45309' : '1px dashed #f59e0b',
                    background: active ? 'linear-gradient(90deg,#92400e,#d97706)' : '#fffbeb',
                    color: active ? '#fff' : '#92400e',
                    fontWeight: active ? 700 : 500, fontSize: 13, cursor: 'pointer',
                    boxShadow: active ? '0 2px 8px #d9770633' : 'none',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  }}>
                  <span>{b.bh_name}</span>
                  <span style={{ fontSize: 10, color: active ? '#fde68a' : '#b45309', fontWeight: 400 }}>target not set</span>
                </button>
              );
            })}
          </div>

          {/* Overview — table 1: All pods */}
          {view === 'overview' && (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '12px 18px', background: 'linear-gradient(90deg,#1e3a5f,#2563eb)', display: 'flex', alignItems: 'center', gap: 16 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>All Pods · Overview</span>
                <span style={{ fontSize: 12, color: '#93c5fd', marginLeft: 'auto' }}>{month}</span>
              </div>
              {!overview && <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading overview…</div>}
              {overview && overview.length > 0 && (
                <BHCustomerTable customers={overview} month={month} firstColLabel="Business Head" countLabel="business heads" showDemandPo weekly={weekly} />
              )}
              {overview && overview.length === 0 && (
                <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No data for this month.</div>
              )}
            </div>
          )}

          {/* Overview — table 2: BHs from client mapping with no pod-plan targets */}
          {view === 'overview' && olOnly && olOnly.length > 0 && (
            <div style={{ border: '1px solid #fcd34d', borderRadius: 12, overflow: 'hidden', marginTop: 16 }}>
              <div style={{ padding: '12px 18px', background: 'linear-gradient(90deg,#92400e,#d97706)', display: 'flex', alignItems: 'center', gap: 16 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>Target Not Set</span>
                <span style={{ fontSize: 12, color: '#fde68a', marginLeft: 'auto' }}>from offer-letter DB · {month}</span>
              </div>
              <BHCustomerTable customers={olOnly.map(b => b.totals)} month={month} firstColLabel="Business Head" countLabel="business heads" showDemandPo weekly={weekly} />
            </div>
          )}

          {/* Overview — table 3: Captives (Anuradha, Sadhna, Deepak, Mehr) */}
          {view === 'overview' && (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', marginTop: 16 }}>
              <div style={{ padding: '12px 18px', background: 'linear-gradient(90deg,#1e3a5f,#2563eb)', display: 'flex', alignItems: 'center', gap: 16 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>Captives</span>
                <span style={{ fontSize: 12, color: '#93c5fd', marginLeft: 'auto' }}>{month}</span>
              </div>
              {!overview && <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading…</div>}
              {overview && (
                <BHCustomerTable customers={overview.filter(r => isCaptiveBH(r.customer_name))} month={month} firstColLabel="Business Head" countLabel="business heads" showDemandPo weekly={weekly} />
              )}
            </div>
          )}

          {/* Overview — table 4: Services (Prathap, Jawad, Unmapped) */}
          {view === 'overview' && (
            <div style={{ border: '1px solid #a5f3fc', borderRadius: 12, overflow: 'hidden', marginTop: 16 }}>
              <div style={{ padding: '12px 18px', background: 'linear-gradient(90deg,#155e63,#0891b2)', display: 'flex', alignItems: 'center', gap: 16 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>Services</span>
                <span style={{ fontSize: 12, color: '#a5f3fc', marginLeft: 'auto' }}>{month}</span>
              </div>
              {(!overview || !olOnly) && <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading…</div>}
              {overview && olOnly && (
                <BHCustomerTable
                  customers={[...overview, ...olOnly.map(b => b.totals)].filter(r => !isCaptiveBH(r.customer_name))}
                  month={month} firstColLabel="Business Head" countLabel="business heads" showDemandPo weekly={weekly} />
              )}
            </div>
          )}

          {/* OL-only BH detail panel — per-client OL actuals, no targets */}
          {typeof view === 'object' && (() => {
            const bh = (olOnly ?? []).find(b => b.bh_name === view.olBh);
            return (
              <div style={{ border: '1px solid #fcd34d', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '12px 18px', background: 'linear-gradient(90deg,#92400e,#d97706)', display: 'flex', alignItems: 'center', gap: 16 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{view.olBh}</span>
                  <span style={{ fontSize: 12, color: '#fde68a', marginLeft: 'auto' }}>target not set · offer-letter DB · {month}</span>
                </div>
                {!olOnly && <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading data…</div>}
                {bh && bh.customers.length > 0 && (
                  <BHCustomerTable customers={bh.customers} month={month} firstColLabel="Client" countLabel="clients" showDemandPo weekly={weekly} />
                )}
                {olOnly && (!bh || bh.customers.length === 0) && (
                  <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No offer-letter data for this BH's clients.</div>
                )}
              </div>
            );
          })()}

          {/* Detail panel */}
          {typeof view === 'number' && (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '12px 18px', background: 'linear-gradient(90deg,#1e3a5f,#2563eb)', display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>
                {detail?.bh_name ?? bhList.find(b => b.setup_id === view)?.bh_name ?? ''}
              </span>
              {detail && (() => {
                const t = bhTotals(detail.customers);
                return (
                  <div style={{ display: 'flex', gap: 20, marginLeft: 'auto', alignItems: 'center' }}>
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
                  </div>
                );
              })()}
            </div>

            {detailLoading && <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading data…</div>}
            {!detailLoading && detail && <BHCustomerTable customers={detail.customers} month={detail.month} showDemandPo weekly={weekly} />}
            {!detailLoading && !detail && <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Select a BH to view data.</div>}
          </div>
          )}
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Section 4 — BH × Company (Postgres jobs table)
// ════════════════════════════════════════════════════════════════════════════

interface BHCompanyRow {
  bh_user_id: number | null;
  bh_name: string;
  client_name: string;
  role_title: string;
  headcount: number;
  jobs_count: number;
  candidates_count: number;
  dl_verified_count: number;
  client_submitted_count: number;
  ol_job_ids: number[];
}

interface BHCandidate {
  full_name: string;
  email: string | null;
  mrr_job_created_at: string | null;
  dl_verified: boolean;
  dl_verified_at: string | null;
  ol_user_id: number | null;
  ol_job_posting_id: number | null;
  ol_step: string | null;
  ol_created_at: string | null;
  ol_updated_at: string | null;
}

type BhSortKey = 'name' | 'hc' | 'companies' | 'roles';

function rowKey(r: { bh_user_id: number | null; client_name: string; role_title: string }) {
  return `${r.bh_user_id ?? 'null'}|${r.client_name}|${r.role_title}`;
}

// Parse "YYYY-MM-DD HH:MM" (UTC naive) into ms-since-epoch. Returns null on
// bad input. Coerces to ISO with a Z suffix so browsers interpret it as UTC.
function parseUtc(s: string | null): number | null {
  if (!s) return null;
  const iso = s.includes('T') ? s : s.replace(' ', 'T') + ':00Z';
  const t = new Date(iso).getTime();
  return isNaN(t) ? null : t;
}

// Format a ms duration. < 60s → "Xm" (rounded up to 1m floor); < 24h → "Xh Ym";
// ≥ 24h → "Xd Yh". Negative → null.
function fmtDurationMs(ms: number): string | null {
  if (ms < 0) return null;
  const mins = Math.floor(ms / 60000);
  if (mins < 60)        return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)         return `${hrs}h ${mins % 60}m`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h`;
}

// Compact elapsed-time formatter between two timestamps.
function fmtElapsed(fromStr: string | null, toStr: string | null): string | null {
  const from = parseUtc(fromStr);
  const to   = parseUtc(toStr);
  if (from == null || to == null) return null;
  return fmtDurationMs(to - from);
}

function StatCard({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div
      className="flex-1 min-w-32 px-4 py-3 rounded-[10px]"
      style={{
        background: 'var(--surface-card)',
        border: '1px solid var(--border-hairline)',
      }}
    >
      <div className="text-[10.5px] font-medium uppercase tracking-wider" style={{ color: 'var(--ink-4)', letterSpacing: '0.06em' }}>
        {label}
      </div>
      <div className="mt-1 font-mono font-semibold tabular-nums text-[22px]" style={{ color: accent ?? 'var(--ink)' }}>
        {value}
      </div>
    </div>
  );
}

function BHCompaniesSection() {
  const [rows, setRows] = useState<BHCompanyRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [fBh, setFBh] = useState<Set<string>>(new Set());
  const [fClient, setFClient] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<BhSortKey>('hc');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const load = () => {
      setLoading(true);
      setError('');
      api.get<{ rows: BHCompanyRow[] }>('/coo/bh-companies')
        .then(r => setRows(r.data.rows))
        .catch(e => {
          const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
          setError(msg || 'Failed to load BH companies.');
        })
        .finally(() => setLoading(false));
    };
    load();
  }, []);

  // Distinct option lists for filter dropdowns
  const bhOptions = useMemo(
    () => uniq((rows ?? []).map(r => r.bh_name)).sort((a, b) => a.localeCompare(b)),
    [rows],
  );
  const clientOptions = useMemo(
    () => uniq((rows ?? []).map(r => r.client_name)).sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  // Apply search + filters → flat list
  const filtered = useMemo(() => {
    if (!rows) return [];
    let out = rows;
    if (fBh.size) out = out.filter(r => fBh.has(r.bh_name));
    if (fClient.size) out = out.filter(r => fClient.has(r.client_name));
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter(r =>
        r.bh_name.toLowerCase().includes(q) ||
        r.client_name.toLowerCase().includes(q) ||
        r.role_title.toLowerCase().includes(q),
      );
    }
    return out;
  }, [rows, fBh, fClient, search]);

  // Group by BH → companies → roles
  const grouped = useMemo(() => {
    const map = new Map<string, BHCompanyRow[]>();
    for (const row of filtered) {
      if (!map.has(row.bh_name)) map.set(row.bh_name, []);
      map.get(row.bh_name)!.push(row);
    }
    const groups = Array.from(map.entries()).map(([bh_name, items]) => {
      const companies = uniq(items.map(i => i.client_name)).length;
      return {
        bh_name,
        items: [...items].sort((a, b) =>
          a.client_name.localeCompare(b.client_name) ||
          b.headcount - a.headcount,
        ),
        total_hc: items.reduce((s, x) => s + x.headcount, 0),
        total_roles: items.length,
        total_jobs: items.reduce((s, x) => s + x.jobs_count, 0),
        total_candidates: items.reduce((s, x) => s + x.candidates_count, 0),
        total_verified: items.reduce((s, x) => s + x.dl_verified_count, 0),
        total_submitted: items.reduce((s, x) => s + x.client_submitted_count, 0),
        total_companies: companies,
      };
    });

    groups.sort((a, b) => {
      const dir = sortDir === 'desc' ? -1 : 1;
      switch (sortKey) {
        case 'name':      return a.bh_name.localeCompare(b.bh_name) * dir;
        case 'hc':        return (a.total_hc - b.total_hc) * dir;
        case 'companies': return (a.total_companies - b.total_companies) * dir;
        case 'roles':     return (a.total_roles - b.total_roles) * dir;
      }
    });
    return groups;
  }, [filtered, sortKey, sortDir]);

  // Aggregate summary across what's visible
  const totals = useMemo(() => ({
    bhs:        grouped.length,
    companies:  uniq(filtered.map(r => `${r.bh_name}|${r.client_name}`)).length,
    roles:      filtered.length,
    hc:         filtered.reduce((s, r) => s + r.headcount, 0),
    candidates: filtered.reduce((s, r) => s + r.candidates_count, 0),
    verified:   filtered.reduce((s, r) => s + r.dl_verified_count, 0),
    submitted:  filtered.reduce((s, r) => s + r.client_submitted_count, 0),
  }), [grouped, filtered]);

  // Per-row candidate drawer — open key → loading / data / error.
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [drawerCache, setDrawerCache] = useState<Map<string, BHCandidate[]>>(new Map());
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState('');
  // OL-status filter applied inside the open drawer. Resets when a different
  // row is opened. Empty set = show all statuses (including "Not in OL").
  const [drawerStatuses, setDrawerStatuses] = useState<Set<string>>(new Set());

  const toggleDrawer = (row: BHCompanyRow) => {
    const key = rowKey(row);
    if (openRow === key) { setOpenRow(null); return; }
    setOpenRow(key);
    setDrawerStatuses(new Set());
    if (drawerCache.has(key)) return;
    setDrawerLoading(true);
    setDrawerError('');
    api.get<{ candidates: BHCandidate[] }>('/coo/bh-companies/candidates', {
      params: {
        bh_user_id: row.bh_user_id ?? undefined,
        client_name: row.client_name,
        role_title: row.role_title,
      },
    })
      .then(r => {
        setDrawerCache(prev => {
          const next = new Map(prev);
          next.set(key, r.data.candidates);
          return next;
        });
      })
      .catch(e => {
        const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        setDrawerError(msg || 'Failed to load candidates.');
      })
      .finally(() => setDrawerLoading(false));
  };

  const handleSort = (k: BhSortKey) => {
    if (sortKey === k) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(k); setSortDir(k === 'name' ? 'asc' : 'desc'); }
  };

  const toggleCollapse = (bh: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(bh)) next.delete(bh); else next.add(bh);
      return next;
    });
  };
  const allCollapsed = grouped.length > 0 && grouped.every(g => collapsed.has(g.bh_name));
  const toggleAll = () => {
    setCollapsed(allCollapsed ? new Set() : new Set(grouped.map(g => g.bh_name)));
  };

  const activeFilters = fBh.size + fClient.size + (search.trim() ? 1 : 0);
  const clearFilters = () => { setFBh(new Set()); setFClient(new Set()); setSearch(''); };

  const sortHeader = (label: string, key: BhSortKey, align: 'left' | 'right' = 'left') => {
    const active = sortKey === key;
    return (
      <button
        type="button"
        onClick={() => handleSort(key)}
        className="inline-flex items-center gap-1 font-semibold transition-colors"
        style={{ color: active ? 'var(--ink)' : 'var(--ink-3)' }}
      >
        {align === 'right' && <SortIcon active={active} dir={sortDir} />}
        <span>{label}</span>
        {align === 'left' && <SortIcon active={active} dir={sortDir} />}
      </button>
    );
  };

  return (
    <div>
      {/* Summary stats */}
      <div className="flex flex-wrap gap-3 mb-5">
        <StatCard label="Business Heads" value={totals.bhs} />
        <StatCard label="Companies"      value={totals.companies} />
        <StatCard label="Job Roles"      value={totals.roles} />
        <StatCard label="HC Positions"   value={totals.hc} accent="var(--accent)" />
        <StatCard label="Candidates"     value={totals.candidates} accent="#2563EB" />
        <StatCard label="DL Verified"    value={totals.verified} accent="#059669" />
        <StatCard label="Client Submitted" value={totals.submitted} accent="#7C3AED" />
      </div>

      {/* Filter bar */}
      <div
        className="flex flex-wrap items-center gap-2.5 mb-4 px-3 py-2.5 rounded-[10px]"
        style={{ background: 'var(--surface-card)', border: '1px solid var(--border-hairline)' }}
      >
        <div className="relative" style={{ flex: '1 1 240px', maxWidth: 360 }}>
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--ink-4)' }} />
          <input
            type="text"
            placeholder="Search BH, company, or role…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-8 py-1.5 text-[12.5px] rounded-md outline-none transition-colors"
            style={{ background: 'var(--surface-muted)', border: '1px solid transparent', color: 'var(--ink)' }}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--border-hairline)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--ink-4)' }}
              aria-label="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <MultiSelectFilter label="BHs"       options={bhOptions}     selected={fBh}     onChange={setFBh} />
        <MultiSelectFilter label="Companies" options={clientOptions} selected={fClient} onChange={setFClient} />

        <div className="flex-1" />

        {activeFilters > 0 && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-[11.5px] font-medium px-2 py-1 rounded-md transition-colors"
            style={{ color: 'var(--ink-2)', border: '1px solid var(--border-hairline)' }}
          >
            Clear ({activeFilters})
          </button>
        )}
        {grouped.length > 0 && (
          <button
            type="button"
            onClick={toggleAll}
            className="text-[11.5px] font-medium px-2 py-1 rounded-md transition-colors"
            style={{ color: 'var(--ink-2)', border: '1px solid var(--border-hairline)' }}
          >
            {allCollapsed ? 'Expand all' : 'Collapse all'}
          </button>
        )}
      </div>

      {loading && <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-4)' }}>Loading…</div>}
      {error && <div style={{ padding: 16, color: '#b91c1c' }}>{error}</div>}

      {!loading && !error && grouped.length === 0 && (
        <div className="text-center py-12 rounded-[10px]"
             style={{ background: 'var(--surface-card)', border: '1px solid var(--border-hairline)', color: 'var(--ink-4)' }}>
          No matching jobs.
        </div>
      )}

      {!loading && !error && grouped.length > 0 && (
        <div
          style={{
            border: '1px solid var(--border-hairline)',
            borderRadius: 10,
            overflow: 'hidden',
            background: 'var(--surface-card)',
          }}
        >
          <table className="w-full border-collapse" style={{ fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: 'var(--surface-muted)', borderBottom: '1px solid var(--border-hairline)' }}>
                <th className="text-left px-3 py-2.5 font-semibold" style={{ width: 220, color: 'var(--ink-2)' }}>
                  {sortHeader('Business Head', 'name')}
                </th>
                <th className="text-left px-3 py-2.5 font-semibold" style={{ width: '28%', color: 'var(--ink-2)' }}>Company</th>
                <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--ink-2)' }}>Job Role</th>
                <th className="text-right px-3 py-2.5 font-semibold whitespace-nowrap" style={{ width: 100, color: 'var(--ink-2)' }}>
                  {sortHeader('HC', 'hc', 'right')}
                </th>
                <th className="text-right px-3 py-2.5 font-semibold whitespace-nowrap" style={{ width: 70, color: 'var(--ink-2)' }}>Jobs</th>
                <th className="text-right px-3 py-2.5 font-semibold whitespace-nowrap" style={{ width: 110, color: 'var(--ink-2)' }}>Candidates</th>
                <th className="text-right px-3 py-2.5 font-semibold whitespace-nowrap" style={{ width: 110, color: 'var(--ink-2)' }}>DL Verified</th>
                <th className="text-right px-3 py-2.5 font-semibold whitespace-nowrap" style={{ width: 130, color: 'var(--ink-2)' }} title="Candidates whose OL applied_jobs current_step is ≥ 7 (Client Submit and beyond)">Client Submitted</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(group => {
                const isCollapsed = collapsed.has(group.bh_name);
                return (
                  <Fragment key={group.bh_name}>
                    {/* Group header */}
                    <tr style={{ background: 'var(--surface-muted)', borderTop: '1px solid var(--border-hairline)', borderBottom: '1px solid var(--border-hairline)' }}>
                      <td colSpan={3} className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => toggleCollapse(group.bh_name)}
                          className="flex items-center gap-1.5 font-semibold text-[13px] transition-colors"
                          style={{ color: 'var(--ink)' }}
                        >
                          <ChevronRight
                            size={13}
                            style={{
                              transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)',
                              transition: 'transform 120ms ease',
                              color: 'var(--ink-3)',
                            }}
                          />
                          <span>{group.bh_name}</span>
                          <span className="ml-1.5 text-[11px] font-normal" style={{ color: 'var(--ink-3)' }}>
                            {group.total_companies} {group.total_companies === 1 ? 'company' : 'companies'} ·
                            {' '}{group.total_roles} {group.total_roles === 1 ? 'role' : 'roles'}
                          </span>
                        </button>
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums" style={{ color: 'var(--accent)' }}>
                        {group.total_hc}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums" style={{ color: 'var(--ink-2)' }}>
                        {group.total_jobs}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums" style={{ color: '#2563EB' }}>
                        {group.total_candidates}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums" style={{ color: '#059669' }}>
                        {group.total_verified}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums" style={{ color: '#7C3AED' }}>
                        {group.total_submitted}
                      </td>
                    </tr>

                    {/* Detail rows — hide when collapsed */}
                    {!isCollapsed && group.items.map((row, idx) => {
                      const prev = idx > 0 ? group.items[idx - 1] : null;
                      const isFirstOfCompany = !prev || prev.client_name !== row.client_name;
                      const key = rowKey(row);
                      const isOpen = openRow === key;
                      const cands = drawerCache.get(key);
                      const baseBg = idx % 2 === 0 ? 'transparent' : 'var(--surface-muted)';
                      return (
                        <Fragment key={`${key}-${idx}`}>
                          <tr
                            style={{
                              borderBottom: isOpen ? 'none' : '1px solid var(--border-hairline)',
                              background: isOpen ? 'var(--accent-soft)' : baseBg,
                            }}
                            onMouseEnter={e => { if (!isOpen) (e.currentTarget as HTMLElement).style.background = 'var(--accent-soft)'; }}
                            onMouseLeave={e => { if (!isOpen) (e.currentTarget as HTMLElement).style.background = baseBg; }}
                          >
                            <td className="px-3 py-2" style={{ color: 'var(--ink-4)' }}></td>
                            <td className="px-3 py-2 align-top" style={{ color: isFirstOfCompany ? 'var(--ink)' : 'var(--ink-4)', fontWeight: isFirstOfCompany ? 500 : 400 }}>
                              {isFirstOfCompany ? row.client_name : <span style={{ paddingLeft: 6 }}>↳</span>}
                            </td>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() => toggleDrawer(row)}
                                disabled={row.candidates_count === 0}
                                className="inline-flex items-center gap-1.5 text-left transition-colors"
                                style={{
                                  color: row.candidates_count === 0 ? 'var(--ink-3)' : 'var(--accent)',
                                  cursor: row.candidates_count === 0 ? 'default' : 'pointer',
                                  textDecoration: row.candidates_count === 0 ? 'none' : 'underline',
                                  textDecorationStyle: 'dotted',
                                  textUnderlineOffset: 3,
                                  fontWeight: 500,
                                }}
                                title={row.candidates_count === 0 ? 'No candidates sourced yet' : 'Click to view candidates'}
                              >
                                <ChevronRight
                                  size={11}
                                  style={{
                                    transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                                    transition: 'transform 120ms ease',
                                    opacity: row.candidates_count === 0 ? 0.3 : 1,
                                  }}
                                />
                                <span>{row.role_title}</span>
                              </button>
                              {row.ol_job_ids.length > 0 && (
                                <span
                                  className="ml-2 font-mono tabular-nums"
                                  style={{ color: 'var(--ink-4)', fontSize: 10.5 }}
                                  title={`OL job_posting_id${row.ol_job_ids.length === 1 ? '' : 's'}: ${row.ol_job_ids.join(', ')}`}
                                >
                                  #{row.ol_job_ids.slice(0, 3).join(', #')}
                                  {row.ol_job_ids.length > 3 && (
                                    <span> +{row.ol_job_ids.length - 3}</span>
                                  )}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold" style={{ color: 'var(--ink)' }}>
                              {row.headcount}
                            </td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: 'var(--ink-3)' }}>
                              {row.jobs_count}
                            </td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: row.candidates_count > 0 ? '#2563EB' : 'var(--ink-4)', fontWeight: row.candidates_count > 0 ? 600 : 400 }}>
                              {row.candidates_count}
                            </td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: row.dl_verified_count > 0 ? '#059669' : 'var(--ink-4)', fontWeight: row.dl_verified_count > 0 ? 600 : 400 }}>
                              {row.candidates_count > 0
                                ? <>{row.dl_verified_count}<span className="text-[10.5px] font-normal" style={{ color: 'var(--ink-4)' }}> /{row.candidates_count}</span></>
                                : '—'}
                            </td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: row.client_submitted_count > 0 ? '#7C3AED' : 'var(--ink-4)', fontWeight: row.client_submitted_count > 0 ? 600 : 400 }}>
                              {row.candidates_count > 0
                                ? <>{row.client_submitted_count}<span className="text-[10.5px] font-normal" style={{ color: 'var(--ink-4)' }}> /{row.candidates_count}</span></>
                                : '—'}
                            </td>
                          </tr>

                          {isOpen && (
                            <tr style={{ background: 'var(--surface-muted)', borderBottom: '1px solid var(--border-hairline)' }}>
                              <td colSpan={8} className="px-0 py-0">
                                <div className="px-6 py-3" style={{ borderTop: '1px dashed var(--border-hairline)' }}>
                                  <div className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--ink-3)', letterSpacing: '0.06em' }}>
                                    Candidates · {row.role_title} <span className="font-normal" style={{ color: 'var(--ink-4)' }}>({row.client_name})</span>
                                  </div>
                                  {drawerLoading && !cands && (
                                    <div className="text-[12px] py-2" style={{ color: 'var(--ink-4)' }}>Loading…</div>
                                  )}
                                  {drawerError && !cands && (
                                    <div className="text-[12px] py-2" style={{ color: '#b91c1c' }}>{drawerError}</div>
                                  )}
                                  {cands && cands.length === 0 && (
                                    <div className="text-[12px] py-2" style={{ color: 'var(--ink-4)' }}>No candidates found.</div>
                                  )}
                                  {cands && cands.length > 0 && (() => {
                                    // Status options (with "Not in OL" sentinel for null steps), sorted with counts.
                                    const statusCounts: Record<string, number> = {};
                                    for (const c of cands) {
                                      const k = c.ol_step ?? 'Not in OL';
                                      statusCounts[k] = (statusCounts[k] || 0) + 1;
                                    }
                                    const statusOptions = Object.keys(statusCounts).sort();

                                    // Apply status filter (empty = all).
                                    const visibleCands = drawerStatuses.size
                                      ? cands.filter(c => drawerStatuses.has(c.ol_step ?? 'Not in OL'))
                                      : cands;

                                    // Per-candidate elapsed (DL → current OL update) in ms.
                                    const tatDlToCurrent = (c: BHCandidate): number | null => {
                                      const from = parseUtc(c.dl_verified_at);
                                      const to   = parseUtc(c.ol_updated_at);
                                      return (from != null && to != null && to >= from) ? to - from : null;
                                    };

                                    // Two averages: (1) DL → current status across all OL-tracked verified
                                    // candidates in view, (2) DL → Onboarded for the onboarded subset only.
                                    const allTats = visibleCands.map(tatDlToCurrent).filter((v): v is number => v != null);
                                    const avgAllStr = allTats.length
                                      ? fmtDurationMs(allTats.reduce((s, v) => s + v, 0) / allTats.length)
                                      : null;

                                    const onboardedTats = visibleCands
                                      .filter(c => c.ol_step === 'Onboarded')
                                      .map(tatDlToCurrent)
                                      .filter((v): v is number => v != null);
                                    const onboardedCount = visibleCands.filter(c => c.ol_step === 'Onboarded').length;
                                    const avgOnbStr = onboardedTats.length
                                      ? fmtDurationMs(onboardedTats.reduce((s, v) => s + v, 0) / onboardedTats.length)
                                      : null;

                                    return (
                                    <>
                                      <div className="flex items-center gap-3 mb-2 text-[11px] flex-wrap" style={{ color: 'var(--ink-3)' }}>
                                        <span className="font-mono tabular-nums">{visibleCands.length}{drawerStatuses.size > 0 && ` / ${cands.length}`} candidate{visibleCands.length === 1 ? '' : 's'}</span>
                                        <span style={{ color: 'var(--ink-4)' }}>·</span>
                                        <span className="font-mono tabular-nums">
                                          <span style={{ color: '#059669', fontWeight: 600 }}>{visibleCands.filter(c => c.dl_verified).length}</span> DL verified
                                        </span>
                                        <span style={{ color: 'var(--ink-4)' }}>·</span>
                                        <span className="font-mono tabular-nums">
                                          <span style={{ color: 'var(--ink-2)', fontWeight: 600 }}>{visibleCands.filter(c => c.ol_user_id != null).length}</span> in OL
                                        </span>
                                        {avgAllStr && (
                                          <span
                                            className="font-mono tabular-nums inline-flex items-center gap-1 px-2 py-0.5 rounded"
                                            style={{ background: '#EFF6FF', color: '#1D4ED8', fontWeight: 600, fontSize: 10.5 }}
                                            title={`Average elapsed time from DL verification to current OL status across ${allTats.length} candidate${allTats.length === 1 ? '' : 's'}`}
                                          >
                                            avg TAT (DL → status): {avgAllStr}
                                          </span>
                                        )}
                                        {onboardedCount > 0 && (
                                          <>
                                            <span style={{ color: 'var(--ink-4)' }}>·</span>
                                            <span className="font-mono tabular-nums">
                                              <span style={{ color: '#7C3AED', fontWeight: 600 }}>{onboardedCount}</span> onboarded
                                            </span>
                                            {avgOnbStr && (
                                              <span
                                                className="font-mono tabular-nums inline-flex items-center gap-1 px-2 py-0.5 rounded"
                                                style={{ background: '#F5F3FF', color: '#6D28D9', fontWeight: 600, fontSize: 10.5 }}
                                                title={`Average elapsed time from DL verification to OL Onboarded across ${onboardedTats.length} onboarded candidate${onboardedTats.length === 1 ? '' : 's'}`}
                                              >
                                                avg TAT (DL → Onboarded): {avgOnbStr}
                                              </span>
                                            )}
                                          </>
                                        )}
                                      </div>

                                      {/* Status filter chips */}
                                      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                                        <span className="text-[10.5px] font-semibold uppercase tracking-wider mr-1" style={{ color: 'var(--ink-4)', letterSpacing: '0.06em' }}>Filter:</span>
                                        {statusOptions.map(s => {
                                          const active = drawerStatuses.has(s);
                                          return (
                                            <button
                                              key={s}
                                              type="button"
                                              onClick={() => {
                                                setDrawerStatuses(prev => {
                                                  const next = new Set(prev);
                                                  if (next.has(s)) next.delete(s); else next.add(s);
                                                  return next;
                                                });
                                              }}
                                              className="text-[10.5px] font-medium px-2 py-0.5 rounded-full transition-colors"
                                              style={{
                                                background: active ? 'var(--accent-soft)' : 'var(--surface-card)',
                                                color:      active ? 'var(--accent)'      : 'var(--ink-2)',
                                                border: `1px solid ${active ? 'var(--accent)' : 'var(--border-hairline)'}`,
                                              }}
                                            >
                                              {s} <span className="font-mono tabular-nums opacity-70">{statusCounts[s]}</span>
                                            </button>
                                          );
                                        })}
                                        {drawerStatuses.size > 0 && (
                                          <button
                                            type="button"
                                            onClick={() => setDrawerStatuses(new Set())}
                                            className="text-[10.5px] font-medium px-2 py-0.5 rounded-full ml-1"
                                            style={{ color: 'var(--ink-3)' }}
                                          >
                                            Clear
                                          </button>
                                        )}
                                      </div>
                                      <div
                                        style={{
                                          maxHeight: 360,
                                          overflowY: 'auto',
                                          borderRadius: 6,
                                          border: '1px solid var(--border-hairline)',
                                          background: 'var(--surface-card)',
                                        }}
                                      >
                                        <table className="w-full" style={{ fontSize: 11.5 }}>
                                          <thead>
                                            <tr style={{ background: 'var(--surface-muted)', position: 'sticky', top: 0, zIndex: 1 }}>
                                              <th className="text-left px-3 py-1.5 font-semibold whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>Name</th>
                                              <th className="text-left px-3 py-1.5 font-semibold whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>Email</th>
                                              <th className="text-left px-3 py-1.5 font-semibold whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>DL Verified</th>
                                              <th className="text-left px-3 py-1.5 font-semibold whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>OL Status</th>
                                              <th className="text-left px-3 py-1.5 font-semibold whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>Job Created (MRR)</th>
                                              <th className="text-left px-3 py-1.5 font-semibold whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>OL Applied</th>
                                              <th className="text-left px-3 py-1.5 font-semibold whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>OL Updated</th>
                                              <th className="text-left px-3 py-1.5 font-semibold whitespace-nowrap" style={{ color: 'var(--ink-3)' }} title="Elapsed time from MRR job creation to last OL status update">Time to Status</th>
                                              <th className="text-left px-3 py-1.5 font-semibold whitespace-nowrap" style={{ color: 'var(--ink-3)' }} title="Elapsed time from DL verification to last OL status update">After DL</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {visibleCands.map((c, i) => (
                                              <tr
                                                key={`${c.email}-${i}`}
                                                style={{
                                                  borderTop: '1px solid var(--border-hairline)',
                                                  background: i % 2 === 0 ? 'transparent' : 'var(--surface-muted)',
                                                }}
                                              >
                                                <td className="px-3 py-1.5 whitespace-nowrap" style={{ color: 'var(--ink-2)', fontWeight: 500 }}>{c.full_name || '—'}</td>
                                                <td className="px-3 py-1.5 font-mono whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>{c.email || '—'}</td>
                                                <td className="px-3 py-1.5 whitespace-nowrap">
                                                  {c.dl_verified ? (
                                                    <span className="inline-flex items-center gap-1">
                                                      <CheckCircle2 size={11} style={{ color: '#059669' }} />
                                                      <span style={{ color: '#059669', fontWeight: 600 }}>Verified</span>
                                                      {c.dl_verified_at && (
                                                        <span className="font-mono" style={{ color: 'var(--ink-4)', fontSize: 10.5 }}>· {c.dl_verified_at}</span>
                                                      )}
                                                    </span>
                                                  ) : (
                                                    <span style={{ color: 'var(--ink-4)' }}>—</span>
                                                  )}
                                                </td>
                                                <td className="px-3 py-1.5 whitespace-nowrap">
                                                  {c.ol_user_id == null ? (
                                                    <span style={{ color: 'var(--ink-4)' }} title="No OL user matched on this email">Not in OL</span>
                                                  ) : c.ol_job_posting_id == null ? (
                                                    <span style={{ color: 'var(--ink-4)' }} title="This Postgres job has no OL job_posting_id mapped">Job not in OL</span>
                                                  ) : c.ol_step ? (
                                                    <span
                                                      className="inline-flex items-center px-1.5 py-0.5 rounded font-medium"
                                                      style={{
                                                        background: 'var(--accent-soft)',
                                                        color: 'var(--accent)',
                                                        fontSize: 10.5,
                                                      }}
                                                      title={`OL user #${c.ol_user_id} · job_posting_id ${c.ol_job_posting_id}`}
                                                    >
                                                      {c.ol_step}
                                                    </span>
                                                  ) : (
                                                    <span style={{ color: 'var(--ink-4)' }} title={`OL user #${c.ol_user_id} did not apply to job_posting_id ${c.ol_job_posting_id}`}>Not applied to this role</span>
                                                  )}
                                                </td>
                                                <td className="px-3 py-1.5 font-mono whitespace-nowrap" style={{ color: 'var(--ink-3)', fontSize: 10.5 }}>{c.mrr_job_created_at || '—'}</td>
                                                <td className="px-3 py-1.5 font-mono whitespace-nowrap" style={{ color: 'var(--ink-3)', fontSize: 10.5 }}>{c.ol_created_at || '—'}</td>
                                                <td className="px-3 py-1.5 font-mono whitespace-nowrap" style={{ color: 'var(--ink-3)', fontSize: 10.5 }}>{c.ol_updated_at || '—'}</td>
                                                <td className="px-3 py-1.5 font-mono whitespace-nowrap" style={{ color: 'var(--ink-2)', fontSize: 11, fontWeight: 500 }}>
                                                  {fmtElapsed(c.mrr_job_created_at, c.ol_updated_at) || <span style={{ color: 'var(--ink-4)', fontWeight: 400 }}>—</span>}
                                                </td>
                                                <td className="px-3 py-1.5 font-mono whitespace-nowrap" style={{ color: '#1D4ED8', fontSize: 11, fontWeight: 500 }}>
                                                  {fmtElapsed(c.dl_verified_at, c.ol_updated_at) || <span style={{ color: 'var(--ink-4)', fontWeight: 400 }}>—</span>}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </>
                                    );
                                  })()}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--surface-muted)', borderTop: '2px solid var(--border-hairline)' }}>
                <td colSpan={3} className="px-3 py-2.5 text-[12px] font-semibold" style={{ color: 'var(--ink-2)' }}>
                  Total ({totals.bhs} BH{totals.bhs === 1 ? '' : 's'}, {totals.companies} {totals.companies === 1 ? 'company' : 'companies'}, {totals.roles} {totals.roles === 1 ? 'role' : 'roles'})
                </td>
                <td className="px-3 py-2.5 text-right font-mono font-bold tabular-nums" style={{ color: 'var(--accent)' }}>{totals.hc}</td>
                <td className="px-3 py-2.5 text-right font-mono font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                  {filtered.reduce((s, r) => s + r.jobs_count, 0)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono font-bold tabular-nums" style={{ color: '#2563EB' }}>
                  {totals.candidates}
                </td>
                <td className="px-3 py-2.5 text-right font-mono font-bold tabular-nums" style={{ color: '#059669' }}>
                  {totals.verified}
                </td>
                <td className="px-3 py-2.5 text-right font-mono font-bold tabular-nums" style={{ color: '#7C3AED' }}>
                  {totals.submitted}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Section 5 — BH Hourly Tracker (live, hourly OL pipeline events)
// ════════════════════════════════════════════════════════════════════════════

interface HourlyMetric { key: string; label: string }
interface HourlyHour   { key: string; label: string }
type HourlyTotals = Record<string, number>;
interface BHHourlyRow {
  bh_name:     string;
  client_name: string;
  totals:      HourlyTotals;
  hourly:      Record<string, HourlyTotals>;
  row_total:   number;
}
interface BHHourlyResponse {
  date:              string;
  metrics:           HourlyMetric[];
  hours:             HourlyHour[];
  rows:              BHHourlyRow[];
  totals:            HourlyTotals;
  totals_row_total:  number;
}

// Color palette per metric — header + cell bg
const METRIC_PAL: Record<string, { hdr: string; cell: string; ink: string }> = {
  client_submit: { hdr: '#1E40AF', cell: '#DBEAFE', ink: '#1E3A8A' }, // blue
  l1:            { hdr: '#B45309', cell: '#FEF3C7', ink: '#92400E' }, // amber
  l2_l3:         { hdr: '#7C3AED', cell: '#EDE9FE', ink: '#5B21B6' }, // violet
  selections:    { hdr: '#0F766E', cell: '#CCFBF1', ink: '#115E59' }, // teal
  onboarded:     { hdr: '#166534', cell: '#DCFCE7', ink: '#14532D' }, // green
};

// ── Redesigned hourly breakdown card ──
// Two-pane layout. Left pane: total skyline (single horizontal bar chart of
// hourly activity, color-stacked by metric). Right pane: per-metric "lanes"
// with bigger numbers, peak ★ marker, and relative shading scaled per row.
// Empty hours collapse to a small dot so the eye can ignore them.
function HourlyBreakdownCard({
  bhName,
  clientName,
  totals,
  hourly,
  hours,
  metrics,
  rowTotal,
}: {
  bhName: string;
  clientName: string;
  totals: HourlyTotals;
  hourly: Record<string, HourlyTotals>;
  hours: HourlyHour[];
  metrics: HourlyMetric[];
  rowTotal: number;
}) {
  // Per-hour stacked total (used for the skyline bar chart on top)
  const hourTotals = hours.map(h => {
    const cnts = hourly[h.key] ?? {};
    return { ...h, total: metrics.reduce((s, m) => s + (cnts[m.key] ?? 0), 0), cnts };
  });
  const peakHourTotal = Math.max(1, ...hourTotals.map(h => h.total));
  const dayPeakHourKey = hourTotals.reduce((best, cur) => cur.total > best.total ? cur : best, hourTotals[0]).key;

  // Per-metric peak hour (used for the ★ marker)
  const peakByMetric: Record<string, string> = {};
  for (const m of metrics) {
    let peakKey = '';
    let peakVal = 0;
    for (const h of hours) {
      const v = hourly[h.key]?.[m.key] ?? 0;
      if (v > peakVal) { peakVal = v; peakKey = h.key; }
    }
    if (peakVal > 0) peakByMetric[m.key] = peakKey;
  }

  // Per-metric max (for relative shading within a row)
  const maxByMetric: Record<string, number> = {};
  for (const m of metrics) {
    let mx = 0;
    for (const h of hours) {
      const v = hourly[h.key]?.[m.key] ?? 0;
      if (v > mx) mx = v;
    }
    maxByMetric[m.key] = mx;
  }

  // Helpers
  const intensity = (val: number, max: number) => {
    if (!val || !max) return 0;
    return Math.max(0.15, val / max);
  };
  const cellBg = (val: number, max: number, palCell: string) => {
    const i = intensity(val, max);
    if (!i) return undefined;
    // Use opacity over the metric's pastel — gives clean low/high shading.
    return palCell;
  };

  return (
    <div className="px-4 py-3 bg-gradient-to-br from-slate-50 to-white border-t border-b border-slate-200">
      {/* Header */}
      <div className="flex items-baseline gap-2 mb-3 flex-wrap">
        <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
          Hourly breakdown
        </div>
        <span className="text-slate-300">·</span>
        <span className="text-[12px] font-semibold text-slate-700">{clientName}</span>
        <span className="text-slate-300">·</span>
        <span className="text-[11px] text-slate-400">{bhName}</span>
        <span className="ml-auto text-[11px] text-slate-500 font-medium">
          Total <span className="font-bold text-slate-900">{rowTotal}</span> events
        </span>
      </div>

      {/* ── Day summary chips (per metric) ── */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {metrics.map(m => {
          const p   = METRIC_PAL[m.key] ?? { hdr: '#475569', cell: '#F1F5F9', ink: '#334155' };
          const v   = totals[m.key] ?? 0;
          const pk  = peakByMetric[m.key];
          const pkLabel = pk ? hours.find(h => h.key === pk)?.label : '';
          return (
            <div
              key={m.key}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 border ${v ? '' : 'opacity-50'}`}
              style={{ background: v ? p.cell : '#F8FAFC', borderColor: (v ? p.hdr : '#CBD5E1') + '44' }}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: p.hdr }} />
              <span className="text-[11px] font-semibold" style={{ color: p.ink }}>{m.label}</span>
              <span className="text-[14px] font-black tabular-nums" style={{ color: p.ink }}>{v}</span>
              {pk && v > 1 && (
                <span className="text-[10px] font-medium ml-0.5 px-1 py-0.5 rounded-md" style={{ color: p.hdr, background: '#fff' }}>
                  peak {pkLabel}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Skyline: stacked-metric bar chart, one bar per hour ── */}
      <div className="mb-3 rounded-xl border border-slate-200 bg-white p-3">
        <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-2">
          Activity per hour
        </div>
        <div className="flex items-end gap-1.5" style={{ height: 84 }}>
          {hourTotals.map(h => {
            const heightPct = (h.total / peakHourTotal) * 100;
            const isPeak = h.key === dayPeakHourKey && h.total > 0;
            return (
              <div key={h.key} className="flex-1 min-w-[28px] flex flex-col items-center justify-end">
                {/* Number on top of the bar */}
                <div
                  className="text-[11px] font-bold tabular-nums mb-0.5"
                  style={{ color: h.total ? '#0F172A' : '#CBD5E1' }}
                >
                  {h.total || '·'}
                </div>
                {/* Stacked vertical bar (metric segments inside) */}
                <div
                  className="w-full rounded-md overflow-hidden flex flex-col-reverse"
                  style={{
                    height: h.total ? `max(${heightPct}%, 4px)` : 4,
                    background: h.total ? 'transparent' : '#F1F5F9',
                    boxShadow: isPeak ? '0 0 0 2px #0F172A' : 'none',
                  }}
                >
                  {metrics.map(m => {
                    const v = h.cnts[m.key] ?? 0;
                    if (!v) return null;
                    const segHeight = (v / h.total) * 100;
                    const p = METRIC_PAL[m.key] ?? { hdr: '#475569', cell: '#F1F5F9', ink: '#334155' };
                    return <div key={m.key} style={{ height: `${segHeight}%`, background: p.hdr }} title={`${m.label}: ${v}`} />;
                  })}
                </div>
              </div>
            );
          })}
        </div>
        {/* Hour labels under the bars */}
        <div className="flex gap-1.5 mt-1.5">
          {hourTotals.map(h => (
            <div key={h.key}
              className={`flex-1 min-w-[28px] text-center text-[10px] font-medium ${h.key === dayPeakHourKey && h.total > 0 ? 'text-slate-900 font-bold' : 'text-slate-400'}`}
            >
              {h.label}
            </div>
          ))}
        </div>
      </div>

      {/* ── Per-metric lanes — bigger cells, relative row shading, ★ on peaks ── */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="text-[12px] w-full" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead>
              <tr>
                <th className="text-left px-3 py-2 sticky left-0 bg-white z-10 border-b border-slate-200 font-bold text-slate-500 uppercase tracking-wider text-[10px]"
                  style={{ minWidth: 130 }}>
                  Metric
                </th>
                {hours.map(h => (
                  <th key={h.key}
                    className={`text-center px-1 py-2 border-b border-slate-200 font-bold text-[10px] ${h.key === dayPeakHourKey ? 'text-slate-900 bg-slate-100' : 'text-slate-400'}`}
                    style={{ minWidth: 44 }}>
                    {h.label}
                  </th>
                ))}
                <th className="text-center px-2 py-2 border-b border-slate-200 bg-slate-900 text-white font-bold text-[10px] uppercase tracking-wider"
                  style={{ minWidth: 60 }}>
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {metrics.map(m => {
                const p   = METRIC_PAL[m.key] ?? { hdr: '#475569', cell: '#F1F5F9', ink: '#334155' };
                const total = totals[m.key] ?? 0;
                const maxV  = maxByMetric[m.key] ?? 0;
                const pkKey = peakByMetric[m.key];
                return (
                  <tr key={m.key} className="border-t border-slate-100">
                    <td className="text-left px-3 py-2 sticky left-0 z-10 border-r border-slate-200 font-semibold whitespace-nowrap"
                      style={{ background: '#fff', color: p.ink }}>
                      <span className="inline-block w-2 h-2 rounded-full mr-2 align-middle" style={{ background: p.hdr }} />
                      {m.label}
                    </td>
                    {hours.map(h => {
                      const v = hourly[h.key]?.[m.key] ?? 0;
                      const i = intensity(v, maxV);
                      const isPk = v > 0 && h.key === pkKey;
                      return (
                        <td key={h.key} className="text-center relative"
                          style={{
                            padding: 0,
                            background: v ? cellBg(v, maxV, p.cell) : '#FAFBFC',
                            borderRight: '1px solid #F1F5F9',
                          }}>
                          <div
                            className="flex items-center justify-center"
                            style={{
                              minHeight: 36,
                              fontSize: v ? 14 : 11,
                              fontWeight: v ? 800 : 400,
                              color: v ? p.ink : '#CBD5E1',
                              opacity: v ? Math.max(0.55, i) + 0.45 : 1,
                              outline: isPk ? `2px solid ${p.hdr}` : 'none',
                              outlineOffset: -2,
                            }}
                          >
                            {v ? (
                              <span className="tabular-nums flex items-center gap-0.5">
                                {v}
                                {isPk && maxV > 1 && (
                                  <span className="text-[9px]" style={{ color: p.hdr }}>★</span>
                                )}
                              </span>
                            ) : '·'}
                          </div>
                        </td>
                      );
                    })}
                    <td className="text-center font-black border-l border-slate-200"
                      style={{ background: total ? p.hdr : '#F8FAFC', color: total ? '#fff' : '#94A3B8', fontSize: 13 }}>
                      {total || '—'}
                    </td>
                  </tr>
                );
              })}
              {/* All-metrics row total — sticky-feel, smaller and subtler */}
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <td className="text-left px-3 py-2 sticky left-0 z-10 border-r border-slate-200 font-bold uppercase tracking-wider text-[10px] text-slate-600 whitespace-nowrap"
                  style={{ background: '#F1F5F9' }}>
                  All metrics
                </td>
                {hours.map(h => {
                  const sum = metrics.reduce((s, m) => s + (hourly[h.key]?.[m.key] ?? 0), 0);
                  const isPk = h.key === dayPeakHourKey && sum > 0;
                  return (
                    <td key={h.key} className="text-center"
                      style={{
                        background: isPk ? '#0F172A' : (sum ? '#E2E8F0' : '#F8FAFC'),
                        color:      isPk ? '#fff'    : (sum ? '#0F172A' : '#CBD5E1'),
                        fontWeight: sum ? 700 : 400,
                        fontSize: sum ? 12 : 11,
                        padding: 6,
                        borderRight: '1px solid #E2E8F0',
                      }}>
                      {sum || '·'}
                    </td>
                  );
                })}
                <td className="text-center font-black border-l border-slate-200 bg-slate-900 text-white"
                  style={{ fontSize: 13, padding: 6 }}>
                  {rowTotal || '—'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function BHHourlyTrackerSection() {
  const [data, setData]       = useState<BHHourlyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [selDate, setSelDate] = useState(todayISO());
  const [search, setSearch]   = useState('');
  const [fBh, setFBh]         = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [collapsedBhs, setCollapsedBhs] = useState<Set<string>>(new Set());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [sortKey, setSortKey] = useState<string>('row_total');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const isToday = selDate === todayISO();

  const fetchData = (d = selDate) => {
    setLoading(true);
    setError('');
    api.get<BHHourlyResponse>('/coo/bh-hourly', { params: { date: d } })
      .then(r => { setData(r.data); setLastRefreshed(new Date()); })
      .catch(e => {
        const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        setError(msg || 'Failed to load BH hourly tracker.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Live auto-refresh every 60 seconds when viewing today
  useEffect(() => {
    if (!autoRefresh || !isToday) return;
    const t = setInterval(() => fetchData(selDate), 60_000);
    return () => clearInterval(t);
  }, [autoRefresh, isToday, selDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDateChange = (val: string) => { setSelDate(val); fetchData(val); };

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const toggleExpand = (rowKey: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey); else next.add(rowKey);
      return next;
    });
  };

  const expandAll = () => {
    if (!data) return;
    setExpanded(new Set(filteredRows.map(r => `${r.bh_name}|${r.client_name}`)));
  };
  const collapseAll = () => setExpanded(new Set());

  const toggleBhCollapse = (bhName: string) => {
    setCollapsedBhs(prev => {
      const next = new Set(prev);
      if (next.has(bhName)) next.delete(bhName); else next.add(bhName);
      return next;
    });
  };
  const collapseAllBhs = () => setCollapsedBhs(new Set(bhGroups.map(g => g.bh_name)));
  const expandAllBhs   = () => setCollapsedBhs(new Set());

  const bhOptions = useMemo(
    () => uniq((data?.rows ?? []).map(r => r.bh_name || 'Unmapped').sort()),
    [data],
  );

  const filteredRows = useMemo(() => {
    if (!data) return [];
    let rows = data.rows;
    if (fBh.size) rows = rows.filter(r => fBh.has(r.bh_name || 'Unmapped'));
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        r.client_name.toLowerCase().includes(q)
        || (r.bh_name || '').toLowerCase().includes(q),
      );
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
        if (sortKey === 'row_total') {
          return sortDir === 'desc' ? b.row_total - a.row_total : a.row_total - b.row_total;
        }
        const av = a.totals[sortKey] ?? 0;
        const bv = b.totals[sortKey] ?? 0;
        return sortDir === 'desc' ? bv - av : av - bv;
      });
    }
    return rows;
  }, [data, fBh, search, sortKey, sortDir]);

  const metrics = useMemo(() => data?.metrics ?? [], [data]);
  const hours   = useMemo(() => data?.hours   ?? [], [data]);

  // Column-level totals across filtered rows (matches what's on screen)
  const filteredTotals = useMemo(() => {
    const t: HourlyTotals = {};
    for (const m of metrics) t[m.key] = filteredRows.reduce((s, r) => s + (r.totals[m.key] ?? 0), 0);
    return t;
  }, [filteredRows, metrics]);
  const filteredGrandTotal = useMemo(
    () => Object.values(filteredTotals).reduce((s, v) => s + v, 0),
    [filteredTotals],
  );

  // Hourly column totals (used in expanded view header strip)
  const hourlyColumnTotals = useMemo(() => {
    const out: Record<string, HourlyTotals> = {};
    for (const h of hours) {
      const hT: HourlyTotals = {};
      for (const m of metrics) {
        hT[m.key] = filteredRows.reduce(
          (s, r) => s + (r.hourly?.[h.key]?.[m.key] ?? 0),
          0,
        );
      }
      out[h.key] = hT;
    }
    return out;
  }, [filteredRows, hours, metrics]);

  // BH groupings — aggregate clients + per-hour rollups for each BH.
  // Sort BH groups by descending row_total so the busiest BH shows first.
  // Inside each group, clients respect the active sort.
  interface BHGroup {
    bh_name:   string;
    clients:   BHHourlyRow[];
    totals:    HourlyTotals;
    row_total: number;
    hourly:    Record<string, HourlyTotals>;
  }
  const bhGroups = useMemo<BHGroup[]>(() => {
    const map = new Map<string, BHGroup>();
    for (const r of filteredRows) {
      let g = map.get(r.bh_name);
      if (!g) {
        g = {
          bh_name:   r.bh_name,
          clients:   [],
          totals:    Object.fromEntries(metrics.map(m => [m.key, 0])),
          row_total: 0,
          hourly:    {},
        };
        map.set(r.bh_name, g);
      }
      g.clients.push(r);
      for (const m of metrics) {
        g.totals[m.key] = (g.totals[m.key] ?? 0) + (r.totals[m.key] ?? 0);
      }
      g.row_total += r.row_total;
      for (const [hKey, hCnts] of Object.entries(r.hourly)) {
        const dest = (g.hourly[hKey] = g.hourly[hKey] ?? Object.fromEntries(metrics.map(m => [m.key, 0])));
        for (const m of metrics) {
          dest[m.key] = (dest[m.key] ?? 0) + (hCnts[m.key] ?? 0);
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.row_total - a.row_total);
  }, [filteredRows, metrics]);

  // Per-BH totals across ALL rows (ignores BH filter) — used by chip strip
  // so a user always sees every BH's daily total even after clicking one.
  const bhChipTotals = useMemo(() => {
    const map = new Map<string, number>();
    if (!data) return map;
    for (const r of data.rows) {
      map.set(r.bh_name, (map.get(r.bh_name) ?? 0) + r.row_total);
    }
    return map;
  }, [data]);
  const bhChipList = useMemo(
    () => Array.from(bhChipTotals.entries()).sort((a, b) => b[1] - a[1]),
    [bhChipTotals],
  );

  const dayLabel = isToday ? 'Today' : fmtDate(selDate);
  const totalCols = 3 + metrics.length + 1; // BH + Client + caret + N metrics + row total

  // Subtle "live" pulse for the today indicator
  const livePulse = isToday && autoRefresh;

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
          BH Hourly Tracker
          <span className="text-slate-400 font-normal text-sm">— {dayLabel}</span>
          {livePulse && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-[10px] font-semibold text-rose-700">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500" />
              </span>
              LIVE
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          {lastRefreshed && (
            <span className="text-[11px] text-slate-400">
              Updated {lastRefreshed.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
            </span>
          )}
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
          {isToday && (
            <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 cursor-pointer hover:bg-slate-50">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={e => setAutoRefresh(e.target.checked)}
                className="h-3 w-3 cursor-pointer"
              />
              Auto-refresh
            </label>
          )}
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
            placeholder="Search BH / client…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-7 pr-2.5 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-blue-400 w-52 bg-white"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={expandAllBhs}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-100 bg-white"
            title="Expand all BH groups"
          >
            <ChevronDown size={11} /> Open BHs
          </button>
          <button
            onClick={collapseAllBhs}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-100 bg-white"
            title="Collapse all BH groups"
          >
            <ChevronUp size={11} /> Close BHs
          </button>
          <div className="w-px h-5 bg-slate-200 mx-0.5" />
          <button
            onClick={expandAll}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-100 bg-white"
            title="Expand hourly view for every client"
          >
            <ChevronDown size={11} /> Expand hourly
          </button>
          <button
            onClick={collapseAll}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-100 bg-white"
          >
            <ChevronUp size={11} /> Collapse hourly
          </button>
          {(fBh.size > 0 || search) && (
            <button
              onClick={() => { setFBh(new Set()); setSearch(''); }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-50 border border-red-100 text-red-600 text-xs font-semibold hover:bg-red-100"
            >
              <X size={11} /> Clear
            </button>
          )}
        </div>
      </div>

      {/* ── BH quick-filter chips: click to toggle filter ── */}
      {bhChipList.length > 0 && (
        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mr-1">BH:</span>
          <button
            onClick={() => setFBh(new Set())}
            className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
              fBh.size === 0
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            All ({data?.rows.length ?? 0})
          </button>
          {bhChipList.map(([bhName, total]) => {
            const isActive = fBh.has(bhName);
            return (
              <button
                key={bhName}
                onClick={() => {
                  setFBh(prev => {
                    const next = new Set(prev);
                    if (next.has(bhName)) next.delete(bhName); else next.add(bhName);
                    return next;
                  });
                }}
                className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50'
                }`}
                title={`${bhName} — ${total} pipeline events`}
              >
                <span className="truncate max-w-[160px]">{bhName}</span>
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                    isActive ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-700'
                  }`}
                >
                  {total}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── KPI strip — quick totals across the filtered view ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-3">
        {metrics.map(m => {
          const p = METRIC_PAL[m.key] ?? { hdr: '#475569', cell: '#F1F5F9', ink: '#334155' };
          return (
            <div
              key={m.key}
              className="rounded-xl px-3 py-2.5 border"
              style={{ background: p.cell, borderColor: p.hdr + '33' }}
            >
              <div className="text-[10px] uppercase tracking-wide font-bold" style={{ color: p.hdr }}>
                {m.label}
              </div>
              <div className="text-2xl font-black mt-0.5" style={{ color: p.ink }}>
                {filteredTotals[m.key] ?? 0}
              </div>
            </div>
          );
        })}
        <div className="rounded-xl px-3 py-2.5 border bg-slate-900 border-slate-900 text-white">
          <div className="text-[10px] uppercase tracking-wide font-bold text-slate-300">Total Events</div>
          <div className="text-2xl font-black mt-0.5">{filteredGrandTotal}</div>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-medium">{error}</div>
      )}

      {/* ── Main table ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm" style={{ minWidth: 920 }}>
            {loading && !data ? (
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
                    <th className="py-3 px-3" style={{ background: '#0F172A', width: 32 }} />
                    <th className="text-left py-3 px-3 text-xs font-bold text-white whitespace-nowrap cursor-pointer select-none border-r border-indigo-700"
                      style={{ background: '#3730A3', minWidth: 150 }}
                      onClick={() => handleSort('bh')}>
                      <span className="flex items-center gap-1">BH <SortIcon active={sortKey === 'bh'} dir={sortDir} /></span>
                    </th>
                    <th className="text-left py-3 px-3 text-xs font-bold text-white whitespace-nowrap cursor-pointer select-none border-r border-green-700"
                      style={{ background: '#15803D', minWidth: 170 }}
                      onClick={() => handleSort('client')}>
                      <span className="flex items-center gap-1">Client Name <SortIcon active={sortKey === 'client'} dir={sortDir} /></span>
                    </th>
                    {metrics.map(m => {
                      const p = METRIC_PAL[m.key] ?? { hdr: '#475569', cell: '#F1F5F9', ink: '#334155' };
                      return (
                        <th key={m.key}
                          className="text-center py-2 px-2 text-[10px] font-bold border-r border-white/30 whitespace-nowrap cursor-pointer select-none"
                          style={{ background: p.hdr, color: '#fff', minWidth: 100 }}
                          onClick={() => handleSort(m.key)}>
                          <span className="flex items-center justify-center gap-1">
                            {m.label} <SortIcon active={sortKey === m.key} dir={sortDir} />
                          </span>
                        </th>
                      );
                    })}
                    <th
                      className="text-center py-2 px-2 text-[10px] font-bold whitespace-nowrap cursor-pointer select-none text-white"
                      style={{ background: '#0F172A', minWidth: 90 }}
                      onClick={() => handleSort('row_total')}
                    >
                      <span className="flex items-center justify-center gap-1">
                        Day Total <SortIcon active={sortKey === 'row_total'} dir={sortDir} />
                      </span>
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {bhGroups.length === 0 ? (
                    <tr>
                      <td colSpan={totalCols} className="py-14 text-center text-sm text-slate-400">
                        {search || fBh.size ? 'No matches found.' : 'No pipeline events for this day yet.'}
                      </td>
                    </tr>
                  ) : (
                    <>
                      {bhGroups.flatMap((group) => {
                        const bhCollapsed = collapsedBhs.has(group.bh_name);
                        // Inside-group client sort follows the active table sort
                        const clients = [...group.clients].sort((a, b) => {
                          if (sortKey === 'client') {
                            const cmp = a.client_name.localeCompare(b.client_name);
                            return sortDir === 'desc' ? -cmp : cmp;
                          }
                          if (sortKey === 'bh') {
                            return 0; // already grouped by BH
                          }
                          if (sortKey === 'row_total') {
                            return sortDir === 'desc' ? b.row_total - a.row_total : a.row_total - b.row_total;
                          }
                          const av = a.totals[sortKey] ?? 0;
                          const bv = b.totals[sortKey] ?? 0;
                          return sortDir === 'desc' ? bv - av : av - bv;
                        });

                        const nodes: React.ReactNode[] = [];

                        // ── BH group header row ──
                        nodes.push(
                          <tr
                            key={`bhg-${group.bh_name}`}
                            onClick={() => toggleBhCollapse(group.bh_name)}
                            className="cursor-pointer border-t-2 border-indigo-300 hover:brightness-95 transition-all"
                            style={{ background: 'linear-gradient(90deg, #312E81 0%, #4338CA 100%)' }}
                          >
                            <td className="text-center py-2 px-2">
                              {bhCollapsed
                                ? <ChevronRight size={14} className="text-white mx-auto" />
                                : <ChevronDown  size={14} className="text-white mx-auto" />}
                            </td>
                            <td colSpan={2} className="py-2 px-3 text-xs font-bold text-white whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <span className="uppercase tracking-wide text-[11px]">{group.bh_name}</span>
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white/20 text-white">
                                  {group.clients.length} client{group.clients.length === 1 ? '' : 's'}
                                </span>
                              </div>
                            </td>
                            {metrics.map(m => {
                              const v = group.totals[m.key] ?? 0;
                              const p = METRIC_PAL[m.key] ?? { hdr: '#475569', cell: '#F1F5F9', ink: '#334155' };
                              return (
                                <td
                                  key={m.key}
                                  className="text-center text-xs font-black py-2 px-2"
                                  style={{
                                    background: v ? p.hdr : 'rgba(255,255,255,0.06)',
                                    color:      v ? '#fff' : 'rgba(255,255,255,0.5)',
                                  }}
                                >
                                  {v || '—'}
                                </td>
                              );
                            })}
                            <td
                              className="text-center text-xs font-black py-2 px-2 text-white"
                              style={{ background: '#0F172A' }}
                            >
                              {group.row_total || '—'}
                            </td>
                          </tr>,
                        );

                        // ── Client rows under this BH group (hidden when collapsed) ──
                        if (!bhCollapsed) {
                          clients.forEach((row, ri) => {
                            const rowKey = `${row.bh_name}|${row.client_name}`;
                            const isExpanded = expanded.has(rowKey);
                            nodes.push(
                              <tr
                                key={rowKey}
                                className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors cursor-pointer"
                                onClick={() => toggleExpand(rowKey)}
                              >
                                <td className="text-center py-2.5 px-2 border-r border-slate-100 bg-slate-50">
                                  {isExpanded
                                    ? <ChevronDown size={14} className="text-slate-500 mx-auto" />
                                    : <ChevronRight size={14} className="text-slate-400 mx-auto" />}
                                </td>
                                <td
                                  className="py-2.5 px-3 text-xs font-medium border-r border-indigo-100 whitespace-nowrap align-top"
                                  style={{ color: '#6366F1', background: ri % 2 === 0 ? '#EEF2FF' : '#E0E7FF' }}
                                >
                                  <span className="text-indigo-300 mr-1">└</span>
                                  <span className="text-indigo-400/80 text-[10px]">{group.bh_name}</span>
                                </td>
                                <td
                                  className="py-2.5 px-3 text-xs font-semibold border-r border-slate-200 whitespace-nowrap"
                                  style={{ color: '#15803D', background: ri % 2 === 0 ? '#F0FDF4' : '#ECFDF5' }}
                                >
                                  {row.client_name}
                                </td>
                                {metrics.map(m => {
                                  const v = row.totals[m.key] ?? 0;
                                  const p = METRIC_PAL[m.key] ?? { hdr: '#475569', cell: '#F1F5F9', ink: '#334155' };
                                  return (
                                    <td key={m.key}
                                      className="text-center text-xs font-bold py-2.5 px-2 border-r border-slate-100"
                                      style={{ background: v ? p.cell : undefined }}>
                                      {v ? <span style={{ color: p.ink }}>{v}</span> : <span className="text-slate-300">—</span>}
                                    </td>
                                  );
                                })}
                                <td
                                  className="text-center text-xs font-black py-2.5 px-2"
                                  style={{ background: row.row_total > 0 ? '#0F172A' : '#F8FAFC', color: row.row_total > 0 ? '#fff' : '#94A3B8' }}
                                >
                                  {row.row_total || '—'}
                                </td>
                              </tr>,
                            );

                            // ── Per-client hourly breakdown ──
                            if (isExpanded) {
                              nodes.push(
                                <tr key={`${rowKey}-hourly`}>
                                  <td colSpan={totalCols} className="p-0">
                                    <HourlyBreakdownCard
                                      bhName={row.bh_name}
                                      clientName={row.client_name}
                                      totals={row.totals}
                                      hourly={row.hourly}
                                      hours={hours}
                                      metrics={metrics}
                                      rowTotal={row.row_total}
                                    />
                                  </td>
                                </tr>,
                              );
                            }
                          });

                          // ── BH subtotal row (closes the group) ──
                          nodes.push(
                            <tr key={`bhsub-${group.bh_name}`} className="border-t border-indigo-200">
                              <td className="py-2 px-2 bg-indigo-50" />
                              <td colSpan={2} className="py-2 px-3 text-[11px] font-bold text-indigo-900 whitespace-nowrap bg-indigo-50">
                                Subtotal — {group.bh_name}
                              </td>
                              {metrics.map(m => {
                                const v = group.totals[m.key] ?? 0;
                                const p = METRIC_PAL[m.key] ?? { hdr: '#475569', cell: '#F1F5F9', ink: '#334155' };
                                return (
                                  <td
                                    key={m.key}
                                    className="text-center text-xs font-black py-2 px-2 border-r border-indigo-100"
                                    style={{ background: '#EEF2FF', color: v ? p.ink : '#94A3B8' }}
                                  >
                                    {v || '—'}
                                  </td>
                                );
                              })}
                              <td className="text-center text-xs font-black py-2 px-2"
                                style={{ background: '#312E81', color: '#fff' }}>
                                {group.row_total || '—'}
                              </td>
                            </tr>,
                          );
                        }

                        return nodes;
                      })}

                      {/* ── Footer: filtered totals ── */}
                      <tr className="border-t-2 border-slate-300">
                        <td className="py-3 px-2 text-center text-[10px] font-bold text-white" style={{ background: '#0F172A' }}>Σ</td>
                        <td colSpan={2} className="py-3 px-3 text-xs font-black border-r border-slate-200 whitespace-nowrap" style={{ color: '#15803D', background: '#D1FAE5' }}>
                          TOTAL&nbsp;({filteredRows.length} client{filteredRows.length === 1 ? '' : 's'})
                        </td>
                        {metrics.map(m => {
                          const v = filteredTotals[m.key] ?? 0;
                          const p = METRIC_PAL[m.key] ?? { hdr: '#475569', cell: '#F1F5F9', ink: '#334155' };
                          return (
                            <td key={m.key} className="text-center text-xs font-black py-3 px-2 border-r border-slate-200"
                              style={{ color: p.ink, background: p.cell }}>
                              {v || '—'}
                            </td>
                          );
                        })}
                        <td className="text-center text-xs font-black py-3 px-2 text-white" style={{ background: '#0F172A' }}>
                          {filteredGrandTotal || '—'}
                        </td>
                      </tr>
                    </>
                  )}
                </tbody>
              </>
            )}
          </table>
        </div>
      </div>

      {/* ── Aggregated hourly trend across whole view ── */}
      {!loading && filteredRows.length > 0 && (
        <div className="mt-4 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-600">Hourly trend — all clients</div>
            <span className="text-[11px] text-slate-400">
              {fBh.size > 0 || search
                ? `Aggregated across ${filteredRows.length} matching client${filteredRows.length === 1 ? '' : 's'}`
                : `Aggregated across ${filteredRows.length} clients`}
            </span>
          </div>
          <HourlyBreakdownCard
            bhName={fBh.size === 1 ? Array.from(fBh)[0] : 'All BHs'}
            clientName={fBh.size === 0 && !search ? 'All clients' : `${filteredRows.length} client${filteredRows.length === 1 ? '' : 's'}`}
            totals={filteredTotals}
            hourly={hourlyColumnTotals}
            hours={hours}
            metrics={metrics}
            rowTotal={filteredGrandTotal}
          />
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Page — internal tabs, BH/Client tab loads only when first opened
// ════════════════════════════════════════════════════════════════════════════

type LbTab = 'recruiter' | 'pipeline' | 'bh-hourly' | 'bh-targets' | 'bh-companies';

const BH_TARGETS_ROLES = new Set(['coo', 'admin', 'kam']);

const TABS: { key: LbTab; label: string }[] = [
  { key: 'recruiter',    label: 'Recruiter Dashboard' },
  { key: 'pipeline',     label: 'Client Pipeline' },
  { key: 'bh-hourly',    label: 'BH Hourly Tracker' },
  { key: 'bh-targets',   label: 'BH Target Tracking' },
  { key: 'bh-companies', label: 'BH × Companies' },
];

export default function Leaderboard() {
  const { user } = useAuth();
  const canSeeBhTargets = BH_TARGETS_ROLES.has(user?.role ?? '');

  const visibleTabs = canSeeBhTargets ? TABS : TABS.filter(t => t.key !== 'bh-targets');

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
          {visibleTabs.map(t => {
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

      {/* BH Hourly Tracker — live hourly OL pipeline events */}
      <div style={{ display: tab === 'bh-hourly' ? 'block' : 'none' }}>
        {visited.has('bh-hourly') && <BHHourlyTrackerSection />}
      </div>

      {/* BH Target Tracking — visible to coo, admin, kam only */}
      {canSeeBhTargets && (
        <div style={{ display: tab === 'bh-targets' ? 'block' : 'none' }}>
          {visited.has('bh-targets') && <BHTargetsSection />}
        </div>
      )}

      {/* BH × Companies — Postgres jobs roll-up */}
      <div style={{ display: tab === 'bh-companies' ? 'block' : 'none' }}>
        {visited.has('bh-companies') && <BHCompaniesSection />}
      </div>
    </Layout>
  );
}
