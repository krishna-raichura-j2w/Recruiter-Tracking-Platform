import { useEffect, useState, useMemo, useRef } from 'react';
import { useSignal } from '../context/RealtimeContext';
import { X, Clock, Search, SlidersHorizontal, Phone, Users, CalendarClock, CalendarDays, ChevronDown } from 'lucide-react';
import Layout from '../components/Layout';
import api from '../api/client';
import type { OverallInterview } from '../types';

// ── Types ──────────────────────────────────────────────────────────────────────

interface TimelineEntry {
  id: number;
  stage: string;
  stage_label: string;
  interview_date: string | null;
  feedback: string | null;
  note: string | null;
  updated_by: string | null;
  created_at: string | null;
}

interface Sub {
  id: number;
  candidate_name: string | null;
  candidate_mobile: string | null;
  client_name: string | null;
  job_title: string | null;
  current_stage: string;
  submitted_at: string | null;
  updated_at: string | null;
  ta_feedback: string | null;
  hm_feedback: string | null;
  tat_window: string | null;
  l1_date: string | null;
  l1_feedback: string | null;
  l1_briefing_done: boolean;
  l2_date: string | null;
  l2_feedback: string | null;
  l2_briefing_done: boolean;
  final_date: string | null;
  final_feedback: string | null;
  final_briefing_done: boolean;
  offered_ctc: number | null;
  offer_date: string | null;
  joining_date_confirmed: string | null;
  actual_joining_date: string | null;
  other_offers_count: string | null;
  counter_offer_risk: string | null;
  last_notes: string | null;
  next_action: string | null;
  next_action_date: string | null;
  timeline: TimelineEntry[];
}

// ── Stage config ───────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  submitted:              'Submitted to Client',
  ta_review:              'TA Screening',
  ta_rejected:            'TA Rejected',
  hm_review:              'HM Screening',
  hm_rejected:            'HM Rejected',
  shortlisted:            'Shortlisted',
  l1_scheduled:           'L1 Scheduled',
  l1_feedback_pending:    'L1 Feedback Pending',
  l1_cleared:             'L1 Cleared',
  l1_rejected:            'L1 Rejected',
  l2_scheduled:           'L2 Scheduled',
  l2_feedback_pending:    'L2 Feedback Pending',
  l2_cleared:             'L2 Cleared',
  l2_rejected:            'L2 Rejected',
  final_scheduled:        'Final Scheduled',
  final_feedback_pending: 'Final Feedback Pending',
  final_cleared:          'Final Cleared',
  final_rejected:         'Final Rejected',
  offer_rolled_out:       'Offer Rolled Out',
  offer_accepted:         'Offer Accepted',
  offer_declined:         'Offer Declined',
  joined:                 'Joined',
  no_show:                'No Show / Backed Out',
};

const STAGE_COLORS: Record<string, string> = {
  submitted:              'bg-blue-100 text-blue-700',
  ta_review:              'bg-sky-100 text-sky-700',
  ta_rejected:            'bg-red-100 text-red-600',
  hm_review:              'bg-indigo-100 text-indigo-700',
  hm_rejected:            'bg-red-100 text-red-600',
  shortlisted:            'bg-violet-100 text-violet-700',
  l1_scheduled:           'bg-purple-100 text-purple-700',
  l1_feedback_pending:    'bg-amber-100 text-amber-700',
  l1_cleared:             'bg-teal-100 text-teal-700',
  l1_rejected:            'bg-red-100 text-red-600',
  l2_scheduled:           'bg-purple-100 text-purple-700',
  l2_feedback_pending:    'bg-amber-100 text-amber-700',
  l2_cleared:             'bg-teal-100 text-teal-700',
  l2_rejected:            'bg-red-100 text-red-600',
  final_scheduled:        'bg-fuchsia-100 text-fuchsia-700',
  final_feedback_pending: 'bg-amber-100 text-amber-700',
  final_cleared:          'bg-green-100 text-green-700',
  final_rejected:         'bg-red-100 text-red-600',
  offer_rolled_out:       'bg-emerald-100 text-emerald-700',
  offer_accepted:         'bg-green-100 text-green-700',
  offer_declined:         'bg-slate-100 text-slate-500',
  joined:                 'bg-green-200 text-green-800',
  no_show:                'bg-slate-100 text-slate-500',
};

const STAGE_GROUPS = [
  { label: 'Client Screening', stages: ['submitted','ta_review','ta_rejected','hm_review','hm_rejected','shortlisted'] },
  { label: 'L1 Round',         stages: ['l1_scheduled','l1_feedback_pending','l1_cleared','l1_rejected'] },
  { label: 'L2 Round',         stages: ['l2_scheduled','l2_feedback_pending','l2_cleared','l2_rejected'] },
  { label: 'Final Round',      stages: ['final_scheduled','final_feedback_pending','final_cleared','final_rejected'] },
  { label: 'Offer & Joining',  stages: ['offer_rolled_out','offer_accepted','offer_declined','joined','no_show'] },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
}

function fmtDateTime(d: string | null) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
}

function stageDotColor(stage: string): string {
  if (stage.includes('rejected') || stage === 'no_show' || stage === 'offer_declined') return 'bg-red-400';
  if (stage === 'joined' || stage === 'offer_accepted') return 'bg-green-500';
  if (stage.includes('cleared') || stage === 'offer_rolled_out' || stage === 'shortlisted') return 'bg-teal-400';
  if (stage.includes('pending') || stage.includes('review')) return 'bg-amber-400';
  return 'bg-blue-400';
}

function stageGroup(stage: string): string {
  return STAGE_GROUPS.find(g => g.stages.includes(stage))?.label ?? '';
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StageBadge({ stage }: { stage: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${STAGE_COLORS[stage] ?? 'bg-slate-100 text-slate-600'}`}>
      {STAGE_LABELS[stage] ?? stage}
    </span>
  );
}

// Keyword-based colour for the OL "workflow_step" label (free-text from the OL DB,
// not the MRR stage enum), so the Overall tab gets sensible badge colours too.
function olStepColor(step: string | null): string {
  const s = (step ?? '').toLowerCase();
  if (s.includes('join'))                                   return 'bg-green-200 text-green-800';
  if (s.includes('offer'))                                  return 'bg-emerald-100 text-emerald-700';
  if (s.includes('reject') || s.includes('fail') || s.includes('drop')) return 'bg-red-100 text-red-600';
  if (s.includes('clear') || s.includes('pass') || s.includes('select')) return 'bg-teal-100 text-teal-700';
  if (s.includes('pending'))                                return 'bg-amber-100 text-amber-700';
  if (s.includes('schedul') || s.includes('interview'))     return 'bg-purple-100 text-purple-700';
  return 'bg-slate-100 text-slate-600';
}

function OlStepBadge({ step }: { step: string | null }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${olStepColor(step)}`}>
      {step || '—'}
    </span>
  );
}

// Single-select dropdown with a built-in search box (used for the Client filter).
function SearchableSelect({ value, options, placeholder, onChange }: {
  value: string;
  options: string[];
  placeholder: string;
  onChange: (v: string) => void;
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
    () => (q.trim() ? options.filter(o => o.toLowerCase().includes(q.trim().toLowerCase())) : options),
    [q, options]);

  const select = (v: string) => { onChange(v); setOpen(false); setQ(''); };

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white flex items-center justify-between gap-1.5 min-w-40 max-w-44"
      >
        <span className={`truncate ${value ? 'text-slate-700 font-medium' : 'text-slate-500'}`}>{value || placeholder}</span>
        <ChevronDown size={12} className={`flex-shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-30 mt-1.5 left-0 w-60 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <div className="relative">
              <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                type="text"
                placeholder="Search client…"
                value={q}
                onChange={e => setQ(e.target.value)}
                className="w-full pl-7 pr-2 py-1.5 rounded-md text-xs bg-slate-50 border border-transparent focus:border-slate-200 focus:outline-none"
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            <button
              onClick={() => select('')}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 ${!value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600'}`}
            >
              {placeholder}
            </button>
            {filtered.length === 0 ? (
              <p className="text-center text-xs py-4 text-slate-400">No matches.</p>
            ) : filtered.map(o => (
              <button
                key={o}
                onClick={() => select(o)}
                className={`w-full text-left px-3 py-1.5 text-xs truncate hover:bg-slate-50 ${value === o ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700'}`}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// YYYY-MM-DD in local time, for the date-window <input type="date"> defaults.
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// "HH:MM" (24h) -> "h:MM AM/PM" for the interview slot chip.
function fmtTime12(t: string | null): string {
  if (!t) return '—';
  const [hStr, m] = t.split(':');
  let h = parseInt(hStr, 10);
  if (isNaN(h)) return t;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${m ?? '00'} ${ampm}`;
}

// Time-of-day slabs for the Today filter chips. start/end are 24h hours; range is [start, end).
const SLABS: { key: string; label: string; start: number; end: number }[] = [
  { key: '6-9',   label: '6–9 AM',     start: 6,  end: 9  },
  { key: '9-12',  label: '9 AM–12 PM', start: 9,  end: 12 },
  { key: '12-15', label: '12–3 PM',    start: 12, end: 15 },
  { key: '15-18', label: '3–6 PM',     start: 15, end: 18 },
  { key: '18-21', label: '6–9 PM',     start: 18, end: 21 },
  { key: '21-24', label: '9 PM–12 AM', start: 21, end: 24 },
];

// Integer hour parsed from a 24h "HH:MM" interview_time (null if missing/unparseable).
function slotHour(t: string | null): number | null {
  if (!t) return null;
  const h = parseInt(t.split(':')[0], 10);
  return isNaN(h) ? null : h;
}

function inSlab(t: string | null, slabKey: string): boolean {
  if (slabKey === 'all') return true;
  const s = SLABS.find(x => x.key === slabKey);
  const h = slotHour(t);
  return !!s && h != null && h >= s.start && h < s.end;
}

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex-1 border-t border-slate-100" />
      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</span>
      <span className="flex-1 border-t border-slate-100" />
    </div>
  );
}

function ReadField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-400 mb-0.5">{label}</p>
      <p className="text-sm text-slate-700 font-medium">{value || '—'}</p>
    </div>
  );
}

function Timeline({ entries }: { entries: TimelineEntry[] }) {
  if (!entries || entries.length === 0) {
    return <p className="text-xs text-slate-400 italic">No history yet.</p>;
  }
  return (
    <div className="space-y-0 max-h-56 overflow-y-auto pr-1">
      {entries.map((entry, i) => (
        <div key={entry.id} className="flex gap-2.5">
          <div className="flex flex-col items-center pt-0.5">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${stageDotColor(entry.stage)}`} />
            {i < entries.length - 1 && (
              <div className="w-px flex-1 bg-slate-100 mt-1 mb-1 min-h-[10px]" />
            )}
          </div>
          <div className={`flex-1 min-w-0 ${i < entries.length - 1 ? 'pb-2' : ''}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-700">{entry.stage_label}</span>
              <span className="text-slate-400 whitespace-nowrap flex-shrink-0" style={{ fontSize: '10px' }}>
                {fmtDateTime(entry.created_at)}
              </span>
            </div>
            {entry.interview_date && (
              <p className="text-slate-500 mt-0.5" style={{ fontSize: '10px' }}>
                Interview: {fmtDate(entry.interview_date)}
              </p>
            )}
            {entry.feedback && (
              <p className="text-slate-500 mt-0.5" style={{ fontSize: '10px' }}>
                Feedback: <span className="font-medium">{entry.feedback}</span>
              </p>
            )}
            {entry.note && (
              <p className="text-slate-400 italic mt-0.5 truncate" style={{ fontSize: '10px' }}>{entry.note}</p>
            )}
            {entry.updated_by && (
              <p className="text-slate-300 mt-0.5" style={{ fontSize: '10px' }}>by {entry.updated_by}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Day-grouping helpers ───────────────────────────────────────────────────────

function dayLabel(iso: string | null | undefined): string {
  if (!iso) return 'Unknown Date';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Unknown Date';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const item = new Date(d); item.setHours(0, 0, 0, 0);
  const diff = Math.round((item.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function groupByDay<T>(items: T[], getDate: (item: T) => string | null | undefined): Array<{ label: string; items: T[] }> {
  const groups: { label: string; items: T[] }[] = [];
  const seen = new Map<string, number>();
  for (const item of items) {
    const label = dayLabel(getDate(item));
    if (!seen.has(label)) { seen.set(label, groups.length); groups.push({ label, items: [] }); }
    groups[seen.get(label)!].items.push(item);
  }
  return groups;
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function Pipeline() {
  const [active, setActive]       = useState<Sub[]>([]);
  const [closed, setClosed]       = useState<Sub[]>([]);
  const [tab, setTab]             = useState<'overall' | 'active' | 'closed'>('overall');
  const [loading, setLoading]     = useState(true);
  const [overlay, setOverlay]     = useState<Sub | null>(null);

  // ── Overall tab (org-wide interviews from the OL replica) ───────────────────
  const [overall, setOverall]         = useState<OverallInterview[]>([]);
  const [overallLoading, setOverallLoading] = useState(true);
  const [bucket, setBucket]           = useState<'all' | 'today' | 'tomorrow' | 'week'>('all');
  const [slab, setSlab]               = useState<string>('all'); // time-of-day filter for the Today group
  const [clientFilter, setClientFilter] = useState<string>('');  // Client (company) filter ('' = all)
  const defaultWindow = useMemo(() => {
    const from = new Date();
    const to   = new Date(); to.setDate(to.getDate() + 60);
    return { from: isoDate(from), to: isoDate(to) };
  }, []);
  const [olFromDate, setOlFromDate] = useState(defaultWindow.from);
  const [olToDate,   setOlToDate]   = useState(defaultWindow.to);

  // ── Filter state ──────────────────────────────────────────────────────────
  const [search,         setSearch]         = useState('');
  const [filterCompany,  setFilterCompany]  = useState('');
  const [filterJob,      setFilterJob]      = useState('');
  const [filterGroup,    setFilterGroup]    = useState('');
  const [filterStage,    setFilterStage]    = useState('');
  const [filterAction,   setFilterAction]   = useState('');
  const [filterFromDate, setFilterFromDate] = useState('');
  const [filterToDate,   setFilterToDate]   = useState('');
  const [showFilters,    setShowFilters]    = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [a, c] = await Promise.all([
        api.get('/submissions', { params: { closed: false, limit: 500 } }).catch(() => ({ data: { items: [] } })),
        api.get('/submissions', { params: { closed: true,  limit: 500 } }).catch(() => ({ data: { items: [] } })),
      ]);
      const extract = (d: unknown): Sub[] => {
        if (Array.isArray(d)) return d as Sub[];
        return ((d as { items?: Sub[] })?.items ?? []) as Sub[];
      };
      setActive(extract(a.data));
      setClosed(extract(c.data));
    } finally {
      setLoading(false);
    }
  };

  const pipelineSignal = useSignal('pipeline');
  useEffect(() => { fetchData(); }, [pipelineSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch the Overall (OL replica) interviews whenever the date window changes.
  useEffect(() => {
    let cancelled = false;
    setOverallLoading(true);
    api.get('/ol-lookup/interview-tracking', { params: { from_date: olFromDate, to_date: olToDate } })
      .then(r => { if (!cancelled) setOverall(Array.isArray(r.data) ? r.data as OverallInterview[] : []); })
      .catch(() => { if (!cancelled) setOverall([]); })
      .finally(() => { if (!cancelled) setOverallLoading(false); });
    return () => { cancelled = true; };
  }, [olFromDate, olToDate]);

  const baseList = tab === 'closed' ? closed : active;

  // ── Derived dropdown options ───────────────────────────────────────────────
  const companies = useMemo(() =>
    [...new Set(baseList.map(s => s.client_name).filter(Boolean))].sort() as string[],
    [baseList]);

  const jobTitles = useMemo(() =>
    [...new Set(
      baseList
        .filter(s => !filterCompany || s.client_name === filterCompany)
        .map(s => s.job_title)
        .filter(Boolean)
    )].sort() as string[],
    [baseList, filterCompany]);

  const availableStages = useMemo(() => {
    const grouped = filterGroup
      ? STAGE_GROUPS.find(g => g.label === filterGroup)?.stages ?? []
      : Object.keys(STAGE_LABELS);
    return grouped.filter(s => baseList.some(sub => sub.current_stage === s));
  }, [baseList, filterGroup]);

  // ── Filtered list ──────────────────────────────────────────────────────────
  const list = useMemo(() => {
    const today     = new Date(); today.setHours(0, 0, 0, 0);
    const weekEnd   = new Date(today); weekEnd.setDate(today.getDate() + 7);
    const fromDt = filterFromDate ? new Date(filterFromDate + 'T00:00:00') : null;
    const toDt   = filterToDate   ? new Date(filterToDate   + 'T23:59:59') : null;
    return baseList.filter(s => {
      if (search) {
        const q = search.toLowerCase();
        const hay = `${s.candidate_name ?? ''} ${s.client_name ?? ''} ${s.job_title ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filterCompany && s.client_name !== filterCompany) return false;
      if (filterJob    && s.job_title !== filterJob) return false;
      if (filterGroup) {
        const stagesInGroup = STAGE_GROUPS.find(g => g.label === filterGroup)?.stages ?? [];
        if (!stagesInGroup.includes(s.current_stage)) return false;
      }
      if (filterStage  && s.current_stage !== filterStage) return false;
      if (filterAction) {
        const d = s.next_action_date ? new Date(s.next_action_date) : null;
        if (filterAction === 'overdue')    { if (!d || d >= today)    return false; }
        if (filterAction === 'today')      { if (!d || d < today || d >= new Date(today.getTime() + 86400000)) return false; }
        if (filterAction === 'this_week')  { if (!d || d < today || d > weekEnd) return false; }
        if (filterAction === 'no_action')  { if (s.next_action_date) return false; }
      }
      if (fromDt && s.updated_at && new Date(s.updated_at) < fromDt) return false;
      if (toDt   && s.updated_at && new Date(s.updated_at) > toDt)   return false;
      return true;
    });
  }, [baseList, search, filterCompany, filterJob, filterGroup, filterStage, filterAction, filterFromDate, filterToDate]);

  const grouped = useMemo(() => groupByDay(list, s => s.updated_at), [list]);

  // ── Client filter: distinct companies + client-scoped base list ─────────────
  const clients = useMemo(
    () => [...new Set(overall.map(o => o.company_name).filter(Boolean))].sort() as string[],
    [overall]);
  const scopedOverall = useMemo(
    () => (clientFilter ? overall.filter(o => o.company_name === clientFilter) : overall),
    [overall, clientFilter]);

  // ── Overall list: bucket + search filter, sorted chronologically ────────────
  const overallList = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayIso    = isoDate(today);
    const tomorrowIso = isoDate(new Date(today.getTime() + 86_400_000));
    const weekEndIso  = isoDate(new Date(today.getTime() + 7 * 86_400_000));
    const q = search.toLowerCase();
    const rows = scopedOverall.filter(o => {
      if (search) {
        const hay = `${o.candidate ?? ''} ${o.company_name ?? ''} ${o.recruiter ?? ''} ${o.email ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const d = o.interview_date;
      if (bucket === 'today')    return d === todayIso;
      if (bucket === 'tomorrow') return d === tomorrowIso;
      if (bucket === 'week')     return !!d && d >= todayIso && d <= weekEndIso;
      return true;
    });
    // earliest first: interview_date then interview_time (zero-padded → lexicographic = chronological)
    return [...rows].sort((a, b) =>
      `${a.interview_date ?? ''} ${a.interview_time ?? ''}`.localeCompare(`${b.interview_date ?? ''} ${b.interview_time ?? ''}`));
  }, [scopedOverall, search, bucket]);

  const overallGrouped = useMemo(
    () => groupByDay(overallList, o => o.interview_date),
    [overallList]);

  // ── Upcoming-interview summary tiles (computed over the fetched window) ──────
  const overallStats = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayIso    = isoDate(today);
    const tomorrow    = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const tomorrowIso = isoDate(tomorrow);
    const weekEnd     = new Date(today); weekEnd.setDate(today.getDate() + 7);
    const weekEndIso  = isoDate(weekEnd);
    let todayCount = 0, tomorrowCount = 0, weekCount = 0;
    for (const o of scopedOverall) {
      const d = o.interview_date;
      if (!d) continue;
      if (d === todayIso)    todayCount++;
      if (d === tomorrowIso) tomorrowCount++;
      if (d >= todayIso && d <= weekEndIso) weekCount++;
    }
    return { today: todayCount, tomorrow: tomorrowCount, week: weekCount, total: scopedOverall.length };
  }, [scopedOverall]);

  const activeFilters = [search, filterCompany, filterJob, filterGroup, filterStage, filterAction, filterFromDate, filterToDate].filter(Boolean).length;

  const clearAllFilters = () => {
    setSearch(''); setFilterCompany(''); setFilterJob('');
    setFilterGroup(''); setFilterStage(''); setFilterAction('');
    setFilterFromDate(''); setFilterToDate('');
  };

  // ── Read-only overlay details ──────────────────────────────────────────────
  const renderOverlayBody = (sub: Sub) => {
    const group = stageGroup(sub.current_stage);
    const isClientScreening = ['submitted','ta_review','ta_rejected','hm_review','hm_rejected','shortlisted'].includes(sub.current_stage);
    const isL1 = group === 'L1 Round';
    const isL2 = group === 'L2 Round';
    const isFinal = group === 'Final Round';
    const isOffer = group === 'Offer & Joining';

    return (
      <div className="p-6 space-y-5">

        {/* Client Screening */}
        {isClientScreening && (sub.ta_feedback || sub.hm_feedback || sub.tat_window) && (
          <div className="space-y-3">
            <Divider label="Client Screening" />
            <div className="grid grid-cols-2 gap-3">
              <ReadField label="TA Feedback" value={sub.ta_feedback} />
              <ReadField label="HM Feedback" value={sub.hm_feedback} />
              <ReadField label="TAT Window" value={sub.tat_window} />
            </div>
          </div>
        )}

        {/* L1 */}
        {isL1 && (
          <div className="space-y-3">
            <Divider label="L1 Interview" />
            <div className="grid grid-cols-2 gap-3">
              <ReadField label="L1 Date" value={fmtDate(sub.l1_date)} />
              <ReadField label="L1 Feedback" value={sub.l1_feedback} />
            </div>
            {sub.l1_briefing_done && (
              <p className="text-xs text-teal-600 font-medium">✓ Candidate briefed before L1</p>
            )}
          </div>
        )}

        {/* L2 */}
        {isL2 && (
          <div className="space-y-3">
            <Divider label="L2 Interview" />
            <div className="grid grid-cols-2 gap-3">
              <ReadField label="L2 Date" value={fmtDate(sub.l2_date)} />
              <ReadField label="L2 Feedback" value={sub.l2_feedback} />
            </div>
            {sub.l2_briefing_done && (
              <p className="text-xs text-teal-600 font-medium">✓ Candidate briefed before L2</p>
            )}
          </div>
        )}

        {/* Final */}
        {isFinal && (
          <div className="space-y-3">
            <Divider label="Final Interview" />
            <div className="grid grid-cols-2 gap-3">
              <ReadField label="Final Date" value={fmtDate(sub.final_date)} />
              <ReadField label="Final Feedback" value={sub.final_feedback} />
            </div>
            {sub.final_briefing_done && (
              <p className="text-xs text-teal-600 font-medium">✓ Candidate briefed before Final round</p>
            )}
          </div>
        )}

        {/* Offer & Joining */}
        {isOffer && (
          <div className="space-y-3">
            <Divider label="Offer & Joining" />
            <div className="grid grid-cols-2 gap-3">
              {sub.offered_ctc != null && (
                <ReadField label="Offered CTC (Lakhs)" value={sub.offered_ctc} />
              )}
              {sub.offer_date && (
                <ReadField label="Offer Date" value={fmtDate(sub.offer_date)} />
              )}
              {sub.joining_date_confirmed && (
                <ReadField label="Joining Date (Confirmed)" value={fmtDate(sub.joining_date_confirmed)} />
              )}
              {sub.actual_joining_date && (
                <ReadField label="Actual Joining Date" value={fmtDate(sub.actual_joining_date)} />
              )}
            </div>
          </div>
        )}

        {/* Risk & Notes */}
        {(sub.other_offers_count || sub.counter_offer_risk || sub.last_notes || sub.next_action) && (
          <div className="space-y-3">
            <Divider label="Risk & Notes" />
            <div className="grid grid-cols-2 gap-3">
              {sub.other_offers_count && (
                <ReadField label="Other Offers in Hand" value={sub.other_offers_count} />
              )}
              {sub.counter_offer_risk && (
                <ReadField label="Counter-Offer Risk" value={sub.counter_offer_risk} />
              )}
            </div>
            {sub.last_notes && (
              <div>
                <p className="text-xs font-medium text-slate-400 mb-1">Feedback / Notes</p>
                <p className="text-sm text-slate-700 bg-slate-50 rounded-xl px-3 py-2 leading-relaxed">{sub.last_notes}</p>
              </div>
            )}
            {(sub.next_action || sub.next_action_date) && (
              <div className="grid grid-cols-2 gap-3">
                <ReadField label="Next Action" value={sub.next_action} />
                <ReadField label="Action By Date" value={fmtDate(sub.next_action_date)} />
              </div>
            )}
          </div>
        )}

        {/* Submitted at */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <ReadField label="Submitted" value={fmtDate(sub.submitted_at)} />
          <ReadField label="Last Updated" value={fmtDate(sub.updated_at)} />
        </div>

        {/* Timeline */}
        <div className="space-y-3">
          <Divider label="Journey Timeline" />
          <Timeline entries={sub.timeline ?? []} />
        </div>

      </div>
    );
  };

  return (
    <Layout title="Interview Tracking">

      {/* ── Top bar: Overall/Active/Closed + Search + Filter toggle ── */}
      <div className="space-y-3 mb-5">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Overall / Active / Closed tabs */}
          <button
            onClick={() => setTab('overall')}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
              tab === 'overall' ? 'text-white shadow' : 'text-slate-500 hover:text-slate-700'
            }`}
            style={tab === 'overall' ? { backgroundColor: '#1a2744' } : {}}
          >
            Overall <span className="ml-1 text-xs opacity-70">({overall.length})</span>
          </button>
          <button
            onClick={() => setTab('active')}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
              tab === 'active' ? 'text-white shadow' : 'text-slate-500 hover:text-slate-700'
            }`}
            style={tab === 'active' ? { backgroundColor: '#1a2744' } : {}}
          >
            Active <span className="ml-1 text-xs opacity-70">({active.length})</span>
          </button>
          <button
            onClick={() => setTab('closed')}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
              tab === 'closed' ? 'text-white shadow' : 'text-slate-500 hover:text-slate-700'
            }`}
            style={tab === 'closed' ? { backgroundColor: '#1a2744' } : {}}
          >
            Closed <span className="ml-1 text-xs opacity-70">({closed.length})</span>
          </button>

          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search candidate…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-400 bg-white"
            />
          </div>

          {/* Overall tab: Client filter + date-window pickers */}
          {tab === 'overall' ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <SearchableSelect
                value={clientFilter}
                options={clients}
                placeholder="All Clients"
                onChange={setClientFilter}
              />
              <input
                type="date"
                value={olFromDate}
                max={olToDate || undefined}
                onChange={e => setOlFromDate(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-blue-400 bg-white"
              />
              <span className="text-slate-400 text-xs">to</span>
              <input
                type="date"
                value={olToDate}
                min={olFromDate || undefined}
                onChange={e => setOlToDate(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-blue-400 bg-white"
              />
            </div>
          ) : (
            <>
              {/* Filter toggle */}
              <button
                onClick={() => setShowFilters(v => !v)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-semibold border transition-all ${
                  showFilters || activeFilters > 0
                    ? 'bg-blue-50 border-blue-300 text-blue-700'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <SlidersHorizontal size={13} />
                Filters
                {activeFilters > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-blue-500 text-white text-[10px] font-bold">
                    {activeFilters}
                  </span>
                )}
              </button>

              {/* Results count + clear */}
              {activeFilters > 0 && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>{list.length} of {baseList.length} shown</span>
                  <button onClick={clearAllFilters} className="text-blue-500 hover:text-blue-700 font-semibold flex items-center gap-0.5">
                    <X size={11} /> Clear
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Expanded filter row ── */}
        {tab !== 'overall' && showFilters && (
          <div className="bg-white border border-slate-100 rounded-2xl p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 shadow-sm">

            {/* Company */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Company</label>
              <select
                value={filterCompany}
                onChange={e => { setFilterCompany(e.target.value); setFilterJob(''); }}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-blue-400 bg-white"
              >
                <option value="">All companies</option>
                {companies.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Job Title */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Job Title</label>
              <select
                value={filterJob}
                onChange={e => setFilterJob(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-blue-400 bg-white"
              >
                <option value="">All roles</option>
                {jobTitles.map(j => <option key={j} value={j}>{j}</option>)}
              </select>
            </div>

            {/* Stage Group */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Round</label>
              <select
                value={filterGroup}
                onChange={e => { setFilterGroup(e.target.value); setFilterStage(''); }}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-blue-400 bg-white"
              >
                <option value="">All rounds</option>
                {STAGE_GROUPS.map(g => <option key={g.label} value={g.label}>{g.label}</option>)}
              </select>
            </div>

            {/* Individual Stage */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Stage</label>
              <select
                value={filterStage}
                onChange={e => setFilterStage(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-blue-400 bg-white"
              >
                <option value="">All stages</option>
                {availableStages.map(s => <option key={s} value={s}>{STAGE_LABELS[s] ?? s}</option>)}
              </select>
            </div>

            {/* Next Action */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Next Action</label>
              <select
                value={filterAction}
                onChange={e => setFilterAction(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-blue-400 bg-white"
              >
                <option value="">Any</option>
                <option value="overdue">Overdue</option>
                <option value="today">Due Today</option>
                <option value="this_week">Due This Week</option>
                <option value="no_action">No Action Set</option>
              </select>
            </div>

            {/* Date Updated */}
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-semibold text-slate-500 mb-1">Updated From</label>
              <input type="date" value={filterFromDate} onChange={e => setFilterFromDate(e.target.value)} max={filterToDate || undefined}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-blue-400 bg-white" />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-semibold text-slate-500 mb-1">Updated To</label>
              <input type="date" value={filterToDate} onChange={e => setFilterToDate(e.target.value)} min={filterFromDate || undefined}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-blue-400 bg-white" />
            </div>

          </div>
        )}
      </div>

      {/* ── Upcoming-interview summary dashboard (Overall tab only) — tiles filter the list ── */}
      {tab === 'overall' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {([
            { b: 'today',    label: 'Today',     value: overallStats.today,    Icon: CalendarClock, accent: true },
            { b: 'tomorrow', label: 'Tomorrow',  value: overallStats.tomorrow, Icon: CalendarDays,  accent: false },
            { b: 'week',     label: 'This Week', value: overallStats.week,     Icon: CalendarDays,  accent: false },
            { b: 'all',      label: 'Total Upcoming', value: overallStats.total, Icon: Users,        accent: false },
          ] as const).map(({ b, label, value, Icon, accent }) => {
            const selected = bucket === b;
            return (
              <button
                key={b}
                onClick={() => setBucket(prev => (prev === b ? 'all' : b))}
                className={`text-left rounded-2xl border shadow-sm p-4 flex items-center justify-between transition-all hover:shadow-md ${
                  accent ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-100'
                } ${selected ? 'ring-2 ring-blue-400' : ''}`}
              >
                <div>
                  <p className={`text-[11px] font-semibold uppercase tracking-wider ${accent ? 'text-blue-600' : 'text-slate-400'}`}>{label}</p>
                  <p className={`text-2xl font-bold tabular-nums mt-0.5 ${accent ? 'text-blue-700' : 'text-slate-800'}`}>{value}</p>
                </div>
                <Icon size={22} className={accent ? 'text-blue-400' : 'text-slate-300'} />
              </button>
            );
          })}
        </div>
      )}

      {/* Card list */}
      {tab === 'overall' ? (
        overallLoading ? (
          <div className="space-y-2.5 animate-pulse">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-white rounded-2xl border border-slate-100" />
            ))}
          </div>
        ) : overallList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400">
            <Clock size={40} className="opacity-20 mb-3" />
            <p className="font-medium text-slate-500">
              {search ? 'No results match your search.' : 'No interviews in this date range.'}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {overallGrouped.map(group => {
              const isToday = group.label === 'Today';
              const isPastSlot = (o: OverallInterview) =>
                isToday && !!o.interview_date && !!o.interview_time &&
                new Date(`${o.interview_date}T${o.interview_time}:00`).getTime() < Date.now();
              // Today: apply the time-slab filter, then show upcoming first / past at the bottom.
              const base = isToday && slab !== 'all'
                ? group.items.filter(o => inSlab(o.interview_time, slab))
                : group.items;
              const items = isToday
                ? [...base.filter(o => !isPastSlot(o)), ...base.filter(isPastSlot)]
                : base;
              return (
              <div key={group.label}>
                {/* Day header */}
                <div className="flex items-center gap-2 py-2 px-1">
                  <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                    group.label === 'Today' ? 'bg-blue-100 text-blue-700' :
                    group.label === 'Yesterday' ? 'bg-slate-100 text-slate-600' :
                    'bg-slate-50 text-slate-500'
                  }`}>{group.label}</span>
                  <span className="text-[10px] text-slate-400">{items.length} candidate{items.length !== 1 ? 's' : ''}</span>
                  <span className="flex-1 border-t border-slate-100" />
                  {isToday && (
                    <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full">Upcoming</span>
                  )}
                </div>
                {/* Time-slab filter chips (Today only) */}
                {isToday && (
                  <div className="flex flex-wrap gap-1.5 mb-2 px-1">
                    {([{ key: 'all', label: 'All times' }, ...SLABS] as { key: string; label: string }[]).map(s => {
                      const count = s.key === 'all'
                        ? group.items.length
                        : group.items.filter(o => inSlab(o.interview_time, s.key)).length;
                      const selected = slab === s.key;
                      return (
                        <button
                          key={s.key}
                          onClick={() => setSlab(prev => (prev === s.key ? 'all' : s.key))}
                          className={`rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
                            selected
                              ? 'text-white'
                              : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                          style={selected ? { backgroundColor: '#1a2744' } : {}}
                        >
                          {s.label} <span className="opacity-70">({count})</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white shadow-sm">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        <th className="py-2 px-3 whitespace-nowrap">Time</th>
                        <th className="py-2 px-3">Candidate</th>
                        <th className="py-2 px-3">Company</th>
                        <th className="py-2 px-3 whitespace-nowrap">Phone</th>
                        <th className="py-2 px-3">Recruiter</th>
                        <th className="py-2 px-3">Round</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((o, i) => {
                        const slot = o.interview_date && o.interview_time
                          ? new Date(`${o.interview_date}T${o.interview_time}:00`)
                          : null;
                        const isPast = slot != null && slot.getTime() < Date.now();
                        return (
                        <tr
                          key={`${o.email ?? 'na'}-${o.job_id ?? 'na'}-${i}`}
                          className={`border-t border-slate-50 hover:bg-slate-50/60 transition-colors ${isPast ? 'opacity-50' : ''}`}
                        >
                          <td className="py-2.5 px-3 whitespace-nowrap font-semibold text-blue-700">{fmtTime12(o.interview_time)}</td>
                          <td className="py-2.5 px-3 font-semibold text-slate-800">{o.candidate ?? '—'}</td>
                          <td className="py-2.5 px-3 text-slate-600">{o.company_name ?? '—'}</td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            {o.contact
                              ? <a href={`tel:${o.contact}`} className="inline-flex items-center gap-1 text-slate-700 hover:text-blue-600"><Phone size={12} className="text-slate-400" />{o.contact}</a>
                              : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">{o.recruiter ?? '—'}</td>
                          <td className="py-2.5 px-3"><OlStepBadge step={o.workflow_step} /></td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              );
            })}
          </div>
        )
      ) : loading ? (
        <div className="space-y-2.5 animate-pulse">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-white rounded-2xl border border-slate-100" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400">
          <Clock size={40} className="opacity-20 mb-3" />
          <p className="font-medium text-slate-500">
            {activeFilters > 0 ? 'No results match your filters.' : tab === 'closed' ? 'No closed submissions.' : 'No active submissions.'}
          </p>
          {activeFilters > 0 && (
            <button onClick={clearAllFilters} className="mt-2 text-sm text-blue-500 hover:text-blue-700 font-semibold">
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-1">
          {grouped.map(group => (
            <div key={group.label}>
              {/* Day header */}
              <div className="flex items-center gap-2 py-2 px-1">
                <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                  group.label === 'Today' ? 'bg-blue-100 text-blue-700' :
                  group.label === 'Yesterday' ? 'bg-slate-100 text-slate-600' :
                  'bg-slate-50 text-slate-500'
                }`}>{group.label}</span>
                <span className="flex-1 border-t border-slate-100" />
                <span className="text-[10px] text-slate-400">{group.items.length} candidate{group.items.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="space-y-2">
                {group.items.map(sub => {
                const nextActionDate = sub.next_action_date ? new Date(sub.next_action_date) : null;
                const isOverdue = nextActionDate != null && nextActionDate < new Date();
                return (
                <button
                  key={sub.id}
                  onClick={() => setOverlay(sub)}
                  className={`w-full text-left rounded-2xl border shadow-sm hover:shadow-md transition-all px-5 py-4 flex items-center gap-4 ${
                    isOverdue
                      ? 'bg-amber-50 border-amber-200 hover:border-amber-300'
                      : 'bg-white border-slate-100 hover:border-blue-200'
                  }`}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}
                  >
                    {(sub.candidate_name ?? '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 text-sm">{sub.candidate_name ?? '—'}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {sub.job_title ?? '—'}
                      <span className="mx-1.5 text-slate-300">@</span>
                      <span className="font-medium text-slate-600">{sub.client_name ?? '—'}</span>
                    </p>
                  </div>
                  <div className="flex-shrink-0 flex flex-col items-end gap-1">
                    <StageBadge stage={sub.current_stage} />
                    <span className="text-slate-400" style={{ fontSize: '10px' }}>
                      Updated {fmtDate(sub.updated_at)}
                    </span>
                    {sub.next_action && sub.next_action_date && (
                      <span className={`text-[10px] font-semibold ${isOverdue ? 'text-amber-600' : 'text-slate-400'}`}>
                        {isOverdue ? '⚠ ' : ''}Action: {fmtDate(sub.next_action_date)}
                      </span>
                    )}
                  </div>
                </button>
                );
              })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Read-only detail overlay ─────────────────────────────────────────── */}
      {overlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setOverlay(null)}
          />

          {/* Modal */}
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto flex flex-col">

            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-start justify-between rounded-t-2xl z-10">
              <div>
                <h3 className="font-bold text-slate-800 text-base leading-tight">{overlay.candidate_name}</h3>
                <p className="text-sm text-slate-500 mt-0.5">{overlay.job_title} @ {overlay.client_name}</p>
                <div className="mt-1.5">
                  <StageBadge stage={overlay.current_stage} />
                </div>
              </div>
              <button
                onClick={() => setOverlay(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 ml-4 flex-shrink-0 mt-0.5"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body — read-only */}
            {renderOverlayBody(overlay)}

            {/* Footer */}
            <div className="sticky bottom-0 bg-white border-t border-slate-100 px-6 py-4 rounded-b-2xl">
              <button
                onClick={() => setOverlay(null)}
                className="w-full py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}
    </Layout>
  );
}
