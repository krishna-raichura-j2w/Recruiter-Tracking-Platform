import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import type { Dayjs } from "dayjs";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { RefreshCw, Search } from "lucide-react";
import { fmtDateTime } from "@/lib/formatDate";
import { TableLoader } from "@/components/Loader";
import { LottieIcon } from "@/components/LottieIcon";
import { CustomTablePagination } from "@/components/CustomPagination";
import { CustomDateRangePicker } from "@/components/CustomDateRangePicker";
import { fetchAuditLog, type AuditLogItem } from "@/apiService/api";
import { useAuth } from "@/lib/auth";
import { toast } from "react-toastify";

export const Route = createFileRoute("/_authenticated/activity-log")({
  component: ActivityLogPage,
});

const ENTITY_TYPES = ["consultant", "client", "ticket", "exit", "user"];

const ACTIONS: Record<string, string> = {
  create:         "Created",
  update:         "Updated",
  delete:         "Deleted",
  close:          "Closed",
  status_change:  "Status Changed",
  create_user:    "User Created",
  reset_password: "Password Reset",
  bulk_upsert:    "Bulk Uploaded",
};

const ENTITY_BADGE: Record<string, string> = {
  consultant: "bg-blue-100 text-blue-700",
  client:     "bg-purple-100 text-purple-700",
  ticket:     "bg-amber-100 text-amber-700",
  exit:       "bg-red-100 text-red-700",
  user:       "bg-slate-100 text-slate-700",
};

const ACTION_BADGE: Record<string, string> = {
  create:         "bg-green-100 text-green-700",
  create_user:    "bg-green-100 text-green-700",
  update:         "bg-sky-100 text-sky-700",
  status_change:  "bg-indigo-100 text-indigo-700",
  delete:         "bg-red-100 text-red-700",
  close:          "bg-slate-100 text-slate-600",
  reset_password: "bg-orange-100 text-orange-700",
  bulk_upsert:    "bg-teal-100 text-teal-700",
};

function StatusChip({ label, colorClass }: { label: string; colorClass: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${colorClass}`}>
      {label}
    </span>
  );
}

function DiffCell({
  old_value,
  new_value,
}: {
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
}) {
  const keys = [...new Set([...Object.keys(old_value ?? {}), ...Object.keys(new_value ?? {})])];
  if (keys.length === 0) return <span className="text-slate-400 text-xs">—</span>;
  return (
    <div className="space-y-0.5">
      {keys.map((k) => {
        const oldVal = old_value?.[k];
        const newVal = new_value?.[k];
        const changed = JSON.stringify(oldVal) !== JSON.stringify(newVal);
        return (
          <div key={k} className="text-xs flex gap-1 items-baseline flex-wrap">
            <span className="font-medium text-slate-500 shrink-0">{k}:</span>
            {changed && oldVal !== undefined && (
              <span className="text-red-500 line-through">{String(oldVal)}</span>
            )}
            {newVal !== undefined && (
              <span className="text-green-700 font-medium">{String(newVal)}</span>
            )}
            {!changed && oldVal !== undefined && (
              <span className="text-slate-600">{String(oldVal)}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ActivityLogPage() {
  const { user } = useAuth();
  const role = user?.role ?? "";
  const canView = ["admin", "coo", "ceo", "ops_head"].includes(role);

  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Filters
  const [entityType, setEntityType] = useState("all");
  const [action, setAction] = useState("all");
  const [actorSearch, setActorSearch] = useState("");
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>([null, null]);

  const fetchData = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const result = await fetchAuditLog({
        page_no: page + 1,
        per_page: rowsPerPage,
        entity_type: entityType !== "all" ? entityType : undefined,
        action: action !== "all" ? action : undefined,
        date_from: dateRange[0] ? dateRange[0].startOf("day").toISOString() : undefined,
        date_to: dateRange[1] ? dateRange[1].endOf("day").toISOString() : undefined,
      });
      setItems(result.items);
      setTotal(result.total);
    } catch {
      toast.error("Failed to load activity log");
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, entityType, action, dateRange, canView]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // client-side actor name filter
  const displayed = actorSearch.trim()
    ? items.filter((i) => i.actor_name?.toLowerCase().includes(actorSearch.toLowerCase()))
    : items;

  // KPI counts from the current page
  const countByModule = (type: string) => items.filter((i) => i.entity_type === type).length;

  if (!canView) {
    return (
      <div className="flex flex-col h-full bg-white text-slate-800">
        <TopBar title="Activity Log" subtitle="System-wide observability tracking." />
        <main className="flex-1 overflow-y-auto flex items-center justify-center">
          <p className="text-slate-400 text-sm">You don't have access to this page.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white text-slate-800">
      <TopBar title="Activity Log" subtitle="Track who did what across the entire HRBP system." />

      <main className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total Events", value: total, color: "text-sky-600", src: "/json/data-audit-color.json" },
            { label: "Consultants", value: countByModule("consultant"), color: "text-blue-600", src: "/json/employee-colored.json" },
            { label: "Clients", value: countByModule("client"), color: "text-purple-600", src: "/json/successful-business-agreement.json" },
            { label: "Tickets", value: countByModule("ticket"), color: "text-amber-600", src: "/json/business-problem-solving.json" },
          ].map(({ label, value, color, src }) => (
            <Card key={label} className="flex items-center gap-4 p-4 border border-slate-100 shadow-sm bg-white rounded-xl">
              <div className="shrink-0">
                <LottieIcon src={src} size={40} />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">{label}</p>
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
              </div>
            </Card>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Actor search */}
          <div className="relative w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter by actor…"
              value={actorSearch}
              onChange={(e) => setActorSearch(e.target.value)}
              className="pl-9 h-10 border-slate-200 shadow-sm bg-white"
            />
          </div>

          <div className="flex items-center gap-3 ml-auto flex-wrap">
            {/* Module */}
            <div className="w-[150px]">
              <Select value={entityType} onValueChange={(v) => { setEntityType(v); setPage(0); }}>
                <SelectTrigger className="h-10 text-sm border-slate-200 shadow-sm bg-white">
                  <SelectValue placeholder="All Modules" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Modules</SelectItem>
                  {ENTITY_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Action */}
            <div className="w-[160px]">
              <Select value={action} onValueChange={(v) => { setAction(v); setPage(0); }}>
                <SelectTrigger className="h-10 text-sm border-slate-200 shadow-sm bg-white">
                  <SelectValue placeholder="All Actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  {Object.entries(ACTIONS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date range */}
            <CustomDateRangePicker
              value={dateRange}
              onChange={(v) => { setDateRange(v); setPage(0); }}
            />

            <Button variant="ghost" size="icon" onClick={fetchData} title="Refresh">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-lg overflow-hidden border border-slate-200 bg-white shadow-sm">
          <Table>
            <TableHeader className="bg-slate-100 border-b border-slate-200">
              <TableRow className="hover:bg-transparent border-0">
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide w-44">Timestamp</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide w-40">Actor</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide w-28">Module</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide w-32">Action</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableLoader colSpan={5} />
              ) : displayed.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-40 text-center text-slate-400">
                    No activity recorded yet.
                  </TableCell>
                </TableRow>
              ) : (
                displayed.map((item) => (
                  <TableRow key={item.id} className="hover:bg-slate-50">
                    <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                      {fmtDateTime(item.ts)}
                    </TableCell>
                    <TableCell className="text-sm font-medium text-slate-700">
                      {item.actor_name ?? <span className="text-slate-400 italic text-xs">System</span>}
                    </TableCell>
                    <TableCell>
                      <StatusChip
                        label={item.entity_type}
                        colorClass={ENTITY_BADGE[item.entity_type] ?? "bg-gray-100 text-gray-600"}
                      />
                    </TableCell>
                    <TableCell>
                      <StatusChip
                        label={ACTIONS[item.action] ?? item.action}
                        colorClass={ACTION_BADGE[item.action] ?? "bg-gray-100 text-gray-600"}
                      />
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <DiffCell old_value={item.old_value} new_value={item.new_value} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <CustomTablePagination
          count={total}
          page={page}
          rowsPerPage={rowsPerPage}
          onPageChange={(_: unknown, p: number) => setPage(p)}
          onRowsPerPageChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
        />
      </main>
    </div>
  );
}
