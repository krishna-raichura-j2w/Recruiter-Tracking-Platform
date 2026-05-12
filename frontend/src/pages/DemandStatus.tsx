import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ChevronUp, ChevronDown, ChevronsUpDown,
  RefreshCw, AlertCircle, Search,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
} from 'lucide-react';
import Layout from '../components/Layout';
import api from '../api/client';
import type { DemandStatusRow, DemandStatusResponse } from '../types';

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const PAGE_SIZE = 25;

function getISTNow() {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return { month: ist.getUTCMonth() + 1, year: ist.getUTCFullYear() };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function NamePills({ names }: { names: string | null }) {
  if (!names) return <span className="text-gray-400">—</span>;
  const parts = names.split(', ').filter(Boolean);
  if (parts.length === 0) return <span className="text-gray-400">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {parts.map((name, i) => (
        <span
          key={i}
          className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-full text-xs font-medium whitespace-nowrap"
        >
          {name}
        </span>
      ))}
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

type SortKey = keyof DemandStatusRow;
type SortDir = 'asc' | 'desc';

interface ColDef {
  key: SortKey;
  label: string;
  align?: 'left' | 'right' | 'center';
}

const COLUMNS: ColDef[] = [
  { key: 'company_name',        label: 'Customer' },
  { key: 'demand_id',           label: 'Demand ID',      align: 'right' },
  { key: 'last_demand_id',      label: 'Last Demand ID', align: 'right' },
  { key: 'job_title_name',      label: 'Job Title' },
  { key: 'no_of_positions',     label: 'Positions',      align: 'center' },
  { key: 'account_manager_name',label: 'Account Manager' },
  { key: 'delivery_lead',       label: 'Delivery Lead' },
  { key: 'recruiter',           label: 'Recruiter' },
];

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DemandStatus() {
  const ist = getISTNow();
  const currentYear = ist.year;

  const [month, setMonth] = useState(ist.month);
  const [year, setYear]   = useState(ist.year);
  const [rows, setRows]   = useState<DemandStatusRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [search, setSearch]   = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('demand_id');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage]       = useState(1);

  const yearOptions: number[] = [];
  for (let y = 2022; y <= currentYear + 1; y++) yearOptions.push(y);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .get<DemandStatusResponse>('/demand-status', { params: { month, year } })
      .then((res) => {
        setRows(res.data.data);
        setTotal(res.data.total);
        setPage(1);
      })
      .catch((err) => {
        setError(err.response?.data?.detail ?? 'Failed to load demand status.');
      })
      .finally(() => setLoading(false));
  }, [month, year]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Derived data ───────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let r = [...rows];
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(
        (row) =>
          (row.company_name ?? '').toLowerCase().includes(q) ||
          (row.job_title_name ?? '').toLowerCase().includes(q) ||
          (row.account_manager_name ?? '').toLowerCase().includes(q),
      );
    }
    r.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return r;
  }, [rows, search, sortKey, sortDir]);

  const pageCount  = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(1);
  };

  const handleMonthChange = (m: number) => { setMonth(m); setPage(1); };
  const handleYearChange  = (y: number) => { setYear(y);  setPage(1); };

  // ── Helpers ────────────────────────────────────────────────────────────────

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronsUpDown size={13} className="inline ml-1 opacity-30" />;
    return sortDir === 'asc'
      ? <ChevronUp size={13} className="inline ml-1 text-blue-500" />
      : <ChevronDown size={13} className="inline ml-1 text-blue-500" />;
  }

  const thClass = (align?: string) =>
    `px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-800 transition-colors ${
      align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
    }`;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Layout title="Demand Status">
      <div className="space-y-4">

        {/* ── Toolbar ──────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-500 min-h-[1.25rem]">
            {!loading && !error && (
              <>
                <span className="font-semibold text-gray-700">{filtered.length !== total ? `${filtered.length} / ` : ''}{total}</span>
                {' '}demand{total !== 1 ? 's' : ''} for{' '}
                <span className="font-semibold text-gray-700">{MONTHS[month - 1]} {year}</span>
              </>
            )}
          </p>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={month}
              onChange={(e) => handleMonthChange(Number(e.target.value))}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {MONTHS.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>

            <select
              value={year}
              onChange={(e) => handleYearChange(Number(e.target.value))}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>

            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* ── Search ───────────────────────────────────────────────────────── */}
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by customer, job title or account manager…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* ── Error banner ──────────────────────────────────────────────────── */}
        {error && (
          <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            <AlertCircle size={17} className="flex-shrink-0" />
            <span className="flex-1">{error}</span>
            <button
              onClick={fetchData}
              className="font-semibold underline hover:no-underline whitespace-nowrap"
            >
              Retry
            </button>
          </div>
        )}

        {/* ── Table ────────────────────────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide w-10">#</th>
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className={thClass(col.align)}
                      onClick={() => handleSort(col.key)}
                    >
                      {col.label}
                      <SortIcon col={col.key} />
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="px-3 py-3">
                        <div className="h-3 w-4 bg-gray-200 rounded" />
                      </td>
                      {COLUMNS.map((c) => (
                        <td key={c.key} className="px-3 py-3">
                          <div className="h-3 bg-gray-200 rounded" style={{ width: `${60 + (i * 17) % 60}px` }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : paginated.length === 0 ? (
                  <tr>
                    <td
                      colSpan={COLUMNS.length + 1}
                      className="px-6 py-20 text-center text-gray-400 text-sm"
                    >
                      {search.trim()
                        ? `No results match "${search}"`
                        : `No demands found for ${MONTHS[month - 1]} ${year}.`}
                    </td>
                  </tr>
                ) : (
                  paginated.map((row, idx) => (
                    <tr
                      key={row.demand_id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-3 py-3 text-gray-400 text-xs tabular-nums">
                        {(page - 1) * PAGE_SIZE + idx + 1}
                      </td>
                      <td className="px-3 py-3 font-medium text-gray-800 max-w-[160px] truncate">
                        {row.company_name ?? <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-semibold text-gray-800 tabular-nums">
                        {row.demand_id}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-gray-500 tabular-nums">
                        {row.last_demand_id ?? <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-3 py-3 text-gray-700 max-w-[180px] truncate" title={row.job_title_name ?? ''}>
                        {row.job_title_name ?? <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {row.no_of_positions != null ? (
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-50 text-blue-700 text-xs font-bold">
                            {row.no_of_positions}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-gray-700 whitespace-nowrap">
                        {row.account_manager_name ?? <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-3 py-3 min-w-[140px]">
                        <NamePills names={row.delivery_lead} />
                      </td>
                      <td className="px-3 py-3 min-w-[160px]">
                        <NamePills names={row.recruiter} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ──────────────────────────────────────────────────── */}
          {!loading && pageCount > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50 text-sm">
              <p className="text-gray-500 text-xs">
                {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} rows
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(1)}
                  disabled={page === 1}
                  className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30 transition-colors"
                  title="First page"
                >
                  <ChevronsLeft size={15} />
                </button>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30 transition-colors"
                  title="Previous page"
                >
                  <ChevronLeft size={15} />
                </button>

                <span className="px-3 py-1 text-xs text-gray-600">
                  Page <span className="font-semibold text-gray-800">{page}</span> / {pageCount}
                </span>

                <button
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={page === pageCount}
                  className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30 transition-colors"
                  title="Next page"
                >
                  <ChevronRight size={15} />
                </button>
                <button
                  onClick={() => setPage(pageCount)}
                  disabled={page === pageCount}
                  className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30 transition-colors"
                  title="Last page"
                >
                  <ChevronsRight size={15} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
