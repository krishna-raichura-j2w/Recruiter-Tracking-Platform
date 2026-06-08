import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Save, Plus, Phone, ChevronDown, ChevronRight,
  AlertCircle, UserPlus, Calculator, Mail, Eye, Check, UserRound,
} from 'lucide-react';
import Layout from '../components/Layout';
import StatusBadge from '../components/StatusBadge';
import DriveAddCandidateModal from '../components/DriveAddCandidateModal';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import type {
  Drive, DriveCandidate, DriveStatus, DriveType, DriveTrackerStage, DriveCallType, DriveCallOutcome,
} from '../types';

// Canonical reconfirmation-call outcomes (Phase 4.1b). Only 'confirmed' counts as confirmed.
const OUTCOME_OPTIONS: DriveCallOutcome[] = ['confirmed', 'not_picked', 'not_confirmed', 'declined', 'callback'];
const OUTCOME_LABEL: Record<DriveCallOutcome, string> = {
  confirmed: 'Confirmed (will attend)',
  not_picked: 'Called – not picked',
  not_confirmed: 'Reached – not confirmed',
  declined: "Won't attend",
  callback: 'Call back later',
};
const OUTCOME_SHORT: Record<string, string> = {
  confirmed: 'confirmed', not_picked: 'not picked', not_confirmed: 'not confirmed',
  declined: "won't attend", callback: 'callback',
};
type ReconfirmFilter = 'all' | 'confirmed' | 'not_confirmed' | 'not_called';
const RECONFIRM_FILTER_LABEL: Record<ReconfirmFilter, string> = {
  all: 'All', confirmed: 'Confirmed', not_confirmed: 'Not confirmed', not_called: 'Not called',
};
function matchesReconfirm(f: ReconfirmFilter, done: boolean, confirmed: boolean): boolean {
  if (f === 'all') return true;
  if (f === 'confirmed') return confirmed;
  if (f === 'not_confirmed') return done && !confirmed;
  return !done; // not_called
}

const STATUS_OPTIONS: DriveStatus[] = [
  'planned', 'sourcing', 'in_progress', 'shortlisted', 'complete', 'blocked', 'cancelled',
];
const TYPE_OPTIONS: DriveType[] = ['walkin', 'virtual', 'college_walkin', 'followup'];
const STAGE_OPTIONS: DriveTrackerStage[] = [
  'lined_up', 'confirmed', 'en_route', 'reached', 'attended', 'no_show',
];
const STAGE_LABEL: Record<DriveTrackerStage, string> = {
  lined_up: 'Lined up', confirmed: 'Confirmed', en_route: 'En route',
  reached: 'Reached', attended: 'Attended', no_show: 'No show',
};
const STAGE_STYLE: Record<DriveTrackerStage, string> = {
  lined_up: 'bg-slate-100 text-slate-700',
  confirmed: 'bg-amber-100 text-amber-700',
  en_route: 'bg-blue-100 text-blue-700',
  reached: 'bg-violet-100 text-violet-700',
  attended: 'bg-emerald-100 text-emerald-700',
  no_show: 'bg-red-100 text-red-700',
};
const CALL_TYPE_LABEL: Record<DriveCallType, string> = {
  recruiter_followup: 'Recruiter follow-up',
  lead_am_pulse: 'Lead/AM pulse (as client)',
  reconfirm_d1: 'D-1 reconfirm (24h)',
  reconfirm_dday: 'D-day reconfirm (2h)',
};

function ceilTarget(pos: number, convPct: number, bufferPct: number): number {
  if (!convPct || !pos) return 0;
  return Math.ceil((pos / (convPct / 100)) * (1 + bufferPct / 100));
}

// Editable copy of the fulfilment plan (rates as percentages for the UI)
interface PlanForm {
  drive_type: DriveType;
  status: DriveStatus;
  open_positions: number;
  conversion_pct: number;
  buffer_pct: number;
  show_pct: number;
  submission_target_override: string;
  drive_date_from: string;
  drive_date_upto: string;
  start_time: string;
  end_time: string;
  venue: string;
  dress_code: string;
  virtual_link: string;
  notes: string;
}

function toForm(d: Drive): PlanForm {
  return {
    drive_type: d.drive_type,
    status: d.status,
    open_positions: d.open_positions ?? 0,
    conversion_pct: Math.round((d.conversion_rate ?? 0) * 100),
    buffer_pct: Math.round((d.buffer_pct ?? 0) * 100),
    show_pct: Math.round((d.show_rate ?? 0) * 100),
    submission_target_override: d.submission_target_override?.toString() ?? '',
    drive_date_from: d.drive_date_from?.slice(0, 10) ?? '',
    drive_date_upto: d.drive_date_upto?.slice(0, 10) ?? '',
    start_time: d.start_time ?? '',
    end_time: d.end_time ?? '',
    venue: d.venue ?? '',
    dress_code: d.dress_code ?? '',
    virtual_link: d.virtual_link ?? '',
    notes: d.notes ?? '',
  };
}

export default function DriveDetail() {
  const { driveId } = useParams<{ driveId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = user?.role ?? '';
  const canEditPlan = ['admin', 'kam', 'delivery_lead', 'bh'].includes(role);
  const canAddCandidate = ['admin', 'kam', 'delivery_lead', 'recruiter'].includes(role);

  const [drive, setDrive] = useState<Drive | null>(null);
  const [form, setForm] = useState<PlanForm | null>(null);
  const [candidates, setCandidates] = useState<DriveCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [d1Filter, setD1Filter] = useState<ReconfirmFilter>('all');
  const [ddayFilter, setDdayFilter] = useState<ReconfirmFilter>('all');
  const [recruiterFilter, setRecruiterFilter] = useState<string>('all');

  const fetchAll = useCallback(() => {
    if (!driveId) return;
    setLoading(true);
    Promise.all([
      api.get<Drive>(`/drives/${driveId}`),
      api.get<DriveCandidate[]>(`/drives/${driveId}/candidates`),
    ])
      .then(([dRes, cRes]) => {
        setDrive(dRes.data);
        setForm(toForm(dRes.data));
        setCandidates(cRes.data ?? []);
      })
      .catch(() => setError('Failed to load drive.'))
      .finally(() => setLoading(false));
  }, [driveId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Lighter refresh used after candidate-level actions (tracker/calls): re-pulls
  // only the candidate list so derived reconfirm fields + auto-advanced stage
  // update, without resetting the fulfilment-plan form (avoids losing edits).
  const refreshCandidates = useCallback(() => {
    if (!driveId) return;
    api.get<DriveCandidate[]>(`/drives/${driveId}/candidates`)
      .then((r) => setCandidates(r.data ?? []))
      .catch(() => { });
  }, [driveId]);

  const set = <K extends keyof PlanForm>(k: K, v: PlanForm[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const savePlan = async () => {
    if (!form || !driveId) return;
    setSaving(true);
    try {
      const payload = {
        drive_type: form.drive_type,
        status: form.status,
        open_positions: Number(form.open_positions) || 0,
        conversion_rate: form.conversion_pct / 100,
        buffer_pct: form.buffer_pct / 100,
        show_rate: form.show_pct / 100,
        submission_target_override: form.submission_target_override.trim()
          ? Number(form.submission_target_override)
          : null,
        drive_date_from: form.drive_date_from || null,
        drive_date_upto: form.drive_date_upto || null,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        venue: form.venue || null,
        dress_code: form.dress_code || null,
        virtual_link: form.virtual_link || null,
        notes: form.notes || null,
      };
      const res = await api.patch<Drive>(`/drives/${driveId}`, payload);
      setDrive(res.data);
      setForm(toForm(res.data));
    } catch {
      setError('Failed to save plan.');
    } finally {
      setSaving(false);
    }
  };

  const updateStage = async (candId: number, stage: DriveTrackerStage) => {
    if (!driveId) return;
    try {
      const res = await api.patch<DriveCandidate>(
        `/drives/${driveId}/candidates/${candId}/tracker`,
        { tracker_stage: stage },
      );
      setCandidates((cs) => cs.map((c) => (c.id === candId ? res.data : c)));
    } catch {
      setError('Failed to update stage.');
    }
  };

  if (loading) {
    return <Layout title="Drive"><div className="py-20 text-center text-slate-400 text-sm">Loading…</div></Layout>;
  }
  if (!drive || !form) {
    return <Layout title="Drive"><div className="py-20 text-center text-slate-400 text-sm">Drive not found.</div></Layout>;
  }

  const computed = ceilTarget(Number(form.open_positions), form.conversion_pct, form.buffer_pct);
  const effective = form.submission_target_override.trim()
    ? Number(form.submission_target_override)
    : computed;

  // Distinct recruiters present in this drive's candidates (for the filter dropdown).
  const recruiterOptions = Array.from(
    new Set(candidates.map((c) => c.recruiter_name).filter((n): n is string => !!n))
  ).sort();
  const hasUnassigned = candidates.some((c) => !c.recruiter_name);

  const filteredCandidates = candidates.filter((c) =>
    matchesReconfirm(d1Filter, c.reconfirm_d1_done, c.reconfirm_d1_confirmed) &&
    matchesReconfirm(ddayFilter, c.reconfirm_dday_done, c.reconfirm_dday_confirmed) &&
    (recruiterFilter === 'all' ||
      (recruiterFilter === '__unassigned__' ? !c.recruiter_name : c.recruiter_name === recruiterFilter))
  );

  return (
    <Layout title={`${drive.client_name ?? 'Drive'}`} subtitle={drive.role_title ?? ''}>
      <button
        onClick={() => navigate('/drives')}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4"
      >
        <ArrowLeft size={15} /> Back to all drives
      </button>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 mb-4 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* ── Fulfilment Plan ─────────────────────────────────────────── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Calculator size={15} /> Fulfilment Plan
          </h2>
          {canEditPlan && (
            <button
              onClick={savePlan}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Save size={14} /> {saving ? 'Saving…' : 'Save plan'}
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Field label="Drive type">
            <select disabled={!canEditPlan} value={form.drive_type}
              onChange={(e) => set('drive_type', e.target.value as DriveType)} className={inputCls}>
              {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select disabled={!canEditPlan} value={form.status}
              onChange={(e) => set('status', e.target.value as DriveStatus)} className={inputCls}>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          </Field>
          <Field label="Open positions">
            <input type="number" disabled={!canEditPlan} value={form.open_positions}
              onChange={(e) => set('open_positions', Number(e.target.value))} className={inputCls} />
          </Field>
          <Field label="Conversion %">
            <input type="number" disabled={!canEditPlan} value={form.conversion_pct}
              onChange={(e) => set('conversion_pct', Number(e.target.value))} className={inputCls} />
          </Field>
          <Field label="Buffer %">
            <input type="number" disabled={!canEditPlan} value={form.buffer_pct}
              onChange={(e) => set('buffer_pct', Number(e.target.value))} className={inputCls} />
          </Field>
          <Field label="Show rate %">
            <input type="number" disabled={!canEditPlan} value={form.show_pct}
              onChange={(e) => set('show_pct', Number(e.target.value))} className={inputCls} />
          </Field>
          <Field label="Submission target (override)">
            <input type="number" disabled={!canEditPlan} placeholder={`auto: ${computed}`}
              value={form.submission_target_override}
              onChange={(e) => set('submission_target_override', e.target.value)} className={inputCls} />
          </Field>
          <div className="flex flex-col justify-end">
            <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-xs">
              <div className="text-slate-500">Computed: <b className="text-slate-700">{computed}</b> subs</div>
              <div className="text-blue-700 font-semibold">
                → {effective} subs → {Math.round(effective * form.show_pct / 100)} show → {Math.round(effective * form.conversion_pct / 100)} select
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <Field label="Date from">
            <input type="date" disabled={!canEditPlan} value={form.drive_date_from}
              onChange={(e) => set('drive_date_from', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Date upto">
            <input type="date" disabled={!canEditPlan} value={form.drive_date_upto}
              onChange={(e) => set('drive_date_upto', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Time from">
            <input type="time" disabled={!canEditPlan} value={form.start_time}
              onChange={(e) => set('start_time', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Time to">
            <input type="time" disabled={!canEditPlan} value={form.end_time}
              onChange={(e) => set('end_time', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Venue">
            <input disabled={!canEditPlan} value={form.venue}
              onChange={(e) => set('venue', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Dress code">
            <input disabled={!canEditPlan} value={form.dress_code}
              onChange={(e) => set('dress_code', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Virtual link">
            <input disabled={!canEditPlan} value={form.virtual_link}
              onChange={(e) => set('virtual_link', e.target.value)} className={inputCls} />
          </Field>
        </div>

        <Field label="Notes / action plan" className="mt-4">
          <textarea disabled={!canEditPlan} value={form.notes} rows={2}
            onChange={(e) => set('notes', e.target.value)} className={inputCls} />
        </Field>
      </section>

      {/* ── Candidates ──────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-sm font-bold text-slate-800">
            Candidates <span className="text-slate-400 font-normal">({filteredCandidates.length}{filteredCandidates.length !== candidates.length ? ` of ${candidates.length}` : ''})</span>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {/* Reconfirmation filters (Phase 4.1b) */}
            <label className="flex items-center gap-1 text-xs text-slate-500">
              D-1
              <select value={d1Filter} onChange={(e) => setD1Filter(e.target.value as ReconfirmFilter)}
                className="px-2 py-1 text-xs rounded-lg border border-slate-200">
                {(Object.keys(RECONFIRM_FILTER_LABEL) as ReconfirmFilter[]).map((f) => (
                  <option key={f} value={f}>{RECONFIRM_FILTER_LABEL[f]}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1 text-xs text-slate-500">
              D-day
              <select value={ddayFilter} onChange={(e) => setDdayFilter(e.target.value as ReconfirmFilter)}
                className="px-2 py-1 text-xs rounded-lg border border-slate-200">
                {(Object.keys(RECONFIRM_FILTER_LABEL) as ReconfirmFilter[]).map((f) => (
                  <option key={f} value={f}>{RECONFIRM_FILTER_LABEL[f]}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1 text-xs text-slate-500">
              Recruiter
              <select value={recruiterFilter} onChange={(e) => setRecruiterFilter(e.target.value)}
                className="px-2 py-1 text-xs rounded-lg border border-slate-200 max-w-[160px]">
                <option value="all">All</option>
                {recruiterOptions.map((n) => <option key={n} value={n}>{n}</option>)}
                {hasUnassigned && <option value="__unassigned__">Unassigned</option>}
              </select>
            </label>
            {canAddCandidate && (
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50"
              >
                <UserPlus size={14} /> Add candidate
              </button>
            )}
          </div>
        </div>

        {candidates.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">No candidates added to this drive yet.</p>
        ) : filteredCandidates.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">No candidates match the selected filters.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="px-2 py-2.5 w-6"></th>
                  <th className="px-2 py-2.5 font-semibold">Candidate</th>
                  <th className="px-2 py-2.5 font-semibold">Phone</th>
                  <th className="px-2 py-2.5 font-semibold">Company</th>
                  <th className="px-2 py-2.5 font-semibold">Exp</th>
                  <th className="px-2 py-2.5 font-semibold">Recruiter</th>
                  <th className="px-2 py-2.5 font-semibold text-center">D-1</th>
                  <th className="px-2 py-2.5 font-semibold text-center">D-day</th>
                  <th className="px-2 py-2.5 font-semibold">Stage</th>
                  <th className="px-2 py-2.5 font-semibold text-center">Calls</th>
                  <th className="px-2 py-2.5 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {filteredCandidates.map((c) => (
                  <CandidateRow
                    key={c.id}
                    cand={c}
                    driveId={driveId!}
                    role={role}
                    driveDateFrom={drive.drive_date_from}
                    onStage={updateStage}
                    onRefresh={refreshCandidates}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showAdd && drive.job_id && (
        <DriveAddCandidateModal
          driveId={Number(driveId)}
          jobId={drive.job_id}
          jobLabel={`${drive.client_name ?? ''} — ${drive.role_title ?? ''}`}
          onClose={() => setShowAdd(false)}
          onAdded={() => { setShowAdd(false); fetchAll(); }}
        />
      )}
    </Layout>
  );
}

const inputCls =
  'w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-slate-50 disabled:text-slate-500';

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  );
}

// SLA hint for a reconfirmation checkpoint, relative to the drive date.
function reconfirmHint(driveDateFrom: string | null | undefined, done: boolean, kind: 'd1' | 'dday'): 'due' | 'overdue' | null {
  if (done || !driveDateFrom) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(driveDateFrom); d.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (days < 0) return 'overdue';
  if (kind === 'd1' && days <= 1) return 'due';     // 24h window
  if (kind === 'dday' && days <= 0) return 'due';   // drive day
  return null;
}

const CALL_CHIP_STYLE: Record<string, string> = {
  lead_am_pulse: 'bg-violet-100 text-violet-700',
  reconfirm_d1: 'bg-amber-100 text-amber-700',
  reconfirm_dday: 'bg-amber-100 text-amber-700',
  recruiter_followup: 'bg-blue-100 text-blue-700',
};

function ReconfirmChip({ label, done, confirmed, outcome, at, hint }: {
  label: string; done: boolean; confirmed: boolean; outcome: string | null;
  at: string | null; hint: 'due' | 'overdue' | null;
}) {
  // Confirmed → green ✓; attempted but not confirmed → amber + outcome; not called → gray + SLA hint.
  if (confirmed) {
    const when = at ? new Date(at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
    return (
      <span title={when} className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700 flex items-center gap-0.5">
        <Check size={10} /> {label}
      </span>
    );
  }
  if (done) {
    const short = outcome ? (OUTCOME_SHORT[outcome] ?? outcome) : 'not confirmed';
    return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">{label} · {short}</span>;
  }
  const color = hint === 'overdue' ? 'bg-red-100 text-red-700' : hint === 'due' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400';
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${color}`}>{label}{hint ? ` · ${hint}` : ''}</span>;
}

// One reconfirmation checkpoint card with a structured-outcome logging form.
function ReconfirmCheckpoint({ cp, canLog, driveId, candId, onLogged }: {
  cp: { key: string; label: string; type: DriveCallType; done: boolean; confirmed: boolean; at: string | null; attempts: number; outcome: string | null; hint: 'due' | 'overdue' | null };
  canLog: boolean;
  driveId: string;
  candId: number;
  onLogged: () => void;
}) {
  const [openForm, setOpenForm] = useState(false);
  const [outcome, setOutcome] = useState<DriveCallOutcome>('confirmed');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.post(`/drives/${driveId}/candidates/${candId}/calls`, {
        call_type: cp.type, outcome, notes: notes || null,
      });
      setOpenForm(false); setNotes(''); setOutcome('confirmed');
      onLogged();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-100 bg-white p-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700">{cp.label}</span>
        {cp.confirmed ? (
          <span className="text-[10px] font-semibold text-emerald-700 flex items-center gap-0.5"><Check size={11} /> confirmed</span>
        ) : cp.done ? (
          <span className="text-[10px] font-semibold text-amber-600">{cp.outcome ? (OUTCOME_SHORT[cp.outcome] ?? cp.outcome) : 'not confirmed'}</span>
        ) : (
          <span className={`text-[10px] font-semibold ${cp.hint === 'overdue' ? 'text-red-600' : cp.hint === 'due' ? 'text-amber-600' : 'text-slate-400'}`}>
            {cp.hint ?? 'pending'}
          </span>
        )}
      </div>
      {cp.done && (
        <div className="text-[10px] text-slate-400 mt-0.5">
          {cp.at ? new Date(cp.at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
          {cp.attempts > 1 ? ` · ${cp.attempts} attempts` : ''}
        </div>
      )}
      {canLog && !openForm && (
        <button onClick={() => setOpenForm(true)}
          className="mt-1.5 flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50">
          <Phone size={11} /> {cp.done ? 'Log again' : 'Log call'}
        </button>
      )}
      {canLog && openForm && (
        <div className="mt-2 space-y-1.5">
          <select value={outcome} onChange={(e) => setOutcome(e.target.value as DriveCallOutcome)}
            className="w-full px-2 py-1 text-xs rounded-lg border border-slate-200">
            {OUTCOME_OPTIONS.map((o) => <option key={o} value={o}>{OUTCOME_LABEL[o]}</option>)}
          </select>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)"
            className="w-full px-2 py-1 text-xs rounded-lg border border-slate-200" />
          <div className="flex gap-1.5">
            <button onClick={save} disabled={saving}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              <Plus size={11} /> Save
            </button>
            <button onClick={() => setOpenForm(false)}
              className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Candidate row with tracker + reconfirmation + calls ───────────────────────
function CandidateRow({
  cand, driveId, role, driveDateFrom, onStage, onRefresh,
}: {
  cand: DriveCandidate;
  driveId: string;
  role: string;
  driveDateFrom: string | null | undefined;
  onStage: (id: number, s: DriveTrackerStage) => void;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [callType, setCallType] = useState<DriveCallType>('recruiter_followup');
  const [outcome, setOutcome] = useState('');
  const [notes, setNotes] = useState('');
  const [logging, setLogging] = useState(false);

  const canPulse = ['admin', 'kam', 'delivery_lead', 'bh'].includes(role);
  const canRecruiter = ['admin', 'kam', 'delivery_lead', 'recruiter'].includes(role);
  // Reconfirm calls are logged via the structured checkpoint forms (with outcome);
  // the general logger handles free-text follow-up / pulse calls.
  const availableTypes: DriveCallType[] = [
    ...(canRecruiter ? (['recruiter_followup'] as DriveCallType[]) : []),
    ...(canPulse ? (['lead_am_pulse'] as DriveCallType[]) : []),
  ];

  const submitCall = async (type: DriveCallType) => {
    setLogging(true);
    try {
      await api.post(`/drives/${driveId}/candidates/${cand.id}/calls`, {
        call_type: type, outcome: outcome || null, notes: notes || null,
      });
      setOutcome(''); setNotes('');
      onRefresh();   // re-pull list → updated reconfirm checkpoints + auto-advanced stage
    } finally {
      setLogging(false);
    }
  };

  const stage = cand.drive_tracker_stage ?? 'lined_up';
  const phone = cand.mobile || null;
  const d1Hint = reconfirmHint(driveDateFrom, cand.reconfirm_d1_done, 'd1');
  const ddayHint = reconfirmHint(driveDateFrom, cand.reconfirm_dday_done, 'dday');

  const checkpoints = [
    { key: 'd1', label: 'D-1 (24h before)', type: 'reconfirm_d1' as DriveCallType, done: cand.reconfirm_d1_done, confirmed: cand.reconfirm_d1_confirmed, at: cand.reconfirm_d1_at, attempts: cand.reconfirm_d1_attempts, outcome: cand.reconfirm_d1_outcome, hint: d1Hint },
    { key: 'dday', label: 'D-day (2h before)', type: 'reconfirm_dday' as DriveCallType, done: cand.reconfirm_dday_done, confirmed: cand.reconfirm_dday_confirmed, at: cand.reconfirm_dday_at, attempts: cand.reconfirm_dday_attempts, outcome: cand.reconfirm_dday_outcome, hint: ddayHint },
  ];

  return (
    <>
      {/* Main row */}
      <tr className="border-b border-slate-50 last:border-0 hover:bg-blue-50/30 align-middle">
        <td className="px-2 py-2">
          <button onClick={() => setOpen((o) => !o)} className="text-slate-400 hover:text-slate-700">
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        </td>
        <td className="px-2 py-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-800">{cand.full_name}</span>
            {cand.status && <StatusBadge status={cand.status} />}
          </div>
          {cand.designation && <div className="text-xs text-slate-500">{cand.designation}</div>}
        </td>
        <td className="px-2 py-2">
          {phone ? (
            <a href={`tel:${phone}`} className="flex items-center gap-1 text-blue-600 font-medium hover:underline whitespace-nowrap">
              <Phone size={11} /> {phone}
            </a>
          ) : <span className="text-slate-300">—</span>}
        </td>
        <td className="px-2 py-2 text-slate-600 max-w-[160px] truncate">{cand.current_company || '—'}</td>
        <td className="px-2 py-2 text-slate-600 whitespace-nowrap">{cand.exp_range || '—'}</td>
        <td className="px-2 py-2 text-slate-600 whitespace-nowrap">
          <span className="flex items-center gap-1"><UserRound size={11} /> {cand.recruiter_name ?? '—'}</span>
        </td>
        <td className="px-2 py-2 text-center">
          <ReconfirmChip label="D-1" done={cand.reconfirm_d1_done} confirmed={cand.reconfirm_d1_confirmed} outcome={cand.reconfirm_d1_outcome} at={cand.reconfirm_d1_at} hint={d1Hint} />
        </td>
        <td className="px-2 py-2 text-center">
          <ReconfirmChip label="D-day" done={cand.reconfirm_dday_done} confirmed={cand.reconfirm_dday_confirmed} outcome={cand.reconfirm_dday_outcome} at={cand.reconfirm_dday_at} hint={ddayHint} />
        </td>
        <td className="px-2 py-2">
          <select
            value={stage}
            onChange={(e) => onStage(cand.id, e.target.value as DriveTrackerStage)}
            className={`px-2 py-1 text-xs rounded-lg border-0 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-200 ${STAGE_STYLE[stage]}`}
          >
            {STAGE_OPTIONS.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
          </select>
        </td>
        <td className="px-2 py-2 text-center">
          <span className="text-xs text-slate-400 inline-flex items-center gap-1"><Phone size={12} /> {cand.drive_calls.length}</span>
        </td>
        <td className="px-2 py-2 text-center">
          <Link to={`/candidates/${cand.id}`} title="Open candidate" className="text-slate-400 hover:text-blue-600 inline-block">
            <Eye size={15} />
          </Link>
        </td>
      </tr>

      {open && (
        <tr className="bg-slate-50/60">
          <td colSpan={11} className="px-4 py-3 border-b border-slate-100">
          {/* Candidate snapshot chips */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-xs text-slate-600">
            {cand.email && <span className="flex items-center gap-1"><Mail size={11} /> {cand.email}</span>}
            {cand.location && <span>📍 {cand.location}</span>}
            {cand.skills && <span className="truncate max-w-[260px]">🛠 {cand.skills}</span>}
            {(cand.current_ctc != null || cand.expected_ctc != null) && (
              <span>💰 {cand.current_ctc ?? '—'} → {cand.expected_ctc ?? '—'} LPA</span>
            )}
            {cand.lead_source && <span>via {cand.lead_source}</span>}
          </div>

          {/* Reconfirmation (Phase 4.1) — two checkpoints with structured outcomes */}
          <p className="text-[10px] font-semibold uppercase text-slate-400 mb-1.5">Reconfirmation (Phase 4)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
            {checkpoints.map((cp) => (
              <ReconfirmCheckpoint key={cp.key} cp={cp} canLog={canRecruiter} driveId={driveId} candId={cand.id} onLogged={onRefresh} />
            ))}
          </div>

          {/* Call log */}
          {cand.drive_calls.length > 0 ? (
            <div className="space-y-1.5 mb-3">
              {cand.drive_calls.map((call) => (
                <div key={call.id} className="flex items-start gap-2 text-xs">
                  <span className={`px-1.5 py-0.5 rounded font-medium ${call.call_type ? CALL_CHIP_STYLE[call.call_type] ?? 'bg-blue-100 text-blue-700' : 'bg-blue-100 text-blue-700'}`}>
                    {call.call_type ? CALL_TYPE_LABEL[call.call_type] : 'Call'}
                  </span>
                  <div className="flex-1">
                    {call.outcome && <span className="font-semibold text-slate-700">{OUTCOME_SHORT[call.outcome] ?? call.outcome}</span>}
                    {call.notes && <span className="text-slate-500"> — {call.notes}</span>}
                    <div className="text-[10px] text-slate-400">
                      {call.caller_name ?? 'Unknown'} · {call.call_date ? new Date(call.call_date).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 mb-3">No calls logged yet.</p>
          )}

          {/* Outcome / notes (shared by checkpoint buttons + the general logger below) */}
          {availableTypes.length > 0 && (
            <div className="flex flex-wrap items-end gap-2">
              <input value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="Outcome (e.g. confirmed)"
                className="px-2 py-1 text-xs rounded-lg border border-slate-200 w-40" />
              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes"
                className="px-2 py-1 text-xs rounded-lg border border-slate-200 flex-1 min-w-[140px]" />
              <select value={callType} onChange={(e) => setCallType(e.target.value as DriveCallType)}
                className="px-2 py-1 text-xs rounded-lg border border-slate-200">
                {availableTypes.map((t) => <option key={t} value={t}>{CALL_TYPE_LABEL[t]}</option>)}
              </select>
              <button onClick={() => submitCall(callType)} disabled={logging}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                <Plus size={12} /> Log call
              </button>
            </div>
          )}
          </td>
        </tr>
      )}
    </>
  );
}
