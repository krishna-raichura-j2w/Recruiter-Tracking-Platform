import { useEffect, useState, useMemo } from 'react';
import { X, Clock, Search, SlidersHorizontal } from 'lucide-react';
import Layout from '../components/Layout';
import api from '../api/client';

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

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex-1 border-t border-slate-100" />
      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</span>
      <span className="flex-1 border-t border-slate-100" />
    </div>
  );
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      {children}
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

// ── Main ───────────────────────────────────────────────────────────────────────

type FormState = Record<string, string | boolean>;

export default function Pipeline() {
  const [active, setActive]       = useState<Sub[]>([]);
  const [closed, setClosed]       = useState<Sub[]>([]);
  const [showClosed, setShowClosed] = useState(false);
  const [loading, setLoading]     = useState(true);
  const [overlay, setOverlay]     = useState<Sub | null>(null);
  const [form, setForm]           = useState<FormState>({});
  const [saving, setSaving]       = useState(false);
  const [toast, setToast]         = useState('');

  // ── Filter state ──────────────────────────────────────────────────────────
  const [search,         setSearch]         = useState('');
  const [filterCompany,  setFilterCompany]  = useState('');
  const [filterJob,      setFilterJob]      = useState('');
  const [filterGroup,    setFilterGroup]    = useState('');
  const [filterStage,    setFilterStage]    = useState('');
  const [filterAction,   setFilterAction]   = useState('');
  const [showFilters,    setShowFilters]    = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [a, c] = await Promise.all([
        api.get('/submissions?closed=false').catch(() => ({ data: [] })),
        api.get('/submissions?closed=true').catch(() => ({ data: [] })),
      ]);
      setActive(a.data as Sub[]);
      setClosed(c.data as Sub[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const openOverlay = (sub: Sub) => {
    setOverlay(sub);
    setForm({
      current_stage:          sub.current_stage,
      ta_feedback:            sub.ta_feedback ?? '',
      hm_feedback:            sub.hm_feedback ?? '',
      tat_window:             sub.tat_window ?? '',
      l1_date:                sub.l1_date ?? '',
      l1_feedback:            sub.l1_feedback ?? '',
      l1_briefing_done:       !!sub.l1_briefing_done,
      l2_date:                sub.l2_date ?? '',
      l2_feedback:            sub.l2_feedback ?? '',
      l2_briefing_done:       !!sub.l2_briefing_done,
      final_date:             sub.final_date ?? '',
      final_feedback:         sub.final_feedback ?? '',
      final_briefing_done:    !!sub.final_briefing_done,
      offered_ctc:            sub.offered_ctc != null ? String(sub.offered_ctc) : '',
      offer_date:             sub.offer_date ?? '',
      joining_date_confirmed: sub.joining_date_confirmed ?? '',
      actual_joining_date:    sub.actual_joining_date ?? '',
      other_offers_count:     sub.other_offers_count ?? '',
      counter_offer_risk:     sub.counter_offer_risk ?? '',
      last_notes:             sub.last_notes ?? '',
      next_action:            sub.next_action ?? '',
      next_action_date:       sub.next_action_date ?? '',
    });
  };

  const setField = (key: string, val: string | boolean) =>
    setForm(prev => ({ ...prev, [key]: val }));

  const onSave = async () => {
    if (!overlay) return;
    const notes = (form.last_notes as string)?.trim();
    if (!notes) {
      showToast('⚠ Feedback / notes are required before saving.');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { ...form };
      payload.notes = notes;   // map to required backend field
      if (payload.offered_ctc) payload.offered_ctc = Number(payload.offered_ctc);
      Object.keys(payload).forEach(k => {
        if (payload[k] === '' || payload[k] === null) delete payload[k];
      });
      await api.patch(`/submissions/${overlay.id}`, payload);
      showToast('✅ Updated successfully!');
      setOverlay(null);
      fetchData();
    } catch {
      showToast('❌ Update failed. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const currentStage = (form.current_stage as string) ?? '';
  const group        = stageGroup(currentStage);
  const baseList     = showClosed ? closed : active;

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
    return baseList.filter(s => {
      if (search       && !s.candidate_name?.toLowerCase().includes(search.toLowerCase())) return false;
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
      return true;
    });
  }, [baseList, search, filterCompany, filterJob, filterGroup, filterStage, filterAction]);

  const activeFilters = [search, filterCompany, filterJob, filterGroup, filterStage, filterAction].filter(Boolean).length;

  const clearAllFilters = () => {
    setSearch(''); setFilterCompany(''); setFilterJob('');
    setFilterGroup(''); setFilterStage(''); setFilterAction('');
  };

  return (
    <Layout title="Interview Tracking">

      {/* Toast */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium bg-white border border-slate-200 text-slate-800">
          {toast}
        </div>
      )}

      {/* ── Top bar: Active/Closed + Search + Filter toggle ── */}
      <div className="space-y-3 mb-5">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Active / Closed tabs */}
          <button
            onClick={() => setShowClosed(false)}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
              !showClosed ? 'text-white shadow' : 'text-slate-500 hover:text-slate-700'
            }`}
            style={!showClosed ? { backgroundColor: '#1a2744' } : {}}
          >
            Active <span className="ml-1 text-xs opacity-70">({active.length})</span>
          </button>
          <button
            onClick={() => setShowClosed(true)}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
              showClosed ? 'text-white shadow' : 'text-slate-500 hover:text-slate-700'
            }`}
            style={showClosed ? { backgroundColor: '#1a2744' } : {}}
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
        </div>

        {/* ── Expanded filter row ── */}
        {showFilters && (
          <div className="bg-white border border-slate-100 rounded-2xl p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 shadow-sm">

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

          </div>
        )}
      </div>

      {/* Card list */}
      {loading ? (
        <div className="space-y-2.5 animate-pulse">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-white rounded-2xl border border-slate-100" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400">
          <Clock size={40} className="opacity-20 mb-3" />
          <p className="font-medium text-slate-500">
            {activeFilters > 0 ? 'No results match your filters.' : showClosed ? 'No closed submissions.' : 'No active submissions.'}
          </p>
          {activeFilters > 0 && (
            <button onClick={clearAllFilters} className="mt-2 text-sm text-blue-500 hover:text-blue-700 font-semibold">
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {list.map(sub => {
            const nextActionDate = sub.next_action_date ? new Date(sub.next_action_date) : null;
            const isOverdue = nextActionDate != null && nextActionDate < new Date();
            return (
            <button
              key={sub.id}
              onClick={() => openOverlay(sub)}
              className={`w-full text-left rounded-2xl border shadow-sm hover:shadow-md transition-all px-5 py-4 flex items-center gap-4 ${
                isOverdue
                  ? 'bg-amber-50 border-amber-200 hover:border-amber-300'
                  : 'bg-white border-slate-100 hover:border-blue-200'
              }`}
            >
              {/* Avatar */}
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}
              >
                {(sub.candidate_name ?? '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 text-sm">{sub.candidate_name ?? '—'}</p>
                <p className="text-xs text-slate-500 truncate">
                  {sub.job_title ?? '—'}
                  <span className="mx-1.5 text-slate-300">@</span>
                  <span className="font-medium text-slate-600">{sub.client_name ?? '—'}</span>
                </p>
              </div>

              {/* Stage + date + next action */}
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
      )}

      {/* ── Overlay modal ─────────────────────────────────────────────────── */}
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

            {/* Body */}
            <div className="p-6 space-y-5">

              {/* Stage selector */}
              <div>
                <label className="form-label">Update Stage</label>
                <select
                  value={currentStage}
                  onChange={e => setField('current_stage', e.target.value)}
                  className="form-select"
                >
                  {STAGE_GROUPS.map(g => (
                    <optgroup key={g.label} label={g.label}>
                      {g.stages.map(s => (
                        <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* ── Conditional fields based on selected stage ── */}

              {/* Client Screening */}
              {['submitted','ta_review','ta_rejected','hm_review','hm_rejected','shortlisted'].includes(currentStage) && (
                <div className="space-y-3">
                  <Divider label="Client Screening" />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="TA Feedback">
                      <select
                        value={form.ta_feedback as string}
                        onChange={e => setField('ta_feedback', e.target.value)}
                        className="form-select"
                      >
                        <option value="">—</option>
                        {['Pending','Accepted','Rejected'].map(o => <option key={o}>{o}</option>)}
                      </select>
                    </Field>
                    <Field label="HM Feedback">
                      <select
                        value={form.hm_feedback as string}
                        onChange={e => setField('hm_feedback', e.target.value)}
                        className="form-select"
                      >
                        <option value="">—</option>
                        {['Pending','Shortlisted','Rejected'].map(o => <option key={o}>{o}</option>)}
                      </select>
                    </Field>
                    <Field label="TAT Window">
                      <select
                        value={form.tat_window as string}
                        onChange={e => setField('tat_window', e.target.value)}
                        className="form-select"
                      >
                        <option value="">—</option>
                        {['24 hrs','24–48 hrs','72 hrs'].map(o => <option key={o}>{o}</option>)}
                      </select>
                    </Field>
                  </div>
                </div>
              )}

              {/* L1 */}
              {group === 'L1 Round' && (
                <div className="space-y-3">
                  <Divider label="L1 Interview" />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="L1 Date">
                      <input
                        type="date"
                        value={form.l1_date as string}
                        onChange={e => setField('l1_date', e.target.value)}
                        className="form-input"
                      />
                    </Field>
                    <Field label="L1 Feedback">
                      <select
                        value={form.l1_feedback as string}
                        onChange={e => setField('l1_feedback', e.target.value)}
                        className="form-select"
                      >
                        <option value="">—</option>
                        {['Pending','Cleared','Rejected','Hold'].map(o => <option key={o}>{o}</option>)}
                      </select>
                    </Field>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!form.l1_briefing_done}
                      onChange={e => setField('l1_briefing_done', e.target.checked)}
                      className="rounded"
                    />
                    Candidate briefed before L1
                  </label>
                </div>
              )}

              {/* L2 */}
              {group === 'L2 Round' && (
                <div className="space-y-3">
                  <Divider label="L2 Interview" />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="L2 Date">
                      <input
                        type="date"
                        value={form.l2_date as string}
                        onChange={e => setField('l2_date', e.target.value)}
                        className="form-input"
                      />
                    </Field>
                    <Field label="L2 Feedback">
                      <select
                        value={form.l2_feedback as string}
                        onChange={e => setField('l2_feedback', e.target.value)}
                        className="form-select"
                      >
                        <option value="">—</option>
                        {['Pending','Cleared','Rejected','Hold'].map(o => <option key={o}>{o}</option>)}
                      </select>
                    </Field>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!form.l2_briefing_done}
                      onChange={e => setField('l2_briefing_done', e.target.checked)}
                      className="rounded"
                    />
                    Candidate briefed before L2
                  </label>
                </div>
              )}

              {/* Final */}
              {group === 'Final Round' && (
                <div className="space-y-3">
                  <Divider label="Final Interview" />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Final Date">
                      <input
                        type="date"
                        value={form.final_date as string}
                        onChange={e => setField('final_date', e.target.value)}
                        className="form-input"
                      />
                    </Field>
                    <Field label="Final Feedback">
                      <select
                        value={form.final_feedback as string}
                        onChange={e => setField('final_feedback', e.target.value)}
                        className="form-select"
                      >
                        <option value="">—</option>
                        {['Pending','Cleared','Rejected','Hold'].map(o => <option key={o}>{o}</option>)}
                      </select>
                    </Field>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!form.final_briefing_done}
                      onChange={e => setField('final_briefing_done', e.target.checked)}
                      className="rounded"
                    />
                    Candidate briefed before Final round
                  </label>
                </div>
              )}

              {/* Offer & Joining */}
              {group === 'Offer & Joining' && (
                <div className="space-y-3">
                  <Divider label="Offer & Joining" />
                  <div className="grid grid-cols-2 gap-3">
                    {['offer_rolled_out','offer_accepted'].includes(currentStage) && (
                      <>
                        <Field label="Offered CTC (Lakhs)">
                          <input
                            type="number"
                            step="0.1"
                            placeholder="e.g. 18.5"
                            value={form.offered_ctc as string}
                            onChange={e => setField('offered_ctc', e.target.value)}
                            className="form-input"
                          />
                        </Field>
                        <Field label="Offer Date">
                          <input
                            type="date"
                            value={form.offer_date as string}
                            onChange={e => setField('offer_date', e.target.value)}
                            className="form-input"
                          />
                        </Field>
                      </>
                    )}
                    {['offer_accepted','joined'].includes(currentStage) && (
                      <Field label="Joining Date (Confirmed)">
                        <input
                          type="date"
                          value={form.joining_date_confirmed as string}
                          onChange={e => setField('joining_date_confirmed', e.target.value)}
                          className="form-input"
                        />
                      </Field>
                    )}
                    {currentStage === 'joined' && (
                      <Field label="Actual Joining Date">
                        <input
                          type="date"
                          value={form.actual_joining_date as string}
                          onChange={e => setField('actual_joining_date', e.target.value)}
                          className="form-input"
                        />
                      </Field>
                    )}
                  </div>
                </div>
              )}

              {/* Risk & Notes — always shown */}
              <div className="space-y-3">
                <Divider label="Risk & Notes" />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Other Offers in Hand">
                    <select
                      value={form.other_offers_count as string}
                      onChange={e => setField('other_offers_count', e.target.value)}
                      className="form-select"
                    >
                      <option value="">—</option>
                      {['0','1','2','3+'].map(o => <option key={o}>{o}</option>)}
                    </select>
                  </Field>
                  <Field label="Counter-Offer Risk">
                    <select
                      value={form.counter_offer_risk as string}
                      onChange={e => setField('counter_offer_risk', e.target.value)}
                      className="form-select"
                    >
                      <option value="">—</option>
                      {['Low','Medium','High'].map(o => <option key={o}>{o}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label={<span>Feedback / Notes <span className="text-red-500">*</span></span>}>
                  <textarea
                    rows={3}
                    placeholder="Required — add your feedback or update notes for this stage change…"
                    value={form.last_notes as string}
                    onChange={e => setField('last_notes', e.target.value)}
                    className={`form-input resize-none border-2 ${
                      !(form.last_notes as string)?.trim()
                        ? 'border-amber-300 bg-amber-50/30 focus:border-amber-400'
                        : 'border-green-300 bg-green-50/20'
                    }`}
                  />
                  {!(form.last_notes as string)?.trim() && (
                    <p className="text-xs text-amber-600 mt-1">⚠ Required before saving</p>
                  )}
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Next Action">
                    <input
                      type="text"
                      placeholder="e.g. Lock L2 slot"
                      value={form.next_action as string}
                      onChange={e => setField('next_action', e.target.value)}
                      className="form-input"
                    />
                  </Field>
                  <Field label="Action By Date">
                    <input
                      type="date"
                      value={form.next_action_date as string}
                      onChange={e => setField('next_action_date', e.target.value)}
                      className="form-input"
                    />
                  </Field>
                </div>
              </div>

              {/* Timeline */}
              <div className="space-y-3">
                <Divider label="Journey Timeline" />
                <Timeline entries={overlay.timeline ?? []} />
              </div>

            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-white border-t border-slate-100 px-6 py-4 flex gap-3 rounded-b-2xl">
              <button
                onClick={() => setOverlay(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={onSave}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-60"
                style={{ backgroundColor: '#1a2744' }}
              >
                {saving ? 'Saving…' : 'Save Update'}
              </button>
            </div>

          </div>
        </div>
      )}
    </Layout>
  );
}
