import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { TopBar } from "@/components/TopBar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, Search, UserCog, Loader2, Download } from "lucide-react";
import { toast } from "react-toastify";
import { LottieIcon } from "@/components/LottieIcon";
import { TableLoader } from "@/components/Loader";
import { CustomTablePagination } from "@/components/CustomPagination";
import { getClientsApi, exportClientsApi, fetchWithAuth } from "@/apiService/api";
import { getAdminUsers, assignClient, type AdminUser } from "@/apiService/adminApi";
import type { ClientItem } from "@/apiService/types";
import { fetchClientsSummary } from "@/apiService/dashboardApi";
import type { ClientsSummary } from "@/apiService/dashboardApi";

const getBaseUrl = () => {
  const base = import.meta.env.VITE_BASE_URL || "http://localhost:8000/";
  return base.endsWith("/") ? base : `${base}/`;
};

export const Route = createFileRoute("/_authenticated/admin/clients")({
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      const raw = localStorage.getItem("j2w_user");
      if (raw) {
        const u = JSON.parse(raw);
        if (u.role !== "admin") throw redirect({ to: "/dashboard" });
      }
    }
  },
  component: AdminClientsPage,
});

function AdminClientsPage() {
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [industry, setIndustry] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<ClientsSummary | null>(null);
  const [exporting, setExporting] = useState(false);
  const [industries, setIndustries] = useState<string[]>([]);
  const [allClientNames, setAllClientNames] = useState<string[]>([]);
  const [clientNameFilter, setClientNameFilter] = useState("");

  const [hrbpUsers, setHrbpUsers] = useState<AdminUser[]>([]);
  const [bhUsers, setBhUsers] = useState<AdminUser[]>([]);

  const [assignTarget, setAssignTarget] = useState<ClientItem | null>(null);
  const [assignForm, setAssignForm] = useState<{ hrbp_id: string; bh_id: string }>({ hrbp_id: "", bh_id: "" });
  const [saving, setSaving] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", industry: "", hrbp_id: "", bh_id: "" });

  // Debounce text search — clears clientNameFilter so they don't conflict
  useEffect(() => {
    const t = setTimeout(() => {
      if (search) setClientNameFilter("");
      setDebouncedSearch(search);
      setPage(0);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch all clients once on mount to populate name + industry dropdowns
  useEffect(() => {
    getClientsApi({ per_page: -1 }).then((res) => {
      if (res.meta.status) {
        const items: ClientItem[] = res.data ?? [];
        setAllClientNames(items.map((c) => c.name).filter(Boolean).sort());
        setIndustries([...new Set(items.map((c) => c.industry).filter(Boolean) as string[])].sort());
      }
    }).catch(() => {});
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      // clientNameFilter takes precedence over the text search box
      const effectiveSearch = clientNameFilter || debouncedSearch || undefined;
      const [clientRes, hrbpRes, bhRes, summaryRes] = await Promise.all([
        getClientsApi({
          page_no: page + 1,
          per_page: rowsPerPage,
          search: effectiveSearch,
          industry: industry || undefined,
        }),
        getAdminUsers({ role: "hrbp" }),
        getAdminUsers({ role: "bh" }),
        fetchClientsSummary(),
      ]);
      if (clientRes.meta.status) {
        setClients(clientRes.data ?? []);
        setTotal(clientRes.meta.total ?? 0);
      }
      setHrbpUsers(hrbpRes.data ?? []);
      setBhUsers(bhRes.data ?? []);
      setSummary(summaryRes);
    } catch (e: any) {
      toast.error(e.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [page, rowsPerPage, debouncedSearch, clientNameFilter, industry]);

  const filtered = clients;

  const stats = useMemo(() => ({
    total: summary?.total ?? total,
    active: summary?.active ?? 0,
    inactive: summary?.inactive ?? 0,
    consultants: summary?.total_consultants ?? 0,
  }), [summary, total]);

  const openAssign = (c: ClientItem) => {
    setAssignTarget(c);
    setAssignForm({
      hrbp_id: c.hrbp_id ? String(c.hrbp_id) : "none",
      bh_id: c.bh_id ? String(c.bh_id) : "none",
    });
  };

  const handleAssign = async () => {
    if (!assignTarget) return;
    try {
      setSaving(true);
      await assignClient(assignTarget.id, {
        hrbp_id: assignForm.hrbp_id && assignForm.hrbp_id !== "none" ? Number(assignForm.hrbp_id) : undefined,
        bh_id: assignForm.bh_id && assignForm.bh_id !== "none" ? Number(assignForm.bh_id) : undefined,
      });
      toast.success("Client assignment updated");
      setAssignTarget(null);
      fetchData();
    } catch (e: any) {
      toast.error(e.message || "Failed to update assignment");
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!createForm.name.trim()) {
      toast.error("Client name is required");
      return;
    }
    try {
      setCreating(true);
      const payload: Record<string, any> = { name: createForm.name.trim() };
      if (createForm.industry) payload.industry = createForm.industry;
      if (createForm.hrbp_id && createForm.hrbp_id !== "none") payload.hrbp_id = Number(createForm.hrbp_id);
      if (createForm.bh_id && createForm.bh_id !== "none") payload.bh_id = Number(createForm.bh_id);

      const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/clients`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || json?.meta?.status === false) throw new Error(json?.meta?.message || "Failed");
      toast.success("Client created successfully");
      setCreateOpen(false);
      setCreateForm({ name: "", industry: "", hrbp_id: "", bh_id: "" });
      fetchData();
    } catch (e: any) {
      toast.error(e.message || "Failed to create client");
    } finally {
      setCreating(false);
    }
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      const url = await exportClientsApi({
        search: clientNameFilter || debouncedSearch || undefined,
        industry: industry || undefined,
      });
      window.open(url, "_blank");
      toast.success("Excel report ready — opening download link");
    } catch (err: any) {
      toast.error(err?.message || "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const getUserName = (users: AdminUser[], id: number | null | undefined) => {
    if (!id) return "—";
    return users.find((u) => u.id === id)?.name ?? `#${id}`;
  };

  return (
    <div className="flex flex-col min-h-screen bg-white text-slate-800">
      <TopBar title="Clients" subtitle="Assign HRBP and BH to clients" />
      <main className="flex-1 p-6 space-y-4">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total Clients", value: stats.total, color: "text-sky-600", src: "/json/successful-business-agreement.json" },
            { label: "Active", value: stats.active, color: "text-emerald-600", src: "/json/reviewed.json" },
            { label: "Inactive", value: stats.inactive, color: "text-slate-500", src: "/json/office-drawer.json" },
            { label: "Total Consultants", value: stats.consultants, color: "text-violet-600", src: "/json/employee-colored.json" },
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
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search clients…"
              className="pl-9 h-10 border-slate-200 shadow-sm bg-white"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select
            value={clientNameFilter || "all"}
            onValueChange={(v) => { setClientNameFilter(v === "all" ? "" : v); setSearch(""); setDebouncedSearch(""); setPage(0); }}
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
          <Select value={industry || "all"} onValueChange={(v) => { setIndustry(v === "all" ? "" : v); setPage(0); }}>
            <SelectTrigger className="w-44 h-10 border-slate-200 shadow-sm bg-white">
              <SelectValue placeholder="All Industries" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Industries</SelectItem>
              {industries.map((ind) => (
                <SelectItem key={ind} value={ind}>{ind}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* <span className="text-sm text-slate-500">{total} clients total</span> */}
          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={exporting}
              className="gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50 font-semibold shadow-sm"
              title="Export to Excel"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {exporting ? "Exporting…" : "Export"}
            </Button>
            <Button onClick={() => setCreateOpen(true)} className="gap-2 bg-sky-600 hover:bg-sky-500 text-white font-semibold shadow-sm">
              <Plus className="h-4 w-4" /> New Client
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 hover:bg-slate-50">
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Client Name</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Industry</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">HRBP</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">BH Owner</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Headcount</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">Assign</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableLoader colSpan={7} />
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-16 text-slate-400">No clients found.</TableCell>
                </TableRow>
              ) : (
                filtered.map((c) => (
                  <TableRow key={c.id} className="hover:bg-slate-50">
                    <TableCell className="font-medium text-slate-800">{c.name}</TableCell>
                    <TableCell className="text-slate-500 text-sm">{c.industry ?? "—"}</TableCell>
                    <TableCell className="text-sm text-slate-600">{getUserName(hrbpUsers, c.hrbp_id)}</TableCell>
                    <TableCell className="text-sm text-slate-600">{getUserName(bhUsers, c.bh_id)}</TableCell>
                    <TableCell className="text-sm text-slate-600">{c.headcount ?? 0}</TableCell>
                    <TableCell>
                      <Badge className={c.is_active ? "bg-emerald-100 text-emerald-700 border-0" : "bg-slate-100 text-slate-500 border-0"}>
                        {c.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" className="gap-1.5 text-slate-600 hover:text-blue-600" onClick={() => openAssign(c)}>
                        <UserCog className="h-4 w-4" /> Assign
                      </Button>
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
          onPageChange={(_: any, p: number) => setPage(p)}
          onRowsPerPageChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
        />
      </main>

      {/* Create Client Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Client</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Client Name *</Label>
              <Input
                placeholder="e.g. Infosys"
                value={createForm.name}
                onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Industry</Label>
              <Input
                placeholder="e.g. Technology, Healthcare…"
                value={createForm.industry}
                onChange={(e) => setCreateForm((p) => ({ ...p, industry: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Assign HRBP</Label>
              <Select value={createForm.hrbp_id} onValueChange={(v) => setCreateForm((p) => ({ ...p, hrbp_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select HRBP (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {hrbpUsers.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Assign Business Head</Label>
              <Select value={createForm.bh_id} onValueChange={(v) => setCreateForm((p) => ({ ...p, bh_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select BH (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {bhUsers.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating} className="bg-sky-600 hover:bg-sky-500 text-white font-semibold shadow-sm">
              {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Client
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Modal */}
      <Dialog open={!!assignTarget} onOpenChange={(o) => { if (!o) setAssignTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Assign HRBP & BH — {assignTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>HRBP</Label>
              <Select value={assignForm.hrbp_id} onValueChange={(v) => setAssignForm((p) => ({ ...p, hrbp_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select HRBP" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {hrbpUsers.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Business Head (BH)</Label>
              <Select value={assignForm.bh_id} onValueChange={(v) => setAssignForm((p) => ({ ...p, bh_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select BH" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {bhUsers.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignTarget(null)}>Cancel</Button>
            <Button onClick={handleAssign} disabled={saving} className="bg-sky-600 hover:bg-sky-500 text-white font-semibold shadow-sm">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Assignment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
