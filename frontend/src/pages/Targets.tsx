import { useEffect, useMemo, useState } from 'react';
import { Calendar, Save, RefreshCw, Filter } from 'lucide-react';
import Layout from '../components/Layout';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Slot { index: number; label: string; start: string; end: string; }

interface TargetCell { slot_index: number; target_count: number; }

interface UserTargets {
  id:         number;
  name:       string;
  email:      string;
  role:       string;
  editable:   boolean;
  is_default: boolean;            // true if these are role defaults (no save yet)
  is_carried_forward?: boolean;   // true if values came from an earlier saved date
  source_date?: string | null;    // YYYY-MM-DD of the save these values came from
  targets:    TargetCell[];
  day_target: number;
}

interface ApiResp {
  date:  string;
  slots: Slot[];
  users: UserTargets[];
}

const ROLE_TABS: { value: 'delivery_lead' | 'recruiter'; label: string }[] = [
  { value: 'delivery_lead', label: 'Delivery Leads' },
  { value: 'recruiter',     label: 'Recruiters' },
];

// Backend treats "today" as today in IST (Asia/Kolkata). Use the same so the
// default date here matches what the leaderboard reads. Without this, anyone
// loading the page before 05:30 IST would silently save targets for the
// previous UTC day and never see them in the leaderboard.
function todayISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Targets() {
  const { user } = useAuth();
  const myRole = user?.role;

  const [date, setDate]               = useState(todayISO());
  const [roleTab, setRoleTab]         = useState<'delivery_lead' | 'recruiter'>(
    myRole === 'delivery_lead' ? 'recruiter' : 'delivery_lead'
  );
  const [data, setData]               = useState<ApiResp | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [search, setSearch]           = useState('');

  // Local edits: { userId → new daily-target number }. Only present when changed.
  const [edits, setEdits] = useState<Record<number, number>>({});
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  const fetchData = () => {
    setLoading(true);
    setError('');
    api.get<ApiResp>('/targets', { params: { date, role: roleTab } })
      .then(r => { setData(r.data); setEdits({}); })
      .catch(e => setError(e?.response?.data?.detail || 'Failed to load targets'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [date, roleTab]);

  // DLs can only see Recruiters tab (they have no DLs under them).
  const visibleTabs = useMemo(
    () => myRole === 'delivery_lead' ? ROLE_TABS.filter(t => t.value === 'recruiter') : ROLE_TABS,
    [myRole],
  );

  const filteredUsers = useMemo(() => {
    const users = data?.users ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
  }, [data, search]);

  // Resolve the current daily target for a user: pending edit takes precedence,
  // otherwise the server-side day_target (which already accounts for default /
  // carried-forward values).
  const valueFor = (uid: number): number => {
    if (edits[uid] !== undefined) return edits[uid];
    const u = data?.users.find(x => x.id === uid);
    return u?.day_target ?? 0;
  };

  const setEdit = (uid: number, val: number) => {
    setEdits(prev => ({ ...prev, [uid]: val }));
  };

  const dirtyUserIds = useMemo(() => Object.keys(edits).map(Number), [edits]);

  const saveAll = async () => {
    if (dirtyUserIds.length === 0) return;
    setSaving(true);
    setError('');
    setSavedMsg('');
    const failures: string[] = [];
    const skipped:  string[] = [];
    let     saved   = 0;
    for (const uid of dirtyUserIds) {
      const u = data?.users.find(x => x.id === uid);
      if (!u) continue;
      if (!u.editable) { skipped.push(u.name); continue; }
      // Daily-target model: one number per user per day. Persisted in the
      // backend as slot_index=0 carrying the value, every other slot 0.
      // (The existing API already accepts a per-slot list; we just zero out
      // the rest so the leaderboard sum matches the user's intent.)
      const dayTarget = valueFor(uid);
      const slots = (data?.slots ?? []).map(s => ({
        slot_index: s.index,
        target_count: s.index === 0 ? dayTarget : 0,
      }));
      try {
        await api.put('/targets', { user_id: uid, date, slots });
        saved += 1;
      } catch (e) {
        const err = e as { response?: { data?: { detail?: string } } };
        failures.push(`${u.name}: ${err?.response?.data?.detail || 'Failed'}`);
      }
    }
    setSaving(false);
    if (failures.length === 0 && skipped.length === 0) {
      setSavedMsg(`Saved targets for ${saved} user(s) on ${date}. Open the Leaderboard and click Refresh to see the new "Target so far" and "Day target".`);
    } else {
      const parts: string[] = [];
      if (saved   > 0)      parts.push(`Saved ${saved}.`);
      if (skipped.length)   parts.push(`Skipped (no permission): ${skipped.join(', ')}.`);
      if (failures.length)  parts.push(`Failed: ${failures.join('; ')}`);
      setError(parts.join(' '));
    }
    fetchData();
  };

  const subtitle = `Set the daily submission target per person. Saved on any date carries forward until you override it.`;

  return (
    <Layout title="Targets" subtitle={subtitle}>
      {/* ── Controls ── */}
      <div className="flex items-center flex-wrap gap-2 mb-5">
        {/* Role segmented control */}
        <div className="inline-flex rounded-md overflow-hidden p-0.5" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border-hairline)' }}>
          {visibleTabs.map(t => {
            const isActive = roleTab === t.value;
            return (
              <button
                key={t.value}
                onClick={() => setRoleTab(t.value)}
                className="px-3 py-1.5 text-[12.5px] rounded-[5px] transition-all"
                style={{
                  background: isActive ? 'var(--surface-card)' : 'transparent',
                  color: isActive ? 'var(--ink)' : 'var(--ink-3)',
                  fontWeight: isActive ? 600 : 500,
                  boxShadow: isActive ? 'var(--shadow-1)' : 'none',
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Date picker — restyled */}
        <div className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors"
             style={{ background: 'var(--surface-card)', border: '1px solid var(--border-hairline)' }}>
          <Calendar size={13} style={{ color: 'var(--ink-3)' }} />
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="text-[12.5px] font-mono tabular-nums focus:outline-none bg-transparent"
            style={{ color: 'var(--ink)' }}
          />
        </div>

        <div className="relative">
          <Filter size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--ink-4)' }} />
          <input
            type="text" placeholder="Search user…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="pl-7 pr-2.5 py-1.5 rounded-md text-[12.5px] w-48 focus:outline-none"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--border-hairline)', color: 'var(--ink)' }}
          />
        </div>

        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12.5px] font-medium transition-colors disabled:opacity-50"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border-hairline)', color: 'var(--ink-2)' }}
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>

        <div className="flex-1" />

        <button
          onClick={saveAll}
          disabled={saving || dirtyUserIds.length === 0}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[12.5px] font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: dirtyUserIds.length > 0 ? 'var(--ink)' : 'var(--surface-muted)',
            color: dirtyUserIds.length > 0 ? '#FFFFFF' : 'var(--ink-3)',
            border: '1px solid ' + (dirtyUserIds.length > 0 ? 'var(--ink)' : 'var(--border-hairline)'),
            boxShadow: dirtyUserIds.length > 0 ? 'var(--shadow-1)' : 'none',
          }}
        >
          <Save size={12} /> {saving ? 'Saving…' : dirtyUserIds.length > 0 ? `Save changes (${dirtyUserIds.length})` : 'No changes'}
        </button>
      </div>

      {error && (
        <div className="mb-3 px-4 py-2.5 rounded-md text-[13px] font-medium"
             style={{ background: 'var(--danger-soft)', border: '1px solid #FCA5A5', color: 'var(--danger)' }}>
          {error}
        </div>
      )}
      {savedMsg && !error && (
        <div className="mb-3 px-4 py-2.5 rounded-md text-[13px] font-medium"
             style={{ background: 'var(--success-soft)', border: '1px solid #A7F3D0', color: 'var(--success)' }}>
          {savedMsg}
        </div>
      )}

      {/* ── Grid ── */}
      <div className="surface overflow-hidden">
        <div className="overflow-x-auto">
          {loading && !data ? (
            <div className="py-16 text-center text-[13px]" style={{ color: 'var(--ink-3)' }}>Loading…</div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-16 text-center text-[13px]" style={{ color: 'var(--ink-3)' }}>
              No {roleTab === 'delivery_lead' ? 'Delivery Leads' : 'recruiters'} visible.
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr style={{ background: 'var(--surface-muted)', borderBottom: '1px solid var(--border-hairline)' }}>
                  <th className="text-left py-2.5 px-5 label-caps">
                    {roleTab === 'delivery_lead' ? 'Delivery Lead' : 'Recruiter'}
                  </th>
                  <th className="text-center py-2.5 px-5 label-caps" style={{ width: 200 }}>
                    Daily target
                  </th>
                  <th className="text-left py-2.5 px-5 label-caps" style={{ width: 240 }}>
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(u => {
                  const v = valueFor(u.id);
                  const dirty = edits[u.id] !== undefined;
                  return (
                    <tr key={u.id} className="transition-colors" style={{ borderBottom: '1px solid var(--border-hairline)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <td className="py-3 px-5">
                        <div className="text-[13.5px] font-medium" style={{ color: 'var(--ink)' }}>{u.name}</div>
                        <div className="text-[11px] mt-0.5" style={{ color: 'var(--ink-4)' }}>{u.email}</div>
                      </td>
                      <td className="py-3 px-5 text-center">
                        <input
                          type="number"
                          min={0}
                          max={999}
                          value={v}
                          disabled={!u.editable}
                          onChange={e => setEdit(u.id, Math.max(0, Math.min(999, parseInt(e.target.value || '0', 10))))}
                          className="w-20 py-1.5 px-2 text-center font-mono tabular-nums focus:outline-none transition-colors"
                          style={{
                            fontSize: 15,
                            fontWeight: 600,
                            borderRadius: 8,
                            border: '1px solid ' + (dirty ? '#10B981' : 'var(--border-hairline)'),
                            background: dirty ? '#ECFDF5' : (u.editable ? 'var(--surface-card)' : 'var(--surface-muted)'),
                            color: u.editable ? (dirty ? '#047857' : 'var(--ink)') : 'var(--ink-4)',
                            cursor: u.editable ? 'text' : 'not-allowed',
                          }}
                        />
                      </td>
                      <td className="py-3 px-5">
                        {dirty ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold"
                                style={{ background: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0' }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#10B981' }} />
                            Unsaved change
                          </span>
                        ) : u.is_default ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold"
                                style={{ background: 'var(--warning-soft)', color: 'var(--warning)', border: '1px solid #FDE68A' }}
                                title="Role default — no save on file yet">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#F59E0B' }} />
                            Default · {v}
                          </span>
                        ) : u.is_carried_forward && u.source_date ? (
                          <span className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--ink-3)' }}
                                title="Carried forward from a prior save; still active until you change it">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--ink-4)' }} />
                            Carried from <span className="font-mono tabular-nums">{u.source_date}</span>
                          </span>
                        ) : v === 0 ? (
                          <span className="text-[11px]" style={{ color: 'var(--ink-4)' }}>No target set</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium"
                                style={{ color: 'var(--ink-2)', background: 'var(--surface-muted)' }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--success)' }} />
                            Saved today
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Layout>
  );
}
