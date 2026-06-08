import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  Plus, Pencil, Trash2, ChevronDown, ChevronRight,
  TrendingUp, IndianRupee, Zap, Send,
  X, Check, Loader2, Users, ChevronsUpDown,
  AlertCircle,
} from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

/* ── types ──────────────────────────────────────────────────────────────────── */

interface FlatRow {
  customer_id: number;
  customer_name: string;
  client_id: number | null;
  bucket: string | null;
  bh_user_id: number | null;
  bh_name: string | null;
  consolidated_net_po_rl: number | null;
  line_id: number | null;
  effort_line: string | null;
  leadership_contact: string | null;
  opportunity_type: string | null;
  track: string | null;
  target_rl: number | null;
  budget: string | null;
  bottleneck: string | null;
  escalation: string | null;
  stage: string | null;
  ldr_mtg: string | null;
  mtg_date: string | null;
  next_action: string | null;
  due_date: string | null;
  status: string | null;
  comments: string | null;
}

interface Client { id: number; name: string }
interface BHUser { id: number; name: string }
interface SummaryStats {
  revenue_booked_rl: number;
  open_pipeline_rl: number;
  active_engagements: number;
  proposals_out: number;
}

/* ── constants ──────────────────────────────────────────────────────────────── */

const BUCKETS = ['Strategic', 'Growth', 'New'];
const TRACKS = ['T1 - Demand Gen (extra)', 'T2 - Large Deals', 'T3 - Upsell / Managed Svcs', 'T4 - Creative / Strategic'];
const OPPORTUNITY_TYPES = ['BAU - MRR', 'Bulk Deals', 'Drives', 'Pod / Managed Services', 'Consolidation', 'Managed Services Solutions'];
const BUDGETS = ['Yes', 'No', 'Partial', 'Unknown'];
const STAGES = ['Scope / Oppty ID', '1st Meeting', '2nd Meeting', 'Proposal Sent', 'Negotiation', 'Verbal Commit', 'Signed / Won', 'Parked', 'Lost'];
const LDR_MTGS = ['Yes - Done', 'Scheduled', 'Requested', 'Not Yet'];
const STATUSES = ['Not Started', 'In Progress', 'On Track', 'At Risk', 'Parked', 'Won', 'Lost'];
const BOTTLENECKS = ['Low Selections', 'Quality Submissions', 'No Shows', 'Others', 'None'];
const ESCALATIONS = ['None', 'Budget freeze / on hold', 'Delivery / quality', 'Relationship / access', 'Commercial / rate', 'Attrition / exit risk', 'Approval pending (client)', 'Other'];

const TRACK_SHORT: Record<string, string> = {
  'T1 - Demand Gen (extra)': 'T1',
  'T2 - Large Deals': 'T2',
  'T3 - Upsell / Managed Svcs': 'T3',
  'T4 - Creative / Strategic': 'T4',
};

const TYPE_SHORT: Record<string, string> = {
  'Pod / Managed Services': 'Pod/MS',
  'Managed Services Solutions': 'MS Sol',
  'BAU - MRR': 'MRR',
  'Bulk Deals': 'Bulk',
  'Drives': 'Drives',
  'Consolidation': 'Consol.',
};

/* ── status & bucket tokens ─────────────────────────────────────────────────── */

const STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string }> = {
  'Won':         { bg: '#DCFCE7', text: '#166534', dot: '#16A34A' },
  'Lost':        { bg: '#F1F5F9', text: '#64748B', dot: '#94A3B8' },
  'In Progress': { bg: '#DBEAFE', text: '#1E40AF', dot: '#3B82F6' },
  'On Track':    { bg: '#CCFBF1', text: '#134E4A', dot: '#0D9488' },
  'At Risk':     { bg: '#FEE2E2', text: '#991B1B', dot: '#EF4444' },
  'Parked':      { bg: '#FEF3C7', text: '#92400E', dot: '#D97706' },
  'Not Started': { bg: '#F8FAFC', text: '#94A3B8', dot: '#CBD5E1' },
};

const BUCKET_CONFIG: Record<string, { bg: string; text: string; border: string }> = {
  'Strategic': { bg: '#EEF2FF', text: '#4338CA', border: '#C7D2FE' },
  'Growth':    { bg: '#F0FDF4', text: '#15803D', border: '#BBF7D0' },
  'New':       { bg: '#F0F9FF', text: '#0369A1', border: '#BAE6FD' },
};

const STAGE_CONFIG: Record<string, { bg: string; text: string }> = {
  'Signed / Won':    { bg: '#DCFCE7', text: '#166534' },
  'Won':             { bg: '#DCFCE7', text: '#166534' },
  'Proposal Sent':   { bg: '#EFF6FF', text: '#1D4ED8' },
  'Negotiation':     { bg: '#FFF7ED', text: '#C2410C' },
  'Verbal Commit':   { bg: '#FAF5FF', text: '#7E22CE' },
  'Lost':            { bg: '#F1F5F9', text: '#475569' },
  'Parked':          { bg: '#FFFBEB', text: '#92400E' },
  '2nd Meeting':     { bg: '#EFF6FF', text: '#1E40AF' },
  '1st Meeting':     { bg: '#F0F9FF', text: '#0369A1' },
  'Scope / Oppty ID':{ bg: '#F8FAFC', text: '#64748B' },
};

/* ── helpers ────────────────────────────────────────────────────────────────── */

function fmt(v: number | null | undefined) {
  if (v == null) return '—';
  return v % 1 === 0 ? String(v) : v.toFixed(1);
}

function StatusBadge({ status }: { status: string | null }) {
  const s = status ?? 'Not Started';
  const cfg = STATUS_CONFIG[s] ?? STATUS_CONFIG['Not Started'];
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
      style={{ background: cfg.bg, color: cfg.text }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: cfg.dot }} />
      {s}
    </span>
  );
}

function BucketBadge({ bucket }: { bucket: string | null }) {
  if (!bucket) return <span className="text-slate-400 text-xs">—</span>;
  const cfg = BUCKET_CONFIG[bucket] ?? { bg: '#F8FAFC', text: '#64748B', border: '#E2E8F0' };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border"
      style={{ background: cfg.bg, color: cfg.text, borderColor: cfg.border }}
    >
      {bucket}
    </span>
  );
}

function TrackBadge({ track }: { track: string | null }) {
  if (!track) return <span className="text-slate-400">—</span>;
  const short = TRACK_SHORT[track] ?? track;
  const colors: Record<string, string> = { T1: '#EFF6FF', T2: '#FDF4FF', T3: '#FFF7ED', T4: '#F0FDF4' };
  const textColors: Record<string, string> = { T1: '#1D4ED8', T2: '#7E22CE', T3: '#C2410C', T4: '#15803D' };
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold"
      style={{ background: colors[short] ?? '#F8FAFC', color: textColors[short] ?? '#64748B' }}
    >
      {short}
    </span>
  );
}

function StageBadge({ stage }: { stage: string | null }) {
  if (!stage) return <span className="text-slate-400 text-xs">—</span>;
  const cfg = STAGE_CONFIG[stage] ?? { bg: '#F8FAFC', text: '#64748B' };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap"
      style={{ background: cfg.bg, color: cfg.text }}
    >
      {stage}
    </span>
  );
}

/* ── shared form primitives ─────────────────────────────────────────────────── */

const inputCls = [
  'w-full px-3 py-2 text-sm rounded-lg border border-slate-200',
  'bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
  'placeholder:text-slate-400',
].join(' ');
const selectCls = `${inputCls} appearance-none`;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

/* ── searchable client select ────────────────────────────────────────────────── */

function ClientSelect({
  clients,
  value,
  onChange,
}: {
  clients: Client[];
  value: number | '';
  onChange: (id: number) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = useMemo(
    () => clients.filter(c => c.name.toLowerCase().includes(query.toLowerCase())),
    [clients, query]
  );
  const selected = clients.find(c => c.id === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`${inputCls} flex items-center justify-between text-left`}
      >
        <span className={selected ? 'text-slate-800' : 'text-slate-400'}>
          {selected ? selected.name : '— Select client —'}
        </span>
        <ChevronsUpDown size={14} className="text-slate-400 flex-shrink-0 ml-2" />
      </button>
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <input
              autoFocus
              className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-slate-400"
              placeholder="Search client..."
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          <ul className="max-h-48 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-xs text-slate-400 text-center">No clients found</li>
            )}
            {filtered.map(c => (
              <li
                key={c.id}
                onClick={() => { onChange(c.id); setOpen(false); setQuery(''); }}
                className={`px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 hover:text-blue-700 transition-colors ${value === c.id ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-700'}`}
              >
                {c.name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ── customer modal ──────────────────────────────────────────────────────────── */

interface CustomerModalProps {
  onClose: () => void;
  onSaved: () => void;
  initial?: { customer_id: number; client_id: number | null; bucket: string | null; bh_user_id: number | null; consolidated_net_po_rl: number | null };
  clients: Client[];
  bhs: BHUser[];
  isBH: boolean;
  currentUserId: number;
}

function CustomerModal({ onClose, onSaved, initial, clients, bhs, isBH, currentUserId }: CustomerModalProps) {
  const isEdit = !!initial?.customer_id;
  const [form, setForm] = useState({
    client_id: initial?.client_id ?? ('' as number | ''),
    bucket: initial?.bucket ?? '',
    bh_user_id: initial?.bh_user_id ?? (isBH ? currentUserId : 0),
    consolidated_net_po_rl: initial?.consolidated_net_po_rl != null ? String(initial.consolidated_net_po_rl) : '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!form.client_id) { setError('Please select a client'); return; }
    setSaving(true); setError(null);
    try {
      const payload = {
        client_id: form.client_id,
        bucket: form.bucket || null,
        bh_user_id: isBH ? currentUserId : (form.bh_user_id || null),
        consolidated_net_po_rl: form.consolidated_net_po_rl !== '' ? Number(form.consolidated_net_po_rl) : null,
      };
      if (isEdit) await api.put(`/sales-effort/customers/${initial!.customer_id}`, payload);
      else await api.post('/sales-effort/customers', payload);
      onSaved();
    } catch (e: unknown) {
      setError((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Save failed');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(2px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-slate-900">{isEdit ? 'Edit Customer' : 'Add Customer'}</h2>
            <p className="text-xs text-slate-500 mt-0.5">Select from the clients list — no free-typing</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"><X size={16} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <Field label="Client *">
            <ClientSelect clients={clients} value={form.client_id} onChange={id => setForm(f => ({ ...f, client_id: id }))} />
          </Field>
          <Field label="Bucket">
            <select className={selectCls} value={form.bucket} onChange={e => setForm(f => ({ ...f, bucket: e.target.value }))}>
              <option value="">— Select —</option>
              {BUCKETS.map(b => <option key={b}>{b}</option>)}
            </select>
          </Field>
          {!isBH && (
            <Field label="Business Head *">
              <select className={selectCls} value={form.bh_user_id} onChange={e => setForm(f => ({ ...f, bh_user_id: Number(e.target.value) }))}>
                <option value={0}>— Select BH —</option>
                {bhs.map(bh => <option key={bh.id} value={bh.id}>{bh.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="Consolidated Net PO ₹L">
            <input
              className={inputCls} type="number" step="0.5" min="0"
              value={form.consolidated_net_po_rl}
              onChange={e => setForm(f => ({ ...f, consolidated_net_po_rl: e.target.value }))}
              placeholder="e.g. 22"
            />
          </Field>
          {error && (
            <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 rounded-lg px-3 py-2">
              <AlertCircle size={13} /> {error}
            </div>
          )}
        </div>
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
          <button
            onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {isEdit ? 'Update' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── effort line modal ───────────────────────────────────────────────────────── */

interface LineModalProps {
  customerId: number;
  customerName: string;
  onClose: () => void;
  onSaved: () => void;
  initial?: FlatRow | null;
}

function LineModal({ customerId, customerName, onClose, onSaved, initial }: LineModalProps) {
  const isEdit = !!initial?.line_id;
  const [form, setForm] = useState({
    effort_line: initial?.effort_line ?? '',
    leadership_contact: initial?.leadership_contact ?? '',
    opportunity_type: initial?.opportunity_type ?? '',
    track: initial?.track ?? '',
    target_rl: initial?.target_rl != null ? String(initial.target_rl) : '',
    budget: initial?.budget ?? '',
    bottleneck: initial?.bottleneck ?? '',
    escalation: initial?.escalation ?? '',
    stage: initial?.stage ?? '',
    ldr_mtg: initial?.ldr_mtg ?? '',
    mtg_date: initial?.mtg_date ?? '',
    next_action: initial?.next_action ?? '',
    due_date: initial?.due_date ?? '',
    status: initial?.status ?? 'Not Started',
    comments: initial?.comments ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }));

  const handleSave = async () => {
    setSaving(true); setError(null);
    try {
      const payload = {
        effort_line: form.effort_line || null,
        leadership_contact: form.leadership_contact || null,
        opportunity_type: form.opportunity_type || null,
        track: form.track || null,
        target_rl: form.target_rl !== '' ? Number(form.target_rl) : null,
        budget: form.budget || null,
        bottleneck: form.bottleneck || null,
        escalation: form.escalation || null,
        stage: form.stage || null,
        ldr_mtg: form.ldr_mtg || null,
        mtg_date: form.mtg_date || null,
        next_action: form.next_action || null,
        due_date: form.due_date || null,
        status: form.status || 'Not Started',
        comments: form.comments || null,
      };
      if (isEdit) await api.put(`/sales-effort/lines/${initial!.line_id}`, payload);
      else await api.post(`/sales-effort/customers/${customerId}/lines`, payload);
      onSaved();
    } catch (e: unknown) {
      setError((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Save failed');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto" style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(2px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-slate-900">{isEdit ? 'Edit Effort Line' : 'Add Effort Line'}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{customerName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"><X size={16} /></button>
        </div>
        <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Field label="Effort Line / Initiative">
              <textarea className={inputCls} rows={2} value={form.effort_line} onChange={set('effort_line')} placeholder="Describe the initiative..." />
            </Field>
          </div>
          <Field label="Leadership Contact">
            <input className={inputCls} value={form.leadership_contact} onChange={set('leadership_contact')} placeholder="Name — Title" />
          </Field>
          <Field label="Opportunity Type">
            <select className={selectCls} value={form.opportunity_type} onChange={set('opportunity_type')}>
              <option value="">— Select —</option>
              {OPPORTUNITY_TYPES.map(o => <option key={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Track">
            <select className={selectCls} value={form.track} onChange={set('track')}>
              <option value="">— Select —</option>
              {TRACKS.map(t => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Target ₹L">
            <input className={inputCls} type="number" step="0.5" min="0" value={form.target_rl} onChange={set('target_rl')} placeholder="e.g. 15" />
          </Field>
          <Field label="Stage">
            <select className={selectCls} value={form.stage} onChange={set('stage')}>
              <option value="">— Select —</option>
              {STAGES.map(s => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select className={selectCls} value={form.status} onChange={set('status')}>
              {STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Budget">
            <select className={selectCls} value={form.budget} onChange={set('budget')}>
              <option value="">— Select —</option>
              {BUDGETS.map(b => <option key={b}>{b}</option>)}
            </select>
          </Field>
          <Field label="Leadership Meeting">
            <select className={selectCls} value={form.ldr_mtg} onChange={set('ldr_mtg')}>
              <option value="">— Select —</option>
              {LDR_MTGS.map(l => <option key={l}>{l}</option>)}
            </select>
          </Field>
          <Field label="Meeting Date">
            <input className={inputCls} value={form.mtg_date} onChange={set('mtg_date')} placeholder="e.g. 4-Jun" />
          </Field>
          <Field label="Due Date">
            <input className={inputCls} value={form.due_date} onChange={set('due_date')} placeholder="e.g. 10-Jun" />
          </Field>
          <Field label="Bottleneck">
            <select className={selectCls} value={form.bottleneck} onChange={set('bottleneck')}>
              <option value="">— None —</option>
              {BOTTLENECKS.map(b => <option key={b}>{b}</option>)}
            </select>
          </Field>
          <Field label="Escalation">
            <select className={selectCls} value={form.escalation} onChange={set('escalation')}>
              <option value="">— None —</option>
              {ESCALATIONS.map(e => <option key={e}>{e}</option>)}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Next Action">
              <input className={inputCls} value={form.next_action} onChange={set('next_action')} placeholder="What needs to happen next..." />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Comments / War Room Tag">
              <textarea className={inputCls} rows={2} value={form.comments} onChange={set('comments')} placeholder="War Room T2 (₹15L), notes..." />
            </Field>
          </div>
          {error && (
            <div className="sm:col-span-2 flex items-center gap-2 text-red-600 text-xs bg-red-50 rounded-lg px-3 py-2">
              <AlertCircle size={13} /> {error}
            </div>
          )}
        </div>
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
          <button
            onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {isEdit ? 'Update' : 'Add Line'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── confirm delete ──────────────────────────────────────────────────────────── */

function ConfirmModal({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(2px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h3 className="font-bold text-slate-900 mb-2">Confirm Delete</h3>
        <p className="text-sm text-slate-600 mb-6">{message}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-2 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">Delete</button>
        </div>
      </div>
    </div>
  );
}

/* ── KPI card ────────────────────────────────────────────────────────────────── */

function KpiCard({ label, value, sub, icon, accent }: { label: string; value: string; sub?: string; icon: React.ReactNode; accent: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4 shadow-sm">
      <div className="p-2.5 rounded-xl flex-shrink-0" style={{ background: accent + '18' }}>
        <span style={{ color: accent }}>{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-black text-slate-900 leading-tight tabular-nums">{value}</p>
        {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

/* ── filter chip ─────────────────────────────────────────────────────────────── */

function FilterSelect({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; placeholder: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`
          pl-3 pr-8 py-2 text-sm border rounded-lg bg-white appearance-none cursor-pointer
          focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors
          ${value ? 'border-blue-400 text-blue-700 font-semibold bg-blue-50' : 'border-slate-200 text-slate-600'}
        `}
      >
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
    </div>
  );
}

/* ── customer group header ───────────────────────────────────────────────────── */

function CustomerHeader({
  customerName, bucket, bhName, netPoRl, lineCount, isExpanded,
  canWrite, canDelete,
  onToggle, onAddLine, onEdit, onDelete,
}: {
  customerName: string; bucket: string | null; bhName: string | null;
  netPoRl: number | null; lineCount: number; isExpanded: boolean;
  canWrite: boolean; canDelete: boolean;
  onToggle: () => void; onAddLine: () => void; onEdit: () => void; onDelete: () => void;
}) {
  return (
    <tr
      onClick={onToggle}
      className="cursor-pointer select-none group"
      style={{ background: '#0C1B33' }}
    >
      {/* expand icon + customer name */}
      <td className="px-4 py-3" style={{ width: 'auto' }}>
        <div className="flex items-center gap-2.5">
          <span className="text-slate-400 flex-shrink-0 transition-transform group-hover:text-slate-300">
            {isExpanded
              ? <ChevronDown size={15} className="text-blue-400" />
              : <ChevronRight size={15} />
            }
          </span>
          <span className="font-bold text-white text-sm tracking-wide">{customerName}</span>
          {lineCount > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.1)', color: '#94A3B8' }}>
              {lineCount}
            </span>
          )}
        </div>
      </td>
      {/* bucket */}
      <td className="px-3 py-3">
        <BucketBadge bucket={bucket} />
      </td>
      {/* bh */}
      <td className="px-3 py-3">
        <div className="flex items-center gap-1.5">
          <Users size={11} className="text-slate-500 flex-shrink-0" />
          <span className="text-xs text-slate-300">{bhName ?? '—'}</span>
        </div>
      </td>
      {/* net po */}
      <td className="px-3 py-3">
        {netPoRl != null ? (
          <span className="text-sm font-bold tabular-nums" style={{ color: '#60A5FA' }}>
            ₹{fmt(netPoRl)}L
          </span>
        ) : (
          <span className="text-xs text-slate-600">—</span>
        )}
      </td>
      {/* spacer columns */}
      <td colSpan={6} />
      {/* actions */}
      <td className="px-3 py-3 text-right">
        <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
          {canWrite && (
            <>
              <button
                onClick={onAddLine}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors"
                style={{ background: 'rgba(59,130,246,0.2)', color: '#93C5FD' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.35)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.2)')}
              >
                <Plus size={11} /> Line
              </button>
              <button
                onClick={onEdit}
                className="p-1.5 rounded-md transition-colors"
                style={{ color: '#64748B' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#CBD5E1'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#64748B'; }}
                title="Edit customer"
              >
                <Pencil size={12} />
              </button>
            </>
          )}
          {canDelete && (
            <button
              onClick={onDelete}
              className="p-1.5 rounded-md transition-colors"
              style={{ color: '#64748B' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; e.currentTarget.style.color = '#FCA5A5'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#64748B'; }}
              title="Delete customer"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

/* ── effort line row ─────────────────────────────────────────────────────────── */

function LineRow({ line, canWrite, canDelete, isEven, onEdit, onDelete }: {
  line: FlatRow; canWrite: boolean; canDelete: boolean; isEven: boolean;
  onEdit: () => void; onDelete: () => void;
}) {
  const bg = isEven ? '#FAFBFE' : '#FFFFFF';
  return (
    <tr
      className="border-b border-slate-100 group transition-colors"
      style={{ background: bg }}
      onMouseEnter={e => (e.currentTarget.style.background = '#EFF6FF')}
      onMouseLeave={e => (e.currentTarget.style.background = bg)}
    >
      {/* effort line - spans first 2 cols */}
      <td className="px-4 py-2.5 pl-10" colSpan={1} style={{ minWidth: 280, maxWidth: 320 }}>
        <span className="text-slate-700 text-xs leading-relaxed line-clamp-2 block" title={line.effort_line ?? ''}>
          {line.effort_line ?? <span className="text-slate-400 italic">No description</span>}
        </span>
      </td>
      {/* bucket placeholder (empty - shown in header) */}
      <td className="px-3 py-2.5" style={{ minWidth: 80 }}>
        {/* intentionally empty */}
      </td>
      {/* contact */}
      <td className="px-3 py-2.5" style={{ minWidth: 140, maxWidth: 180 }}>
        <span className="text-slate-600 text-xs line-clamp-1" title={line.leadership_contact ?? ''}>
          {line.leadership_contact ?? <span className="text-slate-300">—</span>}
        </span>
      </td>
      {/* type */}
      <td className="px-3 py-2.5 whitespace-nowrap" style={{ minWidth: 70 }}>
        <span className="text-slate-500 text-xs font-medium">
          {line.opportunity_type ? (TYPE_SHORT[line.opportunity_type] ?? line.opportunity_type) : <span className="text-slate-300">—</span>}
        </span>
      </td>
      {/* track */}
      <td className="px-3 py-2.5" style={{ minWidth: 40 }}>
        <TrackBadge track={line.track} />
      </td>
      {/* target */}
      <td className="px-3 py-2.5 text-right" style={{ minWidth: 60 }}>
        <span className="text-slate-700 text-xs font-semibold tabular-nums">
          {line.target_rl != null ? `₹${fmt(line.target_rl)}L` : <span className="text-slate-300 font-normal">—</span>}
        </span>
      </td>
      {/* stage */}
      <td className="px-3 py-2.5" style={{ minWidth: 100 }}>
        <StageBadge stage={line.stage} />
      </td>
      {/* ldr mtg */}
      <td className="px-3 py-2.5 whitespace-nowrap" style={{ minWidth: 90 }}>
        <span className={`text-xs ${line.ldr_mtg === 'Yes - Done' ? 'text-emerald-600 font-semibold' : line.ldr_mtg ? 'text-slate-500' : 'text-slate-300'}`}>
          {line.ldr_mtg ?? '—'}
        </span>
      </td>
      {/* due */}
      <td className="px-3 py-2.5 whitespace-nowrap" style={{ minWidth: 70 }}>
        <span className="text-slate-500 text-xs">{line.due_date ?? <span className="text-slate-300">—</span>}</span>
      </td>
      {/* status */}
      <td className="px-3 py-2.5" style={{ minWidth: 110 }}>
        <StatusBadge status={line.status} />
      </td>
      {/* actions */}
      <td className="px-3 py-2.5 text-right" style={{ minWidth: 70 }}>
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {canWrite && (
            <button onClick={onEdit} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors" title="Edit">
              <Pencil size={11} />
            </button>
          )}
          {canDelete && (
            <button onClick={onDelete} className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors" title="Delete">
              <Trash2 size={11} />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

/* ── main page ───────────────────────────────────────────────────────────────── */

export default function SalesEffortTracker() {
  const { user } = useAuth();
  const role = user?.role ?? '';
  const isBH = role === 'bh';
  const isPrivileged = role === 'admin' || role === 'coo';
  const canWrite = isBH || isPrivileged;
  const canDelete = isPrivileged;

  const [rows, setRows] = useState<FlatRow[]>([]);
  const [stats, setStats] = useState<SummaryStats>({ revenue_booked_rl: 0, open_pipeline_rl: 0, active_engagements: 0, proposals_out: 0 });
  const [clients, setClients] = useState<Client[]>([]);
  const [bhs, setBhs] = useState<BHUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // filters
  const [filterBH, setFilterBH] = useState('');
  const [filterBucket, setFilterBucket] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTrack, setFilterTrack] = useState('');

  // expand state
  const [expandedCustomers, setExpandedCustomers] = useState<Set<number>>(new Set());

  // modals
  const [customerModal, setCustomerModal] = useState<{ open: boolean; initial?: CustomerModalProps['initial'] }>({ open: false });
  const [lineModal, setLineModal] = useState<{ customerId: number; customerName: string; line?: FlatRow } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'customer' | 'line'; id: number; label: string } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const bhParam = !isBH && filterBH ? { bh_user_id: filterBH } : {};
      const [flatRes, statsRes] = await Promise.all([
        api.get<{ rows: FlatRow[] }>('/sales-effort/flat', { params: bhParam }),
        api.get<SummaryStats>('/sales-effort/summary', { params: bhParam }),
      ]);
      setRows(flatRes.data.rows ?? []);
      setStats(statsRes.data);
    } catch {
      setError('Failed to load data');
    } finally { setLoading(false); }
  }, [isBH, filterBH]);

  // load static data once
  useEffect(() => {
    Promise.all([
      api.get<Client[]>('/clients'),
      api.get<{ bh_users: BHUser[] }>('/sales-effort/bh-users'),
    ]).then(([clientsRes, bhsRes]) => {
      setClients(Array.isArray(clientsRes.data) ? clientsRes.data : []);
      setBhs(bhsRes.data.bh_users ?? []);
    }).catch(() => {});
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // group rows by customer
  type Group = {
    customerId: number; customerName: string; clientId: number | null;
    bucket: string | null; bhName: string | null; bhUserId: number | null;
    netPoRl: number | null; lines: FlatRow[];
  };

  const groups = useMemo<Group[]>(() => {
    const map = new Map<number, Group>();
    for (const r of rows) {
      if (!map.has(r.customer_id)) {
        map.set(r.customer_id, {
          customerId: r.customer_id, customerName: r.customer_name,
          clientId: r.client_id, bucket: r.bucket,
          bhName: r.bh_name, bhUserId: r.bh_user_id,
          netPoRl: r.consolidated_net_po_rl, lines: [],
        });
      }
      if (r.line_id !== null) map.get(r.customer_id)!.lines.push(r);
    }
    return Array.from(map.values());
  }, [rows]);

  const filteredGroups = useMemo(() => groups.filter(g => {
    if (filterBucket && g.bucket !== filterBucket) return false;
    if (filterBH && !isBH && String(g.bhUserId) !== filterBH) return false;
    if (filterStatus || filterTrack) {
      if (g.lines.length > 0) {
        const hasMatch = g.lines.some(l => {
          if (filterStatus && l.status !== filterStatus) return false;
          if (filterTrack && l.track !== filterTrack) return false;
          return true;
        });
        if (!hasMatch) return false;
      }
    }
    return true;
  }), [groups, filterBucket, filterBH, filterStatus, filterTrack, isBH]);

  const toggleCustomer = (id: number) =>
    setExpandedCustomers(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const allExpanded = filteredGroups.every(g => expandedCustomers.has(g.customerId));
  const toggleAll = () => {
    if (allExpanded) setExpandedCustomers(new Set());
    else setExpandedCustomers(new Set(filteredGroups.map(g => g.customerId)));
  };

  const canWriteGroup = (bhUserId: number | null) =>
    isPrivileged || (isBH && bhUserId === user?.user_id);

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      if (confirmDelete.type === 'customer') await api.delete(`/sales-effort/customers/${confirmDelete.id}`);
      else await api.delete(`/sales-effort/lines/${confirmDelete.id}`);
      setConfirmDelete(null);
      fetchData();
    } catch { setConfirmDelete(null); }
  };

  const activeFilters = [filterBH, filterBucket, filterStatus, filterTrack].filter(Boolean).length;

  return (
    <Layout title="Sales Effort Tracker" subtitle="BH pipeline — accounts, effort lines & deal stages">

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KpiCard
          label="Revenue Booked" value={`₹${fmt(stats.revenue_booked_rl)}L`}
          sub="Status = Won" icon={<IndianRupee size={18} />} accent="#16A34A"
        />
        <KpiCard
          label="Open Pipeline" value={`₹${fmt(stats.open_pipeline_rl)}L`}
          sub="In Progress" icon={<TrendingUp size={18} />} accent="#2563EB"
        />
        <KpiCard
          label="Active Engagements" value={String(stats.active_engagements)}
          sub="Customers in progress" icon={<Zap size={18} />} accent="#7C3AED"
        />
        <KpiCard
          label="Proposals Out" value={String(stats.proposals_out)}
          sub="Stage = Proposal Sent" icon={<Send size={18} />} accent="#D97706"
        />
      </div>

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {isPrivileged && (
          <FilterSelect
            value={filterBH}
            onChange={setFilterBH}
            placeholder="All BHs"
            options={bhs.map(b => ({ value: String(b.id), label: b.name }))}
          />
        )}
        <FilterSelect
          value={filterBucket} onChange={setFilterBucket} placeholder="All Buckets"
          options={BUCKETS.map(b => ({ value: b, label: b }))}
        />
        <FilterSelect
          value={filterStatus} onChange={setFilterStatus} placeholder="All Statuses"
          options={STATUSES.map(s => ({ value: s, label: s }))}
        />
        <FilterSelect
          value={filterTrack} onChange={setFilterTrack} placeholder="All Tracks"
          options={TRACKS.map(t => ({ value: t, label: TRACK_SHORT[t] + ' — ' + t.split(' - ')[1] }))}
        />
        {activeFilters > 0 && (
          <button
            onClick={() => { setFilterBH(''); setFilterBucket(''); setFilterStatus(''); setFilterTrack(''); }}
            className="text-xs text-blue-600 hover:text-blue-800 font-semibold px-2 py-1 hover:bg-blue-50 rounded-lg transition-colors"
          >
            Clear {activeFilters} filter{activeFilters > 1 ? 's' : ''}
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={toggleAll}
            className="px-3 py-2 text-xs font-medium text-slate-600 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 transition-colors"
          >
            {allExpanded ? 'Collapse All' : 'Expand All'}
          </button>
          {canWrite && (
            <button
              onClick={() => setCustomerModal({ open: true })}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Plus size={13} /> Add Customer
            </button>
          )}
        </div>
      </div>

      {/* results summary */}
      <p className="text-xs text-slate-400 mb-2">
        {filteredGroups.length} customer{filteredGroups.length !== 1 ? 's' : ''}
        {filteredGroups.reduce((acc, g) => acc + g.lines.length, 0) > 0 && (
          <> · {filteredGroups.reduce((acc, g) => acc + g.lines.length, 0)} effort lines</>
        )}
      </p>

      {/* table */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 size={20} className="animate-spin mr-2" /> Loading…
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-red-600 text-sm py-10 justify-center">
          <AlertCircle size={16} /> {error}
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="py-16 text-center text-slate-400 text-sm border border-dashed border-slate-200 rounded-xl">
          No data found. Adjust filters or add a customer.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
          <table className="min-w-full text-xs border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-200 bg-slate-50">
                <th className="px-4 py-3 text-left font-semibold text-slate-600 whitespace-nowrap" style={{ minWidth: 280 }}>Customer / Effort Line</th>
                <th className="px-3 py-3 text-left font-semibold text-slate-600 whitespace-nowrap" style={{ minWidth: 80 }}>Bucket</th>
                <th className="px-3 py-3 text-left font-semibold text-slate-600 whitespace-nowrap" style={{ minWidth: 120 }}>Contact</th>
                <th className="px-3 py-3 text-left font-semibold text-slate-600 whitespace-nowrap" style={{ minWidth: 60 }}>Type</th>
                <th className="px-3 py-3 text-left font-semibold text-slate-600 whitespace-nowrap" style={{ minWidth: 40 }}>Track</th>
                <th className="px-3 py-3 text-right font-semibold text-slate-600 whitespace-nowrap" style={{ minWidth: 60 }}>₹L</th>
                <th className="px-3 py-3 text-left font-semibold text-slate-600 whitespace-nowrap" style={{ minWidth: 110 }}>Stage</th>
                <th className="px-3 py-3 text-left font-semibold text-slate-600 whitespace-nowrap" style={{ minWidth: 80 }}>Ldr Mtg</th>
                <th className="px-3 py-3 text-left font-semibold text-slate-600 whitespace-nowrap" style={{ minWidth: 60 }}>Due</th>
                <th className="px-3 py-3 text-left font-semibold text-slate-600 whitespace-nowrap" style={{ minWidth: 110 }}>Status</th>
                <th className="px-3 py-3 text-right font-semibold text-slate-600 whitespace-nowrap" style={{ minWidth: 70 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredGroups.map(group => {
                const isExpanded = expandedCustomers.has(group.customerId);
                const canWriteThis = canWriteGroup(group.bhUserId);
                const visibleLines = group.lines.filter(l => {
                  if (filterStatus && l.status !== filterStatus) return false;
                  if (filterTrack && l.track !== filterTrack) return false;
                  return true;
                });

                return [
                  <CustomerHeader
                    key={`hdr-${group.customerId}`}
                    customerName={group.customerName}
                    bucket={group.bucket}
                    bhName={group.bhName}
                    netPoRl={group.netPoRl}
                    lineCount={group.lines.length}
                    isExpanded={isExpanded}
                    canWrite={canWriteThis}
                    canDelete={canDelete}
                    onToggle={() => toggleCustomer(group.customerId)}
                    onAddLine={() => setLineModal({ customerId: group.customerId, customerName: group.customerName })}
                    onEdit={() => setCustomerModal({
                      open: true,
                      initial: {
                        customer_id: group.customerId,
                        client_id: group.clientId,
                        bucket: group.bucket,
                        bh_user_id: group.bhUserId,
                        consolidated_net_po_rl: group.netPoRl,
                      },
                    })}
                    onDelete={() => setConfirmDelete({ type: 'customer', id: group.customerId, label: group.customerName })}
                  />,

                  ...(isExpanded
                    ? visibleLines.length === 0
                      ? [
                          <tr key={`empty-${group.customerId}`} className="border-b border-slate-100 bg-white">
                            <td colSpan={11} className="px-10 py-3 text-xs text-slate-400 italic">
                              No effort lines yet.
                              {canWriteThis && (
                                <button
                                  onClick={() => setLineModal({ customerId: group.customerId, customerName: group.customerName })}
                                  className="ml-2 text-blue-500 hover:text-blue-700 font-semibold not-italic"
                                >
                                  + Add one
                                </button>
                              )}
                            </td>
                          </tr>,
                        ]
                      : visibleLines.map((line, idx) => (
                          <LineRow
                            key={`line-${line.line_id}`}
                            line={line}
                            canWrite={canWriteThis}
                            canDelete={canDelete}
                            isEven={idx % 2 === 0}
                            onEdit={() => setLineModal({ customerId: group.customerId, customerName: group.customerName, line })}
                            onDelete={() => setConfirmDelete({ type: 'line', id: line.line_id!, label: line.effort_line ?? 'this line' })}
                          />
                        ))
                    : []
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* modals */}
      {customerModal.open && (
        <CustomerModal
          onClose={() => setCustomerModal({ open: false })}
          onSaved={() => { setCustomerModal({ open: false }); fetchData(); }}
          initial={customerModal.initial}
          clients={clients}
          bhs={bhs}
          isBH={isBH}
          currentUserId={user?.user_id ?? 0}
        />
      )}

      {lineModal && (
        <LineModal
          customerId={lineModal.customerId}
          customerName={lineModal.customerName}
          onClose={() => setLineModal(null)}
          onSaved={() => { setLineModal(null); fetchData(); }}
          initial={lineModal.line ?? null}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          message={`Delete ${confirmDelete.type === 'customer' ? 'customer' : 'effort line'} "${confirmDelete.label}"? This cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </Layout>
  );
}
