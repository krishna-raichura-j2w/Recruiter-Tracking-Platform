import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { TopBar } from "@/components/TopBar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, User, Briefcase, IndianRupee } from "lucide-react";
import { getConsultantDetailsApi } from "@/apiService/api";
import type { ConsultantItem } from "@/apiService/types";
import { toast } from "react-toastify";
import { format } from "date-fns";
import { fmtINR } from "@/lib/mockData";

export const Route = createFileRoute("/_authenticated/consultants/$consultantId")({
  component: ConsultantDetailPage,
});

function ConsultantDetailPage() {
  const { consultantId } = Route.useParams();
  const [consultant, setConsultant] = useState<ConsultantItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchConsultant() {
      try {
        setLoading(true);
        const res = await getConsultantDetailsApi(Number(consultantId));
        if (res.meta.status) {
          setConsultant(res.data);
        } else {
          toast.error(res.meta.message || "Failed to load consultant details");
        }
      } catch (err: any) {
        toast.error(err.message || "Failed to load consultant details");
      } finally {
        setLoading(false);
      }
    }
    fetchConsultant();
  }, [consultantId]);

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "-";
    try {
      return format(new Date(dateStr), "MMM dd, yyyy");
    } catch {
      return dateStr;
    }
  };

  const formatDateTime = (dateStr: string | null | undefined) => {
    if (!dateStr) return "-";
    try {
      return format(new Date(dateStr), "MMM dd, yyyy, hh:mm a");
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen">
        <TopBar title="Consultant Profile" subtitle="Loading consultant details..." />
        <main className="flex-1 p-6 flex justify-center items-center">
          <div className="text-slate-500 font-medium">Loading...</div>
        </main>
      </div>
    );
  }

  if (!consultant) {
    return (
      <div className="flex flex-col min-h-screen">
        <TopBar title="Consultant Profile" subtitle="Not Found" />
        <main className="flex-1 p-6">
          <div className="text-slate-500 font-medium text-center">Consultant not found.</div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <TopBar
        title={consultant.name || "Consultant Profile"}
        subtitle={`Employee ID: ${consultant.emp_id || "-"} · Skill: ${consultant.skill || "-"}`}
      />
      
      <main className="flex-1 p-6 space-y-6 max-w-7xl mx-auto w-full">
        <div className="flex items-center justify-between">
          <Link
            to={consultant.client_id ? "/clients/$clientId" : "/clients"}
            params={{ clientId: String(consultant.client_id) }}
            className="text-slate-500 hover:text-slate-900 flex items-center gap-2 text-sm font-medium transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> 
            Back to {consultant.client_id ? "Client Team" : "Clients"}
          </Link>
          
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-500">Status:</span>
            {consultant.is_active ? (
              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Active</Badge>
            ) : (
              <Badge className="bg-slate-100 text-slate-600 border-slate-200">Inactive</Badge>
            )}
          </div>
        </div>

        <div className="max-w-3xl mx-auto space-y-8 pb-10">
          {/* Profile Header */}
          <div className="flex flex-col items-center pt-4">
            <div className="h-24 w-24 bg-sky-100 text-sky-700 rounded-full flex items-center justify-center text-3xl font-bold mb-4 shadow-sm border-4 border-white ring-1 ring-slate-200">
              {consultant.name?.charAt(0) || "C"}
            </div>
            <h1 className="text-3xl font-bold text-[#132246]">{consultant.name || "Consultant"}</h1>
            <p className="text-slate-500 font-medium mt-1">{consultant.skill || "-"} • {consultant.emp_id || "-"}</p>
          </div>

          <div className="flex flex-col gap-6">
          {/* Personal Information */}
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/50">
              <CardTitle className="text-base font-semibold flex items-center gap-2 text-[#132246]">
                <User className="w-4 h-4 text-sky-600" />
                Personal Details
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">Email</p>
                <p className="text-sm font-medium text-slate-900">{consultant.email || "-"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">Phone</p>
                <p className="text-sm font-medium text-slate-900">{consultant.phone || "-"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">Manager Name</p>
                <p className="text-sm font-medium text-slate-900">{consultant.manager_name || "-"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">Join Date</p>
                <p className="text-sm font-medium text-slate-900">{formatDate(consultant.join_date)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">System Timestamps</p>
                <p className="text-xs text-slate-500">Created: {formatDateTime(consultant.created_at)}</p>
                <p className="text-xs text-slate-500">Updated: {formatDateTime(consultant.updated_at)}</p>
              </div>
            </CardContent>
          </Card>

          {/* Work Information */}
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/50">
              <CardTitle className="text-base font-semibold flex items-center gap-2 text-[#132246]">
                <Briefcase className="w-4 h-4 text-sky-600" />
                Project Information
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">Modality</p>
                <p className="text-sm font-medium text-slate-900">{consultant.modality || "-"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">Cohort</p>
                <Badge variant="outline" className="bg-slate-50 text-slate-700 capitalize">
                  {(consultant.cohort || "-").replace(/_/g, " ")}
                </Badge>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">Performance Tier</p>
                <p className="text-sm font-medium text-slate-900 capitalize">
                  {(consultant.perf_tier || "-").replace(/_/g, " ")}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">NPS Score</p>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-sky-700">{consultant.nps_score ?? "-"}</span>
                  <span className="text-xs text-slate-500">/ 10</span>
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">L&D Status</p>
                <Badge variant="outline" className="capitalize text-slate-700">{consultant.l_d_status || "-"}</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Financial Information */}
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/50">
              <CardTitle className="text-base font-semibold flex items-center gap-2 text-[#132246]">
                <IndianRupee className="w-4 h-4 text-sky-600" />
                Financials
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <div className="bg-sky-50 rounded-lg p-3 border border-sky-100">
                <p className="text-xs font-medium text-sky-800 mb-1">Monthly PO Value</p>
                <p className="text-lg font-bold text-sky-900">{consultant.monthly_po ? fmtINR(consultant.monthly_po) : "-"}</p>
              </div>
              
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                <p className="text-xs font-medium text-slate-600 mb-1">Monthly CTC</p>
                <p className="text-base font-semibold text-slate-800">{consultant.monthly_ctc ? fmtINR(consultant.monthly_ctc) : "-"}</p>
              </div>

              <div className="pt-2">
                <p className="text-xs font-medium text-slate-500 mb-1">PO End Date</p>
                <p className="text-sm font-medium text-slate-900">{formatDate(consultant.po_end_date)}</p>
              </div>
              
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">Last Hike</p>
                <p className="text-sm font-medium text-slate-900">
                  {consultant.last_hike_pct ? `${consultant.last_hike_pct}%` : "-"}
                  <span className="text-slate-500 ml-2 font-normal text-xs">
                    {consultant.last_hike_date ? `(${formatDate(consultant.last_hike_date)})` : ""}
                  </span>
                </p>
              </div>
            </CardContent>
          </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
