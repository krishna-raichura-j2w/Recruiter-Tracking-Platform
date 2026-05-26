import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { TopBar } from "@/components/TopBar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Briefcase, IndianRupee, Clock, TrendingDown } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { getConsultantDetailsApi, getUserProfile, getClientsApi } from "@/apiService/api";
import type { ConsultantItem } from "@/apiService/types";
import { toast } from "react-toastify";
import { format } from "date-fns";
import { fmtINR } from "@/lib/mockData";
import { PageLoader } from "@/components/Loader";

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

function ConsultantDetailPage() {
  const { consultantId } = Route.useParams();
  const [consultant, setConsultant] = useState<ConsultantItem | null>(null);
  const [hrbpName, setHrbpName] = useState<string | null>(null);
  const [bhName, setBhName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
      <div className="flex flex-col min-h-screen bg-white text-slate-800">
        <TopBar title="Consultant Profile" subtitle="Loading…" />
        <main className="flex-1 p-6">
          <PageLoader message="Loading consultant details…" />
        </main>
      </div>
    );
  }

  if (!consultant) {
    return (
      <div className="flex flex-col min-h-screen bg-white text-slate-800">
        <TopBar title="Consultant Profile" subtitle="Not Found" />
        <main className="flex-1 p-6 text-center text-slate-500 font-medium">
          Consultant not found.
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 text-slate-800">
      <TopBar
        title={consultant.name || "Consultant Profile"}
        subtitle={`Employee ID: ${consultant.emp_id || "-"} · Skill: ${consultant.skill || "-"}`}
      />

      <main className="flex-1 px-6 py-5 w-full space-y-5">
        {/* Back + status */}
        <div className="flex items-center justify-between">
          <BackButton
            to={consultant.client_id ? "/clients/$clientId" : "/clients"}
            params={consultant.client_id ? { clientId: String(consultant.client_id) } : undefined}
            label={consultant.client_id ? "Back to Client Team" : "Back to Clients"}
          />
          <Badge className={consultant.is_active
            ? "bg-emerald-100 text-emerald-800 border-emerald-200"
            : "bg-slate-100 text-slate-600 border-slate-200"}>
            {consultant.is_active ? "Active" : "Inactive"}
          </Badge>
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
                  {consultant.email
                    ? <a href={`mailto:${consultant.email}`} className="text-sky-600 hover:underline truncate block">{consultant.email}</a>
                    : "-"}
                </Field>
                <Field label="Phone">
                  {consultant.phone
                    ? <a href={`tel:${consultant.phone}`} className="text-sky-600 hover:underline">{consultant.phone}</a>
                    : "-"}
                </Field>
                <Field label="Skill">{consultant.skill || "-"}</Field>
                <Field label="Join Date">{formatDate(consultant.join_date)}</Field>
                <Field label="HRBP">
                  {hrbpName || consultant.hrbp_name || "-"}
                </Field>
                <Field label="Business Head">
                  {bhName || consultant.bh_name || "-"}
                </Field>
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
                <Field label="Manager Name">{consultant.manager_name || "-"}</Field>
                <Field label="Modality">{consultant.modality || "-"}</Field>
                <Field label="Cohort">
                  {consultant.cohort
                    ? <Badge variant="outline" className={`capitalize text-xs ${COHORT_COLOR[consultant.cohort] ?? "bg-slate-100 text-slate-700"}`}>
                        {consultant.cohort.replace(/_/g, " ")}
                      </Badge>
                    : "-"}
                </Field>
                <Field label="Performance Tier">
                  {consultant.perf_tier
                    ? <Badge variant="outline" className={`capitalize text-xs ${PERF_COLOR[consultant.perf_tier] ?? "bg-slate-100 text-slate-600"}`}>
                        {consultant.perf_tier.replace(/_/g, " ")}
                      </Badge>
                    : "-"}
                </Field>
                <Field label="NPS Score">
                  {consultant.nps_score != null
                    ? <span className="text-sky-700 font-bold text-base">{consultant.nps_score}<span className="text-xs font-normal text-slate-400"> / 10</span></span>
                    : "-"}
                </Field>
                <Field label="L&D Status">
                  {consultant.l_d_status
                    ? <Badge variant="outline" className={`capitalize text-xs ${LD_COLOR[consultant.l_d_status] ?? "bg-slate-100 text-slate-600"}`}>
                        {consultant.l_d_status.replace(/_/g, " ")}
                      </Badge>
                    : "-"}
                </Field>
                <Field label="BH Feedback">
                  {consultant.bh_feedback
                    ? <span className="capitalize">{consultant.bh_feedback.replace(/_/g, " ")}</span>
                    : "-"}
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
                <FinTile
                  label="Monthly PO Rate"
                  value={consultant.monthly_po ? fmtINR(consultant.monthly_po) : "-"}
                  accent="blue"
                />
                <FinTile
                  label="Total PO at Risk"
                  value={totalPoValue != null && totalPoValue > 0 ? fmtINR(totalPoValue) : "-"}
                  accent={totalPoValue ? "red" : "slate"}
                />
                <FinTile
                  label="Monthly CTC"
                  value={consultant.monthly_ctc ? fmtINR(consultant.monthly_ctc) : "-"}
                  accent="slate"
                />

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1 text-amber-500">
                      <Clock className="w-3 h-3" />
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600">Tenure Left</p>
                    </div>
                    <p className="text-sm font-bold text-amber-700">
                      {consultant.po_end_date ? `${tenureLeft} mo` : "-"}
                    </p>
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
                      {consultant.last_hike_date && (
                        <span className="text-xs text-slate-400 ml-1.5">({formatDate(consultant.last_hike_date)})</span>
                      )}
                    </p>
                  </div>
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
      </main>
    </div>
  );
}
