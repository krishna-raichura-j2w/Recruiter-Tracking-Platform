import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Search, UserCog, Loader2, Upload, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "react-toastify";
import dayjs, { type Dayjs } from "dayjs";
import { LottieIcon } from "@/components/LottieIcon";
import { TableLoader } from "@/components/Loader";
import { CustomTablePagination } from "@/components/CustomPagination";
import { CustomDatePicker } from "@/components/CustomDatePicker";
import { CustomSelect } from "@/components/CustomSelect";
import { getConsultantsApi, getClientsApi, fetchWithAuth, bulkUpsertConsultantsApi } from "@/apiService/api";
import { fetchConsultantsSummary } from "@/apiService/dashboardApi";
import type { ConsultantsSummary } from "@/apiService/dashboardApi";
import { getAdminUsers, assignConsultant, type AdminUser } from "@/apiService/adminApi";
import type { ConsultantItem, ClientItem } from "@/apiService/types";

export const Route = createFileRoute("/_authenticated/admin/consultants")({
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      const raw = localStorage.getItem("j2w_user");
      if (raw) {
        const u = JSON.parse(raw);
        if (u.role !== "admin") throw redirect({ to: "/dashboard" });
      }
    }
  },
  component: AdminConsultantsPage,
});

const getBaseUrl = () => {
  const base = import.meta.env.VITE_BASE_URL || "http://localhost:8000/";
  return base.endsWith("/") ? base : `${base}/`;
};

const COHORTS = ["star","high_performer","rising","bedrock","new_joiner","watch_exit","watch_rate_rev","watch_general","rescue"];
const PERF_TIERS = ["top_20","mid_60","bottom_20","unrated"];

function AdminConsultantsPage() {
  const [consultants, setConsultants] = useState<ConsultantItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<ConsultantsSummary | null>(null);

  const [hrbpUsers, setHrbpUsers] = useState<AdminUser[]>([]);
  const [clients, setClients] = useState<ClientItem[]>([]);

  const [assignTarget, setAssignTarget] = useState<ConsultantItem | null>(null);
  const [assignForm, setAssignForm] = useState<{ hrbp_id: string }>({ hrbp_id: "" });
  const [saving, setSaving] = useState(false);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ inserted: number; updated: number; errors: { row: number; error: string }[] } | null>(null);

  const handleBulkUpload = async () => {
    if (!bulkFile) return;
    try {
      setBulkUploading(true);
      const res = await bulkUpsertConsultantsApi(bulkFile);
      if (res.meta.status === false) throw new Error(res.meta.message);
      setBulkResult(res.data);
      fetchData();
    } catch (e: any) {
      toast.error(e.message || "Bulk upload failed");
    } finally {
      setBulkUploading(false);
    }
  };

  const closeBulk = () => {
    setBulkOpen(false);
    setBulkFile(null);
    setBulkResult(null);
  };

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    emp_id: "", name: "", email: "", phone: "",
    client_id: "", hrbp_id: "",
    manager_name: "", modality: "", skill: "",
    cohort: "", perf_tier: "",
    join_date: "",
    monthly_po: "", monthly_ctc: "", po_end_date: "",
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [consultantRes, hrbpRes, clientRes, summaryRes] = await Promise.all([
        getConsultantsApi({ page_no: page + 1, per_page: rowsPerPage }),
        getAdminUsers({ role: "hrbp" }),
        getClientsApi({ per_page: -1 }),
        fetchConsultantsSummary(),
      ]);
      if (consultantRes.meta.status) {
        setConsultants(consultantRes.data ?? []);
        setTotal(consultantRes.meta.total ?? 0);
      }
      setHrbpUsers(hrbpRes.data ?? []);
      setClients(clientRes.data ?? []);
      setSummary(summaryRes);
    } catch (e: any) {
      toast.error(e.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [page, rowsPerPage]);

  const filtered = useMemo(
    () => consultants.filter((c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.emp_id.toLowerCase().includes(search.toLowerCase()),
    ),
    [consultants, search],
  );

  const stats = useMemo(() => ({
    total: summary?.total ?? total,
    active: summary?.active ?? 0,
    inactive: summary?.inactive ?? 0,
    clients: summary?.clients_served ?? 0,
  }), [summary, total]);

  const openAssign = (c: ConsultantItem) => {
    setAssignTarget(c);
    setAssignForm({ hrbp_id: c.hrbp_id ? String(c.hrbp_id) : "" });
  };

  const handleAssign = async () => {
    if (!assignTarget) return;
    try {
      setSaving(true);
      await assignConsultant(assignTarget.id, {
        hrbp_id: assignForm.hrbp_id ? Number(assignForm.hrbp_id) : undefined,
      });
      toast.success("Consultant assignment updated");
      setAssignTarget(null);
      fetchData();
    } catch (e: any) {
      toast.error(e.message || "Failed to update assignment");
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!createForm.emp_id || !createForm.name || !createForm.client_id || !createForm.hrbp_id) {
      toast.error("Emp ID, name, client and HRBP are required");
      return;
    }
    try {
      setCreating(true);
      const payload: Record<string, any> = {
        emp_id: createForm.emp_id,
        name: createForm.name,
        client_id: Number(createForm.client_id),
        hrbp_id: Number(createForm.hrbp_id),
      };
      if (createForm.email) payload.email = createForm.email;
      if (createForm.phone) payload.phone = createForm.phone;
      if (createForm.manager_name) payload.manager_name = createForm.manager_name;
      if (createForm.modality) payload.modality = createForm.modality;
      if (createForm.skill) payload.skill = createForm.skill;
      if (createForm.cohort) payload.cohort = createForm.cohort;
      if (createForm.perf_tier) payload.perf_tier = createForm.perf_tier;
      if (createForm.join_date) payload.join_date = createForm.join_date;
      if (createForm.monthly_po) payload.monthly_po = parseFloat(createForm.monthly_po);
      if (createForm.monthly_ctc) payload.monthly_ctc = parseFloat(createForm.monthly_ctc);
      if (createForm.po_end_date) payload.po_end_date = createForm.po_end_date;

      const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/consultants`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || json?.meta?.status === false) throw new Error(json?.meta?.message || "Failed");
      toast.success("Consultant created successfully");
      setCreateOpen(false);
      setCreateForm({ emp_id: "", name: "", email: "", phone: "", client_id: "", hrbp_id: "", manager_name: "", modality: "", skill: "", cohort: "", perf_tier: "", join_date: "", monthly_po: "", monthly_ctc: "", po_end_date: "" });
      fetchData();
    } catch (e: any) {
      toast.error(e.message || "Failed to create consultant");
    } finally {
      setCreating(false);
    }
  };

  const getUserName = (id: number | null | undefined) => {
    if (!id) return "—";
    return hrbpUsers.find((u) => u.id === id)?.name ?? `#${id}`;
  };

  const getClientName = (id: number | null | undefined) => {
    if (!id) return "—";
    return clients.find((c) => c.id === id)?.name ?? `#${id}`;
  };

  return (
    <div className="flex flex-col min-h-screen bg-white text-slate-800">
      <TopBar title="Consultants" subtitle="Create consultants and manage HRBP assignments" />
      <main className="flex-1 p-6 space-y-4">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Active Consultants", value: stats.active, color: "text-emerald-600", src: "/json/employee-colored.json" },
            { label: "Total Consultants", value: stats.total, color: "text-sky-600", src: "/json/hiring.json" },
            { label: "Inactive", value: stats.inactive, color: "text-slate-500", src: "/json/office-drawer.json" },
            { label: "Clients Served", value: stats.clients, color: "text-violet-600", src: "/json/successful-business-agreement.json" },
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
              placeholder="Search by name or emp ID…"
              className="pl-9 h-10 border-slate-200 shadow-sm bg-white"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            />
          </div>
          <span className="text-sm text-slate-500">{total} consultants total</span>
          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              onClick={() => setBulkOpen(true)}
              className="gap-2 border-sky-200 text-sky-700 hover:bg-sky-50 font-semibold shadow-sm"
            >
              <Upload className="h-4 w-4" /> Bulk Upload
            </Button>
            <Button onClick={() => setCreateOpen(true)} className="gap-2 bg-sky-600 hover:bg-sky-500 text-white font-semibold shadow-sm">
              <Plus className="h-4 w-4" /> Add Consultant
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 hover:bg-slate-50">
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Emp ID</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Name</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Client</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">HRBP</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Cohort</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">Assign</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableLoader colSpan={7} />
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-16 text-slate-400">No consultants found.</TableCell>
                </TableRow>
              ) : (
                filtered.map((c) => (
                  <TableRow key={c.id} className="hover:bg-slate-50">
                    <TableCell className="font-mono text-xs text-slate-500">{c.emp_id}</TableCell>
                    <TableCell className="font-medium text-slate-800">{c.name}</TableCell>
                    <TableCell className="text-sm text-slate-600">{getClientName(c.client_id)}</TableCell>
                    <TableCell className="text-sm text-slate-600">{getUserName(c.hrbp_id)}</TableCell>
                    <TableCell>
                      {c.cohort ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                          {c.cohort.replace(/_/g, " ")}
                        </span>
                      ) : "—"}
                    </TableCell>
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

      {/* Bulk Upload Modal */}
      <Dialog open={bulkOpen} onOpenChange={(o) => { if (!o) closeBulk(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Bulk Upload Consultants</DialogTitle>
          </DialogHeader>

          {!bulkResult ? (
            <div className="space-y-4 py-2">
              <p className="text-sm text-slate-500">
                Upload an <strong>.xlsx</strong> file with columns:{" "}
                <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">
                  emp_id, name, join_date, phone, email, monthly_PO, margin, ctc, is_active, designation, skill, po_end_date, cleint_id, hrbp_id
                </code>
              </p>
              <p className="text-xs text-slate-400">
                Existing records (matched by emp_id) will be updated. New records will be inserted with{" "}
                <code className="bg-slate-100 px-1 rounded">created_at</code> set from join_date.
                CTC is treated as annual and divided by 12 to get monthly_ctc.
              </p>

              <label className="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:border-sky-300 hover:bg-sky-50 transition-colors">
                <Upload className="h-8 w-8 text-slate-400 mb-2" />
                {bulkFile ? (
                  <span className="text-sm font-medium text-sky-700">{bulkFile.name}</span>
                ) : (
                  <>
                    <span className="text-sm text-slate-500">Click to choose file</span>
                    <span className="text-xs text-slate-400 mt-1">.xlsx only</span>
                  </>
                )}
                <input
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={(e) => setBulkFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          ) : (
            <div className="py-4 space-y-4">
              <div className="flex gap-6 justify-center">
                <div className="flex flex-col items-center gap-1">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                  <span className="text-2xl font-bold text-emerald-600">{bulkResult.inserted}</span>
                  <span className="text-xs text-slate-500">Inserted</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <CheckCircle2 className="h-8 w-8 text-sky-500" />
                  <span className="text-2xl font-bold text-sky-600">{bulkResult.updated}</span>
                  <span className="text-xs text-slate-500">Updated</span>
                </div>
                {bulkResult.errors.length > 0 && (
                  <div className="flex flex-col items-center gap-1">
                    <AlertCircle className="h-8 w-8 text-red-400" />
                    <span className="text-2xl font-bold text-red-500">{bulkResult.errors.length}</span>
                    <span className="text-xs text-slate-500">Errors</span>
                  </div>
                )}
              </div>
              {bulkResult.errors.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-lg border border-red-100 bg-red-50 p-3 space-y-1">
                  {bulkResult.errors.map((e) => (
                    <p key={e.row} className="text-xs text-red-600">
                      Row {e.row}: {e.error}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeBulk}>
              {bulkResult ? "Close" : "Cancel"}
            </Button>
            {!bulkResult && (
              <Button
                onClick={handleBulkUpload}
                disabled={bulkUploading || !bulkFile}
                className="bg-sky-600 hover:bg-sky-500 text-white font-semibold shadow-sm gap-2"
              >
                {bulkUploading && <Loader2 className="h-4 w-4 animate-spin" />}
                Upload & Process
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign HRBP Modal */}
      <Dialog open={!!assignTarget} onOpenChange={(o) => { if (!o) setAssignTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reassign HRBP — {assignTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-1.5">
            <Label>HRBP</Label>
            <CustomSelect
              value={assignForm.hrbp_id}
              onChange={(v) => setAssignForm({ hrbp_id: v })}
              placeholder="Select HRBP"
              options={hrbpUsers.map((u) => ({ label: u.name, value: String(u.id) }))}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignTarget(null)}>Cancel</Button>
            <Button onClick={handleAssign} disabled={saving || !assignForm.hrbp_id} className="bg-sky-600 hover:bg-sky-500 text-white font-semibold shadow-sm">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Consultant Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Consultant</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            {/* Basic info — text/email/tel inputs */}
            {[
              { label: "Emp ID *", key: "emp_id", type: "text", placeholder: "EMP001" },
              { label: "Full Name *", key: "name", type: "text", placeholder: "John Doe" },
              { label: "Email", key: "email", type: "email", placeholder: "john@example.com" },
              { label: "Phone", key: "phone", type: "tel", placeholder: "+91 9876543210" },
              { label: "Manager Name", key: "manager_name", type: "text", placeholder: "Manager" },
              { label: "Modality", key: "modality", type: "text", placeholder: "Remote / Onsite" },
              { label: "Skill", key: "skill", type: "text", placeholder: "Java, React…" },
            ].map(({ label, key, type, placeholder }) => (
              <div key={key} className="space-y-1.5">
                <Label>{label}</Label>
                <Input
                  type={type}
                  placeholder={placeholder}
                  value={(createForm as any)[key]}
                  onChange={(e) => setCreateForm((p) => ({ ...p, [key]: e.target.value }))}
                />
              </div>
            ))}

            <div className="space-y-1.5">
              <Label>Join Date</Label>
              <CustomDatePicker
                value={createForm.join_date ? dayjs(createForm.join_date) : null}
                onChange={(d: Dayjs | null) => setCreateForm((p) => ({ ...p, join_date: d ? d.format("YYYY-MM-DD") : "" }))}
                placeholder="Select join date"
              />
            </div>

            {/* PO / Billing Section */}
            <div className="col-span-2">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-1 mb-1">
                PO & Billing Details
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Monthly PO (₹)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 150000"
                value={createForm.monthly_po}
                onChange={(e) => setCreateForm((p) => ({ ...p, monthly_po: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Monthly CTC (₹)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 120000"
                value={createForm.monthly_ctc}
                onChange={(e) => setCreateForm((p) => ({ ...p, monthly_ctc: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>PO End Date</Label>
              <CustomDatePicker
                value={createForm.po_end_date ? dayjs(createForm.po_end_date) : null}
                onChange={(d: Dayjs | null) => setCreateForm((p) => ({ ...p, po_end_date: d ? d.format("YYYY-MM-DD") : "" }))}
                placeholder="Select PO end date"
              />
            </div>

            {/* Assignment & Classification */}
            <div className="col-span-2">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-1 mb-1">
                Assignment & Classification
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Client *</Label>
              <CustomSelect
                value={createForm.client_id}
                onChange={(v) => setCreateForm((p) => ({ ...p, client_id: v }))}
                placeholder="Select client"
                options={clients.map((c) => ({ label: c.name, value: String(c.id) }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>HRBP *</Label>
              <CustomSelect
                value={createForm.hrbp_id}
                onChange={(v) => setCreateForm((p) => ({ ...p, hrbp_id: v }))}
                placeholder="Assign HRBP"
                options={hrbpUsers.map((u) => ({ label: u.name, value: String(u.id) }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Cohort</Label>
              <CustomSelect
                value={createForm.cohort}
                onChange={(v) => setCreateForm((p) => ({ ...p, cohort: v }))}
                placeholder="Select cohort"
                options={COHORTS.map((c) => ({ label: c.replace(/_/g, " "), value: c }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Performance Tier</Label>
              <CustomSelect
                value={createForm.perf_tier}
                onChange={(v) => setCreateForm((p) => ({ ...p, perf_tier: v }))}
                placeholder="Select tier"
                options={PERF_TIERS.map((t) => ({ label: t.replace(/_/g, " "), value: t }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating} className="bg-sky-600 hover:bg-sky-500 text-white font-semibold shadow-sm">
              {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Consultant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
