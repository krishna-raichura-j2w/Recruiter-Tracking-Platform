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

  const subtitle = `Set hourly submission targets — cumulative target is what the user should reach by the end of each slot`;

  return (
    <Layout title="Targets" subtitle={subtitle}>
      {/* ── Controls ── */}
      <div className="flex items-center flex-wrap gap-3 mb-4">
        <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
          {visibleTabs.map(t => (
            <button
              key={t.value}
              onClick={() => setRoleTab(t.value)}
              className={`px-3 py-1.5 text-xs font-bold ${roleTab === t.value ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-white">
          <Calendar size={13} className="text-slate-400" />
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="text-xs focus:outline-none"
          />
        </div>

        <div className="relative">
          <Filter size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text" placeholder="Search user…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="pl-7 pr-2.5 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-blue-400 w-48"
          />
        </div>

        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>

        <div className="flex-1" />

        <button
          onClick={saveAll}
          disabled={saving || dirtyUserIds.length === 0}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50"
        >
          <Save size={12} /> {saving ? 'Saving…' : dirtyUserIds.length > 0 ? `Save (${dirtyUserIds.length})` : 'No changes'}
        </button>
      </div>

      {error && (
        <div className="mb-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-medium">
          {error}
        </div>
      )}
      {savedMsg && !error && (
        <div className="mb-3 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-700 font-medium">
          {savedMsg}
        </div>
      )}

      {/* ── Grid ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          {loading && !data ? (
            <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-400">
              No {roleTab === 'delivery_lead' ? 'Delivery Leads' : 'recruiters'} visible.
            </div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-100">
                  <th className="text-left py-2.5 px-4 text-xs font-bold text-slate-700 border-b border-slate-200 uppercase tracking-wider">
                    {roleTab === 'delivery_lead' ? 'Delivery Lead' : 'Recruiter'}
                  </th>
                  <th className="text-center py-2.5 px-4 text-xs font-bold text-slate-700 border-b border-slate-200 uppercase tracking-wider" style={{ width: 180 }}>
                    Daily target
                  </th>
                  <th className="text-left py-2.5 px-4 text-xs font-bold text-slate-700 border-b border-slate-200 uppercase tracking-wider" style={{ width: 180 }}>
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(u => {
                  const v = valueFor(u.id);
                  const dirty = edits[u.id] !== undefined;
                  return (
                    <tr key={u.id} className="hover:bg-slate-50 border-b border-slate-100 last:border-0">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-800">{u.name}</div>
                        <div className="text-[10px] text-slate-400">{u.email}</div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <input
                          type="number"
                          min={0}
                          max={999}
                          value={v}
                          disabled={!u.editable}
                          onChange={e => setEdit(u.id, Math.max(0, Math.min(999, parseInt(e.target.value || '0', 10))))}
                          className={`w-24 py-2 px-3 text-center text-base font-semibold rounded-lg border ${dirty ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200'} focus:outline-none focus:border-blue-400 ${u.editable ? '' : 'bg-slate-50 text-slate-400 cursor-not-allowed'}`}
                        />
                      </td>
                      <td className="py-3 px-4 text-xs">
                        {dirty ? (
                          <span className="px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-700">Unsaved change</span>
                        ) : u.is_default ? (
                          <span className="px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-700 border border-amber-200" title="Role default — no save on file yet">
                            Default ({v})
                          </span>
                        ) : u.is_carried_forward && u.source_date ? (
                          <span className="text-slate-500" title="Carried forward from a prior save; still active until you change it">
                            Carried from {u.source_date}
                          </span>
                        ) : v === 0 ? (
                          <span className="text-slate-400">No target</span>
                        ) : (
                          <span className="text-slate-500">Saved today</span>
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
