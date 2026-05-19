import { useEffect, useState, useMemo } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import Layout from '../components/Layout';
import api from '../api/client';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PeriodCount { yesterday: number; today: number; }

interface LeaderboardRow {
  kam_name:     string;
  client_name:  string;
  submission:   PeriodCount;
  screen_reject:PeriodCount;
  l1_reject:    PeriodCount;
  l1_accept:    PeriodCount;
  l2_reject:    PeriodCount;
  l2_accept:    PeriodCount;
  l3_reject:    PeriodCount;
  l3_accept:    PeriodCount;
  selection:    PeriodCount;
  onboarding:   PeriodCount;
}

// ── Column config ─────────────────────────────────────────────────────────────

const COLS: {
  key: keyof Omit<LeaderboardRow, 'kam_name' | 'client_name'>;
  label: string;
  headerBg: string;
  headerText: string;
  cellBg: string;
  todayBg: string;
}[] = [
  { key: 'submission',    label: 'Submission',     headerBg: '#1E40AF', headerText: '#fff',    cellBg: '#EFF6FF', todayBg: '#DBEAFE' },
  { key: 'screen_reject', label: 'Screen Reject',  headerBg: '#991B1B', headerText: '#fff',    cellBg: '#FEF2F2', todayBg: '#FEE2E2' },
  { key: 'l1_reject',     label: 'L1 Reject',      headerBg: '#C2410C', headerText: '#fff',    cellBg: '#FFF7ED', todayBg: '#FFEDD5' },
  { key: 'l1_accept',     label: 'L1 Accept',      headerBg: '#166534', headerText: '#fff',    cellBg: '#F0FDF4', todayBg: '#DCFCE7' },
  { key: 'l2_reject',     label: 'L2 Reject',      headerBg: '#C2410C', headerText: '#fff',    cellBg: '#FFF7ED', todayBg: '#FFEDD5' },
  { key: 'l2_accept',     label: 'L2 Accept',      headerBg: '#15803D', headerText: '#fff',    cellBg: '#F0FDF4', todayBg: '#DCFCE7' },
  { key: 'l3_reject',     label: 'L3 Reject',      headerBg: '#9F1239', headerText: '#fff',    cellBg: '#FFF1F2', todayBg: '#FFE4E6' },
  { key: 'l3_accept',     label: 'L3 Accept',      headerBg: '#047857', headerText: '#fff',    cellBg: '#F0FDF4', todayBg: '#D1FAE5' },
  { key: 'selection',     label: 'Selection',      headerBg: '#0F766E', headerText: '#fff',    cellBg: '#F0FDFA', todayBg: '#CCFBF1' },
  { key: 'onboarding',    label: 'Onboarding',     headerBg: '#065F46', headerText: '#fff',    cellBg: '#ECFDF5', todayBg: '#A7F3D0' },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function CooLeaderboard() {
  const [rows, setRows]       = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchData = () => {
    setLoading(true);
    api.get<{ rows: LeaderboardRow[] }>('/coo/leaderboard')
      .then(r => {
        setRows(r.data.rows ?? []);
        setLastRefresh(new Date());
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(r =>
      r.kam_name.toLowerCase().includes(q) ||
      r.client_name.toLowerCase().includes(q)
    );
  }, [rows, search]);

  // Totals row
  const totals = useMemo(() => {
    const t: Record<string, PeriodCount> = {};
    for (const col of COLS) {
      t[col.key] = { yesterday: 0, today: 0 };
      for (const r of filtered) {
        t[col.key].yesterday += (r[col.key] as PeriodCount).yesterday;
        t[col.key].today     += (r[col.key] as PeriodCount).today;
      }
    }
    return t;
  }, [filtered]);

  const Cell = ({ val, cellBg, todayBg }: { val: PeriodCount; cellBg: string; todayBg: string }) => (
    <>
      <td className="text-center text-xs font-medium py-2.5 px-3 border-r border-slate-100" style={{ background: cellBg }}>
        {val.yesterday || <span className="text-slate-300">—</span>}
      </td>
      <td className="text-center text-xs font-semibold py-2.5 px-3 border-r border-slate-200" style={{ background: todayBg }}>
        {val.today || <span className="text-slate-300">—</span>}
      </td>
    </>
  );

  return (
    <Layout title="Leaderboard" subtitle="KAM × Client pipeline activity">

      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          {/* Today / Yesterday legend */}
          <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-white border border-slate-200 rounded-lg px-3 py-1.5">
            <span className="w-3 h-3 rounded-sm inline-block bg-slate-100 border border-slate-300" />
            Yesterday
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-600 font-semibold bg-white border border-slate-200 rounded-lg px-3 py-1.5">
            <span className="w-3 h-3 rounded-sm inline-block bg-blue-200 border border-blue-400" />
            Today
          </div>
          {lastRefresh && (
            <span className="text-[11px] text-slate-400 ml-2">
              Updated {lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search KAM or client…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-blue-400 bg-white w-52"
            />
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm" style={{ minWidth: 1400 }}>

            {/* ── Header row 1: group labels ── */}
            <thead>
              <tr>
                {/* KAM */}
                <th
                  rowSpan={2}
                  className="text-left py-3 px-4 text-xs font-bold text-white border-r border-green-700 whitespace-nowrap"
                  style={{ background: '#14532D', minWidth: 130 }}
                >
                  KAM Name
                </th>
                {/* Customer */}
                <th
                  rowSpan={2}
                  className="text-left py-3 px-4 text-xs font-bold text-white border-r border-green-600 whitespace-nowrap"
                  style={{ background: '#166534', minWidth: 130 }}
                >
                  Customer
                </th>
                {/* Metric group headers — each spans Yesterday + Today */}
                {COLS.map(col => (
                  <th
                    key={col.key}
                    colSpan={2}
                    className="text-center py-2 px-2 text-[11px] font-bold border-r border-white/30 whitespace-nowrap"
                    style={{ background: col.headerBg, color: col.headerText }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>

              {/* ── Header row 2: Yesterday / Today sub-headers ── */}
              <tr>
                {COLS.map(col => (
                  <>
                    <th
                      key={`${col.key}-y`}
                      className="text-center py-1.5 px-3 text-[10px] font-semibold border-r border-white/20 whitespace-nowrap"
                      style={{ background: col.headerBg, color: 'rgba(255,255,255,0.75)', borderTop: '1px solid rgba(255,255,255,0.2)' }}
                    >
                      Yesterday
                    </th>
                    <th
                      key={`${col.key}-t`}
                      className="text-center py-1.5 px-3 text-[10px] font-bold border-r border-white/30 whitespace-nowrap"
                      style={{ background: col.headerBg, color: '#fff', borderTop: '1px solid rgba(255,255,255,0.2)' }}
                    >
                      Today
                    </th>
                  </>
                ))}
              </tr>
            </thead>

            {/* ── Body ── */}
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={2 + COLS.length * 2} className="py-12 text-center text-sm text-slate-400">
                    <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-slate-300" />
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={2 + COLS.length * 2} className="py-12 text-center text-sm text-slate-400">
                    {search ? 'No matches found.' : 'No submission data yet.'}
                  </td>
                </tr>
              ) : (
                filtered.map((row, i) => (
                  <tr
                    key={`${row.kam_name}-${row.client_name}-${i}`}
                    className="border-t border-slate-100 hover:bg-blue-50/30 transition-colors"
                  >
                    {/* KAM name */}
                    <td
                      className="py-2.5 px-4 text-xs font-semibold border-r border-slate-200 whitespace-nowrap"
                      style={{ color: '#14532D', background: i % 2 === 0 ? '#F0FDF4' : '#ECFDF5' }}
                    >
                      {row.kam_name}
                    </td>
                    {/* Client name */}
                    <td
                      className="py-2.5 px-4 text-xs font-medium border-r border-slate-200 whitespace-nowrap"
                      style={{ color: '#166534', background: i % 2 === 0 ? '#F0FDF4' : '#ECFDF5' }}
                    >
                      {row.client_name}
                    </td>
                    {/* Metric cells */}
                    {COLS.map(col => (
                      <Cell
                        key={col.key}
                        val={row[col.key] as PeriodCount}
                        cellBg={col.cellBg}
                        todayBg={col.todayBg}
                      />
                    ))}
                  </tr>
                ))
              )}

              {/* ── Totals row ── */}
              {!loading && filtered.length > 0 && (
                <tr className="border-t-2 border-slate-300 bg-slate-50">
                  <td
                    className="py-3 px-4 text-xs font-black border-r border-slate-200 whitespace-nowrap"
                    style={{ color: '#14532D' }}
                    colSpan={2}
                  >
                    TOTAL ({filtered.length} row{filtered.length !== 1 ? 's' : ''})
                  </td>
                  {COLS.map(col => (
                    <>
                      <td
                        key={`${col.key}-tot-y`}
                        className="text-center text-xs font-bold py-3 px-3 border-r border-slate-100"
                        style={{ color: col.headerBg }}
                      >
                        {totals[col.key]?.yesterday || '—'}
                      </td>
                      <td
                        key={`${col.key}-tot-t`}
                        className="text-center text-xs font-black py-3 px-3 border-r border-slate-200"
                        style={{ color: col.headerBg }}
                      >
                        {totals[col.key]?.today || '—'}
                      </td>
                    </>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary pills */}
      {!loading && filtered.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {COLS.map(col => {
            const t = totals[col.key];
            if (!t || (t.yesterday === 0 && t.today === 0)) return null;
            return (
              <div
                key={col.key}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{ background: col.headerBg + '18', color: col.headerBg, border: `1px solid ${col.headerBg}40` }}
              >
                <span>{col.label}</span>
                <span className="opacity-60">{t.yesterday}</span>
                <span className="opacity-100">/ {t.today} today</span>
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
