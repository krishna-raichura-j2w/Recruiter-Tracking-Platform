import { Loader2 } from "lucide-react";
import { TableCell, TableRow } from "@/components/ui/table";

/** Full-page centred spinner — use when the whole page is fetching. */
export function PageLoader({ message = "Loading…" }: { message?: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] gap-3">
      <Loader2 className="w-9 h-9 text-sky-500 animate-spin" />
      <p className="text-sm text-slate-500 animate-pulse">{message}</p>
    </div>
  );
}

/** Drop-in table-body row spinner — pass the same colSpan as your header. */
export function TableLoader({ colSpan }: { colSpan: number }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="h-32 text-center">
        <div className="flex flex-col items-center justify-center gap-2 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin text-sky-500" />
          <span className="text-xs">Loading…</span>
        </div>
      </TableCell>
    </TableRow>
  );
}

/** Inline section spinner — use inside cards or panels. */
export function SectionLoader({ message = "Loading…" }: { message?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-slate-400">
      <Loader2 className="w-5 h-5 animate-spin text-sky-500" />
      <span className="text-sm">{message}</span>
    </div>
  );
}
