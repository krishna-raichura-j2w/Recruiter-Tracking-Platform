import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { TopBar } from "@/components/TopBar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fmtINR } from "@/lib/mockData";
import { Search, Eye, Building2, Users, IndianRupee, Calendar, ExternalLink } from "lucide-react";
import { getClientsApi } from "@/apiService/api";
import type { ClientItem } from "@/apiService/types";
import { toast } from "react-toastify";
import { CustomTablePagination } from "@/components/CustomPagination";
import { LottieIcon } from "@/components/LottieIcon";
import { fetchClientsSummary, type ClientsSummary } from "@/apiService/dashboardApi";
import { TableLoader } from "@/components/Loader";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/clients/")({ component: ClientsPage });

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  try { return format(new Date(d), "MMM dd, yyyy"); } catch { return d; }
}

// ── Field pair ─────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
      <div className="text-sm font-medium text-slate-800">{children}</div>
    </div>
  );
}

// ── Metric tile ────────────────────────────────────────────────────────────

function MetricTile({
  label,
  value,
  icon,
  accent = "blue",
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent?: "blue" | "emerald" | "amber" | "slate";
}) {
  const styles: Record<string, string> = {
    blue:    "bg-blue-50 border-blue-100 text-blue-900",
    emerald: "bg-emerald-50 border-emerald-100 text-emerald-900",
    amber:   "bg-amber-50 border-amber-100 text-amber-900",
    slate:   "bg-slate-50 border-slate-100 text-slate-800",
  };
  const labelColors: Record<string, string> = {
    blue: "text-blue-600", emerald: "text-emerald-600", amber: "text-amber-600", slate: "text-slate-500",
  };
  return (
    <div className={`rounded-xl border p-3 ${styles[accent]}`}>
      <div className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide mb-1 ${labelColors[accent]}`}>
        {icon}
        {label}
      </div>
      <p className="text-base font-bold">{value}</p>
    </div>
  );
}

// ── Client detail dialog ───────────────────────────────────────────────────

function ClientDetailDialog({
  client,
  open,
  onClose,
}: {
  client: ClientItem | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!client) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="pb-4 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="h-12 w-12 bg-sky-100 text-sky-700 rounded-full flex items-center justify-center text-xl font-bold shrink-0 border-2 border-white ring-1 ring-slate-200">
              {client.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base font-bold text-[#132246] leading-tight">
                {client.name}
              </DialogTitle>
              <p className="text-xs text-slate-500 mt-0.5">{client.industry || "—"}</p>
            </div>
            <Badge className={client.is_active
              ? "bg-emerald-100 text-emerald-800 border-emerald-200 shrink-0"
              : "bg-slate-100 text-slate-600 border-slate-200 shrink-0"}>
              {client.is_active ? "Active" : "Inactive"}
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-5">
          {/* Business metrics */}
          <div className="grid grid-cols-2 gap-3">
            <MetricTile
              label="Headcount"
              value={String(client.headcount ?? 0)}
              icon={<Users className="w-3 h-3" />}
              accent="blue"
            />
            <MetricTile
              label="Monthly PO"
              value={client.total_monthly_po ? fmtINR(client.total_monthly_po) : "—"}
              icon={<IndianRupee className="w-3 h-3" />}
              accent="emerald"
            />
          </div>

          {/* Client Details card */}
          <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="bg-slate-50/60 border-b border-slate-100 px-4 py-2.5 flex items-center gap-2">
              <Building2 className="w-3.5 h-3.5 text-sky-600" />
              <p className="text-xs font-semibold text-[#132246]">Client Details</p>
            </div>
            <div className="px-4 py-4 grid grid-cols-2 gap-x-6 gap-y-4">
              <Field label="Industry">{client.industry || "—"}</Field>
              <Field label="BH Owner">{client.bh_name || "—"}</Field>
              <Field label="Status">
                <Badge variant="outline" className={client.is_active
                  ? "text-xs bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "text-xs bg-slate-50 text-slate-600 border-slate-200"}>
                  {client.is_active ? "Active" : "Inactive"}
                </Badge>
              </Field>
            </div>
          </div>

          {/* Timestamps */}
          <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="bg-slate-50/60 border-b border-slate-100 px-4 py-2.5 flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-sky-600" />
              <p className="text-xs font-semibold text-[#132246]">Dates</p>
            </div>
            <div className="px-4 py-4 grid grid-cols-2 gap-x-6 gap-y-4">
              <Field label="Created">{formatDate(client.created_at)}</Field>
              <Field label="Last Updated">{formatDate(client.updated_at)}</Field>
            </div>
          </div>

          {/* View consultants link */}
          <Link
            to="/clients/$clientId"
            params={{ clientId: String(client.id) }}
            onClick={onClose}
          >
            <Button variant="outline" className="w-full gap-2 text-sm">
              <ExternalLink className="w-4 h-4" />
              View Consultant Team
            </Button>
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

function ClientsPage() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [clientNameFilter, setClientNameFilter] = useState("");
  const [industryFilter, setIndustryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [apiClients, setApiClients] = useState<ClientItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<ClientsSummary | null>(null);
  const [selectedClient, setSelectedClient] = useState<ClientItem | null>(null);
  const [allClientNames, setAllClientNames] = useState<string[]>([]);
  const [allIndustries, setAllIndustries] = useState<string[]>([]);

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Debounce text search — clears clientNameFilter so they don't conflict
  useEffect(() => {
    const t = setTimeout(() => {
      if (q) setClientNameFilter("");
      setDebouncedQ(q);
      setPage(0);
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  // Fetch all clients once on mount to populate name + industry dropdowns
  useEffect(() => {
    fetchClientsSummary().then(setSummary).catch(() => {});
    getClientsApi({ per_page: -1 }).then((res) => {
      if (res.meta.status) {
        const items: ClientItem[] = res.data ?? [];
        setAllClientNames(items.map((c) => c.name).filter(Boolean).sort());
        setAllIndustries([...new Set(items.map((c) => c.industry).filter(Boolean) as string[])].sort());
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    async function fetchClients() {
      try {
        setLoading(true);
        const effectiveSearch = clientNameFilter || debouncedQ || undefined;
        const res = await getClientsApi({
          page_no: page + 1,
          per_page: rowsPerPage,
          search: effectiveSearch,
          industry: industryFilter || undefined,
          is_active: statusFilter === "all" ? undefined : statusFilter === "active",
        });
        if (res.meta.status) {
          setApiClients(res.data || []);
          setTotalCount(res.meta.total || 0);
        } else {
          toast.error(res.meta.message || "Failed to load clients");
        }
      } catch (err: any) {
        toast.error(err.message || "Failed to load clients");
      } finally {
        setLoading(false);
      }
    }
    fetchClients();
  }, [page, rowsPerPage, debouncedQ, clientNameFilter, industryFilter, statusFilter]);

  const handleChangePage = (
    _: React.MouseEvent<HTMLButtonElement> | null,
    newPage: number,
  ) => setPage(newPage);

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const filtered = apiClients;

  return (
    <div className="flex flex-col h-full bg-white text-slate-800">
      <TopBar
        title="Clients"
        subtitle="Manage client engagements, monitor headcount, and track project health."
      />
      <main className="flex-1 overflow-y-auto p-6 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total Clients",      value: summary?.total ?? "—",              color: "text-sky-600",    src: "/json/successful-business-agreement.json" },
            { label: "Active",             value: summary?.active ?? "—",             color: "text-emerald-600", src: "/json/reviewed.json" },
            { label: "Inactive",           value: summary?.inactive ?? "—",           color: "text-slate-500",  src: "/json/office-drawer.json" },
            { label: "Total Consultants",  value: summary?.total_consultants ?? "—",  color: "text-violet-600", src: "/json/employee-colored.json" },
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

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search clients..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9 h-10 border-slate-200 shadow-sm bg-white"
            />
          </div>
          <Select
            value={clientNameFilter || "all"}
            onValueChange={(v) => { setClientNameFilter(v === "all" ? "" : v); setQ(""); setDebouncedQ(""); setPage(0); }}
          >
            <SelectTrigger className="w-48 h-10 border-slate-200 shadow-sm bg-white">
              <SelectValue placeholder="All Clients" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Clients</SelectItem>
              {allClientNames.map((name) => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={industryFilter || "all"} onValueChange={(v) => { setIndustryFilter(v === "all" ? "" : v); setPage(0); }}>
            <SelectTrigger className="w-44 h-10 border-slate-200 shadow-sm bg-white">
              <SelectValue placeholder="All Industries" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Industries</SelectItem>
              {allIndustries.map((ind) => (
                <SelectItem key={ind} value={ind}>{ind}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
            <SelectTrigger className="w-36 h-10 text-sm border-slate-200 shadow-sm bg-white">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-slate-500">{totalCount} clients total</span>
        </div>

        <div className="rounded-lg overflow-hidden border border-slate-200 bg-white shadow-sm">
          <Table>
            <TableHeader className="bg-slate-100 border-b border-slate-200">
              <TableRow className="hover:bg-transparent border-0">
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Client</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Industry</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">BH Owner</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">Headcount</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">PO Value</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">Active Incidents</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableLoader colSpan={8} />
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center">
                    No clients found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((c) => (
                  <TableRow key={c.id} className="hover:bg-slate-50 transition-colors">
                    <TableCell className="font-medium">
                      <Link
                        to="/clients/$clientId"
                        params={{ clientId: c.id.toString() }}
                        className="text-sky-600 hover:text-sky-700 hover:underline font-semibold"
                      >
                        {c.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600 font-medium">{c.industry || "N/A"}</TableCell>
                    <TableCell className="text-center text-xs text-slate-600 font-medium">{c.bh_name || "N/A"}</TableCell>
                    <TableCell className="text-center text-slate-700 font-medium">{c.headcount || 0}</TableCell>
                    <TableCell className="text-center text-slate-500 text-xs font-medium">{fmtINR(c.total_monthly_po || 0)}</TableCell>
                    <TableCell className="text-center text-slate-700 font-medium">0</TableCell>
                    <TableCell>
                      {c.is_active ? (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-200">Active</Badge>
                      ) : (
                        <Badge className="bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-slate-400 hover:text-sky-600 hover:bg-sky-50"
                        onClick={() => setSelectedClient(c)}
                        title="View details"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex justify-center mt-4">
          <CustomTablePagination
            rowsPerPageOptions={[5, 10, 25, 50, 100]}
            count={totalCount}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={handleChangePage}
            onRowsPerPageChange={handleChangeRowsPerPage}
          />
        </div>
      </main>

      <ClientDetailDialog
        client={selectedClient}
        open={selectedClient !== null}
        onClose={() => setSelectedClient(null)}
      />
    </div>
  );
}
