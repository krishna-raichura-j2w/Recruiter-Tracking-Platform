import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Search, AlertCircle, CalendarCheck, MapPin, Users } from 'lucide-react';
import Layout from '../components/Layout';
import api from '../api/client';
import type { Drive, DriveStatus, DriveType } from '../types';

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
    </Layout>
  );
}
