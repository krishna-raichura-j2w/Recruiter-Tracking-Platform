import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate, type NavigateFunction } from 'react-router-dom';
import { RefreshCw, Search, AlertCircle, CalendarCheck, MapPin, Users, List, LayoutDashboard } from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import type { Drive, DriveStatus, DriveType, DriveSummary } from '../types';

const STATUS_STYLE: Record<DriveStatus, string> = {
  planned:     'bg-slate-100 text-slate-700 border-slate-200',
  sourcing:    'bg-amber-100 text-amber-700 border-amber-200',
  in_progress: 'bg-blue-100 text-blue-700 border-blue-200',
  shortlisted: 'bg-violet-100 text-violet-700 border-violet-200',
  complete:    'bg-emerald-100 text-emerald-700 border-emerald-200',
  blocked:     'bg-red-100 text-red-700 border-red-200',
  cancelled:   'bg-gray-100 text-gray-500 border-gray-200',
};

const TYPE_LABEL: Record<DriveType, string> = {
  walkin: 'Walk-in',
  virtual: 'Virtual',
  college_walkin: 'College Walk-in',
  followup: 'Follow-up',
};

const STATUS_OPTIONS: DriveStatus[] = [
  'planned', 'sourcing', 'in_progress', 'shortlisted', 'complete', 'blocked', 'cancelled',
];

function pct(v: number | null): string {
  if (v === null || v === undefined) return '—';
  return `${Math.round(v * 100)}%`;
}

function fmtDate(d: string | null): string {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function driveDateRange(d: Drive): string {
  const from = fmtDate(d.drive_date_from);
  const to = fmtDate(d.drive_date_upto);
  if (from && to && from !== to) return `${from} – ${to}`;
  return from || to || '—';
}

export default function Drives() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = user?.role ?? '';
  const canDashboard = ['admin', 'kam', 'delivery_lead', 'bh'].includes(role);
  const [view, setView] = useState<'list' | 'dashboard'>('list');
  const [drives, setDrives] = useState<Drive[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  const fetchDrives = useCallback(() => {
    setLoading(true);
    setError(null);
    const params: Record<string, string> = {};
    if (statusFilter) params.status = statusFilter;
    api.get<Drive[]>('/drives', { params })
      .then((res) => setDrives(res.data ?? []))
      .catch(() => setError('Failed to load drives.'))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => { fetchDrives(); }, [fetchDrives]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return drives;
    return drives.filter((d) =>
      (d.client_name ?? '').toLowerCase().includes(q) ||
      (d.role_title ?? '').toLowerCase().includes(q) ||
      (d.venue ?? '').toLowerCase().includes(q)
    );
  }, [drives, search]);

  return (
    <Layout title="Walk-ins / Drives" subtitle="Drive planning & day-of tracking">
      {/* View toggle (DL/KAM/Admin/BH get the aggregate Dashboard) */}
      {canDashboard && (
        <div className="inline-flex rounded-xl border border-slate-200 p-0.5 mb-4">
          {([['list', 'List', List], ['dashboard', 'Dashboard', LayoutDashboard]] as const).map(([v, label, Icon]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors ${view === v ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      )}

      {view === 'dashboard' && canDashboard ? (
        <DriveDashboard role={role} navigate={navigate} />
      ) : (
      <>
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client, role, venue…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s.replace('_', ' ')}</option>
          ))}
        </select>
        <button
          onClick={fetchDrives}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 mb-4 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center text-slate-400 text-sm">Loading drives…</div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center">
          <CalendarCheck size={28} className="mx-auto mb-2 text-slate-200" />
          <p className="text-sm text-slate-400">
            No drives yet. Create a job with Walk-in/Drive selected and it will appear here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <th className="px-4 py-3 font-semibold">Client / Role</th>
                <th className="px-3 py-3 font-semibold">Type</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold text-center">Pos</th>
                <th className="px-3 py-3 font-semibold text-center">Conv</th>
                <th className="px-3 py-3 font-semibold text-center">Sub Target</th>
                <th className="px-3 py-3 font-semibold text-center">Show</th>
                <th className="px-3 py-3 font-semibold text-center">Select</th>
                <th className="px-3 py-3 font-semibold">Date(s)</th>
                <th className="px-3 py-3 font-semibold">Owners</th>
                <th className="px-3 py-3 font-semibold text-center">Lineup</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr
                  key={d.id}
                  onClick={() => navigate(`/drives/${d.id}`)}
                  className="border-b border-slate-50 last:border-0 hover:bg-blue-50/40 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-800">{d.client_name ?? '—'}</div>
                    <div className="text-xs text-slate-500">{d.role_title ?? ''}</div>
                    {d.venue && (
                      <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                        <MapPin size={10} /> {d.venue}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-slate-600">{TYPE_LABEL[d.drive_type]}</td>
                  <td className="px-3 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border ${STATUS_STYLE[d.status] ?? STATUS_STYLE.planned}`}>
                      {(d.status ?? 'planned').replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center text-slate-700">{d.open_positions ?? '—'}</td>
                  <td className="px-3 py-3 text-center text-slate-600">{pct(d.conversion_rate)}</td>
                  <td className="px-3 py-3 text-center font-semibold text-slate-800">
                    {d.submission_target}
                    {d.submission_target_override != null && (
                      <span className="ml-1 text-[10px] text-amber-600">(set)</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center text-slate-600">{d.show_target}</td>
                  <td className="px-3 py-3 text-center text-slate-600">{d.select_target}</td>
                  <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{driveDateRange(d)}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {[d.kam_owner_name, d.dl_owner_name, d.bh_owner_name]
                        .filter(Boolean)
                        .map((n, i) => (
                          <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-full text-[11px] font-medium whitespace-nowrap">
                            {n}
                          </span>
                        ))}
                      {![d.kam_owner_name, d.dl_owner_name, d.bh_owner_name].some(Boolean) && (
                        <span className="text-slate-300">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className="inline-flex items-center gap-1 text-slate-600">
                      <Users size={12} /> {d.lineup_count}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </>
      )}
    </Layout>
  );
}

// ── Aggregate Dashboard (DL/KAM/Admin/BH) ─────────────────────────────────────
function StatCard({ label, value, tone = 'slate' }: { label: string; value: number; tone?: string }) {
  const tones: Record<string, string> = {
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    violet: 'bg-violet-50 text-violet-700 border-violet-200',
  };
  return (
    <div className={`rounded-2xl border p-4 ${tones[tone] ?? tones.slate}`}>
      <div className="text-2xl font-black tabular-nums leading-none">{value}</div>
      <div className="text-[11px] font-semibold uppercase tracking-wide mt-1.5 opacity-80">{label}</div>
    </div>
  );
}

function DriveDashboard({ role, navigate }: { role: string; navigate: NavigateFunction }) {
  const [scope, setScope] = useState<'mine' | 'all'>(role === 'admin' ? 'all' : 'mine');
  const [data, setData] = useState<DriveSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(() => {
    setLoading(true);
    setError(null);
    api.get<DriveSummary>('/drives/summary', { params: { scope } })
      .then((res) => setData(res.data))
      .catch(() => setError('Failed to load dashboard.'))
      .finally(() => setLoading(false));
  }, [scope]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  const t = data?.totals;

  return (
    <div>
      {/* Scope toggle */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-slate-500">Showing</span>
        <div className="inline-flex rounded-lg border border-slate-200 p-0.5">
          {(['mine', 'all'] as const).map((s) => (
            <button key={s} onClick={() => setScope(s)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md ${scope === s ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-700'}`}>
              {s === 'mine' ? 'My drives' : 'All drives'}
            </button>
          ))}
        </div>
        <button onClick={fetchSummary} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 mb-4 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {loading || !t ? (
        <div className="py-20 text-center text-slate-400 text-sm">Loading dashboard…</div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
            <StatCard label="Total drives" value={data!.total_drives} tone="slate" />
            <StatCard label="In pipeline" value={t.in_pipeline} tone="blue" />
            <StatCard label="Confirmed" value={t.confirmed} tone="emerald" />
            <StatCard label="Not confirmed" value={t.not_confirmed} tone="amber" />
            <StatCard label="No-show" value={t.no_show} tone="red" />
            <StatCard label="D-1 confirmed" value={t.d1_confirmed} tone="emerald" />
            <StatCard label="D-1 pending" value={t.d1_pending} tone="amber" />
            <StatCard label="D-day confirmed" value={t.dday_confirmed} tone="emerald" />
            <StatCard label="D-day pending" value={t.dday_pending} tone="amber" />
          </div>

          {/* Per-drive breakdown */}
          {data!.per_drive.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">No drives in scope.</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                    <th className="px-4 py-3 font-semibold">Client / Role</th>
                    <th className="px-3 py-3 font-semibold">Date</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="px-3 py-3 font-semibold text-center">Pipeline</th>
                    <th className="px-3 py-3 font-semibold text-center">Confirmed</th>
                    <th className="px-3 py-3 font-semibold text-center">Not conf.</th>
                    <th className="px-3 py-3 font-semibold text-center">No-show</th>
                    <th className="px-3 py-3 font-semibold text-center">D-1 ✓ / pend</th>
                    <th className="px-3 py-3 font-semibold text-center">D-day ✓ / pend</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.per_drive.map((r) => (
                    <tr key={r.drive_id} onClick={() => navigate(`/drives/${r.drive_id}`)}
                      className="border-b border-slate-50 last:border-0 hover:bg-blue-50/40 cursor-pointer transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800">{r.client_name ?? '—'}</div>
                        <div className="text-xs text-slate-500">{r.role_title ?? ''}</div>
                      </td>
                      <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{fmtDate(r.drive_date_from)}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border ${STATUS_STYLE[r.status ?? 'planned'] ?? STATUS_STYLE.planned}`}>
                          {(r.status ?? 'planned').replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center font-semibold text-slate-800">{r.in_pipeline}</td>
                      <td className="px-3 py-3 text-center text-emerald-700">{r.confirmed}</td>
                      <td className="px-3 py-3 text-center text-amber-700">{r.not_confirmed}</td>
                      <td className="px-3 py-3 text-center text-red-600">{r.no_show}</td>
                      <td className="px-3 py-3 text-center text-slate-600">
                        <span className="text-emerald-700 font-semibold">{r.d1_confirmed}</span>
                        <span className="text-slate-300"> / </span>
                        <span className="text-amber-700">{r.d1_pending}</span>
                      </td>
                      <td className="px-3 py-3 text-center text-slate-600">
                        <span className="text-emerald-700 font-semibold">{r.dday_confirmed}</span>
                        <span className="text-slate-300"> / </span>
                        <span className="text-amber-700">{r.dday_pending}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
