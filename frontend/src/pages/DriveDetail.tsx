import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Save, Plus, Phone, ChevronDown, ChevronRight,
  AlertCircle, UserPlus, X, Calculator,
} from 'lucide-react';
import Layout from '../components/Layout';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import type {
  Drive, DriveCandidate, DriveStatus, DriveType, DriveTrackerStage, DriveCallType,
} from '../types';

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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-slate-800">
            Candidates <span className="text-slate-400 font-normal">({candidates.length})</span>
          </h2>
          {canAddCandidate && (
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50"
            >
              <UserPlus size={14} /> Add candidate
            </button>
          )}
        </div>

        {candidates.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">No candidates added to this drive yet.</p>
        ) : (
          <div className="space-y-2">
            {candidates.map((c) => (
              <CandidateRow
                key={c.id}
                cand={c}
                driveId={driveId!}
                role={role}
                onStage={updateStage}
                onCallAdded={(updated) =>
                  setCandidates((cs) => cs.map((x) => (x.id === updated.id ? updated : x)))
                }
              />
            ))}
          </div>
        )}
      </section>

      {showAdd && (
        <AddCandidateModal
          driveId={driveId!}
          onClose={() => setShowAdd(false)}
          onAdded={(c) => { setCandidates((cs) => [...cs, c]); setShowAdd(false); }}
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

// ── Candidate row with tracker + calls ────────────────────────────────────────
function CandidateRow({
  cand, driveId, role, onStage, onCallAdded,
}: {
  cand: DriveCandidate;
  driveId: string;
  role: string;
  onStage: (id: number, s: DriveTrackerStage) => void;
  onCallAdded: (c: DriveCandidate) => void;
}) {
  const [open, setOpen] = useState(false);
  const [callType, setCallType] = useState<DriveCallType>('recruiter_followup');
  const [outcome, setOutcome] = useState('');
  const [notes, setNotes] = useState('');
  const [logging, setLogging] = useState(false);

  const canPulse = ['admin', 'kam', 'delivery_lead', 'bh'].includes(role);
  const canRecruiter = ['admin', 'kam', 'delivery_lead', 'recruiter'].includes(role);
  const availableTypes: DriveCallType[] = [
    ...(canRecruiter ? (['recruiter_followup'] as DriveCallType[]) : []),
    ...(canPulse ? (['lead_am_pulse'] as DriveCallType[]) : []),
  ];

  const logCall = async () => {
    setLogging(true);
    try {
      await api.post(`/drives/${driveId}/candidates/${cand.id}/calls`, {
        call_type: callType, outcome: outcome || null, notes: notes || null,
      });
      // refetch this candidate's calls via the candidates list is heavy; just
      // re-pull the single candidate's calls and merge.
      const res = await api.get(`/drives/${driveId}/candidates/${cand.id}/calls`);
      onCallAdded({ ...cand, drive_calls: res.data });
      setOutcome(''); setNotes('');
    } finally {
      setLogging(false);
    }
  };

  const stage = cand.drive_tracker_stage ?? 'lined_up';

  return (
    <div className="rounded-xl border border-slate-100">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <button onClick={() => setOpen((o) => !o)} className="text-slate-400 hover:text-slate-700">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-slate-800 truncate">{cand.full_name}</div>
          <div className="text-xs text-slate-500 truncate">
            {[cand.mobile, cand.designation, cand.current_company].filter(Boolean).join(' · ') || '—'}
          </div>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${STAGE_STYLE[stage]}`}>
          {STAGE_LABEL[stage]}
        </span>
        <select
          value={stage}
          onChange={(e) => onStage(cand.id, e.target.value as DriveTrackerStage)}
          className="px-2 py-1 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
        >
          {STAGE_OPTIONS.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
        </select>
        <span className="text-xs text-slate-400 flex items-center gap-1 w-14 justify-end">
          <Phone size={12} /> {cand.drive_calls.length}
        </span>
      </div>

      {open && (
        <div className="border-t border-slate-100 px-3 py-3 bg-slate-50/50">
          {/* Call log */}
          {cand.drive_calls.length > 0 ? (
            <div className="space-y-1.5 mb-3">
              {cand.drive_calls.map((call) => (
                <div key={call.id} className="flex items-start gap-2 text-xs">
                  <span className={`px-1.5 py-0.5 rounded font-medium ${call.call_type === 'lead_am_pulse' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}`}>
                    {call.call_type ? CALL_TYPE_LABEL[call.call_type] : 'Call'}
                  </span>
                  <div className="flex-1">
                    {call.outcome && <span className="font-semibold text-slate-700">{call.outcome}</span>}
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

          {/* Add call */}
          {availableTypes.length > 0 && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase text-slate-400">Call type</span>
                <select value={callType} onChange={(e) => setCallType(e.target.value as DriveCallType)}
                  className="px-2 py-1 text-xs rounded-lg border border-slate-200">
                  {availableTypes.map((t) => <option key={t} value={t}>{CALL_TYPE_LABEL[t]}</option>)}
                </select>
              </label>
              <input value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="Outcome (e.g. confirmed)"
                className="px-2 py-1 text-xs rounded-lg border border-slate-200 w-40" />
              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes"
                className="px-2 py-1 text-xs rounded-lg border border-slate-200 flex-1 min-w-[140px]" />
              <button onClick={logCall} disabled={logging}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                <Plus size={12} /> Log call
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Add candidate modal ───────────────────────────────────────────────────────
function AddCandidateModal({
  driveId, onClose, onAdded,
}: {
  driveId: string;
  onClose: () => void;
  onAdded: (c: DriveCandidate) => void;
}) {
  const [f, setF] = useState({
    full_name: '', mobile: '', email: '', skills: '', designation: '',
    current_company: '', location: '', min_experience: '', max_experience: '',
    current_ctc: '', expected_ctc: '', lead_source: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));

  const submit = async () => {
    if (!f.full_name.trim()) { setErr('Name is required.'); return; }
    setSaving(true); setErr(null);
    try {
      const payload: Record<string, unknown> = { full_name: f.full_name.trim() };
      for (const k of ['mobile', 'email', 'skills', 'designation', 'current_company', 'location', 'lead_source'] as const) {
        if (f[k].trim()) payload[k] = f[k].trim();
      }
      for (const k of ['min_experience', 'max_experience', 'current_ctc', 'expected_ctc'] as const) {
        if (f[k].trim()) payload[k] = Number(f[k]);
      }
      const res = await api.post<DriveCandidate>(`/drives/${driveId}/candidates`, payload);
      onAdded(res.data);
    } catch {
      setErr('Failed to add candidate.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-800">Add candidate to drive</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        {err && <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 text-red-700 text-xs">{err}</div>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Full name *"><input value={f.full_name} onChange={(e) => set('full_name', e.target.value)} className={inputCls} /></Field>
          <Field label="Mobile"><input value={f.mobile} onChange={(e) => set('mobile', e.target.value)} className={inputCls} /></Field>
          <Field label="Email"><input value={f.email} onChange={(e) => set('email', e.target.value)} className={inputCls} /></Field>
          <Field label="Designation"><input value={f.designation} onChange={(e) => set('designation', e.target.value)} className={inputCls} /></Field>
          <Field label="Current company"><input value={f.current_company} onChange={(e) => set('current_company', e.target.value)} className={inputCls} /></Field>
          <Field label="Location"><input value={f.location} onChange={(e) => set('location', e.target.value)} className={inputCls} /></Field>
          <Field label="Skills" className="col-span-2"><input value={f.skills} onChange={(e) => set('skills', e.target.value)} className={inputCls} /></Field>
          <Field label="Min exp (yrs)"><input type="number" value={f.min_experience} onChange={(e) => set('min_experience', e.target.value)} className={inputCls} /></Field>
          <Field label="Max exp (yrs)"><input type="number" value={f.max_experience} onChange={(e) => set('max_experience', e.target.value)} className={inputCls} /></Field>
          <Field label="Current CTC"><input type="number" value={f.current_ctc} onChange={(e) => set('current_ctc', e.target.value)} className={inputCls} /></Field>
          <Field label="Expected CTC"><input type="number" value={f.expected_ctc} onChange={(e) => set('expected_ctc', e.target.value)} className={inputCls} /></Field>
          <Field label="Lead source" className="col-span-2"><input value={f.lead_source} onChange={(e) => set('lead_source', e.target.value)} className={inputCls} /></Field>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Adding…' : 'Add candidate'}
          </button>
        </div>
      </div>
    </div>
  );
}
