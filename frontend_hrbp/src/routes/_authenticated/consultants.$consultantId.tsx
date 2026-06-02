import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useCallback } from "react";
import { TopBar } from "@/components/TopBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomDatePicker } from "@/components/CustomDatePicker";
import { CustomSelect } from "@/components/CustomSelect";
import { User, Briefcase, IndianRupee, Clock, TrendingDown, History, BarChart2, Table2, Pencil, X } from "lucide-react";
import dayjs, { type Dayjs } from "dayjs";
import { BackButton } from "@/components/BackButton";
import { getConsultantDetailsApi, getUserProfile, getClientsApi, updateConsultantApi } from "@/apiService/api";
import type { ConsultantItem } from "@/apiService/types";
import { toast } from "react-toastify";
import { format } from "date-fns";
import { fmtINR } from "@/lib/mockData";
import { PageLoader, TableLoader } from "@/components/Loader";
import { LottieIcon } from "@/components/LottieIcon";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CustomTablePagination } from "@/components/CustomPagination";
import { listPoRevisions } from "@/apiService/poRevisionApi";
import type { PoRevision } from "@/apiService/poRevisionApi";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
  Cell,
  Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/consultants/$consultantId")({
  component: ConsultantDetailPage,
});

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  try { return format(new Date(dateStr), "MMM dd, yyyy"); } catch { return dateStr; }
}

function calcTenureLeft(poEndDate: string | null | undefined): number {
  if (!poEndDate) return 0;
  const end = new Date(poEndDate);
  if (isNaN(end.getTime())) return 0;
  const now = new Date();
  return Math.max(0, (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth()));
}

// ── Small field pair ─────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
      <div className="text-sm font-medium text-slate-800">{children}</div>
    </div>
  );
}

// ── Financial highlight tile ──────────────────────────────────────────────────

function FinTile({
  label, value, accent = "blue",
}: {
  label: string; value: string; accent?: "blue" | "amber" | "red" | "slate";
}) {
  const styles = {
    blue:  "bg-blue-50  border-blue-100  text-blue-900  label:text-blue-700",
    amber: "bg-amber-50 border-amber-100 text-amber-900",
    red:   "bg-red-50   border-red-100   text-red-900",
    slate: "bg-slate-50 border-slate-100 text-slate-800",
  };
  const labelColors = { blue: "text-blue-600", amber: "text-amber-600", red: "text-red-600", slate: "text-slate-500" };
  return (
    <div className={`rounded-xl border p-3 ${styles[accent]}`}>
      <p className={`text-[11px] font-semibold uppercase tracking-wide mb-1 ${labelColors[accent]}`}>{label}</p>
      <p className="text-base font-bold">{value}</p>
    </div>
  );
}

// ── Cohort / perf badge colours ───────────────────────────────────────────────

const COHORT_COLOR: Record<string, string> = {
  star:           "bg-yellow-100 text-yellow-800 border-yellow-200",
  high_performer: "bg-emerald-100 text-emerald-800 border-emerald-200",
  rising:         "bg-sky-100 text-sky-800 border-sky-200",
  bedrock:        "bg-slate-100 text-slate-700 border-slate-200",
  new_joiner:     "bg-blue-100 text-blue-800 border-blue-200",
  watch_exit:     "bg-red-100 text-red-800 border-red-200",
  watch_rate_rev: "bg-orange-100 text-orange-800 border-orange-200",
  watch_general:  "bg-amber-100 text-amber-800 border-amber-200",
  rescue:         "bg-rose-100 text-rose-800 border-rose-200",
};
const PERF_COLOR: Record<string, string> = {
  top_20:    "bg-emerald-100 text-emerald-800",
  mid_60:    "bg-sky-100 text-sky-800",
  bottom_20: "bg-orange-100 text-orange-800",
  unrated:   "bg-slate-100 text-slate-600",
};
const LD_COLOR: Record<string, string> = {
  enrolled:    "bg-sky-100 text-sky-800",
  completed:   "bg-emerald-100 text-emerald-800",
  not_started: "bg-slate-100 text-slate-600",
  pending:     "bg-amber-100 text-amber-800",
};

const STATUS_STYLE: Record<string, string> = {
  pending_approval: "bg-amber-100 text-amber-700 border-amber-200",
  approved:         "bg-emerald-100 text-emerald-700 border-emerald-200",
  rejected:         "bg-red-100 text-red-700 border-red-200",
};
const STATUS_LABEL: Record<string, string> = {
  pending_approval: "Pending Approval",
  approved:         "Approved",
  rejected:         "Rejected",
};

const STATUS_BAR_COLOR: Record<string, string> = {
  approved:         "#10b981",
  pending_approval: "#f59e0b",
  rejected:         "#ef4444",
};

// ── Tooltip ───────────────────────────────────────────────────────────────────

interface ChartPoint {
  date: string;
  old_rate: number | null;
  new_rate: number;
  hike_pct: number | null;
  status: string;
  notes: string | null;
}

function RevisionTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d: ChartPoint = payload[0].payload;
  const statusBg = d.status === "approved" ? "bg-emerald-50 text-emerald-700"
    : d.status === "rejected"              ? "bg-red-50 text-red-700"
    :                                        "bg-amber-50 text-amber-700";
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3 text-xs space-y-1 min-w-[180px]">
      <p className="font-semibold text-slate-700 text-[11px] uppercase tracking-wide">{d.date}</p>
      {d.old_rate != null && (
        <p className="text-slate-500">Old rate: <span className="font-medium text-slate-700">{fmtINR(d.old_rate)}</span></p>
      )}
      <p className="text-slate-500">New rate: <span className="font-bold text-slate-800">{fmtINR(d.new_rate)}</span></p>
      {d.hike_pct != null && (
        <p className={`font-semibold ${Number(d.hike_pct) >= 0 ? "text-emerald-600" : "text-red-600"}`}>
          {Number(d.hike_pct) >= 0 ? "+" : ""}{Number(d.hike_pct).toFixed(2)}% hike
        </p>
      )}
      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBg}`}>
        {STATUS_LABEL[d.status] ?? d.status}
      </span>
      {d.notes && <p className="text-slate-400 pt-1 border-t border-slate-100 leading-snug">{d.notes}</p>}
    </div>
  );
}

// ── Hike % label above new-rate bar ──────────────────────────────────────────

function HikeLabel(props: any) {
  const { x, y, width, value } = props;
  if (value == null) return null;
  const n = Number(value);
  const color = n >= 0 ? "#059669" : "#dc2626";
  return (
    <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={10} fontWeight={600} fill={color}>
      {n >= 0 ? "+" : ""}{n.toFixed(1)}%
    </text>
  );
}

// ── Chart component ───────────────────────────────────────────────────────────

function PoRevisionChart({ revisions }: { revisions: PoRevision[] }) {
  const data: ChartPoint[] = useMemo(() => {
    return [...revisions]
      .sort((a, b) => new Date(a.revised_at).getTime() - new Date(b.revised_at).getTime())
      .map((r) => ({
        date:     format(new Date(r.revised_at), "MMM yyyy"),
        old_rate: r.old_po_rate != null ? Number(r.old_po_rate) : null,
        new_rate: Number(r.new_po_rate),
        hike_pct: r.hike_pct != null ? Number(r.hike_pct) : null,
        status:   r.status,
        notes:    r.notes ?? null,
      }));
  }, [revisions]);

  if (data.length === 0) return null;

  const allRates = data.flatMap((d) => [d.old_rate ?? d.new_rate, d.new_rate]);
  const yMin = Math.max(0, Math.floor((Math.min(...allRates) * 0.85) / 10000) * 10000);

  return (
    <div className="px-5 pt-4 pb-2">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 28, right: 24, left: 16, bottom: 4 }} barCategoryGap="30%" barGap={4}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v) => `₹${(v / 100000).toFixed(1)}L`}
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
            domain={[yMin, "auto"]}
            width={56}
          />
          <Tooltip content={<RevisionTooltip />} cursor={{ fill: "#f8fafc" }} />
          <Legend
            iconType="square"
            iconSize={10}
            formatter={(value) => <span className="text-[11px] text-slate-500">{value}</span>}
          />
          <Bar dataKey="old_rate" name="Old PO Rate" fill="#cbd5e1" radius={[3, 3, 0, 0]} maxBarSize={32} />
          <Bar dataKey="new_rate" name="New PO Rate" radius={[3, 3, 0, 0]} maxBarSize={32}>
            <LabelList dataKey="hike_pct" content={<HikeLabel />} />
            {data.map((d, i) => (
              <Cell key={i} fill={STATUS_BAR_COLOR[d.status] ?? "#0ea5e9"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-4 justify-end pb-2 pr-1">
        {(["approved", "pending_approval", "rejected"] as const).map((s) => (
          <span key={s} className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: STATUS_BAR_COLOR[s] }} />
            {STATUS_LABEL[s]}
          </span>
        ))}
      </div>
    </div>
  );
}

const COHORT_OPTIONS = ["star","high_performer","rising","bedrock","new_joiner","watch_exit","watch_rate_rev","watch_general","rescue"].map((c) => ({ label: c.replace(/_/g, " "), value: c }));
const PERF_OPTIONS   = ["top_20","mid_60","bottom_20","unrated"].map((t) => ({ label: t.replace(/_/g, " "), value: t }));
const LD_OPTIONS     = ["enrolled","not_started","completed","pending"].map((s) => ({ label: s.replace(/_/g, " "), value: s }));
const BH_OPTIONS     = ["great","good","mediocre","bad","not_given"].map((f) => ({ label: f.replace(/_/g, " "), value: f }));
const STATUS_OPTIONS = [{ label: "Active", value: "true" }, { label: "Inactive", value: "false" }];

function ConsultantDetailPage() {
  const { consultantId } = Route.useParams();
  const [consultant, setConsultant] = useState<ConsultantItem | null>(null);
  const [hrbpName, setHrbpName] = useState<string | null>(null);
  const [bhName, setBhName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Inline edit
  const [editMode, setEditMode] = useState(false);
  type EForm = {
    name: string; email: string; phone: string; manager_name: string;
    skill: string; designation: string; modality: string;
    join_date: Dayjs | null; is_active: string;
    cohort: string; perf_tier: string; nps_score: string;
    l_d_status: string; bh_feedback: string;
    monthly_po: string; monthly_ctc: string; yearly_ctc: string;
    margin: string; po_end_date: Dayjs | null;
    last_hike_pct: string; last_hike_date: Dayjs | null;
  };
  const [editForm, setEditForm] = useState<EForm>({
    name: "", email: "", phone: "", manager_name: "",
    skill: "", designation: "", modality: "",
    join_date: null, is_active: "true",
    cohort: "", perf_tier: "", nps_score: "",
    l_d_status: "", bh_feedback: "",
    monthly_po: "", monthly_ctc: "", yearly_ctc: "",
    margin: "", po_end_date: null,
    last_hike_pct: "", last_hike_date: null,
  });
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof EForm>(k: K) => (v: EForm[K]) => setEditForm((p) => ({ ...p, [k]: v }));
  const setStr = (k: keyof EForm) => (e: React.ChangeEvent<HTMLInputElement>) => setEditForm((p) => ({ ...p, [k]: e.target.value }));

  function startEdit() {
    if (!consultant) return;
    setEditForm({
      name: consultant.name ?? "",
      email: consultant.email ?? "",
      phone: consultant.phone ?? "",
      manager_name: consultant.manager_name ?? "",
      skill: consultant.skill ?? "",
      designation: consultant.designation ?? "",
      modality: consultant.modality ?? "",
      join_date: consultant.join_date ? dayjs(consultant.join_date) : null,
      is_active: consultant.is_active ? "true" : "false",
      cohort: consultant.cohort ?? "",
      perf_tier: consultant.perf_tier ?? "",
      nps_score: consultant.nps_score != null ? String(consultant.nps_score) : "",
      l_d_status: consultant.l_d_status ?? "",
      bh_feedback: consultant.bh_feedback ?? "",
      monthly_po: consultant.monthly_po != null ? String(consultant.monthly_po) : "",
      monthly_ctc: consultant.monthly_ctc != null ? String(consultant.monthly_ctc) : "",
      yearly_ctc: consultant.yearly_ctc != null ? String(consultant.yearly_ctc) : "",
      margin: consultant.margin != null ? String(consultant.margin) : "",
      po_end_date: consultant.po_end_date ? dayjs(consultant.po_end_date) : null,
      last_hike_pct: consultant.last_hike_pct != null ? String(consultant.last_hike_pct) : "",
      last_hike_date: consultant.last_hike_date ? dayjs(consultant.last_hike_date) : null,
    });
    setEditMode(true);
  }

  async function handleSave() {
    if (!consultant) return;
    try {
      setSaving(true);
      const payload: Record<string, any> = {
        name: editForm.name,
        is_active: editForm.is_active === "true",
      };
      if (editForm.email) payload.email = editForm.email;
      if (editForm.phone) payload.phone = editForm.phone;
      if (editForm.manager_name) payload.manager_name = editForm.manager_name;
      if (editForm.skill) payload.skill = editForm.skill;
      if (editForm.designation) payload.designation = editForm.designation;
      if (editForm.modality) payload.modality = editForm.modality;
      if (editForm.join_date) payload.join_date = editForm.join_date.format("YYYY-MM-DD");
      if (editForm.cohort) payload.cohort = editForm.cohort;
      if (editForm.perf_tier) payload.perf_tier = editForm.perf_tier;
      if (editForm.nps_score !== "") payload.nps_score = Number(editForm.nps_score);
      if (editForm.l_d_status) payload.l_d_status = editForm.l_d_status;
      if (editForm.bh_feedback) payload.bh_feedback = editForm.bh_feedback;
      if (editForm.monthly_po !== "") payload.monthly_po = Number(editForm.monthly_po);
      if (editForm.monthly_ctc !== "") payload.monthly_ctc = Number(editForm.monthly_ctc);
      if (editForm.yearly_ctc !== "") payload.yearly_ctc = Number(editForm.yearly_ctc);
      if (editForm.margin !== "") payload.margin = Number(editForm.margin);
      if (editForm.po_end_date) payload.po_end_date = editForm.po_end_date.format("YYYY-MM-DD");
      if (editForm.last_hike_pct !== "") payload.last_hike_pct = Number(editForm.last_hike_pct);
      if (editForm.last_hike_date) payload.last_hike_date = editForm.last_hike_date.format("YYYY-MM-DD");

      const res = await updateConsultantApi(consultant.id, payload);
      if (res.meta.status) {
        toast.success("Consultant updated successfully");
        setConsultant((prev) => prev ? { ...prev, ...res.data } : prev);
        setEditMode(false);
      } else {
        toast.error(res.meta.message || "Update failed");
      }
    } catch {
      toast.error("Update failed");
    } finally {
      setSaving(false);
    }
  }

  // PO revision history
  const [revisions, setRevisions]           = useState<PoRevision[]>([]);
  const [revTotal, setRevTotal]             = useState(0);
  const [revLoading, setRevLoading]         = useState(false);
  const [revPage, setRevPage]               = useState(0);
  const [revRowsPerPage, setRevRowsPerPage] = useState(5);
  const [allRevisions, setAllRevisions]     = useState<PoRevision[]>([]);
  const [revView, setRevView]               = useState<"chart" | "table">("table");

  const fetchRevisions = useCallback(async () => {
    setRevLoading(true);
    try {
      const resp = await listPoRevisions(Number(consultantId), revPage + 1, revRowsPerPage);
      setRevisions(resp.data ?? []);
      setRevTotal(resp.meta?.total ?? 0);
    } catch {
      // silently fail — table will show empty state
    } finally {
      setRevLoading(false);
    }
  }, [consultantId, revPage, revRowsPerPage]);

  // Fetch all revisions (unpaginated) for the chart
  const fetchAllRevisions = useCallback(async () => {
    try {
      const resp = await listPoRevisions(Number(consultantId), 1, 200);
      setAllRevisions(resp.data ?? []);
    } catch {
      // chart simply won't render
    }
  }, [consultantId]);

  useEffect(() => {
    async function fetchConsultant() {
      try {
        setLoading(true);
        const res = await getConsultantDetailsApi(Number(consultantId));
        if (!res.meta.status) {
          toast.error(res.meta.message || "Failed to load consultant details");
          return;
        }
        const c = res.data;
        setConsultant(c);

        // Resolve HRBP name and BH name in parallel
        const [hrbpRes, clientsRes] = await Promise.allSettled([
          c.hrbp_id ? getUserProfile(c.hrbp_id) : Promise.resolve(null),
          c.client_id ? getClientsApi({ page_no: 1, per_page: -1 }) : Promise.resolve(null),
        ]);

        if (hrbpRes.status === "fulfilled" && hrbpRes.value?.data?.name) {
          setHrbpName(hrbpRes.value.data.name);
        }
        if (clientsRes.status === "fulfilled" && clientsRes.value) {
          const clients = (clientsRes.value as any)?.data?.items ?? (clientsRes.value as any)?.data ?? [];
          const client = clients.find((cl: any) => cl.id === c.client_id);
          if (client?.bh_name) setBhName(client.bh_name);
        }
      } catch (err: any) {
        toast.error(err.message || "Failed to load consultant details");
      } finally {
        setLoading(false);
      }
    }
    fetchConsultant();
  }, [consultantId]);

  useEffect(() => { fetchRevisions(); }, [fetchRevisions]);
  useEffect(() => { fetchAllRevisions(); }, [fetchAllRevisions]);

  const tenureLeft = useMemo(
    () => calcTenureLeft(consultant?.po_end_date),
    [consultant?.po_end_date],
  );

  const totalPoValue = useMemo(() => {
    if (!consultant?.monthly_po || !consultant?.po_end_date) return null;
    return consultant.monthly_po * tenureLeft;
  }, [consultant?.monthly_po, consultant?.po_end_date, tenureLeft]);

  if (loading) {
    return (
      <div className="flex flex-col h-full bg-white text-slate-800">
        <TopBar title="Consultant Profile" subtitle="Loading…" />
        <main className="flex-1 overflow-y-auto p-6">
          <PageLoader message="Loading consultant details…" />
        </main>
      </div>
    );
  }

  if (!consultant) {
    return (
      <div className="flex flex-col h-full bg-white text-slate-800">
        <TopBar title="Consultant Profile" subtitle="Not Found" />
        <main className="flex-1 overflow-y-auto p-6 text-center text-slate-500 font-medium">
          Consultant not found.
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-800">
      <TopBar
        title={consultant.name || "Consultant Profile"}
        subtitle={`Employee ID: ${consultant.emp_id || "-"} · Skill: ${consultant.skill || "-"}`}
      />

      <main className="flex-1 overflow-y-auto px-6 py-5 w-full space-y-5">
        {/* Back + status */}
        <div className="flex items-center justify-between">
          <BackButton
            to={consultant.client_id ? "/clients/$clientId" : "/clients"}
            params={consultant.client_id ? { clientId: String(consultant.client_id) } : undefined}
            label={consultant.client_id ? "Back to Client Team" : "Back to Clients"}
          />
          <div className="flex items-center gap-2">
            {editMode ? (
              <>
                <Button variant="ghost" size="sm" className="gap-1.5 text-slate-500" onClick={() => setEditMode(false)} disabled={saving}>
                  <X className="h-3.5 w-3.5" /> Cancel
                </Button>
                <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={saving}>
                  {saving ? "Saving…" : "Save Changes"}
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={startEdit}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
            )}
            <Badge className={consultant.is_active
              ? "bg-emerald-100 text-emerald-800 border-emerald-200"
              : "bg-slate-100 text-slate-600 border-slate-200"}>
              {consultant.is_active ? "Active" : "Inactive"}
            </Badge>
          </div>
        </div>

        {/* Profile hero */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm px-6 py-5 flex items-center gap-5">
          <div className="h-16 w-16 bg-sky-100 text-sky-700 rounded-full flex items-center justify-center text-2xl font-bold shrink-0 border-2 border-white ring-1 ring-slate-200">
            {consultant.name?.charAt(0) || "C"}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-[#132246] leading-tight">{consultant.name}</h1>
            <p className="text-sm text-slate-500 mt-0.5">{consultant.skill || "-"} · {consultant.emp_id}</p>
          </div>
          {/* Quick finance chips */}
          {consultant.monthly_po && (
            <div className="shrink-0 flex flex-col items-end gap-1.5">
              <span className="text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-1 rounded-full">
                {fmtINR(consultant.monthly_po)}/mo PO
              </span>
              {consultant.po_end_date && (
                <span className="text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-100 px-2.5 py-1 rounded-full">
                  {tenureLeft} mo tenure left
                </span>
              )}
              {consultant.po_risk != null && consultant.po_risk > 0 && (
                <span className="text-xs font-semibold bg-red-50 text-red-700 border border-red-100 px-2.5 py-1 rounded-full">
                  Risk {fmtINR(consultant.po_risk)}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left col: Personal + Project */}
          <div className="lg:col-span-2 space-y-5">

            {/* Personal Details */}
            <Card className="shadow-sm border-slate-200">
              <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/60 px-5 py-3.5">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-[#132246]">
                  <User className="w-4 h-4 text-sky-600" />
                  Personal Details
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 py-4 grid grid-cols-2 gap-x-6 gap-y-4">
                <Field label="Email">
                  {editMode
                    ? <Input className="h-8 text-sm" value={editForm.email} onChange={setStr("email")} />
                    : consultant.email ? <a href={`mailto:${consultant.email}`} className="text-sky-600 hover:underline truncate block">{consultant.email}</a> : "-"}
                </Field>
                <Field label="Phone">
                  {editMode
                    ? <Input className="h-8 text-sm" value={editForm.phone} onChange={setStr("phone")} />
                    : consultant.phone ? <a href={`tel:${consultant.phone}`} className="text-sky-600 hover:underline">{consultant.phone}</a> : "-"}
                </Field>
                <Field label="Skill">
                  {editMode ? <Input className="h-8 text-sm" value={editForm.skill} onChange={setStr("skill")} /> : consultant.skill || "-"}
                </Field>
                <Field label="Join Date">
                  {editMode
                    ? <CustomDatePicker value={editForm.join_date} onChange={set("join_date")} />
                    : formatDate(consultant.join_date)}
                </Field>
                <Field label="HRBP">{hrbpName || consultant.hrbp_name || "-"}</Field>
                <Field label="Business Head">{bhName || consultant.bh_name || "-"}</Field>
              </CardContent>
            </Card>

            {/* Project Information */}
            <Card className="shadow-sm border-slate-200">
              <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/60 px-5 py-3.5">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-[#132246]">
                  <Briefcase className="w-4 h-4 text-sky-600" />
                  Project Information
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 py-4 grid grid-cols-2 gap-x-6 gap-y-4">
                <Field label="Manager Name">
                  {editMode ? <Input className="h-8 text-sm" value={editForm.manager_name} onChange={setStr("manager_name")} /> : consultant.manager_name || "-"}
                </Field>
                <Field label="Modality">
                  {editMode ? <Input className="h-8 text-sm" value={editForm.modality} onChange={setStr("modality")} /> : consultant.modality || "-"}
                </Field>
                <Field label="Designation">
                  {editMode ? <Input className="h-8 text-sm" value={editForm.designation} onChange={setStr("designation")} /> : consultant.designation || "-"}
                </Field>
                <Field label="Cohort">
                  {editMode
                    ? <CustomSelect value={editForm.cohort} onChange={set("cohort")} options={COHORT_OPTIONS} placeholder="Select cohort" />
                    : consultant.cohort ? <Badge variant="outline" className={`capitalize text-xs ${COHORT_COLOR[consultant.cohort] ?? "bg-slate-100 text-slate-700"}`}>{consultant.cohort.replace(/_/g, " ")}</Badge> : "-"}
                </Field>
                <Field label="Performance Tier">
                  {editMode
                    ? <CustomSelect value={editForm.perf_tier} onChange={set("perf_tier")} options={PERF_OPTIONS} placeholder="Select tier" />
                    : consultant.perf_tier ? <Badge variant="outline" className={`capitalize text-xs ${PERF_COLOR[consultant.perf_tier] ?? "bg-slate-100 text-slate-600"}`}>{consultant.perf_tier.replace(/_/g, " ")}</Badge> : "-"}
                </Field>
                <Field label="NPS Score">
                  {editMode
                    ? <Input className="h-8 text-sm" type="number" min={0} max={10} value={editForm.nps_score} onChange={setStr("nps_score")} />
                    : consultant.nps_score != null ? <span className="text-sky-700 font-bold text-base">{consultant.nps_score}<span className="text-xs font-normal text-slate-400"> / 10</span></span> : "-"}
                </Field>
                <Field label="L&D Status">
                  {editMode
                    ? <CustomSelect value={editForm.l_d_status} onChange={set("l_d_status")} options={LD_OPTIONS} placeholder="Select" />
                    : consultant.l_d_status ? <Badge variant="outline" className={`capitalize text-xs ${LD_COLOR[consultant.l_d_status] ?? "bg-slate-100 text-slate-600"}`}>{consultant.l_d_status.replace(/_/g, " ")}</Badge> : "-"}
                </Field>
                <Field label="BH Feedback">
                  {editMode
                    ? <CustomSelect value={editForm.bh_feedback} onChange={set("bh_feedback")} options={BH_OPTIONS} placeholder="Select" />
                    : consultant.bh_feedback ? <span className="capitalize">{consultant.bh_feedback.replace(/_/g, " ")}</span> : "-"}
                </Field>
              </CardContent>
            </Card>
          </div>

          {/* Right col: Financials */}
          <div className="space-y-5">
            <Card className="shadow-sm border-slate-200">
              <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/60 px-5 py-3.5">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-[#132246]">
                  <IndianRupee className="w-4 h-4 text-sky-600" />
                  Financials
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 py-4 space-y-3">
                {editMode ? (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                    <Field label="Monthly PO">
                      <Input className="h-8 text-sm" type="number" value={editForm.monthly_po} onChange={setStr("monthly_po")} />
                    </Field>
                    <Field label="Monthly CTC">
                      <Input className="h-8 text-sm" type="number" value={editForm.monthly_ctc} onChange={setStr("monthly_ctc")} />
                    </Field>
                    <Field label="Yearly CTC">
                      <Input className="h-8 text-sm" type="number" value={editForm.yearly_ctc} onChange={setStr("yearly_ctc")} />
                    </Field>
                    <Field label="Margin">
                      <Input className="h-8 text-sm" type="number" value={editForm.margin} onChange={setStr("margin")} />
                    </Field>
                    <Field label="PO End Date">
                      <CustomDatePicker value={editForm.po_end_date} onChange={set("po_end_date")} />
                    </Field>
                    <Field label="Last Hike %">
                      <Input className="h-8 text-sm" type="number" value={editForm.last_hike_pct} onChange={setStr("last_hike_pct")} />
                    </Field>
                    <Field label="Last Hike Date">
                      <CustomDatePicker value={editForm.last_hike_date} onChange={set("last_hike_date")} />
                    </Field>
                    <Field label="Status">
                      <CustomSelect value={editForm.is_active} onChange={set("is_active")} options={STATUS_OPTIONS} />
                    </Field>
                  </div>
                ) : (
                  <>
                    <FinTile label="Monthly PO Rate" value={consultant.monthly_po ? fmtINR(consultant.monthly_po) : "-"} accent="blue" />
                    <FinTile label="Total PO at Risk" value={totalPoValue != null && totalPoValue > 0 ? fmtINR(totalPoValue) : "-"} accent={totalPoValue ? "red" : "slate"} />
                    <FinTile label="Monthly CTC" value={consultant.monthly_ctc ? fmtINR(consultant.monthly_ctc) : "-"} accent="slate" />
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1 text-amber-500">
                          <Clock className="w-3 h-3" />
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600">Tenure Left</p>
                        </div>
                        <p className="text-sm font-bold text-amber-700">{consultant.po_end_date ? `${tenureLeft} mo` : "-"}</p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">PO End Date</p>
                        <p className="text-sm font-medium text-slate-800">{formatDate(consultant.po_end_date)}</p>
                      </div>
                    </div>
                    {consultant.po_risk != null && consultant.po_risk > 0 && (
                      <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
                        <TrendingDown className="w-4 h-4 text-red-500 shrink-0" />
                        <div>
                          <p className="text-[11px] font-semibold text-red-500 uppercase tracking-wide">PO Risk Amount</p>
                          <p className="text-sm font-bold text-red-700">{fmtINR(consultant.po_risk)}</p>
                        </div>
                      </div>
                    )}
                    {(consultant.last_hike_pct || consultant.last_hike_date) && (
                      <div className="pt-2 border-t border-slate-100 space-y-0.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Last Hike</p>
                        <p className="text-sm font-medium text-slate-800">
                          {consultant.last_hike_pct ? `${consultant.last_hike_pct}%` : "-"}
                          {consultant.last_hike_date && <span className="text-xs text-slate-400 ml-1.5">({formatDate(consultant.last_hike_date)})</span>}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Timestamps — de-emphasised */}
            <p className="text-[11px] text-slate-400 px-1 space-y-0.5">
              <span className="block">Created: {formatDate(consultant.created_at)}</span>
              <span className="block">Updated: {formatDate(consultant.updated_at)}</span>
            </p>
          </div>
        </div>

        {/* PO Revision History */}
        <Card className="shadow-sm border-slate-200">
          <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/60 px-5 py-3.5">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-[#132246]">
                <History className="w-4 h-4 text-sky-600" />
                PO Revision History
              </CardTitle>
              {allRevisions.length > 0 && (
                <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
                  <button
                    onClick={() => setRevView("chart")}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      revView === "chart"
                        ? "bg-white text-slate-800 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    <BarChart2 className="w-3.5 h-3.5" />
                    Chart
                  </button>
                  <button
                    onClick={() => setRevView("table")}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      revView === "table"
                        ? "bg-white text-slate-800 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    <Table2 className="w-3.5 h-3.5" />
                    Table
                  </button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {revView === "chart" && allRevisions.length > 0 && (
              <PoRevisionChart revisions={allRevisions} />
            )}
            {revView === "table" && (
              <>
                <Table>
                  <TableHeader className="bg-slate-100 border-b border-slate-200">
                    <TableRow className="hover:bg-transparent border-0">
                      <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-5">Revised On</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Old PO Rate</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">New PO Rate</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Hike %</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Ticket #</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {revLoading ? (
                      <TableLoader colSpan={7} />
                    ) : revisions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-40 text-center text-slate-400">
                          <div className="flex justify-center">
                            <LottieIcon src="/json/searching-jobs.json" size={80} />
                          </div>
                          <p className="font-medium -mt-1">No PO revisions recorded yet</p>
                          <p className="text-xs mt-1">Revisions will appear here once a rate change is logged via a ticket.</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      revisions.map((r) => (
                        <TableRow key={r.id} className="hover:bg-slate-50 transition-colors">
                          <TableCell className="text-xs font-medium text-slate-800 px-5">
                            {formatDate(r.revised_at)}
                          </TableCell>
                          <TableCell className="text-xs text-slate-600">
                            {r.old_po_rate != null ? fmtINR(Number(r.old_po_rate)) : "—"}
                          </TableCell>
                          <TableCell className="text-xs font-semibold text-slate-800">
                            {fmtINR(Number(r.new_po_rate))}
                          </TableCell>
                          <TableCell className="text-xs">
                            {r.hike_pct != null ? (
                              <span className={Number(r.hike_pct) >= 0 ? "text-emerald-600 font-semibold" : "text-red-600 font-semibold"}>
                                {Number(r.hike_pct) >= 0 ? "+" : ""}{Number(r.hike_pct).toFixed(2)}%
                              </span>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="text-xs font-mono text-sky-600">
                            {r.ticket_number ?? "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-xs font-semibold ${STATUS_STYLE[r.status] ?? ""}`}>
                              {STATUS_LABEL[r.status] ?? r.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-slate-500 max-w-[160px] truncate">{r.notes ?? "—"}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                {revTotal > revRowsPerPage && (
                  <div className="flex justify-center py-3 border-t border-slate-100">
                    <CustomTablePagination
                      rowsPerPageOptions={[5, 10, 25]}
                      count={revTotal}
                      rowsPerPage={revRowsPerPage}
                      page={revPage}
                      onPageChange={(_: React.MouseEvent<HTMLButtonElement> | null, p: number) => setRevPage(p)}
                      onRowsPerPageChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setRevRowsPerPage(parseInt(e.target.value, 10)); setRevPage(0); }}
                    />
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </main>

    </div>
  );
}
