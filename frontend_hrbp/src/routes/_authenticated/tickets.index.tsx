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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, RefreshCw, Download, Loader2, LogOut, AlertCircle, CheckCircle2 } from "lucide-react";
import { fmtDateTime } from "@/lib/formatDate";
import { TableLoader } from "@/components/Loader";
import { LottieIcon } from "@/components/LottieIcon";
import { toast } from "react-toastify";
import type { Dayjs } from "dayjs";

import { CreateTicketWizard } from "@/components/tickets/CreateTicketWizard";
import { TicketStatusBadge } from "@/components/tickets/TicketStatusBadge";
import { TicketPriorityBadge } from "@/components/tickets/TicketPriorityBadge";
import { SLACountdown } from "@/components/tickets/SLACountdown";
import { CustomTablePagination } from "@/components/CustomPagination";
import { CustomDateRangePicker } from "@/components/CustomDateRangePicker";
import { CustomDatePicker } from "@/components/CustomDatePicker";

import { listTickets, exportTicketsExcel, listSopDefinitions } from "@/apiService/ticketApi";
import type { Ticket, SopDefinition } from "@/apiService/ticketTypes";
import { getClientsApi, getConsultantsApi, fetchWithAuth } from "@/apiService/api";
import { createExit } from "@/apiService/exitApi";
import type { ExitCreate, ExitReason } from "@/apiService/exitApi";

const EXIT_REASONS: { value: ExitReason; label: string }[] = [
  { value: "resignation",       label: "Resignation"       },
  { value: "end_of_contract",   label: "End of Contract"   },
  { value: "termination",       label: "Termination"       },
  { value: "mutual_separation", label: "Mutual Separation" },
];

function fmtCurrency(val: number | null | undefined) {
  if (val == null) return "—";
  return `₹${val.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

interface LogExitDialogProps {
  open: boolean;
  onClose: () => void;
  clients: { id: number; name: string }[];
  consultants: { id: number; name: string; client_id: number; monthly_po: number | null }[];
  currentUserId: number;
}

function LogExitDialog({ open, onClose, clients, consultants, currentUserId }: LogExitDialogProps) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{
    client_id:           string;
    consultant_id:       string;
    exit_reason:         ExitReason | "";
    exit_type:           "voluntary" | "involuntary" | "";
    exit_date:           Dayjs | null;
    notice_period_start: Dayjs | null;
    replacement_needed:  boolean;
    notes:               string;
  }>({
    client_id: "", consultant_id: "", exit_reason: "", exit_type: "",
    exit_date: null, notice_period_start: null, replacement_needed: false, notes: "",
  });

  const filteredConsultants = useMemo(
    () => form.client_id ? consultants.filter((c) => c.client_id === Number(form.client_id)) : consultants,
    [form.client_id, consultants],
  );

  const selectedConsultant = useMemo(
    () => consultants.find((c) => c.id === Number(form.consultant_id)),
    [form.consultant_id, consultants],
  );

  function reset() {
    setForm({ client_id: "", consultant_id: "", exit_reason: "", exit_type: "",
      exit_date: null, notice_period_start: null, replacement_needed: false, notes: "" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.consultant_id || !form.client_id || !form.exit_reason || !form.exit_type) {
      toast.error("Please fill all required fields");
      return;
    }
    setSaving(true);
    try {
      const payload: ExitCreate = {
        consultant_id:       Number(form.consultant_id),
        client_id:           Number(form.client_id),
        initiated_by_id:     currentUserId,
        exit_reason:         form.exit_reason as ExitReason,
        exit_type:           form.exit_type as "voluntary" | "involuntary",
        exit_date:           form.exit_date ? form.exit_date.format("YYYY-MM-DD") : undefined,
        notice_period_start: form.notice_period_start ? form.notice_period_start.format("YYYY-MM-DD") : undefined,
        replacement_needed:  form.replacement_needed,
        notes:               form.notes || undefined,
      };
      await createExit(payload);
      toast.success("Exit record created successfully");
      reset();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "Failed to create exit record");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Log Exit Initiation</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Client <span className="text-red-500">*</span></Label>
            <Select value={form.client_id} onValueChange={(v) => setForm((f) => ({ ...f, client_id: v, consultant_id: "" }))}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select client…" /></SelectTrigger>
              <SelectContent>
                {clients.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Consultant <span className="text-red-500">*</span></Label>
            <Select value={form.consultant_id} onValueChange={(v) => setForm((f) => ({ ...f, consultant_id: v }))}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select consultant…" /></SelectTrigger>
              <SelectContent>
                {filteredConsultants.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {selectedConsultant?.monthly_po != null && (
              <p className="text-xs text-slate-500">
                Monthly PO: <span className="font-semibold text-slate-700">{fmtCurrency(selectedConsultant.monthly_po)}</span>
                &nbsp;— this will be snapshotted as PO impact.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Exit Reason <span className="text-red-500">*</span></Label>
              <Select value={form.exit_reason} onValueChange={(v) => setForm((f) => ({ ...f, exit_reason: v as ExitReason }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Reason…" /></SelectTrigger>
                <SelectContent>
                  {EXIT_REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Exit Type <span className="text-red-500">*</span></Label>
              <Select value={form.exit_type} onValueChange={(v) => setForm((f) => ({ ...f, exit_type: v as "voluntary" | "involuntary" }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Type…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="voluntary">Voluntary</SelectItem>
                  <SelectItem value="involuntary">Involuntary</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Notice Period Start</Label>
              <CustomDatePicker value={form.notice_period_start} onChange={(v) => setForm((f) => ({ ...f, notice_period_start: v }))} placeholder="Notice start date" />
            </div>
            <div className="space-y-1">
              <Label>Exit Date</Label>
              <CustomDatePicker value={form.exit_date} onChange={(v) => setForm((f) => ({ ...f, exit_date: v }))} placeholder="Last working day" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="replacement"
              type="checkbox"
              checked={form.replacement_needed}
              onChange={(e) => setForm((f) => ({ ...f, replacement_needed: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300"
            />
            <Label htmlFor="replacement" className="cursor-pointer font-normal">Replacement needed</Label>
          </div>

          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea
              placeholder="Any additional context…"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="text-sm resize-none"
              rows={3}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
            <Button type="submit" disabled={saving} className="bg-rose-600 hover:bg-rose-500 text-white">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              {saving ? "Saving…" : "Log Exit"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export const Route = createFileRoute("/_authenticated/tickets/")({
  component: TicketsPage,
});

// All non-admin roles get the Action Required / All Tickets tab treatment

type ActionStatus = "required" | "done" | "none";

function getUserActionStatus(t: Ticket, userId: number | undefined): ActionStatus {
  if (!userId) return "none";
  const hierarchy = t.hierarchy_json ?? [];
  const currentIdx = t.current_step - 1; // convert to 0-based

  // Current step assigned to this user and ticket still active → action required
  if (
    currentIdx >= 0 &&
    currentIdx < hierarchy.length &&
    hierarchy[currentIdx].user_id === userId &&
    t.status !== "closed"
  ) {
    return "required";
  }

  // Any step before current_step assigned to this user → already acted
  for (let i = 0; i < currentIdx; i++) {
    if (hierarchy[i].user_id === userId) return "done";
  }

  return "none";
}

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
  const { user, can } = useAuth();

  const [tickets, setTickets]   = useState<Ticket[]>([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(false);
  const [wizardOpen, setWizardOpen]     = useState(false);
  const [logExitOpen, setLogExitOpen]   = useState(false);
  const [sops, setSops]                 = useState<SopDefinition[]>([]);

  const isApproverRole = user?.role !== "admin";
  const [activeTab, setActiveTab] = useState<"action_required" | "all">("action_required");

  // Pre-fill from cadence "Raise Ticket" navigation
  const [prefillClientId, setPrefillClientId]           = useState<number | undefined>();
  const [prefillConsultantIds, setPrefillConsultantIds] = useState<number[] | undefined>();
  const [prefillBhId, setPrefillBhId]                   = useState<number | undefined>();
  const [prefillDescription, setPrefillDescription]     = useState<string | undefined>();

  useEffect(() => {
    const raw = sessionStorage.getItem("raise_ticket_from_cadence");
    if (!raw) return;
    try {
      const { clientId, consultantId, bhId, description } = JSON.parse(raw);
      if (clientId)    setPrefillClientId(Number(clientId));
      if (consultantId) setPrefillConsultantIds([Number(consultantId)]);
      if (bhId)        setPrefillBhId(Number(bhId));
      if (description) setPrefillDescription(String(description));
    } catch { /* ignore malformed data */ }
    sessionStorage.removeItem("raise_ticket_from_cadence");
    setWizardOpen(true);
  }, []);

  // Filters
  const [search, setSearch]               = useState("");
  const [filterStatus, setFilterStatus]   = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterSopId, setFilterSopId]     = useState("all");
  const [dateRange, setDateRange]         = useState<[Dayjs | null, Dayjs | null]>([null, null]);

  // Pagination — 0-based (MUI style), converted to 1-based for API
  const [page, setPage]               = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const url = await exportTicketsExcel({
        status:   filterStatus   !== "all" ? filterStatus   : undefined,
        priority: filterPriority !== "all" ? filterPriority : undefined,
        sop_id:   filterSopId    !== "all" ? Number(filterSopId) : undefined,
        search:   search || undefined,
      });
      window.open(url, "_blank");
      toast.success("Excel report ready — opening download link");
    } catch (err: any) {
      toast.error(err?.message || "Export failed");
    } finally {
      setExporting(false);
    }
  }

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
        sop_id:   filterSopId    !== "all" ? Number(filterSopId) : undefined,
        search:   search || undefined,
      });
      setTickets(resp.data ?? []);
      setTotal(resp.meta?.total ?? 0);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load tickets");
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, filterStatus, filterPriority, filterSopId, search]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  useEffect(() => {
    getClientsApi({ page_no: 1, per_page: -1 })
      .then((r: any) => setClients(r?.data?.items ?? r?.data ?? []))
      .catch(() => {});
    getConsultantsApi({ page_no: 1, per_page: -1 })
      .then((r: any) => setConsultants(r?.data?.items ?? r?.data ?? []))
      .catch(() => {});
    // fetch all SOPs (including SOP-1) for the filter dropdown
    fetchWithAuth(`${import.meta.env.VITE_BASE_URL || "http://localhost:8000/"}api/hrbp/sop-definitions?per_page=-1`)
      .then((r) => r.json())
      .then((json) => {
        const raw = json?.data;
        const items: SopDefinition[] = Array.isArray(raw) ? raw : (raw?.items ?? []);
        setSops(items);
      })
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

  // Action Required tab — tickets where the logged-in user is the current step owner
  const actionRequiredTickets = useMemo(
    () => tickets.filter((t) => getUserActionStatus(t, user?.id) === "required"),
    [tickets, user?.id],
  );

  const displayedTickets = isApproverRole && activeTab === "action_required"
    ? actionRequiredTickets
    : tickets;

  return (
    <div className="flex flex-col h-full bg-white text-slate-800">
      <TopBar title="Tickets" subtitle="Raise and track HR operational requests." />

      <main className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Stat cards + action buttons */}
        <div className="flex items-center gap-4">
          <div className="flex gap-4 flex-1">
            <StatCard icon={<LottieIcon src="/json/checking-resume.json" size={44} />}          label="Total (this view)" value={total} />
            <StatCard icon={<LottieIcon src="/json/reviewed.json" size={44} />}                label="Open"              value={statsOpen}     accent="text-emerald-700" />
            <StatCard icon={<LottieIcon src="/json/helpful-tips-for-business.json" size={44} />} label="SLA Breached"   value={statsBreached} accent="text-red-600" />
            <StatCard icon={<LottieIcon src="/json/business-problem-solving.json" size={44} />}  label="Critical"         value={statsCritical} accent="text-orange-600" />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {can("exits", "create") && (
              <Button
                onClick={() => setLogExitOpen(true)}
                variant="outline"
                className="border-rose-200 text-rose-700 hover:bg-rose-50 font-semibold gap-1.5 shadow-sm"
              >
                <LogOut className="w-4 h-4" /> Log Exit
              </Button>
            )}
            {can("tickets", "create") && (
              <Button
                onClick={() => setWizardOpen(true)}
                className="bg-sky-600 hover:bg-sky-500 text-white font-semibold gap-1.5 shadow-sm"
              >
                <Plus className="w-4 h-4" /> New Ticket
              </Button>
            )}
          </div>
        </div>

        {/* Tabs — only for BH / OPS Head / COO / CEO */}
        {isApproverRole && (
          <div className="flex gap-1 border-b border-slate-200">
            <button
              onClick={() => { setActiveTab("action_required"); setPage(0); }}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === "action_required"
                  ? "border-amber-500 text-amber-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <AlertCircle className="w-4 h-4" />
              Action Required
              {actionRequiredTickets.length > 0 && (
                <span className="ml-1 bg-amber-100 text-amber-700 text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {actionRequiredTickets.length}
                </span>
              )}
            </button>
            <button
              onClick={() => { setActiveTab("all"); setPage(0); }}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === "all"
                  ? "border-sky-500 text-sky-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              All Tickets
              <span className="ml-1 bg-slate-100 text-slate-600 text-xs font-bold px-1.5 py-0.5 rounded-full">
                {total}
              </span>
            </button>
          </div>
        )}

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

            <div className="w-[200px]">
              <Select value={filterSopId} onValueChange={(v) => { setFilterSopId(v); setPage(0); }}>
                <SelectTrigger className="h-10 text-sm border-slate-200 shadow-sm bg-white">
                  <SelectValue placeholder="All SOPs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All SOPs</SelectItem>
                  {sops.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      <span className="font-mono text-xs text-slate-500 mr-1">{s.sop_type}</span>
                      {s.name}
                    </SelectItem>
                  ))}
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

            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={exporting}
              className="gap-1.5 text-sm border-slate-200 text-slate-700 hover:bg-slate-50"
              title="Export to Excel"
            >
              {exporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {exporting ? "Exporting…" : "Export"}
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-lg overflow-hidden border border-slate-200 bg-white shadow-sm">
          <Table>
            <TableHeader className="bg-slate-100 border-b border-slate-200">
              <TableRow className="hover:bg-transparent border-0">
                {isApproverRole && (
                  <TableHead className="w-8 text-xs font-semibold text-slate-500 uppercase tracking-wide" />
                )}
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Ticket #</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">SOP Type</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Client</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Consultants</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Priority</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">SLA</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Current Step</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Raised By</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Created At</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Updated At</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {loading ? (
                <TableLoader colSpan={isApproverRole ? 12 : 11} />
              ) : displayedTickets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isApproverRole ? 12 : 11} className="h-40 text-center text-slate-400">
                    <div className="flex justify-center"><LottieIcon src="/json/searching-jobs.json" size={80} /></div>
                    <p className="font-medium -mt-1">No tickets found</p>
                    <p className="text-xs mt-1">
                      {activeTab === "action_required"
                        ? "No tickets currently require your action."
                        : can("tickets", "create")
                          ? 'Click "New Ticket" to raise one.'
                          : "No tickets match your filters."}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                displayedTickets.map((t) => {
                  const hierarchy = t.hierarchy_json ?? [];
                  const currentStepLabel = hierarchy[t.current_step - 1]?.label ?? `Step ${t.current_step}`;
                  const actionStatus = getUserActionStatus(t, user?.id);
                  return (
                    <TableRow
                      key={t.id}
                      onClick={() => navigate({ to: `/tickets/${t.id}` })}
                      className="cursor-pointer hover:bg-slate-50 transition-colors"
                    >
                      {isApproverRole && (
                        <TableCell className="w-8 pl-3 pr-0">
                          {actionStatus === "required" && (
                            <span title="Your action is required">
                              <AlertCircle className="w-4 h-4 text-amber-500" />
                            </span>
                          )}
                          {actionStatus === "done" && (
                            <span title="Your action is complete">
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            </span>
                          )}
                        </TableCell>
                      )}

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

                      <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                        {fmtDateTime(t.created_at)}
                      </TableCell>

                      <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                        {fmtDateTime(t.updated_at)}
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
        onClose={() => {
          setWizardOpen(false);
          setPrefillClientId(undefined);
          setPrefillConsultantIds(undefined);
          setPrefillBhId(undefined);
          setPrefillDescription(undefined);
        }}
        onCreated={fetchTickets}
        clients={clients}
        consultants={consultants}
        initialClientId={prefillClientId}
        initialConsultantIds={prefillConsultantIds}
        initialBhId={prefillBhId}
        initialDescription={prefillDescription}
      />

      <LogExitDialog
        open={logExitOpen}
        onClose={() => setLogExitOpen(false)}
        clients={clients}
        consultants={consultants}
        currentUserId={user?.id ?? 0}
      />
    </div>
  );
}
