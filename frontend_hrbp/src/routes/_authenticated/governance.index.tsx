import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { TopBar } from "@/components/TopBar";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { Search, BarChart3, ChevronRight, Loader2 } from "lucide-react";
import { TableLoader } from "@/components/Loader";
import { getConsultantsApi } from "@/apiService/api";
import { getScoreSummary, type ScoreSummary } from "@/apiService/governanceApi";
import type { ConsultantItem } from "@/apiService/types";
import { toast } from "react-toastify";

export const Route = createFileRoute("/_authenticated/governance/")({
  component: GovernancePage,
});

// ── Grade helpers ─────────────────────────────────────────────────────────────

function gradeBadgeClass(tone: string) {
  switch (tone) {
    case "success":  return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "info":     return "bg-blue-100 text-blue-800 border-blue-200";
    case "warning":  return "bg-amber-100 text-amber-800 border-amber-200";
    case "danger":   return "bg-rose-100 text-rose-800 border-rose-200";
    case "critical": return "bg-red-200 text-red-900 border-red-300";
    default:         return "bg-slate-100 text-slate-600 border-slate-200";
  }
}

function scoreBarColor(tone: string) {
  switch (tone) {
    case "success":  return "bg-emerald-500";
    case "info":     return "bg-blue-500";
    case "warning":  return "bg-amber-500";
    default:         return "bg-rose-500";
  }
}

// ── Score cell (lazy fetches per consultant) ──────────────────────────────────

function ScoreCell({ consultantId }: { consultantId: number }) {
  const [summary, setSummary] = useState<ScoreSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getScoreSummary(consultantId)
      .then((s) => { if (!cancelled) setSummary(s); })
      .catch(() => { if (!cancelled) setSummary(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [consultantId]);

  if (loading) return <span className="text-slate-400 text-xs">Loading…</span>;
  if (!summary) return <span className="text-slate-400 text-xs">–</span>;

  const pct = Math.round((summary.total_score / summary.total_possible) * 100);
  return (
    <div className="flex items-center gap-2 min-w-[140px]">
      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full rounded-full ${scoreBarColor(summary.tone)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">
        {summary.total_score}<span className="text-slate-400 font-normal">/100</span>
      </span>
      <Badge className={`text-[11px] px-1.5 py-0 ${gradeBadgeClass(summary.tone)}`}>
        {summary.grade}
      </Badge>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function GovernancePage() {
  const [consultants, setConsultants] = useState<ConsultantItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("active");

  const fetchConsultants = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getConsultantsApi({
        per_page: -1,
        is_active: statusFilter === "all" ? undefined : statusFilter === "active",
      });
      setConsultants(res.data ?? []);
    } catch {
      toast.error("Failed to load consultants");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchConsultants(); }, [fetchConsultants]);

  const filtered = consultants.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      c.emp_id?.toLowerCase().includes(q) ||
      c.skill?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Governance Score" subtitle="AI-powered consultant performance scoring" />

      <div className="flex-1 overflow-auto p-6 space-y-4">
        {/* Header card */}
        <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-5 flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
            <BarChart3 className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800">Consultant Governance Scores</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Scores start at 100 and update via AI-analysed HRBP comments. Click a consultant to view details and add observations.
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search by name, emp ID, skill…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-36 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-slate-500 ml-auto">{filtered.length} consultant{filtered.length !== 1 ? "s" : ""}</span>
        </div>

        {/* Table */}
        <div className="rounded-lg overflow-x-auto border border-slate-200 bg-white shadow-sm">
          <Table className="min-w-max">
            <TableHeader className="bg-slate-100 border-b border-slate-200">
              <TableRow className="hover:bg-transparent border-0">
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Emp ID</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Name</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Skill</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Governance Score</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableLoader colSpan={6} />
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-slate-500 font-medium">
                    No consultants found
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((c) => (
                  <TableRow key={c.id} className="hover:bg-slate-50 transition-colors">
                    <TableCell className="text-sm text-slate-600">{c.emp_id || "–"}</TableCell>
                    <TableCell className="font-medium text-slate-900">{c.name || "–"}</TableCell>
                    <TableCell className="text-sm text-slate-500">{c.skill || "–"}</TableCell>
                    <TableCell>
                      {c.is_active ? (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Active</Badge>
                      ) : (
                        <Badge className="bg-slate-100 text-slate-600 border-slate-200">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <ScoreCell consultantId={c.id} />
                    </TableCell>
                    <TableCell>
                      <Link to="/governance/$consultantId" params={{ consultantId: String(c.id) }}>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-blue-600 hover:bg-blue-50">
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
