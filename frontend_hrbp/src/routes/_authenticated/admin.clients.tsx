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
import { Plus, Search, UserCog, Loader2 } from "lucide-react";
import { toast } from "react-toastify";
import { LottieIcon } from "@/components/LottieIcon";
import { TableLoader } from "@/components/Loader";
import { CustomTablePagination } from "@/components/CustomPagination";
import { getClientsApi, fetchWithAuth } from "@/apiService/api";
import { getAdminUsers, assignClient, type AdminUser } from "@/apiService/adminApi";
import type { ClientItem } from "@/apiService/types";

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
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [total, setTotal] = useState(0);

  const [hrbpUsers, setHrbpUsers] = useState<AdminUser[]>([]);
  const [bhUsers, setBhUsers] = useState<AdminUser[]>([]);

  const [assignTarget, setAssignTarget] = useState<ClientItem | null>(null);
  const [assignForm, setAssignForm] = useState<{ hrbp_id: string; bh_id: string }>({ hrbp_id: "", bh_id: "" });
  const [saving, setSaving] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", industry: "", hrbp_id: "", bh_id: "" });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [clientRes, hrbpRes, bhRes] = await Promise.all([
        getClientsApi({ page_no: page + 1, per_page: rowsPerPage }),
        getAdminUsers({ role: "hrbp" }),
        getAdminUsers({ role: "bh" }),
      ]);
      if (clientRes.meta.status) {
        setClients(clientRes.data ?? []);
        setTotal(clientRes.meta.total ?? 0);
      }
      setHrbpUsers(hrbpRes.data ?? []);
      setBhUsers(bhRes.data ?? []);
    } catch (e: any) {
      toast.error(e.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [page, rowsPerPage]);

  const filtered = useMemo(
    () => clients.filter((c) => (c.name ?? "").toLowerCase().includes(search.toLowerCase())),
    [clients, search],
  );

  const stats = useMemo(() => ({
    total,
    active: clients.filter((c) => c.is_active).length,
    inactive: clients.filter((c) => !c.is_active).length,
    consultants: clients.reduce((sum, c) => sum + (c.headcount ?? 0), 0),
  }), [clients, total]);

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
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search clients…"
              className="pl-9 h-10 border-slate-200 shadow-sm bg-white"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            />
          </div>
          <span className="text-sm text-slate-500">{total} clients total</span>
          <Button onClick={() => setCreateOpen(true)} className="ml-auto gap-2 bg-sky-600 hover:bg-sky-500 text-white font-semibold shadow-sm">
            <Plus className="h-4 w-4" /> New Client
          </Button>
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
