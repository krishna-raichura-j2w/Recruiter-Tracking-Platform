import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PaginationBarProps {
  page: number;
  total: number;
  perPage: number;
  onPageChange: (page: number) => void;
  onPerPageChange?: (perPage: number) => void;
  perPageOptions?: number[];
  loading?: boolean;
}

export default function PaginationBar({
  page, total, perPage, onPageChange, onPerPageChange,
  perPageOptions = [20, 50, 100],
  loading = false,
}: PaginationBarProps) {
  const pages    = Math.max(1, Math.ceil(total / perPage));
  const from     = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to       = Math.min(page * perPage, total);

  // Show up to 5 page numbers around current page
  const pageNums: (number | '…')[] = [];
  if (pages <= 7) {
    for (let i = 1; i <= pages; i++) pageNums.push(i);
  } else {
    pageNums.push(1);
    if (page > 4)            pageNums.push('…');
    for (let i = Math.max(2, page - 2); i <= Math.min(pages - 1, page + 2); i++) pageNums.push(i);
    if (page < pages - 3)    pageNums.push('…');
    pageNums.push(pages);
  }

  const btn = (
    onClick: () => void, disabled: boolean,
    children: React.ReactNode, title?: string,
  ) => (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
      className="flex items-center justify-center rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ width: 32, height: 32, border: '1px solid #E2E8F0', background: '#fff', color: '#475569' }}
      onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLElement).style.background = '#F1F5F9'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; }}
    >
      {children}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-3">
      {/* Left: record count */}
      <p className="text-xs text-slate-500 font-medium">
        {total === 0
          ? 'No results'
          : <><span className="font-bold text-slate-700">{from}–{to}</span> of <span className="font-bold text-slate-700">{total}</span> results</>
        }
        {loading && <span className="ml-2 text-blue-500 animate-pulse">Loading…</span>}
      </p>

      {/* Right: controls */}
      <div className="flex items-center gap-2">
        {/* Per-page selector */}
        {onPerPageChange && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400">Per page</span>
            <select
              value={perPage}
              onChange={e => { onPerPageChange(Number(e.target.value)); onPageChange(1); }}
              className="text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-100"
              style={{ border: '1px solid #E2E8F0', color: '#374151', background: '#fff' }}
            >
              {perPageOptions.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        )}

        <div className="flex items-center gap-1">
          {btn(() => onPageChange(1),     page <= 1,     <ChevronsLeft  size={14} />, 'First page')}
          {btn(() => onPageChange(page-1), page <= 1,    <ChevronLeft   size={14} />, 'Previous')}

          {pageNums.map((n, i) =>
            n === '…' ? (
              <span key={`ellipsis-${i}`} className="text-xs text-slate-400 px-1">…</span>
            ) : (
              <button
                key={n}
                onClick={() => onPageChange(n as number)}
                disabled={loading}
                className="flex items-center justify-center rounded-lg text-xs font-semibold transition-all disabled:cursor-not-allowed"
                style={{
                  width: 32, height: 32,
                  border: n === page ? '1px solid #2563EB' : '1px solid #E2E8F0',
                  background: n === page ? '#2563EB' : '#fff',
                  color: n === page ? '#fff' : '#475569',
                }}
                onMouseEnter={e => { if (n !== page) (e.currentTarget as HTMLElement).style.background = '#F1F5F9'; }}
                onMouseLeave={e => { if (n !== page) (e.currentTarget as HTMLElement).style.background = '#fff'; }}
              >
                {n}
              </button>
            )
          )}

          {btn(() => onPageChange(page+1), page >= pages, <ChevronRight  size={14} />, 'Next')}
          {btn(() => onPageChange(pages),  page >= pages, <ChevronsRight size={14} />, 'Last page')}
        </div>
      </div>
    </div>
  );
}
