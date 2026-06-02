import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calendar, ChevronDown, ChevronUp, Plus, Save, Trash2,
  TrendingUp, Users, Target, BarChart2, AlertTriangle,
  RefreshCw, X,
} from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import {
  podPlanApi,
  type ClientOption,
  type CustomerTarget,
  type KAMAssignment,
  type Metrics,
  type PlanData,
  type PodMember,
  type PodSetup,
  type RecruiterAssignment,
  type WeekInfo,
  type WeeklyOBEntry,
} from '../api/podPlan';

// ── constants ─────────────────────────────────────────────────────────────────

const MONTHS = (() => {
  const now = new Date();
  const result: string[] = [];
  for (let i = -2; i <= 4; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    result.push(d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));
  }
  return result;
})();

const TABS = [
  { key: 'setup', label: 'Month Plan', icon: <Target size={15} /> },
  { key: 'dashboard', label: 'Dashboard', icon: <BarChart2 size={15} /> },
  { key: 'recruiters', label: 'Recruiters', icon: <Users size={15} /> },
  { key: 'plan', label: 'Day Plan', icon: <Calendar size={15} /> },
  { key: 'daily', label: 'Daily Tracker', icon: <TrendingUp size={15} /> },
] as const;

type TabKey = typeof TABS[number]['key'];

// ── small helpers ─────────────────────────────────────────────────────────────

const gap = (v: number) => (v >= 0
  ? <span style={{ color: '#16a34a', fontWeight: 700 }}>+{v}</span>
  : <span style={{ color: '#dc2626', fontWeight: 700 }}>{v}</span>);

const badge = (label: string, ok: boolean) => (
  <span style={{
    display: 'inline-block', padding: '2px 8px', borderRadius: 99, fontSize: 11,
    fontWeight: 700, background: ok ? '#dcfce7' : '#fee2e2',
    color: ok ? '#15803d' : '#dc2626',
  }}>{label}</span>
);

function NumInput({ value, onChange, min = 0, step = 1, style = {} }: {
  value: number; onChange: (v: number) => void; min?: number; step?: number; style?: React.CSSProperties;
}) {
  return (
    <input type="number" min={min} step={step} value={value}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      style={{ width: 90, padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, ...style }} />
  );
}

// ── Working Day Calendar ──────────────────────────────────────────────────────

const MONTH_NAMES = ['January','February','March','April','May','June',
  'July','August','September','October','November','December'];
const DOW = ['S','M','T','W','T','F','S'];

function WorkingDayCalendar({ month, value, onChange }: {
  month: string;
  value: string[] | undefined;
  onChange: (days: string[], count: number) => void;
}) {
  const allDays = useMemo(() => {
    const [mName, yr] = month.split(' ');
    const mi = MONTH_NAMES.indexOf(mName);
    const year = parseInt(yr);
    if (mi === -1 || isNaN(year)) return [];
    const out: { date: string; weekday: number; day: number }[] = [];
    const cur = new Date(year, mi, 1);
    while (cur.getMonth() === mi) {
      out.push({ date: cur.toISOString().slice(0, 10), weekday: cur.getDay(), day: cur.getDate() });
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }, [month]);

  const defaultWeekdays = useMemo(
    () => new Set(allDays.filter(d => d.weekday >= 1 && d.weekday <= 5).map(d => d.date)),
    [allDays],
  );

  // Stateless: derive selected from value prop filtered to the current month's days.
  // Falls back to default weekdays when value is absent or from a different month.
  const selected = useMemo(() => {
    if (value && value.length > 0) {
      const validDates = new Set(allDays.map(d => d.date));
      const filtered = value.filter(d => validDates.has(d));
      if (filtered.length > 0) return new Set(filtered);
    }
    return new Set(defaultWeekdays);
  }, [value, allDays, defaultWeekdays]);

  const toggle = (date: string) => {
    const next = new Set(selected);
    next.has(date) ? next.delete(date) : next.add(date);
    const days = [...next].sort();
    onChange(days, days.length);
  };

  const resetToWeekdays = () => {
    const days = [...defaultWeekdays].sort();
    onChange(days, days.length);
  };

  const firstWeekday = allDays[0]?.weekday ?? 0;

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>
          <span style={{ fontSize: 20, color: '#2563eb', marginRight: 4 }}>{selected.size}</span>
          working days selected
        </span>
        <button onClick={resetToWeekdays} style={{ fontSize: 11, padding: '3px 9px', border: '1px solid #d1d5db', borderRadius: 6, background: '#f9fafb', cursor: 'pointer', color: '#6b7280' }}>
          Reset to weekdays
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 34px)', gap: 3, marginBottom: 4 }}>
        {DOW.map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: i === 0 || i === 6 ? '#fca5a5' : '#9ca3af' }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 34px)', gap: 3 }}>
        {Array.from({ length: firstWeekday }).map((_, i) => <div key={`e${i}`} />)}
        {allDays.map(d => {
          const on = selected.has(d.date);
          const weekend = d.weekday === 0 || d.weekday === 6;
          return (
            <button key={d.date} onClick={() => toggle(d.date)} style={{
              width: 34, height: 30, borderRadius: 7, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: on ? 700 : 400,
              background: on ? '#2563eb' : weekend ? '#fef2f2' : '#f3f4f6',
              color: on ? '#fff' : weekend ? '#fca5a5' : '#374151',
              transition: 'background 0.1s',
            }}>{d.day}</button>
          );
        })}
      </div>
    </div>
  );
}

// ── Setup Tab ─────────────────────────────────────────────────────────────────

function SetupTab({ setup, onSetupChange, clients, customers, onCustomersChange, setupId, weeks, asBh, onSaved }: {
  setup: Partial<PodSetup>;
  onSetupChange: (s: Partial<PodSetup>) => void;
  clients: ClientOption[];
  customers: CustomerTarget[];
  onCustomersChange: (c: CustomerTarget[]) => void;
  setupId: number | null;
  weeks: WeekInfo[];
  asBh?: number;
  onSaved?: (setup: PodSetup, weeks: WeekInfo[]) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [addingClient, setAddingClient] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<number | ''>('');
  const [expandedCustomer, setExpandedCustomer] = useState<number | null>(null);
  const [addingClientToCustomer, setAddingClientToCustomer] = useState<number | null>(null);
  const [extraClientId, setExtraClientId] = useState<number | ''>('');
  const [weeklyOBs, setWeeklyOBs] = useState<Record<number, Record<number, number>>>({});
  const [obSaving, setObSaving] = useState(false);

  useEffect(() => {
    if (!setupId) return;
    podPlanApi.listWeeklyOBs(setupId).then(obs => {
      const map: Record<number, Record<number, number>> = {};
      obs.forEach(o => {
        if (!map[o.customer_target_id]) map[o.customer_target_id] = {};
        map[o.customer_target_id][o.week_num] = o.ob_target;
      });
      setWeeklyOBs(map);
    });
  }, [setupId, customers.length]);

  const f = <K extends keyof PodSetup>(k: K) => (v: number) => onSetupChange({ ...setup, [k]: v });

  const handleSaveSetup = async () => {
    setSaving(true);
    try {
      const result = await podPlanApi.upsertSetup(setup, asBh);
      if (result.setup) onSetupChange(result.setup);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSaved?.(result.setup, result.weeks ?? []);
    } finally { setSaving(false); }
  };

  const handleAddCustomer = async () => {
    if (!setupId || !selectedClientId) return;
    const client = clients.find(c => c.id === Number(selectedClientId));
    if (!client) return;
    const customer = await podPlanApi.upsertCustomer(setupId, {
      customer_name: client.name,
      client_id: client.client_id ?? client.id,
      client_ids: [client.client_id ?? client.id],
      display_order: customers.length,
    });
    onCustomersChange([...customers, customer]);
    setSelectedClientId('');
    setAddingClient(false);
  };

  const handleDeleteCustomer = async (cid: number) => {
    if (!setupId) return;
    if (!confirm('Remove this customer from the plan?')) return;
    await podPlanApi.deleteCustomer(setupId, cid);
    onCustomersChange(customers.filter(c => c.id !== cid));
  };

  const handleUpdateCustomer = async (cid: number, data: Partial<CustomerTarget>) => {
    if (!setupId) return;
    const existing = customers.find(c => c.id === cid)!;
    const updated = await podPlanApi.upsertCustomer(setupId, { ...existing, ...data });
    onCustomersChange(customers.map(c => c.id === cid ? updated : c));
  };

  const handleAddClientMapping = async (customerId: number, newClientId: number) => {
    if (!setupId) return;
    const existing = customers.find(c => c.id === customerId)!;
    const currentIds: number[] = existing.client_ids ?? (existing.client_id ? [existing.client_id] : []);
    if (currentIds.includes(newClientId)) return;
    const newIds = [...currentIds, newClientId];
    await handleUpdateCustomer(customerId, { client_ids: newIds });
    setAddingClientToCustomer(null);
    setExtraClientId('');
  };

  const handleRemoveClientMapping = async (customerId: number, removeClientId: number) => {
    if (!setupId) return;
    const existing = customers.find(c => c.id === customerId)!;
    const currentIds: number[] = existing.client_ids ?? (existing.client_id ? [existing.client_id] : []);
    const newIds = currentIds.filter(id => id !== removeClientId);
    const newPrimary = newIds[0] ?? null;
    await handleUpdateCustomer(customerId, {
      client_ids: newIds.length > 0 ? newIds : undefined,
      client_id: newPrimary,
    });
  };

  const handleSaveWeeklyOBs = async () => {
    if (!setupId) return;
    setObSaving(true);
    try {
      const entries: WeeklyOBEntry[] = [];
      customers.forEach(c => {
        weeks.forEach(w => {
          entries.push({
            customer_target_id: c.id,
            week_num: w.week_num,
            week_label: w.week_label,
            week_start: w.week_start,
            week_end: w.week_end,
            ob_target: weeklyOBs[c.id]?.[w.week_num] ?? 0,
          });
        });
      });
      await podPlanApi.saveWeeklyOBs(setupId, entries);
    } finally { setObSaving(false); }
  };

  const row = (label: string, field: keyof PodSetup, step = 1, help?: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
      <label style={{ width: 220, fontSize: 13, color: '#374151', flexShrink: 0 }}>{label}</label>
      <NumInput value={(setup[field] as number) ?? 0} onChange={f(field)} step={step} />
      {help && <span style={{ fontSize: 11, color: '#9ca3af' }}>{help}</span>}
    </div>
  );

  const custField = (c: CustomerTarget, label: string, field: keyof CustomerTarget, step = 1) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <label style={{ width: 200, fontSize: 12, color: '#6b7280', flexShrink: 0 }}>{label}</label>
      <NumInput
        value={(c[field] as number) ?? 0}
        onChange={v => handleUpdateCustomer(c.id, { [field]: v })}
        step={step}
      />
    </div>
  );

  // Live impact computed from current form values — no save required
  const liveImpact = (() => {
    const wd = Math.max(1, setup.working_days ?? 22);
    const grossPo = (setup.net_po_target ?? 0) + (setup.exit_budget ?? 0);
    const targetObs = Math.round((setup.target_selects_month ?? 0) * (setup.sel_ob_rate ?? 0.8));
    const dailySelects = wd > 0 ? +((setup.target_selects_month ?? 0) / wd).toFixed(1) : 0;
    const dailyObs = wd > 0 ? +(targetObs / wd).toFixed(1) : 0;
    const recCapDay = (setup.subs_per_recruiter_day ?? 0) * (setup.num_recruiters ?? 0);
    const kamCapDay = (setup.interviews_per_kam_day ?? 0) * (setup.num_kams ?? 0);
    // per-customer derived
    const custRows = customers.map(c => {
      const avgSD = c.repeat_demand_pct * c.subs_repeat + (1 - c.repeat_demand_pct) * (c.subs_new_phase1 + c.subs_new_phase2);
      const monthlySubs = Math.round(avgSD * c.open_demand_pool);
      const dailySubs = +(monthlySubs / wd).toFixed(1);
      const obsNeeded = c.avg_po_per_ob > 0 ? Math.round((c.net_po_target_cust + c.exit_alloc) / c.avg_po_per_ob) : 0;
      const dailyObsCust = +(obsNeeded / wd).toFixed(1);
      return { name: c.customer_name, monthlySubs, dailySubs, monthlyInt: c.target_interviews_day * wd, dailyInt: c.target_interviews_day, obsNeeded, dailyObs: dailyObsCust };
    });
    return { wd, grossPo, targetObs, dailySelects, dailyObs, recCapDay, kamCapDay, custRows };
  })();

  return (
    <div>
      {/* Pod-level assumptions */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24, marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#111827' }}>
          Pod-Level Assumptions
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 40px' }}>
          <div>
            {row('Net PO Target (month)', 'net_po_target')}
            {row('Exit Budget', 'exit_budget')}
            {row('Working Days', 'working_days')}
            {row('Target Selects / Month', 'target_selects_month')}
          </div>
          <div>
            {row('Sel → OB Rate', 'sel_ob_rate', 0.01, 'e.g. 0.8 = 80%')}
            {row('Subs / Recruiter / Day', 'subs_per_recruiter_day')}
            {row('Number of Recruiters', 'num_recruiters')}
            {row('Interviews / KAM / Day', 'interviews_per_kam_day')}
            {row('Number of KAMs', 'num_kams')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button onClick={handleSaveSetup} disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <Save size={14} /> {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Setup'}
          </button>
          {!setupId && <span style={{ fontSize: 12, color: '#ef4444', alignSelf: 'center' }}>Save setup first to add customers</span>}
        </div>
      </div>

      {/* Live Impact Panel */}
      <div style={{ background: 'linear-gradient(135deg,#eff6ff 0%,#f0fdf4 100%)', border: '1px solid #bfdbfe', borderRadius: 12, padding: '18px 24px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#1d4ed8' }}>Live Targets — {liveImpact.wd} Working Days</span>
          <span style={{ fontSize: 11, color: '#6b7280' }}>(updates instantly from calendar · save to persist)</span>
        </div>
        {/* Pod-level KPIs */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: liveImpact.custRows.length > 0 ? 16 : 0 }}>
          {[
            { label: 'Gross PO Target', value: liveImpact.grossPo, color: '#2563eb' },
            { label: 'Target Onboards', value: liveImpact.targetObs, color: '#7c3aed' },
            { label: 'Selects/Day needed', value: liveImpact.dailySelects, color: '#7c3aed' },
            { label: 'OBs/Day needed', value: liveImpact.dailyObs, color: '#059669' },
            { label: 'Recruiter Cap/Day', value: liveImpact.recCapDay, color: '#d97706' },
            { label: 'KAM Cap/Day', value: liveImpact.kamCapDay, color: '#0891b2' },
          ].map(k => (
            <div key={k.label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 16px', minWidth: 110, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: k.color }}>{k.value}</div>
              <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>{k.label}</div>
            </div>
          ))}
        </div>
        {/* Per-customer derived targets */}
        {liveImpact.custRows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.7)' }}>
                  {['Customer', 'Monthly Subs', 'Subs/Day', 'Monthly Int', 'Int/Day', 'OBs needed', 'OBs/Day'].map(h => (
                    <th key={h} style={{ padding: '6px 10px', textAlign: h === 'Customer' ? 'left' : 'center', border: '1px solid #e5e7eb', fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {liveImpact.custRows.map(r => (
                  <tr key={r.name} style={{ background: 'rgba(255,255,255,0.5)' }}>
                    <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', fontWeight: 700 }}>{r.name}</td>
                    <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', textAlign: 'center' }}>{r.monthlySubs}</td>
                    <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', textAlign: 'center', fontWeight: 700, color: '#2563eb' }}>{r.dailySubs}</td>
                    <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', textAlign: 'center' }}>{r.monthlyInt}</td>
                    <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', textAlign: 'center', fontWeight: 700, color: '#7c3aed' }}>{r.dailyInt}</td>
                    <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', textAlign: 'center' }}>{r.obsNeeded}</td>
                    <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', textAlign: 'center', fontWeight: 700, color: '#059669' }}>{r.dailyObs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Weekly Effort Distribution */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24, marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: '#111827' }}>Weekly Effort Distribution</h3>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: '#6b7280' }}>
          Set what % of monthly effort falls in each week. Must sum to 100%.
        </p>
        {(() => {
          const weights: number[] = (setup.week_weights as number[]) ?? [20, 20, 20, 20, 20];
          const total = weights.reduce((a, b) => a + b, 0);
          const weekLabels = weeks.length > 0
            ? weeks.map(w => w.week_label)
            : weights.map((_, i) => `Week ${i + 1}`);
          return (
            <div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
                {weights.map((w, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <label style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>{weekLabels[i]}</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input
                        type="number" min={0} max={100} step={1}
                        value={w}
                        onChange={e => {
                          const newW = [...weights];
                          newW[i] = parseFloat(e.target.value) || 0;
                          onSetupChange({ ...setup, week_weights: newW });
                        }}
                        style={{ width: 64, textAlign: 'center', border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 4px', fontSize: 14, fontWeight: 700 }}
                      />
                      <span style={{ fontSize: 13, color: '#6b7280' }}>%</span>
                    </div>
                    <div style={{ width: 64, height: 6, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(w, 100)}%`, height: '100%', background: w > 0 ? '#2563eb' : '#e5e7eb', borderRadius: 4 }} />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: total === 100 ? '#16a34a' : '#ef4444' }}>
                Total: {total}% {total !== 100 ? `(needs ${100 - total > 0 ? '+' : ''}${100 - total}% adjustment)` : '✓'}
              </div>
            </div>
          );
        })()}
        <div style={{ marginTop: 12 }}>
          <button onClick={handleSaveSetup} disabled={saving || ((setup.week_weights as number[] ?? [20,20,20,20,20]).reduce((a,b)=>a+b,0) !== 100)}
            style={{ padding: '7px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: ((setup.week_weights as number[] ?? [20,20,20,20,20]).reduce((a,b)=>a+b,0) !== 100) ? 0.5 : 1 }}>
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Weights'}
          </button>
        </div>
      </div>

      {/* Customer targets */}
      {setupId && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' }}>
              Customer Targets <span style={{ fontWeight: 400, color: '#6b7280', fontSize: 13 }}>({customers.length} customers)</span>
            </h3>
            {!addingClient ? (
              <button onClick={() => setAddingClient(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                <Plus size={14} /> Add Customer
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select value={selectedClientId} onChange={e => setSelectedClientId(Number(e.target.value) || '')}
                  style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }}>
                  <option value="">— select client —</option>
                  {clients.filter(cl => !customers.some(c => c.client_id === (cl.client_id ?? cl.id))).map(cl => (
                    <option key={cl.id} value={cl.client_id ?? cl.id}>{cl.name}</option>
                  ))}
                </select>
                <button onClick={handleAddCustomer} disabled={!selectedClientId}
                  style={{ padding: '7px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Add</button>
                <button onClick={() => setAddingClient(false)}
                  style={{ padding: '7px 10px', background: '#f9fafb', color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}><X size={14} /></button>
              </div>
            )}
          </div>

          {customers.length === 0 && (
            <p style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
              No customers added yet. Click "Add Customer" to begin.
            </p>
          )}

          {customers.map(c => (
            <div key={c.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, marginBottom: 10, overflow: 'hidden' }}>
              <div
                onClick={() => setExpandedCustomer(expandedCustomer === c.id ? null : c.id)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#f9fafb', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{c.customer_name}</span>
                  {(c.client_ids ?? (c.client_id ? [c.client_id] : [])).length > 1 && (
                    <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 99, background: '#dbeafe', color: '#1d4ed8', fontWeight: 600 }}>
                      {(c.client_ids ?? []).length} companies
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>
                    Pool: {c.open_demand_pool} · Int/day: {c.target_interviews_day}
                  </span>
                  <button onClick={e => { e.stopPropagation(); handleDeleteCustomer(c.id); }}
                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}>
                    <Trash2 size={13} />
                  </button>
                  {expandedCustomer === c.id ? <ChevronUp size={15} color="#6b7280" /> : <ChevronDown size={15} color="#6b7280" />}
                </div>
              </div>

              {expandedCustomer === c.id && (
                <div style={{ padding: '16px 20px' }}>
                  {/* Linked Clients */}
                  <div style={{ marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid #f3f4f6' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Linked Client Companies</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      {(c.client_ids ?? (c.client_id ? [c.client_id] : [])).map(cid => {
                        const cl = clients.find(x => x.id === cid || x.client_id === cid);
                        return (
                          <span key={cid} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 99, background: '#eff6ff', border: '1px solid #bfdbfe', fontSize: 12, fontWeight: 600, color: '#1d4ed8' }}>
                            {cl ? cl.name : `Client #${cid}`}
                            <button onClick={() => handleRemoveClientMapping(c.id, cid)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#93c5fd', padding: 0, display: 'flex', lineHeight: 1 }}>
                              <X size={11} />
                            </button>
                          </span>
                        );
                      })}
                      {addingClientToCustomer === c.id ? (
                        <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                          <select value={extraClientId} onChange={e => setExtraClientId(Number(e.target.value) || '')}
                            style={{ padding: '3px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12 }}>
                            <option value="">— select —</option>
                            {clients.filter(cl => {
                              const linked = c.client_ids ?? (c.client_id ? [c.client_id] : []);
                              const olId = cl.client_id ?? cl.id;
                              return !linked.includes(cl.id) && !linked.includes(olId);
                            }).map(cl => (
                              <option key={cl.id} value={cl.client_id ?? cl.id}>{cl.name}</option>
                            ))}
                          </select>
                          <button onClick={() => extraClientId && handleAddClientMapping(c.id, Number(extraClientId))}
                            disabled={!extraClientId}
                            style={{ padding: '3px 10px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: extraClientId ? 1 : 0.5 }}>Add</button>
                          <button onClick={() => { setAddingClientToCustomer(null); setExtraClientId(''); }}
                            style={{ padding: '3px 8px', background: '#f9fafb', color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}><X size={11} /></button>
                        </span>
                      ) : (
                        <button onClick={() => { setAddingClientToCustomer(c.id); setExtraClientId(''); }}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 99, background: '#f0fdf4', border: '1px dashed #86efac', fontSize: 12, fontWeight: 600, color: '#16a34a', cursor: 'pointer' }}>
                          <Plus size={11} /> Add Company
                        </button>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
                      All linked companies' submissions, interviews &amp; OBs will be combined under this target.
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 40px' }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Section B — Revenue</div>
                    {custField(c, 'Net PO Target', 'net_po_target_cust')}
                    {custField(c, 'Exit Allocation', 'exit_alloc')}
                    {custField(c, 'Avg PO per OB', 'avg_po_per_ob', 0.1)}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Section B2 — Submission Demand</div>
                    {custField(c, 'Open Demand Pool', 'open_demand_pool')}
                    {custField(c, 'Repeat Demand %', 'repeat_demand_pct', 0.01)}
                    {custField(c, 'Subs (Repeat)', 'subs_repeat')}
                    {custField(c, 'Subs (New Phase 1)', 'subs_new_phase1')}
                    {custField(c, 'Subs (New Phase 2)', 'subs_new_phase2')}
                    {custField(c, 'Target Interviews / Day', 'target_interviews_day')}
                    {custField(c, 'Int → Select Rate', 'int_sel_target', 0.01)}
                  </div>
                </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Weekly OB targets */}
      {setupId && customers.length > 0 && weeks.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' }}>Weekly OB Targets</h3>
            <button onClick={handleSaveWeeklyOBs} disabled={obSaving}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <Save size={13} /> {obSaving ? 'Saving…' : 'Save OB Targets'}
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', border: '1px solid #e5e7eb', fontWeight: 700 }}>Customer</th>
                  {weeks.map(w => (
                    <th key={w.week_num} style={{ padding: '8px 12px', textAlign: 'center', border: '1px solid #e5e7eb', fontWeight: 700, color: '#7c3aed' }}>
                      {w.week_label}
                    </th>
                  ))}
                  <th style={{ padding: '8px 12px', textAlign: 'center', border: '1px solid #e5e7eb', fontWeight: 700, color: '#374151' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {customers.map(c => {
                  const total = weeks.reduce((s, w) => s + (weeklyOBs[c.id]?.[w.week_num] ?? 0), 0);
                  return (
                    <tr key={c.id}>
                      <td style={{ padding: '8px 12px', border: '1px solid #e5e7eb', fontWeight: 600 }}>{c.customer_name}</td>
                      {weeks.map(w => (
                        <td key={w.week_num} style={{ padding: '6px 8px', border: '1px solid #e5e7eb', textAlign: 'center' }}>
                          <input type="number" min={0}
                            value={weeklyOBs[c.id]?.[w.week_num] ?? 0}
                            onChange={e => setWeeklyOBs(prev => ({
                              ...prev,
                              [c.id]: { ...(prev[c.id] ?? {}), [w.week_num]: parseInt(e.target.value) || 0 },
                            }))}
                            style={{ width: 55, textAlign: 'center', border: '1px solid #d1d5db', borderRadius: 6, padding: '3px 6px', fontSize: 13 }} />
                        </td>
                      ))}
                      <td style={{ padding: '8px 12px', border: '1px solid #e5e7eb', textAlign: 'center', fontWeight: 700 }}>{total}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Dashboard Tab ─────────────────────────────────────────────────────────────

function DashboardTab({ setupId }: { setupId: number }) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    podPlanApi.getMetrics(setupId)
      .then(setMetrics)
      .finally(() => setLoading(false));
  }, [setupId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading metrics…</div>;
  if (!metrics) return null;

  const kpis = [
    { label: 'Gross PO Needed', value: metrics.gross_po_needed, color: '#2563eb' },
    { label: 'Target Onboards', value: metrics.target_onboards, color: '#7c3aed' },
    { label: 'Blended PO/OB Ratio', value: metrics.avg_po_per_ob_blended, color: '#0891b2' },
    { label: 'Total Subs Needed', value: metrics.total_subs_needed, color: '#d97706' },
    { label: 'Total OBs Target', value: metrics.total_obs_needed, color: '#059669' },
    { label: 'Total Selects Target', value: metrics.total_selects_needed, color: '#7c3aed' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12, cursor: 'pointer', color: '#374151' }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 20 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Capacity alerts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {[
          { title: 'Recruiter Capacity', cap: metrics.rec_cap_day, need: metrics.subs_day, gap: metrics.rec_gap, unit: 'subs/day', needed: metrics.recs_needed, unit2: 'recruiters needed' },
          { title: 'KAM Capacity', cap: metrics.kam_cap_day, need: metrics.int_day, gap: metrics.kam_gap, unit: 'int/day', needed: metrics.kams_needed, unit2: 'KAMs needed' },
        ].map(c => (
          <div key={c.title} style={{ background: '#fff', border: `1px solid ${c.gap >= 0 ? '#bbf7d0' : '#fecaca'}`, borderRadius: 10, padding: 18 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: '#111827' }}>{c.title}</div>
            <div style={{ display: 'flex', gap: 20 }}>
              <div><div style={{ fontSize: 20, fontWeight: 800, color: '#374151' }}>{c.cap}</div><div style={{ fontSize: 11, color: '#9ca3af' }}>Capacity ({c.unit})</div></div>
              <div><div style={{ fontSize: 20, fontWeight: 800, color: '#374151' }}>{c.need}</div><div style={{ fontSize: 11, color: '#9ca3af' }}>Required ({c.unit})</div></div>
              <div><div style={{ fontSize: 20, fontWeight: 800, color: c.gap >= 0 ? '#16a34a' : '#dc2626' }}>{c.gap >= 0 ? `+${c.gap}` : c.gap}</div><div style={{ fontSize: 11, color: '#9ca3af' }}>Gap</div></div>
              {c.gap < 0 && <div style={{ alignSelf: 'center' }}><span style={{ background: '#fee2e2', color: '#dc2626', borderRadius: 6, padding: '3px 8px', fontSize: 12, fontWeight: 700 }}>Need {c.needed} more {c.unit2}</span></div>}
            </div>
          </div>
        ))}
      </div>

      {/* Monthly targets table */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: '#111827' }}>Monthly Targets at a Glance</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['Customer', 'Gross PO', 'OBs Needed', 'Selects', 'Monthly Subs', 'Daily Subs', 'Monthly Int', 'Daily Int', 'Capacity', 'Status'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Customer' ? 'left' : 'center', border: '1px solid #e5e7eb', fontWeight: 700, whiteSpace: 'nowrap', fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.customers.map(c => (
                <tr key={c.id ?? c.customer_name} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '8px 12px', border: '1px solid #e5e7eb', fontWeight: 700 }}>{c.customer_name}</td>
                  <td style={{ padding: '8px 12px', border: '1px solid #e5e7eb', textAlign: 'center' }}>{c.gross_po}</td>
                  <td style={{ padding: '8px 12px', border: '1px solid #e5e7eb', textAlign: 'center', fontWeight: 700, color: '#7c3aed' }}>{c.obs_needed}</td>
                  <td style={{ padding: '8px 12px', border: '1px solid #e5e7eb', textAlign: 'center' }}>{c.selects_needed}</td>
                  <td style={{ padding: '8px 12px', border: '1px solid #e5e7eb', textAlign: 'center', fontWeight: 700 }}>{c.monthly_subs}</td>
                  <td style={{ padding: '8px 12px', border: '1px solid #e5e7eb', textAlign: 'center', color: '#2563eb' }}>{c.daily_subs}</td>
                  <td style={{ padding: '8px 12px', border: '1px solid #e5e7eb', textAlign: 'center' }}>{c.monthly_interviews}</td>
                  <td style={{ padding: '8px 12px', border: '1px solid #e5e7eb', textAlign: 'center', color: '#7c3aed' }}>{c.target_interviews_day}</td>
                  <td style={{ padding: '8px 12px', border: '1px solid #e5e7eb', textAlign: 'center' }}>{c.monthly_subs_capacity}</td>
                  <td style={{ padding: '8px 12px', border: '1px solid #e5e7eb', textAlign: 'center' }}>{badge(c.cap_status, c.cap_status === 'OK')}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f9fafb', fontWeight: 800 }}>
                <td style={{ padding: '8px 12px', border: '1px solid #e5e7eb' }}>TOTAL</td>
                <td colSpan={1} style={{ border: '1px solid #e5e7eb' }}></td>
                <td style={{ padding: '8px 12px', border: '1px solid #e5e7eb', textAlign: 'center' }}>{metrics.total_obs_needed}</td>
                <td style={{ padding: '8px 12px', border: '1px solid #e5e7eb', textAlign: 'center' }}>{metrics.total_selects_needed}</td>
                <td style={{ padding: '8px 12px', border: '1px solid #e5e7eb', textAlign: 'center' }}>{metrics.total_subs_needed}</td>
                <td colSpan={5} style={{ border: '1px solid #e5e7eb' }}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* KAM table */}
      {metrics.kams.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: '#111827' }}>KAM Interview Assignments</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', border: '1px solid #e5e7eb' }}>KAM</th>
                  {metrics.customers.map(c => (
                    <th key={c.customer_name} style={{ padding: '8px 12px', textAlign: 'center', border: '1px solid #e5e7eb', color: '#7c3aed' }}>{c.customer_name}</th>
                  ))}
                  <th style={{ padding: '8px 12px', textAlign: 'center', border: '1px solid #e5e7eb' }}>Total/Day</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center', border: '1px solid #e5e7eb' }}>TAT Focus</th>
                </tr>
              </thead>
              <tbody>
                {metrics.kams.map(k => (
                  <tr key={k.user_id}>
                    <td style={{ padding: '8px 12px', border: '1px solid #e5e7eb', fontWeight: 700 }}>{k.user_name}</td>
                    {metrics.customers.map(c => (
                      <td key={c.customer_name} style={{ padding: '8px 12px', border: '1px solid #e5e7eb', textAlign: 'center' }}>
                        {k.customer_targets[c.customer_name] ?? 0}
                      </td>
                    ))}
                    <td style={{ padding: '8px 12px', border: '1px solid #e5e7eb', textAlign: 'center', fontWeight: 700 }}>
                      {Object.values(k.customer_targets).reduce((a, b) => a + b, 0)}
                    </td>
                    <td style={{ padding: '8px 12px', border: '1px solid #e5e7eb', fontSize: 12, color: '#6b7280' }}>{k.tat_focus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Recruiters Tab ────────────────────────────────────────────────────────────

function RecruitersTab({ setupId, customers }: { setupId: number; customers: CustomerTarget[] }) {
  const [members, setMembers] = useState<PodMember[]>([]);
  const [assignments, setAssignments] = useState<RecruiterAssignment[]>([]);
  const [kams, setKams] = useState<KAMAssignment[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [kamSaving, setKamSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      podPlanApi.listPodMembers(setupId),
      podPlanApi.listRecruiters(setupId),
      podPlanApi.listKAMs(setupId),
    ]).then(([m, a, k]) => {
      setMembers(m);
      // Merge members with existing assignments
      const existingById = Object.fromEntries(a.map(x => [x.user_id, x]));
      setAssignments(m.map(mem => existingById[mem.id] ?? {
        user_id: mem.id, user_name: mem.name, user_role: mem.role,
        primary_customer_id: null, secondary_customer_id: null, subs_per_day: 6, primary_subs: null,
      }));
      setKams(k);
    });
  }, [setupId]);

  const updateAssignment = (userId: number, patch: Partial<RecruiterAssignment>) => {
    setAssignments(prev => prev.map(a => a.user_id === userId ? { ...a, ...patch } : a));
  };

  const handleSaveRecruiters = async () => {
    setSaving(true);
    try {
      await podPlanApi.saveRecruiters(setupId, assignments.map(a => ({
        user_id: a.user_id,
        primary_customer_id: a.primary_customer_id,
        secondary_customer_id: a.secondary_customer_id,
        subs_per_day: a.subs_per_day,
        primary_subs: a.primary_subs,
      })));
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  };

  const updateKAM = (userId: number, custName: string, val: number) => {
    setKams(prev => {
      const existing = prev.find(k => k.user_id === userId);
      if (existing) {
        return prev.map(k => k.user_id === userId
          ? { ...k, customer_targets: { ...k.customer_targets, [custName]: val } }
          : k);
      }
      const mem = members.find(m => m.id === userId);
      return [...prev, { user_id: userId, user_name: mem?.name ?? '', customer_targets: { [custName]: val }, tat_focus: '', key_action: '' }];
    });
  };

  const handleSaveKAMs = async () => {
    setKamSaving(true);
    try {
      await podPlanApi.saveKAMs(setupId, kams);
    } finally { setKamSaving(false); }
  };

  const custSelect = (value: number | null, onChange: (v: number | null) => void) => (
    <select value={value ?? ''} onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
      style={{ width: '100%', padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12 }}>
      <option value="">— none —</option>
      {customers.map(c => <option key={c.id} value={c.id}>{c.customer_name}</option>)}
    </select>
  );

  return (
    <div>
      {/* Recruiter assignments */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' }}>Recruiter Assignments</h3>
          <button onClick={handleSaveRecruiters} disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <Save size={13} /> {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Assignments'}
          </button>
        </div>
        <p style={{ margin: '0 0 14px', fontSize: 12, color: '#6b7280' }}>
          All pod members are listed. Assign each to a primary and/or secondary customer. Subs/day can be overridden per recruiter.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['Member', 'Role', 'Subs/Day', 'Primary Customer', 'Secondary Customer'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', border: '1px solid #e5e7eb', fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {assignments.map(a => {
                const mem = members.find(m => m.id === a.user_id);
                if (!mem) return null;
                return (
                  <tr key={a.user_id}>
                    <td style={{ padding: '8px 12px', border: '1px solid #e5e7eb', fontWeight: 600 }}>{mem.name}</td>
                    <td style={{ padding: '8px 12px', border: '1px solid #e5e7eb' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: '#dbeafe', color: '#1d4ed8' }}>{mem.role}</span>
                    </td>
                    <td style={{ padding: '6px 12px', border: '1px solid #e5e7eb' }}>
                      <input type="number" min={1} value={a.subs_per_day}
                        onChange={e => updateAssignment(a.user_id, { subs_per_day: parseInt(e.target.value) || 1, primary_subs: null })}
                        style={{ width: 60, padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }} />
                    </td>
                    <td style={{ padding: '6px 12px', border: '1px solid #e5e7eb', minWidth: 180 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {custSelect(a.primary_customer_id, v => updateAssignment(a.user_id, { primary_customer_id: v }))}
                        {a.primary_customer_id && a.secondary_customer_id && (() => {
                          const p = a.primary_subs ?? Math.round(a.subs_per_day * 2 / 3);
                          return (
                            <input type="number" min={0} max={a.subs_per_day} value={p}
                              onChange={e => {
                                const val = Math.max(0, Math.min(a.subs_per_day, parseInt(e.target.value) || 0));
                                updateAssignment(a.user_id, { primary_subs: val });
                              }}
                              style={{ width: 46, padding: '3px 5px', border: '1px solid #93c5fd', borderRadius: 5, fontSize: 12, fontWeight: 700, color: '#2563eb', textAlign: 'center' }} />
                          );
                        })()}
                      </div>
                    </td>
                    <td style={{ padding: '6px 12px', border: '1px solid #e5e7eb', minWidth: 180 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {custSelect(a.secondary_customer_id, v => updateAssignment(a.user_id, { secondary_customer_id: v }))}
                        {a.primary_customer_id && a.secondary_customer_id && (() => {
                          const p = a.primary_subs ?? Math.round(a.subs_per_day * 2 / 3);
                          const s = a.subs_per_day - p;
                          return (
                            <input type="number" min={0} max={a.subs_per_day} value={s}
                              onChange={e => {
                                const sVal = Math.max(0, Math.min(a.subs_per_day, parseInt(e.target.value) || 0));
                                updateAssignment(a.user_id, { primary_subs: a.subs_per_day - sVal });
                              }}
                              style={{ width: 46, padding: '3px 5px', border: '1px solid #c4b5fd', borderRadius: 5, fontSize: 12, fontWeight: 700, color: '#7c3aed', textAlign: 'center' }} />
                          );
                        })()}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* KAM assignments */}
      {customers.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' }}>KAM Interview Assignments</h3>
            <button onClick={handleSaveKAMs} disabled={kamSaving}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <Save size={13} /> {kamSaving ? 'Saving…' : 'Save KAM Assignments'}
            </button>
          </div>
          <p style={{ margin: '0 0 14px', fontSize: 12, color: '#6b7280' }}>
            Set interviews per day per customer for each KAM.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', border: '1px solid #e5e7eb' }}>KAM</th>
                  {customers.map(c => (
                    <th key={c.id} style={{ padding: '8px 12px', textAlign: 'center', border: '1px solid #e5e7eb', color: '#7c3aed' }}>{c.customer_name}</th>
                  ))}
                  <th style={{ padding: '8px 12px', textAlign: 'left', border: '1px solid #e5e7eb' }}>TAT Focus</th>
                </tr>
              </thead>
              <tbody>
                {members.filter(m => m.role === 'kam').map(m => {
                  const k = kams.find(k => k.user_id === m.id);
                  return (
                    <tr key={m.id}>
                      <td style={{ padding: '8px 12px', border: '1px solid #e5e7eb', fontWeight: 600 }}>{m.name}</td>
                      {customers.map(c => (
                        <td key={c.id} style={{ padding: '6px 8px', border: '1px solid #e5e7eb', textAlign: 'center' }}>
                          <input type="number" min={0}
                            value={k?.customer_targets?.[c.customer_name] ?? 0}
                            onChange={e => updateKAM(m.id, c.customer_name, parseInt(e.target.value) || 0)}
                            style={{ width: 55, textAlign: 'center', border: '1px solid #d1d5db', borderRadius: 6, padding: '3px 6px', fontSize: 13 }} />
                        </td>
                      ))}
                      <td style={{ padding: '6px 12px', border: '1px solid #e5e7eb' }}>
                        <input type="text" value={k?.tat_focus ?? ''}
                          onChange={e => setKams(prev => {
                            const existing = prev.find(x => x.user_id === m.id);
                            if (existing) return prev.map(x => x.user_id === m.id ? { ...x, tat_focus: e.target.value } : x);
                            return [...prev, { user_id: m.id, user_name: m.name, customer_targets: {}, tat_focus: e.target.value, key_action: '' }];
                          })}
                          placeholder="e.g. L1/L2 panel…"
                          style={{ width: '100%', padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12 }} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Plan Tab ──────────────────────────────────────────────────────────────────

function PlanTab({ setupId }: { setupId: number }) {
  const [plan, setPlan] = useState<PlanData | null>(null);

  useEffect(() => {
    podPlanApi.getPlan(setupId).then(setPlan);
  }, [setupId]);

  if (!plan) return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Computing plan…</div>;

  const wd = plan.working_days;

  return (
    <div>
      {/* Recruiter alignment summary */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: '#111827' }}>Recruiter Alignment — Needed vs Assigned</h3>
        <p style={{ margin: '0 0 14px', fontSize: 12, color: '#6b7280' }}>
          Formula: Recs Needed = ⌈Monthly Subs ÷ (subs/rec/day × working days)⌉
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['Customer', 'Monthly Subs', 'Recs Needed', 'Assigned (P+S)', 'Cap/Day', 'Cap/Month', 'Cap Gap', 'Status', 'Add Primary', 'Add Secondary'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Customer' ? 'left' : 'center', border: '1px solid #e5e7eb', fontWeight: 700, fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plan.customer_plans.map(cp => (
                <tr key={cp.customer_name}>
                  <td style={{ padding: '8px 10px', border: '1px solid #e5e7eb', fontWeight: 700 }}>{cp.customer_name}</td>
                  <td style={{ padding: '8px 10px', border: '1px solid #e5e7eb', textAlign: 'center', fontWeight: 700 }}>{cp.monthly_subs}</td>
                  <td style={{ padding: '8px 10px', border: '1px solid #e5e7eb', textAlign: 'center' }}>{cp.recs_needed_full}</td>
                  <td style={{ padding: '8px 10px', border: '1px solid #e5e7eb', textAlign: 'center' }}>
                    <span style={{ color: '#2563eb', fontWeight: 700 }}>{cp.primary_recs.length}P</span>
                    {' + '}
                    <span style={{ color: '#7c3aed', fontWeight: 700 }}>{cp.secondary_recs.length}S</span>
                    {' = '}{cp.assigned_count}
                  </td>
                  <td style={{ padding: '8px 10px', border: '1px solid #e5e7eb', textAlign: 'center' }}>{cp.assigned_cap_day}</td>
                  <td style={{ padding: '8px 10px', border: '1px solid #e5e7eb', textAlign: 'center' }}>{cp.assigned_cap_month}</td>
                  <td style={{ padding: '8px 10px', border: '1px solid #e5e7eb', textAlign: 'center' }}>{gap(cp.rec_cap_gap)}</td>
                  <td style={{ padding: '8px 10px', border: '1px solid #e5e7eb', textAlign: 'center' }}>
                    {cp.rec_cap_gap >= 0 ? badge('OK', true) : badge('Shortfall', false)}
                  </td>
                  <td style={{ padding: '8px 10px', border: '1px solid #e5e7eb', textAlign: 'center' }}>
                    {cp.add_primary_needed > 0
                      ? <span style={{ fontWeight: 700, color: '#dc2626' }}>+{cp.add_primary_needed}</span>
                      : <span style={{ color: '#9ca3af' }}>—</span>}
                  </td>
                  <td style={{ padding: '8px 10px', border: '1px solid #e5e7eb', textAlign: 'center' }}>
                    {cp.add_secondary_needed > 0
                      ? <span style={{ fontWeight: 700, color: '#7c3aed' }}>+{cp.add_secondary_needed}</span>
                      : <span style={{ color: '#9ca3af' }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-customer recruiter chips */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12, marginBottom: 20 }}>
        {plan.customer_plans.map(cp => (
          <div key={cp.customer_name} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: '#111827' }}>{cp.customer_name}</div>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>
              Target: {cp.monthly_subs} subs · Max/day: {cp.max_per_day} · {cp.days_needed} active days · {cp.buffer_days} buffer
              {cp.is_shortfall && <span style={{ color: '#ef4444', marginLeft: 4 }}>⚠ Shortfall</span>}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {cp.primary_recs.map(r => (
                <span key={r} style={{ padding: '2px 8px', borderRadius: 99, background: '#dbeafe', color: '#1d4ed8', fontSize: 11, fontWeight: 600 }}>
                  {r}
                </span>
              ))}
              {cp.secondary_recs.map(r => (
                <span key={r} style={{ padding: '2px 8px', borderRadius: 99, background: '#ede9fe', color: '#6d28d9', fontSize: 11, fontWeight: 600 }}>
                  {r} (S)
                </span>
              ))}
              {cp.primary_recs.length === 0 && cp.secondary_recs.length === 0 && (
                <span style={{ color: '#9ca3af', fontSize: 11 }}>No recruiters assigned</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* KAM alignment summary */}
      {plan.kam_plans && plan.kam_plans.some(k => k.target_per_day > 0) && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: '#111827' }}>KAM Alignment — Needed vs Assigned</h3>
          <p style={{ margin: '0 0 14px', fontSize: 12, color: '#6b7280' }}>
            Formula: KAMs Needed = ⌈Target Interviews/Day ÷ interviews/KAM/day⌉
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['Customer', 'Target Int/Day', 'Monthly Target', 'KAMs Needed', 'Assigned KAMs', 'Cap/Day', 'Cap/Month', 'Gap', 'Status', 'Add KAMs'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Customer' || h === 'Assigned KAMs' ? 'left' : 'center', border: '1px solid #e5e7eb', fontWeight: 700, fontSize: 12 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {plan.kam_plans.filter(k => k.target_per_day > 0).map(kp => (
                  <tr key={kp.customer_name}>
                    <td style={{ padding: '8px 10px', border: '1px solid #e5e7eb', fontWeight: 700 }}>{kp.customer_name}</td>
                    <td style={{ padding: '8px 10px', border: '1px solid #e5e7eb', textAlign: 'center', fontWeight: 700 }}>{kp.target_per_day}</td>
                    <td style={{ padding: '8px 10px', border: '1px solid #e5e7eb', textAlign: 'center' }}>{kp.monthly_target}</td>
                    <td style={{ padding: '8px 10px', border: '1px solid #e5e7eb', textAlign: 'center' }}>{kp.kams_needed}</td>
                    <td style={{ padding: '8px 10px', border: '1px solid #e5e7eb' }}>
                      {kp.assigned_kams.length === 0
                        ? <span style={{ color: '#9ca3af', fontSize: 11 }}>None</span>
                        : kp.assigned_kams.map(k => (
                          <span key={k.user_name} style={{ display: 'inline-block', marginRight: 4, marginBottom: 2, padding: '1px 7px', borderRadius: 99, background: '#f3e8ff', color: '#7c3aed', fontSize: 11, fontWeight: 600 }}>
                            {k.user_name} ({k.daily_target}/d)
                          </span>
                        ))
                      }
                    </td>
                    <td style={{ padding: '8px 10px', border: '1px solid #e5e7eb', textAlign: 'center' }}>{kp.total_cap_day}</td>
                    <td style={{ padding: '8px 10px', border: '1px solid #e5e7eb', textAlign: 'center' }}>{kp.monthly_cap}</td>
                    <td style={{ padding: '8px 10px', border: '1px solid #e5e7eb', textAlign: 'center' }}>{gap(kp.cap_gap)}</td>
                    <td style={{ padding: '8px 10px', border: '1px solid #e5e7eb', textAlign: 'center' }}>
                      {kp.cap_gap >= 0 ? badge('OK', true) : badge('Shortfall', false)}
                    </td>
                    <td style={{ padding: '8px 10px', border: '1px solid #e5e7eb', textAlign: 'center' }}>
                      {kp.add_kams_needed > 0
                        ? <span style={{ fontWeight: 700, color: '#dc2626' }}>+{kp.add_kams_needed}</span>
                        : <span style={{ color: '#9ca3af' }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* KAM 22-day interview distribution */}
      {plan.kam_plans && plan.kam_plans.some(k => k.target_per_day > 0) && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: '#111827' }}>
            {wd.length}-Day Interview Distribution (KAMs)
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  <th style={{ padding: '6px 10px', textAlign: 'left', border: '1px solid #e5e7eb', fontWeight: 700, whiteSpace: 'nowrap' }}>Customer</th>
                  <th style={{ padding: '6px 10px', textAlign: 'left', border: '1px solid #e5e7eb', fontWeight: 700, whiteSpace: 'nowrap' }}>KAMs</th>
                  {wd.map(d => (
                    <th key={d} style={{ padding: '4px 6px', textAlign: 'center', border: '1px solid #e5e7eb', fontWeight: 700, whiteSpace: 'nowrap', minWidth: 40 }}>
                      {d.slice(5)}
                    </th>
                  ))}
                  <th style={{ padding: '6px 10px', textAlign: 'center', border: '1px solid #e5e7eb', fontWeight: 700 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {plan.kam_plans.filter(k => k.target_per_day > 0).map(kp => (
                  <tr key={kp.customer_name}>
                    <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', fontWeight: 700, whiteSpace: 'nowrap' }}>{kp.customer_name}</td>
                    <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', whiteSpace: 'nowrap', fontSize: 10, color: '#7c3aed' }}>
                      {kp.assigned_kams.map(k => `${k.user_name}(${k.daily_target})`).join(', ') || '—'}
                    </td>
                    {kp.daily_plan.map((v, i) => (
                      <td key={i} style={{
                        padding: '4px 6px', border: '1px solid #e5e7eb', textAlign: 'center',
                        background: v === 0 ? '#f9fafb' : v >= kp.max_per_day * 0.9 ? '#4c1d95' : '#f3e8ff',
                        color: v === 0 ? '#d1d5db' : v >= kp.max_per_day * 0.9 ? '#fff' : '#7c3aed',
                        fontWeight: v > 0 ? 700 : 400,
                      }}>{v === 0 ? '—' : v}</td>
                    ))}
                    <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', textAlign: 'center', fontWeight: 800, color: '#111827' }}>
                      {kp.daily_plan.reduce((a, b) => a + b, 0)}
                    </td>
                  </tr>
                ))}
                <tr style={{ background: '#f9fafb', fontWeight: 800 }}>
                  <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb' }}>Pod Total</td>
                  <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb' }}></td>
                  {wd.map((_, i) => {
                    const total = plan.kam_plans.filter(k => k.target_per_day > 0).reduce((s, kp) => s + (kp.daily_plan[i] ?? 0), 0);
                    return <td key={i} style={{ padding: '4px 6px', border: '1px solid #e5e7eb', textAlign: 'center', fontWeight: 700 }}>{total || '—'}</td>;
                  })}
                  <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', textAlign: 'center', fontWeight: 800, color: '#111827' }}>
                    {plan.kam_plans.filter(k => k.target_per_day > 0).reduce((s, kp) => s + kp.daily_plan.reduce((a, b) => a + b, 0), 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Daily distribution table */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: '#111827' }}>
          {wd.length}-Day Submission Distribution
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                <th style={{ padding: '6px 10px', textAlign: 'left', border: '1px solid #e5e7eb', fontWeight: 700, whiteSpace: 'nowrap' }}>Customer</th>
                {wd.map(d => (
                  <th key={d} style={{ padding: '4px 6px', textAlign: 'center', border: '1px solid #e5e7eb', fontWeight: 700, whiteSpace: 'nowrap', minWidth: 40 }}>
                    {d.slice(5)}
                  </th>
                ))}
                <th style={{ padding: '6px 10px', textAlign: 'center', border: '1px solid #e5e7eb', fontWeight: 700 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {plan.customer_plans.map(cp => (
                <tr key={cp.customer_name}>
                  <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', fontWeight: 700, whiteSpace: 'nowrap' }}>{cp.customer_name}</td>
                  {cp.daily_plan.map((v, i) => (
                    <td key={i} style={{
                      padding: '4px 6px', border: '1px solid #e5e7eb', textAlign: 'center',
                      background: v === 0 ? '#f9fafb' : v >= cp.max_per_day * 0.9 ? '#1e3a5f' : '#dbeafe',
                      color: v === 0 ? '#d1d5db' : v >= cp.max_per_day * 0.9 ? '#fff' : '#1d4ed8',
                      fontWeight: v > 0 ? 700 : 400,
                    }}>{v === 0 ? '—' : v}</td>
                  ))}
                  <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', textAlign: 'center', fontWeight: 800, color: '#111827' }}>
                    {cp.daily_plan.reduce((a, b) => a + b, 0)}
                  </td>
                </tr>
              ))}
              <tr style={{ background: '#f9fafb', fontWeight: 800 }}>
                <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb' }}>Pod Total</td>
                {wd.map((_, i) => {
                  const total = plan.customer_plans.reduce((s, cp) => s + (cp.daily_plan[i] ?? 0), 0);
                  return <td key={i} style={{ padding: '4px 6px', border: '1px solid #e5e7eb', textAlign: 'center', fontWeight: 700 }}>{total || '—'}</td>;
                })}
                <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', textAlign: 'center', fontWeight: 800, color: '#111827' }}>
                  {plan.customer_plans.reduce((s, cp) => s + cp.monthly_subs, 0)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Daily Tab ─────────────────────────────────────────────────────────────────

function DailyTab({ setupId, setup, customers }: { setupId: number; setup: Partial<PodSetup>; customers: CustomerTarget[] }) {
  const [workingDays, setWorkingDays] = useState<string[]>([]);
  const [selDate, setSelDate] = useState('');
  const [actuals, setActuals] = useState<Record<number, { actual_subs: number; actual_interviews: number; actual_selects: number; actual_obs: number }>>({});
  const [dlSubs, setDlSubs] = useState<Record<number, number>>({});
  const [olSubs, setOlSubs] = useState<Record<number, number>>({});
  const [weekInfo, setWeekInfo] = useState<WeekInfo | null>(null);
  const [weekOBTargets, setWeekOBTargets] = useState<Record<number, number>>({});
  const [weekOBActuals, setWeekOBActuals] = useState<Record<number, number>>({});
  const [monthlyActuals, setMonthlyActuals] = useState<Record<number, { subs: number; interviews: number; selects: number; obs: number }>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    podPlanApi.getWorkingDays(setupId).then(days => {
      setWorkingDays(days);
      const today = new Date().toISOString().slice(0, 10);
      setSelDate(days.includes(today) ? today : days[0] ?? '');
    });
  }, [setupId]);

  useEffect(() => {
    if (!selDate) return;
    Promise.all([
      podPlanApi.getDaily(setupId, selDate),
      podPlanApi.getMonthlyProgress(setupId),
    ]).then(([daily, monthly]) => {
      const loadedActuals = daily.actuals ?? {};
      const loadedDlSubs: Record<number, number> = daily.dl_subs ?? {};
      setDlSubs(loadedDlSubs);
      setOlSubs(daily.actual_subs_auto ?? {});
      setActuals(loadedActuals);
      setWeekInfo(daily.week_info);
      setWeekOBTargets(daily.week_ob_targets ?? {});
      setWeekOBActuals(daily.week_ob_actuals ?? {});
      setMonthlyActuals(monthly);
    });
  }, [setupId, selDate]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const entries = customers.map(c => ({
        customer_target_id: c.id,
        actual_subs: olSubs[c.id] ?? 0,
        actual_interviews: actuals[c.id]?.actual_interviews ?? 0,
        actual_selects: actuals[c.id]?.actual_selects ?? 0,
        actual_obs: actuals[c.id]?.actual_obs ?? 0,
      }));
      await podPlanApi.saveDaily(setupId, selDate, entries);
      const monthly = await podPlanApi.getMonthlyProgress(setupId);
      setMonthlyActuals(monthly);
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  };

  const setActual = (cid: number, field: string, val: number) => {
    setActuals(prev => ({ ...prev, [cid]: { ...(prev[cid] ?? { actual_subs: 0, actual_interviews: 0, actual_selects: 0, actual_obs: 0 }), [field]: val } }));
  };

  const inputCell = (cid: number, field: string) => (
    <input type="number" min={0}
      value={actuals[cid]?.[field as keyof typeof actuals[number]] ?? 0}
      onChange={e => setActual(cid, field, parseInt(e.target.value) || 0)}
      style={{ width: 65, textAlign: 'center', border: '1px solid #93c5fd', borderRadius: 6, padding: '4px 6px', fontSize: 13, background: '#f0f7ff' }} />
  );

  return (
    <div>
      {/* Date navigator */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 18px', marginBottom: 16 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginRight: 10 }}>Select Date:</span>
        <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6 }}>
          {workingDays.map(d => (
            <button key={d} onClick={() => setSelDate(d)}
              style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 600,
                border: d === selDate ? '2px solid #2563eb' : '1px solid #e5e7eb',
                background: d === selDate ? '#eff6ff' : '#f9fafb',
                color: d === selDate ? '#1d4ed8' : '#374151',
              }}>
              {d.slice(8)}
            </button>
          ))}
        </div>
      </div>

      {/* Entry form */}
      {selDate && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Entry for {selDate}</h3>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>Targets shown in grey · Green = DL verified (system) · Orange = Actual Subs auto-pulled from client pipeline · Blue inputs are editable</div>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['Customer', 'Subs Target/Day', 'DL Subs (System)', 'Actual Subs', 'Int Target/Day', 'Actual Int ✏️', 'Sel Target/Day', 'Actual Sel ✏️', 'Actual OBs ✏️'].map(h => (
                    <th key={h} style={{
                      padding: '8px 12px', border: '1px solid #e5e7eb', fontWeight: 700, fontSize: 12,
                      background: h === 'DL Subs (System)' ? '#f0fdf4' : h === 'Actual Subs' ? '#fff7ed' : h.includes('✏️') ? '#eff6ff' : '#f9fafb',
                      color: h === 'DL Subs (System)' ? '#15803d' : h === 'Actual Subs' ? '#c2410c' : h.includes('✏️') ? '#1d4ed8' : '#374151',
                      textAlign: h === 'Customer' ? 'left' : 'center',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {customers.map(c => {
                  const weights: number[] = (setup.week_weights as number[]) ?? [20, 20, 20, 20, 20];
                  const weekIdx = weekInfo ? (weekInfo.week_num - 1) : -1;
                  const weekPct = (weekIdx >= 0 ? (weights[weekIdx] ?? 20) : 20) / 100;
                  const weekWd = weekInfo ? ((weekInfo as any).week_working_days ?? 5) : 5;
                  const monthlySubs = Math.round(c.open_demand_pool * (c.repeat_demand_pct * c.subs_repeat + (1 - c.repeat_demand_pct) * (c.subs_new_phase1 + c.subs_new_phase2)));
                  const monthlyInts = c.target_interviews_day * Math.max(1, setup.working_days ?? 22);
                  const dailySubsTarget = c.target_interviews_day
                    ? Math.round((monthlySubs * weekPct) / Math.max(1, weekWd))
                    : null;
                  const dailyIntsTarget = Math.round((monthlyInts * weekPct) / Math.max(1, weekWd));
                  return (
                  <tr key={c.id}>
                    <td style={{ padding: '8px 12px', border: '1px solid #e5e7eb', fontWeight: 700 }}>{c.customer_name}</td>
                    <td style={{ padding: '8px 12px', border: '1px solid #e5e7eb', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>
                      {dailySubsTarget !== null ? dailySubsTarget : '—'}
                    </td>
                    <td style={{ padding: '8px 12px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#f0fdf4' }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: dlSubs[c.id] ? '#15803d' : '#9ca3af' }}>
                        {dlSubs[c.id] ?? 0}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#fff7ed' }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: olSubs[c.id] ? '#c2410c' : '#9ca3af' }}>
                        {olSubs[c.id] ?? 0}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px', border: '1px solid #e5e7eb', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>{dailyIntsTarget}</td>
                    <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#f0f7ff' }}>{inputCell(c.id, 'actual_interviews')}</td>
                    <td style={{ padding: '8px 12px', border: '1px solid #e5e7eb', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>—</td>
                    <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#f0f7ff' }}>{inputCell(c.id, 'actual_selects')}</td>
                    <td style={{ padding: '6px 10px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#f0f7ff' }}>{inputCell(c.id, 'actual_obs')}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button onClick={handleSave} disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <Save size={14} /> {saving ? 'Saving…' : saved ? '✓ Saved' : `Save Actuals for ${selDate}`}
            </button>
          </div>
        </div>
      )}

      {/* Weekly OB checkpoint */}
      {weekInfo && customers.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderLeft: '4px solid #7c3aed', borderRadius: 12, padding: 20, marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: '#111827' }}>
            Weekly OB Checkpoint — {weekInfo.week_label}
          </h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['Customer', 'Week OB Target', 'Actual OBs This Week', 'Remaining', 'Status'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Customer' ? 'left' : 'center', border: '1px solid #e5e7eb', fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {customers.map(c => {
                const tgt = weekOBTargets[c.id] ?? 0;
                const act = weekOBActuals[c.id] ?? 0;
                const rem = tgt - act;
                return (
                  <tr key={c.id}>
                    <td style={{ padding: '8px 12px', border: '1px solid #e5e7eb', fontWeight: 700 }}>{c.customer_name}</td>
                    <td style={{ padding: '8px 12px', border: '1px solid #e5e7eb', textAlign: 'center', fontWeight: 800, color: '#7c3aed' }}>{tgt}</td>
                    <td style={{ padding: '8px 12px', border: '1px solid #e5e7eb', textAlign: 'center', fontWeight: 700 }}>{act}</td>
                    <td style={{ padding: '8px 12px', border: '1px solid #e5e7eb', textAlign: 'center', fontWeight: 600, color: rem <= 0 ? '#16a34a' : '#dc2626' }}>
                      {rem <= 0 ? '✅ Done' : `${rem} left`}
                    </td>
                    <td style={{ padding: '8px 12px', border: '1px solid #e5e7eb', textAlign: 'center' }}>
                      {tgt === 0 ? badge('No target', true)
                        : act >= tgt ? badge('On Track', true)
                        : act > 0 ? <span style={{ background: '#fef9c3', color: '#92400e', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>In Progress</span>
                        : badge('Not Started', false)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Monthly progress */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: '#111827' }}>Monthly Progress — {setup.month}</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['Customer', 'Subs Target', 'Actual Subs', 'Progress', 'Int Target', 'Actual Int', 'Actual Sel', 'OBs Target', 'Actual OBs'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', border: '1px solid #e5e7eb', fontWeight: 700, fontSize: 12, textAlign: h === 'Customer' ? 'left' : 'center' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {customers.map(c => {
                const ma = monthlyActuals[c.id];
                const wd = Math.max(1, setup.working_days ?? 22);
                const rpct = c.repeat_demand_pct;
                const avgSD = rpct * c.subs_repeat + (1 - rpct) * (c.subs_new_phase1 + c.subs_new_phase2);
                const monthlySubs = Math.round(avgSD * c.open_demand_pool);
                const monthlyInts = c.target_interviews_day * wd;
                const actualSubs = ma?.subs ?? 0;
                const pct = monthlySubs > 0 ? Math.round((actualSubs / monthlySubs) * 100) : 0;
                const net_po = c.net_po_target_cust + c.exit_alloc;
                const obs_needed = c.avg_po_per_ob > 0 ? Math.round(net_po / c.avg_po_per_ob) : 0;
                return (
                  <tr key={c.id}>
                    <td style={{ padding: '8px 10px', border: '1px solid #e5e7eb', fontWeight: 700 }}>{c.customer_name}</td>
                    <td style={{ padding: '8px 10px', border: '1px solid #e5e7eb', textAlign: 'center', color: '#6b7280' }}>{monthlySubs}</td>
                    <td style={{ padding: '8px 10px', border: '1px solid #e5e7eb', textAlign: 'center', fontWeight: 700 }}>{actualSubs}</td>
                    <td style={{ padding: '8px 10px', border: '1px solid #e5e7eb', minWidth: 140 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ flex: 1, background: '#f3f4f6', borderRadius: 99, height: 7 }}>
                          <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', borderRadius: 99, background: pct >= 100 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#f87171' }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: pct >= 100 ? '#059669' : pct >= 60 ? '#d97706' : '#dc2626', minWidth: 32 }}>{pct}%</span>
                      </div>
                    </td>
                    <td style={{ padding: '8px 10px', border: '1px solid #e5e7eb', textAlign: 'center', color: '#6b7280' }}>{monthlyInts}</td>
                    <td style={{ padding: '8px 10px', border: '1px solid #e5e7eb', textAlign: 'center', fontWeight: 700 }}>{ma?.interviews ?? 0}</td>
                    <td style={{ padding: '8px 10px', border: '1px solid #e5e7eb', textAlign: 'center', fontWeight: 700 }}>{ma?.selects ?? 0}</td>
                    <td style={{ padding: '8px 10px', border: '1px solid #e5e7eb', textAlign: 'center', color: '#6b7280' }}>{obs_needed}</td>
                    <td style={{ padding: '8px 10px', border: '1px solid #e5e7eb', textAlign: 'center', fontWeight: 700, color: (ma?.obs ?? 0) >= obs_needed ? '#059669' : '#374151' }}>{ma?.obs ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PodPlan() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [activeTab, setActiveTab] = useState<TabKey>('setup');
  const [selectedMonth, setSelectedMonth] = useState(
    new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  );
  const [setup, setSetup] = useState<Partial<PodSetup>>({
    month: selectedMonth,
    net_po_target: 100, exit_budget: 5, working_days: 22,
    target_selects_month: 50, sel_ob_rate: 0.8,
    subs_per_recruiter_day: 6, num_recruiters: 16,
    interviews_per_kam_day: 12, num_kams: 4,
  });
  const [setupId, setSetupId] = useState<number | null>(null);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [customers, setCustomers] = useState<CustomerTarget[]>([]);
  const [weeks, setWeeks] = useState<WeekInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [existingMonths, setExistingMonths] = useState<string[]>([]);
  const [bhs, setBhs] = useState<{ id: number; name: string; email: string; pod_id: number }[]>([]);
  const [selectedBhUserId, setSelectedBhUserId] = useState<number | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [planRefreshKey, setPlanRefreshKey] = useState(0);

  const loadSetup = useCallback((month: string, asBh?: number) => {
    setLoading(true);
    setError('');
    podPlanApi.getSetup(month, asBh)
      .then(data => {
        if (data.setup) {
          setSetup(data.setup);
          setSetupId(data.setup.id);
          setWeeks(data.weeks ?? []);
          return podPlanApi.listCustomers(data.setup.id).then(c => setCustomers(c));
        } else {
          setSetup(s => ({ ...s, month }));
          setSetupId(null);
          setCustomers([]);
          setWeeks(data.weeks ?? []);
        }
      })
      .catch(() => setError('Could not load pod setup. Make sure you have a pod assigned.'))
      .finally(() => setLoading(false));
  }, []);

  const loadForBh = useCallback((bhId: number, fallbackMonth: string) => {
    podPlanApi.listSetups(bhId)
      .then(data => {
        setExistingMonths(data.setups.map(s => s.month));
        const month = data.setups.length > 0 ? data.setups[0].month : fallbackMonth;
        setSelectedMonth(month);
        loadSetup(month, bhId);
      })
      .catch(() => loadSetup(fallbackMonth, bhId));
  }, [loadSetup]);

  useEffect(() => {
    podPlanApi.listClients().then(setClients);
    if (isAdmin) {
      podPlanApi.listBHs().then(data => {
        setBhs(data.bhs);
        if (data.bhs.length > 0) {
          const firstBh = data.bhs[0];
          setSelectedBhUserId(firstBh.id);
          loadForBh(firstBh.id, selectedMonth);
        } else {
          setLoading(false);
        }
      }).catch(() => setLoading(false));
    } else {
      podPlanApi.listSetups()
        .then(data => {
          setExistingMonths(data.setups.map(s => s.month));
          if (data.setups.length > 0) {
            const existingMonth = data.setups[0].month;
            setSelectedMonth(existingMonth);
            loadSetup(existingMonth);
          } else {
            loadSetup(selectedMonth);
          }
        })
        .catch(() => loadSetup(selectedMonth));
    }
  }, []);

  const handleBhChange = (bhId: number) => {
    setSelectedBhUserId(bhId);
    setActiveTab('setup');
    loadForBh(bhId, selectedMonth);
  };

  const handleMonthChange = (month: string) => {
    setSelectedMonth(month);
    setActiveTab('setup');
    loadSetup(month, selectedBhUserId ?? undefined);
  };

  const handleSetupChange = (s: Partial<PodSetup>) => setSetup(s);

  if (loading) {
    return (
      <Layout title="Pod Monthly Plan">
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading pod plan…</div>
      </Layout>
    );
  }

  return (
    <Layout title="Pod Monthly Plan">
      <div style={{ padding: '20px 24px', maxWidth: 1400, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#111827' }}>Pod Monthly Plan</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>
              Set targets, track actuals, and plan recruiter capacity for your pod.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {isAdmin && bhs.length > 0 && (
              <>
                <span style={{ fontSize: 13, color: '#6b7280' }}>BH:</span>
                <select
                  value={selectedBhUserId ?? ''}
                  onChange={e => handleBhChange(Number(e.target.value))}
                  style={{ padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, fontWeight: 600, background: '#fff' }}>
                  {bhs.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </>
            )}
            <span style={{ fontSize: 13, color: '#6b7280' }}>Month:</span>
            <select value={selectedMonth} onChange={e => handleMonthChange(e.target.value)}
              style={{ padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, fontWeight: 600, background: '#fff' }}>
              {[...new Set([...existingMonths, ...MONTHS])].map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <button
              onClick={() => setShowCalendar(v => !v)}
              title="Pick working days"
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px',
                border: `1px solid ${showCalendar ? '#93c5fd' : '#d1d5db'}`, borderRadius: 8,
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                background: showCalendar ? '#eff6ff' : '#fff',
                color: showCalendar ? '#2563eb' : '#374151',
              }}>
              <Calendar size={14} />
              {setup.working_days ?? 22}d
            </button>
          </div>
        </div>

        {showCalendar && (
          <div style={{ marginBottom: 16 }}>
            <WorkingDayCalendar
              month={selectedMonth}
              value={setup.custom_working_days}
              onChange={(days, count) => handleSetupChange({ ...setup, working_days: count, custom_working_days: days })}
            />
          </div>
        )}

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, color: '#dc2626', fontSize: 13 }}>
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #e5e7eb', paddingBottom: 0 }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '10px 18px', border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 600, borderRadius: '8px 8px 0 0',
                background: activeTab === t.key ? '#fff' : 'transparent',
                color: activeTab === t.key ? '#2563eb' : '#6b7280',
                borderBottom: activeTab === t.key ? '2px solid #2563eb' : '2px solid transparent',
                marginBottom: -1,
              }}>
              {t.icon} {t.label}
              {t.key !== 'setup' && !setupId && (
                <span style={{ fontSize: 10, background: '#fef3c7', color: '#d97706', padding: '1px 5px', borderRadius: 4, marginLeft: 2 }}>setup first</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'setup' && (
          <SetupTab
            setup={setup}
            onSetupChange={handleSetupChange}
            clients={clients}
            customers={customers}
            onCustomersChange={setCustomers}
            setupId={setupId}
            weeks={weeks}
            asBh={selectedBhUserId ?? undefined}
            onSaved={(savedSetup, savedWeeks) => {
              setSetup(savedSetup);
              setWeeks(savedWeeks);
              if (!setupId && savedSetup.id) setSetupId(savedSetup.id);
              setPlanRefreshKey(k => k + 1);
            }}
          />
        )}
        {activeTab === 'dashboard' && setupId && <DashboardTab key={`dash-${setupId}-${planRefreshKey}`} setupId={setupId} />}
        {activeTab === 'recruiters' && setupId && <RecruitersTab setupId={setupId} customers={customers} />}
        {activeTab === 'plan' && setupId && <PlanTab key={`plan-${setupId}-${planRefreshKey}`} setupId={setupId} />}
        {activeTab === 'daily' && setupId && <DailyTab setupId={setupId} setup={setup} customers={customers} />}
        {activeTab !== 'setup' && !setupId && (
          <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>
            <Target size={40} style={{ marginBottom: 12, opacity: 0.3 }} />
            <div style={{ fontSize: 15 }}>Save your setup first to unlock this tab.</div>
            <button onClick={() => setActiveTab('setup')}
              style={{ marginTop: 12, padding: '8px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Go to Setup
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}
