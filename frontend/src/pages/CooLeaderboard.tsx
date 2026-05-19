import { useEffect, useState, useMemo, useRef } from 'react';
import { RefreshCw, Search, X, Calendar } from 'lucide-react';
import Layout from '../components/Layout';
import api from '../api/client';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ColCounts { total: number; today: number; compare: number; }

interface LeaderboardRow {
  bh_name:     string;
  am_name:     string;
  client_name: string;
  cols:        Record<string, ColCounts>;
}

interface ColDef { key: string; label: string; }

interface ApiResponse {
  rows:         LeaderboardRow[];
  columns:      ColDef[];
  today:        string;
  compare_date: string | null;
}

// ── Colour palette ────────────────────────────────────────────────────────────

const COL_PALETTE: Record<string, { hdr: string; cellTotal: string; cellToday: string }> = {
  submission:    { hdr: '#1E40AF', cellTotal: '#EFF6FF', cellToday: '#DBEAFE' },
  screen_reject: { hdr: '#991B1B', cellTotal: '#FEF2F2', cellToday: '#FEE2E2' },
  l1_reject:     { hdr: '#C2410C', cellTotal: '#FFF7ED', cellToday: '#FFEDD5' },
  l1_accept:     { hdr: '#166534', cellTotal: '#F0FDF4', cellToday: '#DCFCE7' },
  l2_reject:     { hdr: '#B45309', cellTotal: '#FFFBEB', cellToday: '#FEF3C7' },
  l2_accept:     { hdr: '#15803D', cellTotal: '#ECFDF5', cellToday: '#D1FAE5' },
  l3_reject:     { hdr: '#9F1239', cellTotal: '#FFF1F2', cellToday: '#FFE4E6' },
  l3_accept:     { hdr: '#047857', cellTotal: '#D1FAE5', cellToday: '#A7F3D0' },
  selection:     { hdr: '#0F766E', cellTotal: '#F0FDFA', cellToday: '#CCFBF1' },
  onboarding:    { hdr: '#065F46', cellTotal: '#ECFDF5', cellToday: '#6EE7B7' },
};

function pal(key: string) {
  return COL_PALETTE[key] ?? { hdr: '#475569', cellTotal: '#F8FAFC', cellToday: '#F1F5F9' };
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CooLeaderboard() {
  const [data, setData]             = useState<ApiResponse | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [search, setSearch]         = useState('');
  const [compareDate, setCompareDate] = useState('');   // empty = show Total
  const [pickerOpen, setPickerOpen] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  const fetchData = (cmpDate = compareDate) => {
    setLoading(true);
    setError('');
    api.get<ApiResponse>('/coo/leaderboard', {
      params: cmpDate ? { compare_date: cmpDate } : undefined,
    })
      .then(r => { setData(r.data); setLastRefresh(new Date()); })
      .catch(e => {
        const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        setError(msg || 'Failed to load leaderboard.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When picker opens, focus the hidden date input immediately
  useEffect(() => {
    if (pickerOpen) dateInputRef.current?.showPicker?.();
  }, [pickerOpen]);

  const handleDatePick = (val: string) => {
    setPickerOpen(false);
    if (!val) return;
    setCompareDate(val);
    fetchData(val);
  };

  const clearCompare = () => {
    setCompareDate('');
    fetchData('');
  };

  const filteredRows = useMemo(() => {
    if (!data) return [];
    if (!search.trim()) return data.rows;
    const q = search.toLowerCase();
    return data.rows.filter(r =>
      r.bh_name.toLowerCase().includes(q) ||
      r.am_name.toLowerCase().includes(q) ||
      r.client_name.toLowerCase().includes(q)
    );
  }, [data, search]);

  const totals = useMemo(() => {
    const t: Record<string, ColCounts> = {};
    for (const col of (data?.columns ?? [])) {
      t[col.key] = { total: 0, today: 0, compare: 0 };
      for (const r of filteredRows) {
        t[col.key].total   += r.cols[col.key]?.total   ?? 0;
        t[col.key].today   += r.cols[col.key]?.today   ?? 0;
        t[col.key].compare += r.cols[col.key]?.compare ?? 0;
      }
    }
    return t;
  }, [filteredRows, data]);

  const cols = data?.columns ?? [];
  const totalCols = 3 + cols.length * 2;

  // Sub-header label for the left (Total / compare) column
  const leftLabel = compareDate ? fmtDate(compareDate) : 'Total';

  return (
    <Layout title="COO Leaderboard" subtitle="Pipeline activity by Business Head & Client">

      {/* ── Controls ── */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
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
              placeholder="Search BH, AM or client…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-blue-400 bg-white w-52"
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

      {/* Hidden date input — triggered programmatically when Total is clicked */}
      <input
        ref={dateInputRef}
        type="date"
        max={todayISO()}
        className="sr-only"
        onChange={e => handleDatePick(e.target.value)}
        onBlur={() => setPickerOpen(false)}
      />

      {/* ── Table ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table
            className="w-full border-collapse text-sm"
            style={{ minWidth: Math.max(800, 380 + cols.length * 130) }}
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
                      style={{ background: '#166534', minWidth: 110 }}
                    >
                      Account Manager
                    </th>
                    <th
                      rowSpan={2}
                      className="text-left py-3 px-4 text-xs font-bold text-white border-r border-green-700 whitespace-nowrap"
                      style={{ background: '#15803D', minWidth: 120 }}
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

                  {/* Row 2: Total (clickable) / Today sub-headers */}
                  <tr>
                    {cols.map(col => {
                      const p = pal(col.key);
                      return (
                        <>
                          {/* Left: Total (clickable) or selected date */}
                          <th
                            key={`${col.key}-left`}
                            className="text-center py-1.5 px-3 text-[10px] border-r border-white/20 whitespace-nowrap"
                            style={{
                              background: p.hdr,
                              color: 'rgba(255,255,255,0.85)',
                              borderTop: '1px solid rgba(255,255,255,0.25)',
                              cursor: compareDate ? 'default' : 'pointer',
                            }}
                            onClick={() => { if (!compareDate) setPickerOpen(true); }}
                          >
                            {compareDate ? (
                              <span className="flex items-center justify-center gap-1 font-semibold">
                                {leftLabel}
                                <button
                                  onClick={e => { e.stopPropagation(); clearCompare(); }}
                                  className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full hover:bg-white/20"
                                  title="Back to Total"
                                >
                                  <X size={8} />
                                </button>
                              </span>
                            ) : (
                              <span className="flex items-center justify-center gap-1 font-semibold hover:text-white">
                                Total
                                <Calendar size={9} className="opacity-60" />
                              </span>
                            )}
                          </th>
                          {/* Right: Today */}
                          <th
                            key={`${col.key}-today`}
                            className="text-center py-1.5 px-2 text-[10px] font-black border-r border-white/30 whitespace-nowrap"
                            style={{
                              background: p.hdr,
                              color: '#fff',
                              borderTop: '1px solid rgba(255,255,255,0.25)',
                            }}
                          >
                            Today
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
                        {search ? 'No matches found.' : 'No data available.'}
                      </td>
                    </tr>
                  ) : (
                    <>
                      {filteredRows.map((row, ri) => (
                        <tr
                          key={`${row.bh_name}-${row.am_name}-${row.client_name}`}
                          className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors"
                        >
                          <td
                            className="py-2.5 px-4 text-xs font-semibold border-r border-slate-200 whitespace-nowrap"
                            style={{ color: '#14532D', background: ri % 2 === 0 ? '#F0FDF4' : '#ECFDF5' }}
                          >
                            {row.bh_name}
                          </td>
                          <td
                            className="py-2.5 px-4 text-xs text-slate-600 border-r border-slate-200 whitespace-nowrap"
                            style={{ background: ri % 2 === 0 ? '#F0FDF4' : '#ECFDF5' }}
                          >
                            {row.am_name || <span className="text-slate-300">—</span>}
                          </td>
                          <td
                            className="py-2.5 px-4 text-xs text-slate-700 border-r border-slate-200 whitespace-nowrap"
                            style={{ background: ri % 2 === 0 ? '#F0FDF4' : '#ECFDF5' }}
                          >
                            {row.client_name}
                          </td>
                          {cols.map(col => {
                            const c  = row.cols[col.key];
                            const lv = compareDate ? (c?.compare ?? 0) : (c?.total ?? 0);
                            const dv = c?.today ?? 0;
                            const p  = pal(col.key);
                            return (
                              <>
                                <td
                                  key={`${col.key}-l`}
                                  className="text-center text-xs font-medium py-2.5 px-3 border-r border-white/50"
                                  style={{ background: p.cellTotal }}
                                >
                                  {lv || <span className="text-slate-300">—</span>}
                                </td>
                                <td
                                  key={`${col.key}-r`}
                                  className="text-center text-xs font-bold py-2.5 px-3 border-r border-slate-200"
                                  style={{ background: p.cellToday }}
                                >
                                  {dv || <span className="text-slate-300">—</span>}
                                </td>
                              </>
                            );
                          })}
                        </tr>
                      ))}

                      {/* Totals row */}
                      <tr className="border-t-2 border-slate-300">
                        <td
                          colSpan={3}
                          className="py-3 px-4 text-xs font-black border-r border-slate-200 whitespace-nowrap"
                          style={{ color: '#14532D', background: '#D1FAE5' }}
                        >
                          TOTAL&nbsp;({filteredRows.length})
                        </td>
                        {cols.map(col => {
                          const t  = totals[col.key];
                          const lv = compareDate ? (t?.compare ?? 0) : (t?.total ?? 0);
                          const p  = pal(col.key);
                          return (
                            <>
                              <td
                                key={`${col.key}-tot-l`}
                                className="text-center text-xs font-bold py-3 px-3 border-r border-white/50"
                                style={{ color: p.hdr, background: p.cellTotal }}
                              >
                                {lv || '—'}
                              </td>
                              <td
                                key={`${col.key}-tot-r`}
                                className="text-center text-xs font-black py-3 px-3 border-r border-slate-200"
                                style={{ color: p.hdr, background: p.cellToday }}
                              >
                                {t?.today || '—'}
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
