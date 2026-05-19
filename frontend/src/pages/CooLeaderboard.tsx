import { useEffect, useState, useMemo } from 'react';
import { RefreshCw, Search, Calendar } from 'lucide-react';
import Layout from '../components/Layout';
import api from '../api/client';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ColCounts { today: number; compare: number; }

interface LeaderboardRow {
  bh_name:     string;
  client_name: string;
  cols:        Record<string, ColCounts>;
}

interface ColDef { key: string; label: string; }

interface ApiResponse {
  rows:         LeaderboardRow[];
  columns:      ColDef[];
  today:        string;
  compare_date: string;
}

// ── Colour palette ────────────────────────────────────────────────────────────

const COL_PALETTE: Record<string, { hdr: string; cellToday: string; cellCompare: string }> = {
  submission:    { hdr: '#1E40AF', cellToday: '#DBEAFE', cellCompare: '#EFF6FF' },
  screen_reject: { hdr: '#991B1B', cellToday: '#FEE2E2', cellCompare: '#FEF2F2' },
  l1_reject:     { hdr: '#C2410C', cellToday: '#FFEDD5', cellCompare: '#FFF7ED' },
  l1_accept:     { hdr: '#166534', cellToday: '#DCFCE7', cellCompare: '#F0FDF4' },
  l2_reject:     { hdr: '#B45309', cellToday: '#FEF3C7', cellCompare: '#FFFBEB' },
  l2_accept:     { hdr: '#15803D', cellToday: '#D1FAE5', cellCompare: '#ECFDF5' },
  l3_reject:     { hdr: '#9F1239', cellToday: '#FFE4E6', cellCompare: '#FFF1F2' },
  l3_accept:     { hdr: '#047857', cellToday: '#A7F3D0', cellCompare: '#D1FAE5' },
  selection:     { hdr: '#0F766E', cellToday: '#CCFBF1', cellCompare: '#F0FDFA' },
  onboarding:    { hdr: '#065F46', cellToday: '#6EE7B7', cellCompare: '#ECFDF5' },
};

function pal(key: string) {
  return COL_PALETTE[key] ?? { hdr: '#475569', cellToday: '#F1F5F9', cellCompare: '#F8FAFC' };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function yesterdayISO() {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
function fmtDate(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CooLeaderboard() {
  const [data, setData]           = useState<ApiResponse | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [search, setSearch]       = useState('');
  const [compareDate, setCompareDate] = useState(yesterdayISO());
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchData = (date = compareDate) => {
    setLoading(true);
    setError('');
    api.get<ApiResponse>('/coo/leaderboard', { params: { compare_date: date } })
      .then(r => { setData(r.data); setLastRefresh(new Date()); })
      .catch(e => {
        const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        setError(msg || 'Failed to load leaderboard.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDateChange = (d: string) => {
    setCompareDate(d);
    fetchData(d);
  };

  const filteredRows = useMemo(() => {
    if (!data) return [];
    if (!search.trim()) return data.rows;
    const q = search.toLowerCase();
    return data.rows.filter(r =>
      r.bh_name.toLowerCase().includes(q) ||
      r.client_name.toLowerCase().includes(q)
    );
  }, [data, search]);

  const totals = useMemo(() => {
    const t: Record<string, ColCounts> = {};
    for (const col of (data?.columns ?? [])) {
      t[col.key] = { today: 0, compare: 0 };
      for (const r of filteredRows) {
        t[col.key].today   += r.cols[col.key]?.today   ?? 0;
        t[col.key].compare += r.cols[col.key]?.compare ?? 0;
      }
    }
    return t;
  }, [filteredRows, data]);

  const cols = data?.columns ?? [];
  const totalCols = 2 + cols.length * 2;

  return (
    <Layout title="COO Leaderboard" subtitle="Pipeline activity by Business Head & Client">

      {/* ── Controls ── */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          {/* Compare date picker */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white">
            <Calendar size={13} className="text-slate-400 flex-shrink-0" />
            <span className="text-[11px] text-slate-500 font-medium">Compare date:</span>
            <input
              type="date"
              value={compareDate}
              max={todayISO()}
              onChange={e => handleDateChange(e.target.value)}
              className="text-xs bg-transparent focus:outline-none text-slate-700 font-semibold"
            />
          </div>
          {lastRefresh && (
            <span className="text-[11px] text-slate-400">
              Updated {lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search BH or client…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-blue-400 bg-white w-48"
            />
          </div>
          <button
            onClick={() => fetchData()}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-medium">
          {error}
        </div>
      )}

      {/* ── Table ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table
            className="w-full border-collapse text-sm"
            style={{ minWidth: Math.max(700, 260 + cols.length * 130) }}
          >
            {loading ? (
              <tbody>
                <tr>
                  <td colSpan={totalCols} className="py-16 text-center text-slate-400">
                    <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-slate-300" />
                    Loading…
                  </td>
                </tr>
              </tbody>
            ) : (
              <>
                <thead>
                  {/* Row 1: column group headers */}
                  <tr>
                    <th
                      rowSpan={2}
                      className="text-left py-3 px-4 text-xs font-bold text-white border-r border-green-800 whitespace-nowrap"
                      style={{ background: '#14532D', minWidth: 130 }}
                    >
                      Business Head
                    </th>
                    <th
                      rowSpan={2}
                      className="text-left py-3 px-4 text-xs font-bold text-white border-r border-green-700 whitespace-nowrap"
                      style={{ background: '#166534', minWidth: 120 }}
                    >
                      Customer
                    </th>
                    {cols.map(col => (
                      <th
                        key={col.key}
                        colSpan={2}
                        className="text-center py-2 px-2 text-[11px] font-bold border-r border-white/30 whitespace-nowrap"
                        style={{ background: pal(col.key).hdr, color: '#fff' }}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>

                  {/* Row 2: Today / [Selected Date] sub-headers */}
                  <tr>
                    {cols.map(col => {
                      const p = pal(col.key);
                      return (
                        <>
                          <th
                            key={`${col.key}-today`}
                            className="text-center py-1.5 px-3 text-[10px] font-black border-r border-white/20 whitespace-nowrap"
                            style={{
                              background: p.hdr,
                              color: '#fff',
                              borderTop: '1px solid rgba(255,255,255,0.25)',
                            }}
                          >
                            Today
                          </th>
                          <th
                            key={`${col.key}-cmp`}
                            className="text-center py-1.5 px-2 text-[10px] font-semibold border-r border-white/30 whitespace-nowrap"
                            style={{
                              background: p.hdr,
                              color: 'rgba(255,255,255,0.72)',
                              borderTop: '1px solid rgba(255,255,255,0.25)',
                            }}
                          >
                            {fmtDate(compareDate)}
                          </th>
                        </>
                      );
                    })}
                  </tr>
                </thead>

                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={totalCols} className="py-14 text-center text-sm text-slate-400">
                        {search ? 'No matches found.' : 'No data for selected dates.'}
                      </td>
                    </tr>
                  ) : (
                    <>
                      {filteredRows.map((row, ri) => (
                        <tr
                          key={`${row.bh_name}-${row.client_name}`}
                          className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors"
                        >
                          <td
                            className="py-2.5 px-4 text-xs font-semibold border-r border-slate-200 whitespace-nowrap"
                            style={{ color: '#14532D', background: ri % 2 === 0 ? '#F0FDF4' : '#ECFDF5' }}
                          >
                            {row.bh_name}
                          </td>
                          <td
                            className="py-2.5 px-4 text-xs text-slate-700 border-r border-slate-200 whitespace-nowrap"
                            style={{ background: ri % 2 === 0 ? '#F0FDF4' : '#ECFDF5' }}
                          >
                            {row.client_name}
                          </td>
                          {cols.map(col => {
                            const c = row.cols[col.key];
                            const tv = c?.today   ?? 0;
                            const cv = c?.compare ?? 0;
                            const p  = pal(col.key);
                            return (
                              <>
                                <td
                                  key={`${col.key}-t`}
                                  className="text-center text-xs font-bold py-2.5 px-3 border-r border-white/50"
                                  style={{ background: p.cellToday }}
                                >
                                  {tv || <span className="text-slate-300">—</span>}
                                </td>
                                <td
                                  key={`${col.key}-c`}
                                  className="text-center text-xs font-medium py-2.5 px-3 border-r border-slate-200"
                                  style={{ background: p.cellCompare }}
                                >
                                  {cv || <span className="text-slate-300">—</span>}
                                </td>
                              </>
                            );
                          })}
                        </tr>
                      ))}

                      {/* Totals row */}
                      <tr className="border-t-2 border-slate-300">
                        <td
                          colSpan={2}
                          className="py-3 px-4 text-xs font-black border-r border-slate-200 whitespace-nowrap"
                          style={{ color: '#14532D', background: '#D1FAE5' }}
                        >
                          TOTAL&nbsp;({filteredRows.length})
                        </td>
                        {cols.map(col => {
                          const t = totals[col.key];
                          const p = pal(col.key);
                          return (
                            <>
                              <td
                                key={`${col.key}-tot-t`}
                                className="text-center text-xs font-black py-3 px-3 border-r border-white/50"
                                style={{ color: p.hdr, background: p.cellToday }}
                              >
                                {t?.today || '—'}
                              </td>
                              <td
                                key={`${col.key}-tot-c`}
                                className="text-center text-xs font-bold py-3 px-3 border-r border-slate-200"
                                style={{ color: p.hdr, background: p.cellCompare }}
                              >
                                {t?.compare || '—'}
                              </td>
                            </>
                          );
                        })}
                      </tr>
                    </>
                  )}
                </tbody>
              </>
            )}
          </table>
        </div>
      </div>
    </Layout>
  );
}
