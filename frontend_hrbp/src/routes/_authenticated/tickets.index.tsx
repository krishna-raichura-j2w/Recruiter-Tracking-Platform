import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Search, AlertTriangle, Clock, TicketIcon, RefreshCw } from "lucide-react";
import { toast } from "react-toastify";
import type { Dayjs } from "dayjs";

import { CreateTicketWizard } from "@/components/tickets/CreateTicketWizard";
import { TicketStatusBadge } from "@/components/tickets/TicketStatusBadge";
import { TicketPriorityBadge } from "@/components/tickets/TicketPriorityBadge";
import { SLACountdown } from "@/components/tickets/SLACountdown";
import { CustomTablePagination } from "@/components/CustomPagination";
import { CustomDateRangePicker } from "@/components/CustomDateRangePicker";

import { listTickets } from "@/apiService/ticketApi";
import type { Ticket } from "@/apiService/ticketTypes";
import { getClientsApi, getConsultantsApi } from "@/apiService/api";

export const Route = createFileRoute("/_authenticated/tickets/")({
  component: TicketsPage,
});

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  accent?: string;
}) {
  return (
    <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm flex-1">
      <div className={`text-xl ${accent ?? "text-slate-400"}`}>{icon}</div>
      <div>
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{label}</p>
        <p className={`text-3xl font-bold leading-tight ${accent ?? "text-slate-800"}`}>{value}</p>
      </div>
    </div>
  );
}

function TicketsPage() {
  const navigate = useNavigate();
  const { can }  = useAuth();

  const [tickets, setTickets]   = useState<Ticket[]>([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  // Filters
  const [search, setSearch]               = useState("");
  const [filterStatus, setFilterStatus]   = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [dateRange, setDateRange]         = useState<[Dayjs | null, Dayjs | null]>([null, null]);

  // Pagination — 0-based (MUI style), converted to 1-based for API
  const [page, setPage]               = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Wizard data
  const [clients, setClients] = useState<{ id: number; name: string; bh_id?: number }[]>([]);
  const [consultants, setConsultants] = useState<
    {
      id: number; name: string; emp_id: string;
      cohort: string | null; monthly_po: number | null;
      po_end_date: string | null; join_date: string | null;
      po_risk: number | null; client_id: number;
    }[]
  >([]);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await listTickets({
        page_no:  page + 1,
        per_page: rowsPerPage,
        status:   filterStatus   !== "all" ? filterStatus   : undefined,
        priority: filterPriority !== "all" ? filterPriority : undefined,
        search:   search || undefined,
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

  useEffect(() => {
    getClientsApi({ page_no: 1, per_page: -1 })
      .then((r: any) => setClients(r?.data?.items ?? r?.data ?? []))
      .catch(() => {});
    getConsultantsApi({ page_no: 1, per_page: -1 })
      .then((r: any) => setConsultants(r?.data?.items ?? r?.data ?? []))
      .catch(() => {});
  }, []);

  const handleChangePage = (_: React.MouseEvent<HTMLButtonElement> | null, newPage: number) => {
    setPage(newPage);
  };
  const handleChangeRowsPerPage = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setRowsPerPage(parseInt(e.target.value, 10));
    setPage(0);
  };

  // Stats
  const statsOpen     = useMemo(() => tickets.filter((t) => t.status === "open").length,      [tickets]);
  const statsCritical = useMemo(() => tickets.filter((t) => t.priority === "critical").length, [tickets]);
  const statsBreached = useMemo(
    () => tickets.filter((t) => t.sla_deadline && new Date(t.sla_deadline) < new Date() && t.status === "open").length,
    [tickets],
  );

  return (
    <div className="flex flex-col min-h-screen bg-white text-slate-800">
      <TopBar title="Tickets" subtitle="Raise and track HR operational requests." />

      <main className="flex-1 p-6 space-y-4">
        {/* Stat cards + New Ticket button */}
        <div className="flex items-center gap-4">
          <div className="flex gap-4 flex-1">
            <StatCard icon={<TicketIcon className="w-5 h-5" />} label="Total (this view)" value={total} />
            <StatCard icon="🟢"                                  label="Open"              value={statsOpen}     accent="text-emerald-700" />
            <StatCard icon={<AlertTriangle className="w-5 h-5" />} label="SLA Breached"  value={statsBreached} accent="text-red-600" />
            <StatCard icon={<Clock className="w-5 h-5" />}       label="Critical"          value={statsCritical} accent="text-orange-600" />
          </div>
          {can("tickets", "create") && (
            <Button
              onClick={() => setWizardOpen(true)}
              className="bg-sky-600 hover:bg-sky-500 text-white font-semibold gap-1.5 shadow-sm shrink-0"
            >
              <Plus className="w-4 h-4" /> New Ticket
            </Button>
          )}
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

            <CustomDateRangePicker
              value={dateRange}
              onChange={(v) => { setDateRange(v); setPage(0); }}
            />

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
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Consultants</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Priority</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">SLA</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Current Step</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Raised By</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                    Loading tickets…
                  </TableCell>
                </TableRow>
              ) : tickets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center text-slate-400">
                    <TicketIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="font-medium">No tickets found</p>
                    <p className="text-xs mt-1">
                      {can("tickets", "create")
                        ? 'Click "New Ticket" to raise one.'
                        : "No tickets match your filters."}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                tickets.map((t) => {
                  const hierarchy = t.hierarchy_json ?? [];
                  const currentStepLabel = hierarchy[t.current_step - 1]?.label ?? `Step ${t.current_step}`;
                  return (
                    <TableRow
                      key={t.id}
                      onClick={() => navigate({ to: `/tickets/${t.id}` })}
                      className="cursor-pointer hover:bg-slate-50 transition-colors"
                    >
                      <TableCell className="font-medium">
                        <span className="font-mono text-sky-600 hover:underline text-xs font-semibold">
                          {t.ticket_number}
                        </span>
                        <p className="text-xs text-slate-400 mt-0.5 max-w-[140px] truncate">{t.title}</p>
                      </TableCell>

                      <TableCell>
                        <span className="text-xs font-medium text-slate-700">{t.sop_type ?? "—"}</span>
                        <p className="text-xs text-slate-400 mt-0.5 max-w-[120px] truncate">{t.sop_name}</p>
                      </TableCell>

                      <TableCell className="text-xs text-slate-600 font-medium">{t.client_name ?? "—"}</TableCell>

                      <TableCell className="text-xs text-slate-600 font-medium">
                        {t.consultant_count != null
                          ? `${t.consultant_count} consultant${t.consultant_count !== 1 ? "s" : ""}`
                          : "—"}
                      </TableCell>

                      <TableCell>
                        <TicketPriorityBadge priority={t.priority} />
                      </TableCell>

                      <TableCell>
                        <TicketStatusBadge status={t.status} />
                      </TableCell>

                      <TableCell>
                        <SLACountdown deadline={t.sla_deadline} compact />
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-sky-100 text-sky-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                            {t.current_step}
                          </span>
                          <span className="text-xs text-slate-600 truncate max-w-[90px]">
                            {currentStepLabel}
                          </span>
                        </div>
                      </TableCell>

                      <TableCell className="text-xs text-slate-600 font-medium">
                        {t.raised_by_name ?? "—"}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex justify-center mt-4">
          <CustomTablePagination
            rowsPerPageOptions={[5, 10, 25, 50, 100]}
            count={total}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={handleChangePage}
            onRowsPerPageChange={handleChangeRowsPerPage}
          />
        </div>
      </main>

      <CreateTicketWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={fetchTickets}
        clients={clients}
        consultants={consultants}
      />
    </div>
  );
}
