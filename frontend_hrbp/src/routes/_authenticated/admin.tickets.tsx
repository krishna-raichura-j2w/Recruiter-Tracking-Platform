import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { TicketStatusBadge } from "@/components/tickets/TicketStatusBadge";
import { TicketPriorityBadge } from "@/components/tickets/TicketPriorityBadge";
import { SLACountdown } from "@/components/tickets/SLACountdown";
import { CustomTablePagination } from "@/components/CustomPagination";
import { listTickets } from "@/apiService/ticketApi";
import type { Ticket } from "@/apiService/ticketTypes";
import { toast } from "react-toastify";

export const Route = createFileRoute("/_authenticated/admin/tickets")({
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      const raw = localStorage.getItem("j2w_user");
      if (raw) {
        const u = JSON.parse(raw);
        if (u.role !== "admin") throw redirect({ to: "/dashboard" });
      }
    }
  },
  component: AdminTicketsPage,
});


function AdminTicketsPage() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await listTickets({
        page_no: page + 1,
        per_page: rowsPerPage,
        status: filterStatus !== "all" ? filterStatus : undefined,
        priority: filterPriority !== "all" ? filterPriority : undefined,
        search: search || undefined,
      });
      setTickets(resp.data ?? []);
      setTotal(resp.meta?.total ?? 0);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load tickets");
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, filterStatus, filterPriority, search]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  const statsOpen = useMemo(() => tickets.filter((t) => t.status === "open").length, [tickets]);
  const statsCritical = useMemo(() => tickets.filter((t) => t.priority === "critical").length, [tickets]);
  const statsBreached = useMemo(
    () => tickets.filter((t) => t.sla_deadline && new Date(t.sla_deadline) < new Date() && t.status === "open").length,
    [tickets],
  );

  return (
    <div className="flex flex-col h-full bg-white text-slate-800">
      <TopBar title="All Tickets" subtitle="Read-only view of all system tickets." />
      <main className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total (This View)", value: total, color: "text-sky-600", src: "/json/data-audit-color.json" },
            { label: "Open", value: statsOpen, color: "text-emerald-600", src: "/json/business-goal.json" },
            { label: "SLA Breached", value: statsBreached, color: "text-red-600", src: "/json/business-persons-bickering-with-each-other.json" },
            { label: "Critical", value: statsCritical, color: "text-orange-600", src: "/json/business-problem-solving.json" },
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
        <div className="flex items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by ticket number…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="pl-9 h-10 border-slate-200 shadow-sm bg-white"
            />
          </div>
          <div className="flex items-center gap-3 ml-auto">
            <div className="w-[160px]">
              <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(0); }}>
                <SelectTrigger className="h-10 text-sm border-slate-200 shadow-sm bg-white">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-[160px]">
              <Select value={filterPriority} onValueChange={(v) => { setFilterPriority(v); setPage(0); }}>
                <SelectTrigger className="h-10 text-sm border-slate-200 shadow-sm bg-white">
                  <SelectValue placeholder="All Priorities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="ghost" size="icon" onClick={fetchTickets} title="Refresh">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-lg overflow-hidden border border-slate-200 bg-white shadow-sm">
          <Table>
            <TableHeader className="bg-slate-100 border-b border-slate-200">
              <TableRow className="hover:bg-transparent border-0">
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Ticket #</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">SOP Type</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Client</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Priority</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">SLA</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Raised By</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Created At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableLoader colSpan={8} />
              ) : tickets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-40 text-center text-slate-400">
                    No tickets found.
                  </TableCell>
                </TableRow>
              ) : (
                tickets.map((t) => (
                  <TableRow
                    key={t.id}
                    className="hover:bg-slate-50 cursor-pointer"
                    onClick={() => navigate({ to: "/tickets/$ticketId", params: { ticketId: String(t.id) } })}
                  >
                    <TableCell className="font-mono text-xs text-slate-500">#{t.ticket_number ?? t.id}</TableCell>
                    <TableCell className="text-sm font-medium text-slate-700">{t.sop_type ?? "—"}</TableCell>
                    <TableCell className="text-sm text-slate-600">{t.client_name ?? "—"}</TableCell>
                    <TableCell><TicketPriorityBadge priority={t.priority} /></TableCell>
                    <TableCell><TicketStatusBadge status={t.status} /></TableCell>
                    <TableCell>
                      {t.sla_deadline ? (
                        <SLACountdown deadline={t.sla_deadline} />
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">{t.raised_by_name ?? "—"}</TableCell>
                    <TableCell className="text-xs text-slate-400">{fmtDateTime(t.created_at)}</TableCell>
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
          onPageChange={(_: any, p: number) => setPage(p)}
          onRowsPerPageChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
        />
      </main>
    </div>
  );
}
