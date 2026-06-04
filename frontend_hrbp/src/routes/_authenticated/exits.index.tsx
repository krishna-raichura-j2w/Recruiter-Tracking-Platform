import { createFileRoute } from "@tanstack/react-router";
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
import { Badge } from "@/components/ui/badge";
import { Plus, Search, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "react-toastify";
import { TableLoader } from "@/components/Loader";
import { LottieIcon } from "@/components/LottieIcon";
import { CustomDatePicker } from "@/components/CustomDatePicker";
import { CustomTablePagination } from "@/components/CustomPagination";
import dayjs, { type Dayjs } from "dayjs";
import { fmtDateTime } from "@/lib/formatDate";
import { getClientsApi, getConsultantsApi } from "@/apiService/api";
import {
  listExits,
  getExitStats,
  createExit,
  updateExit,
  deleteExit,
} from "@/apiService/exitApi";
import type {
  ExitRecord,
  ExitCreate,
  ExitUpdate,
  ExitStats,
  ExitStatus,
  ExitReason,
} from "@/apiService/exitApi";

export const Route = createFileRoute("/_authenticated/exits/")({
  component: ExitsPage,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const EXIT_REASONS: { value: ExitReason; label: string }[] = [
  { value: "resignation",     label: "Resignation"     },
  { value: "project_roll_off", label: "Project Roll Off" },
  { value: "contract_closure", label: "Contract Closure" },
  { value: "conversion",      label: "Conversion"      },
  { value: "absconding",      label: "Absconding"      },
  { value: "no_show",         label: "No Show"         },
  { value: "termination",     label: "Termination"     },
];

const EXIT_STATUSES: { value: ExitStatus; label: string; color: string }[] = [
  { value: "initiated",    label: "Initiated",    color: "bg-amber-100 text-amber-700 border-amber-200"  },
  { value: "acknowledged", label: "Acknowledged", color: "bg-blue-100 text-blue-700 border-blue-200"    },
  { value: "completed",    label: "Completed",    color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
];

function StatusBadge({ status }: { status: string }) {
  const s = EXIT_STATUSES.find((x) => x.value === status);
  return (
    <Badge variant="outline" className={`text-xs font-semibold ${s?.color ?? ""}`}>
      {s?.label ?? status}
    </Badge>
  );
}

function ReasonLabel({ reason }: { reason: string }) {
  const r = EXIT_REASONS.find((x) => x.value === reason);
  return <span>{r?.label ?? reason}</span>;
}

function fmtCurrency(val: number | null | undefined) {
  if (val == null) return "—";
  return `₹${val.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  subtitle,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  subtitle?: string;
  value: number | string;
  accent?: string;
}) {
  return (
    <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm flex-1">
      <div className={`text-xl ${accent ?? "text-slate-400"}`}>{icon}</div>
      <div>
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{label}</p>
        {subtitle && <p className="text-[10px] text-slate-400 normal-case font-normal -mt-0.5">{subtitle}</p>}
        <p className={`text-3xl font-bold leading-tight ${accent ?? "text-slate-800"}`}>{value}</p>
      </div>
    </div>
  );
}

// ── Create dialog ─────────────────────────────────────────────────────────────

interface CreateDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  clients: { id: number; name: string }[];
  consultants: { id: number; name: string; client_id: number; monthly_po: number | null }[];
  currentUserId: number;
}

function CreateExitDialog({ open, onClose, onCreated, clients, consultants, currentUserId }: CreateDialogProps) {
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
    client_id:           "",
    consultant_id:       "",
    exit_reason:         "",
    exit_type:           "",
    exit_date:           null,
    notice_period_start: null,
    replacement_needed:  false,
    notes:               "",
  });

  const filteredConsultants = useMemo(
    () => form.client_id
      ? consultants.filter((c) => c.client_id === Number(form.client_id))
      : consultants,
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
      onCreated();
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
          {/* Client */}
          <div className="space-y-1">
            <Label>Client <span className="text-red-500">*</span></Label>
            <Select value={form.client_id} onValueChange={(v) => setForm((f) => ({ ...f, client_id: v, consultant_id: "" }))}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select client…" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Consultant */}
          <div className="space-y-1">
            <Label>Consultant <span className="text-red-500">*</span></Label>
            <Select value={form.consultant_id} onValueChange={(v) => setForm((f) => ({ ...f, consultant_id: v }))}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select consultant…" />
              </SelectTrigger>
              <SelectContent>
                {filteredConsultants.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedConsultant?.monthly_po != null && (
              <p className="text-xs text-slate-500">
                Monthly PO: <span className="font-semibold text-slate-700">{fmtCurrency(selectedConsultant.monthly_po)}</span>
                &nbsp;— this will be snapshotted as PO impact.
              </p>
            )}
          </div>

          {/* Reason + Type in a row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Exit Reason <span className="text-red-500">*</span></Label>
              <Select value={form.exit_reason} onValueChange={(v) => setForm((f) => ({ ...f, exit_reason: v as ExitReason }))}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Reason…" />
                </SelectTrigger>
                <SelectContent>
                  {EXIT_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Exit Type <span className="text-red-500">*</span></Label>
              <Select value={form.exit_type} onValueChange={(v) => setForm((f) => ({ ...f, exit_type: v as "voluntary" | "involuntary" }))}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Type…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="voluntary">Voluntary</SelectItem>
                  <SelectItem value="involuntary">Involuntary</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Notice Period Start</Label>
              <CustomDatePicker
                value={form.notice_period_start}
                onChange={(v) => setForm((f) => ({ ...f, notice_period_start: v }))}
                placeholder="Notice start date"
              />
            </div>
            <div className="space-y-1">
              <Label>Exit Date</Label>
              <CustomDatePicker
                value={form.exit_date}
                onChange={(v) => setForm((f) => ({ ...f, exit_date: v }))}
                placeholder="Last working day"
              />
            </div>
          </div>

          {/* Replacement */}
          <div className="flex items-center gap-2">
            <input
              id="replacement"
              type="checkbox"
              checked={form.replacement_needed}
              onChange={(e) => setForm((f) => ({ ...f, replacement_needed: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300"
            />
            <Label htmlFor="replacement" className="cursor-pointer font-normal">
              Replacement needed
            </Label>
          </div>

          {/* Notes */}
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
            <Button type="submit" disabled={saving} className="bg-sky-600 hover:bg-sky-500 text-white">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              {saving ? "Saving…" : "Log Exit"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Update status dialog ──────────────────────────────────────────────────────

function UpdateStatusDialog({
  record,
  onClose,
  onUpdated,
}: {
  record: ExitRecord | null;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<ExitStatus>("initiated");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (record) {
      setStatus(record.status as ExitStatus);
      setNotes(record.notes ?? "");
    }
  }, [record]);

  async function handleSave() {
    if (!record) return;
    setSaving(true);
    try {
      const payload: ExitUpdate = { status, notes: notes || undefined };
      await updateExit(record.id, payload);
      toast.success("Exit record updated");
      onUpdated();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!record} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Update Exit Status</DialogTitle>
        </DialogHeader>
        {record && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-slate-600">
              Consultant: <span className="font-semibold">{record.consultant_name ?? "—"}</span>
            </p>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ExitStatus)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXIT_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {status === "completed" && (
                <p className="text-xs text-amber-600 font-medium">
                  Marking as Completed will deactivate the consultant.
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="text-sm resize-none"
                rows={3}
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-sky-600 hover:bg-sky-500 text-white">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function ExitsPage() {
  const { user, can } = useAuth();

  const [exits, setExits]   = useState<ExitRecord[]>([]);
  const [total, setTotal]   = useState(0);
  const [loading, setLoading] = useState(false);
  const [stats, setStats]   = useState<ExitStats | null>(null);

  const [createOpen, setCreateOpen]       = useState(false);
  const [updateRecord, setUpdateRecord]   = useState<ExitRecord | null>(null);

  const [search, setSearch]               = useState("");
  const [filterStatus, setFilterStatus]   = useState("all");
  const [filterReason, setFilterReason]   = useState("all");

  const [page, setPage]               = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const [clients, setClients]         = useState<{ id: number; name: string }[]>([]);
  const [consultants, setConsultants] = useState<{ id: number; name: string; client_id: number; monthly_po: number | null }[]>([]);

  const fetchExits = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await listExits({
        page_no:  page + 1,
        per_page: rowsPerPage,
        status:   filterStatus !== "all" ? (filterStatus as ExitStatus) : undefined,
        exit_reason: filterReason !== "all" ? (filterReason as ExitReason) : undefined,
      });
      setExits(resp.data ?? []);
      setTotal(resp.meta?.total ?? 0);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load exit records");
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, filterStatus, filterReason]);

  const fetchStats = useCallback(async () => {
    try {
      const s = await getExitStats();
      setStats(s);
    } catch {
      // stats are non-critical, silently ignore
    }
  }, []);

  useEffect(() => { fetchExits(); fetchStats(); }, [fetchExits, fetchStats]);

  useEffect(() => {
    getClientsApi({ page_no: 1, per_page: -1 })
      .then((r: any) => setClients(r?.data?.items ?? r?.data ?? []))
      .catch(() => {});
    getConsultantsApi({ page_no: 1, per_page: -1 })
      .then((r: any) => setConsultants(r?.data?.items ?? r?.data ?? []))
      .catch(() => {});
  }, []);

  const filteredExits = useMemo(() => {
    if (!search) return exits;
    const q = search.toLowerCase();
    return exits.filter(
      (e) =>
        e.consultant_name?.toLowerCase().includes(q) ||
        e.client_name?.toLowerCase().includes(q),
    );
  }, [exits, search]);

  async function handleDelete(id: number) {
    if (!confirm("Delete this exit record? This cannot be undone.")) return;
    try {
      await deleteExit(id);
      toast.success("Exit record deleted");
      fetchExits();
      fetchStats();
    } catch (err: any) {
      toast.error(err?.message || "Delete failed");
    }
  }

  function onRefresh() { fetchExits(); fetchStats(); }

  return (
    <div className="flex flex-col h-full bg-white text-slate-800">
      <TopBar title="Exit Tracking" subtitle="Track consultant exit initiations and PO impact." />

      <main className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Stat cards + Log Exit button */}
        <div className="flex items-center gap-4">
          <div className="flex gap-4 flex-1">
            <StatCard
              icon={<LottieIcon src="/json/searching-jobs.json" size={44} />}
              label="Total Exits"
              value={stats?.total_exits ?? 0}
            />
            <StatCard
              icon={<LottieIcon src="/json/checking-resume.json" size={44} />}
              label="This Month"
              subtitle="Exits logged this month"
              value={stats?.exits_this_month ?? 0}
              accent="text-amber-600"
            />
            <StatCard
              icon={<LottieIcon src="/json/reviewed.json" size={44} />}
              label="This Quarter"
              subtitle="Exits logged this quarter"
              value={stats?.exits_this_quarter ?? 0}
              accent="text-blue-600"
            />
            <StatCard
              icon={<LottieIcon src="/json/business-problem-solving.json" size={44} />}
              label="Total PO Impact / mo"
              value={fmtCurrency(stats?.total_po_impact ?? 0)}
              accent="text-rose-600"
            />
          </div>
          {can("exits", "create") && (
            <Button
              onClick={() => setCreateOpen(true)}
              className="bg-sky-600 hover:bg-sky-500 text-white font-semibold gap-1.5 shadow-sm shrink-0"
            >
              <Plus className="w-4 h-4" /> Log Exit
            </Button>
          )}
        </div>

        {/* Toolbar — search + filters */}
        <div className="flex items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by consultant or client…"
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
                  <SelectItem value="initiated">Initiated</SelectItem>
                  <SelectItem value="acknowledged">Acknowledged</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="w-[180px]">
              <Select value={filterReason} onValueChange={(v) => { setFilterReason(v); setPage(0); }}>
                <SelectTrigger className="h-10 text-sm border-slate-200 shadow-sm bg-white">
                  <SelectValue placeholder="All Reasons" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Reasons</SelectItem>
                  {EXIT_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button variant="ghost" size="icon" onClick={onRefresh} title="Refresh">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-lg overflow-hidden border border-slate-200 bg-white shadow-sm">
          <Table>
            <TableHeader className="bg-slate-100 border-b border-slate-200">
              <TableRow className="hover:bg-transparent border-0">
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Consultant</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Client</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Reason</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Type</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Source Ticket</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">PO Impact/mo</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Exit Date</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Replacement</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Logged By</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Logged At</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {loading ? (
                <TableLoader colSpan={12} />
              ) : filteredExits.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="h-40 text-center text-slate-400">
                    <div className="flex justify-center"><LottieIcon src="/json/searching-jobs.json" size={80} /></div>
                    <p className="font-medium -mt-1">No exit records found</p>
                    <p className="text-xs mt-1">
                      {can("exits", "create")
                        ? 'Click "Log Exit" to record one.'
                        : "No records match your filters."}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredExits.map((e) => (
                  <TableRow key={e.id} className="hover:bg-slate-50 transition-colors">
                    <TableCell className="font-medium text-sm text-slate-800">
                      {e.consultant_name ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">{e.client_name ?? "—"}</TableCell>
                    <TableCell className="text-sm text-slate-600">
                      <ReasonLabel reason={e.exit_reason} />
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        e.exit_type === "voluntary"
                          ? "bg-sky-50 text-sky-700"
                          : "bg-rose-50 text-rose-700"
                      }`}>
                        {e.exit_type === "voluntary" ? "Voluntary" : "Involuntary"}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600 whitespace-nowrap">
                      {e.source_ticket_number ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-violet-50 text-violet-700 font-mono font-semibold border border-violet-100">
                          {e.source_ticket_number}
                        </span>
                      ) : (
                        <span className="text-slate-400">Manual</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm font-semibold text-rose-700">
                      {fmtCurrency(e.po_impact)}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {e.exit_date ?? "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={e.status} />
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {e.replacement_needed ? (
                        <span className="text-amber-700 font-medium">Yes</span>
                      ) : (
                        <span className="text-slate-400">No</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {e.initiated_by_name ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                      {fmtDateTime(e.created_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {can("exits", "update") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-sky-600 hover:text-sky-700 hover:bg-sky-50"
                            onClick={() => setUpdateRecord(e)}
                          >
                            Update
                          </Button>
                        )}
                        {can("exits", "delete") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleDelete(e.id)}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex justify-center mt-4">
          <CustomTablePagination
            rowsPerPageOptions={[5, 10, 25, 50]}
            count={total}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          />
        </div>
      </main>

      <CreateExitDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => { fetchExits(); fetchStats(); }}
        clients={clients}
        consultants={consultants}
        currentUserId={user?.id ?? 0}
      />

      <UpdateStatusDialog
        record={updateRecord}
        onClose={() => setUpdateRecord(null)}
        onUpdated={() => { fetchExits(); fetchStats(); }}
      />
    </div>
  );
}
