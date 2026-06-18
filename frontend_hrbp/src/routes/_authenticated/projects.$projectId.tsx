import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { TopBar } from "@/components/TopBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  ArrowLeft,
  Users,
  Send,
  Loader2,
  MessageSquare,
  History,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  Trash2,
  UserPlus,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Settings2,
  Pencil,
  AlertTriangle,
  Sliders,
  Check,
  GripVertical,
  X,
  Plus,
} from "lucide-react";
import { getConsultantsApi } from "@/apiService/api";
import {
  getProject,
  listMembers,
  addMember,
  updateMember,
  removeMember,
  analyzeTeamComment,
  getProjectCommentHistory,
  updateProject,
  deleteProject,
  getProjectKpis,
  setProjectKpis,
  type ProjectSummary,
  type ProjectMember,
  type TeamCommentResult,
  type ProjectCommentHistory,
  type ProjectKpiDefinition,
  type Cohort,
  type PerfTier,
} from "@/apiService/projectApi";
import { getFullScores, type ScoreEntry } from "@/apiService/governanceApi";
import type { ConsultantItem } from "@/apiService/types";
import { toast } from "react-toastify";

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  component: ProjectDetailPage,
});

// ── Constants ─────────────────────────────────────────────────────────────────

const COHORTS: { value: Cohort; label: string; color: string }[] = [
  { value: "star",            label: "Star",            color: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  { value: "high_performer",  label: "High Performer",  color: "bg-green-100 text-green-800 border-green-200"   },
  { value: "rising",          label: "Rising",          color: "bg-blue-100 text-blue-700 border-blue-200"      },
  { value: "bedrock",         label: "Bedrock",         color: "bg-slate-100 text-slate-600 border-slate-200"   },
  { value: "new_joiner",      label: "New Joiner",      color: "bg-sky-100 text-sky-700 border-sky-200"         },
  { value: "watch",           label: "Watch",           color: "bg-amber-100 text-amber-800 border-amber-200"   },
  { value: "rescue",          label: "Rescue",          color: "bg-red-100 text-red-800 border-red-200"         },
];

const PERF_TIERS: { value: PerfTier; label: string }[] = [
  { value: "top_20",    label: "Top 20%"    },
  { value: "middle",    label: "Middle"     },
  { value: "bottom_20", label: "Bottom 20%" },
];

function cohortStyle(cohort: Cohort) {
  return COHORTS.find((c) => c.value === cohort)?.color ?? "bg-slate-100 text-slate-600";
}

function cohortLabel(cohort: Cohort) {
  return COHORTS.find((c) => c.value === cohort)?.label ?? cohort;
}

function perfTierLabel(tier: PerfTier) {
  return PERF_TIERS.find((t) => t.value === tier)?.label ?? tier;
}

function perfTierColor(tier: PerfTier) {
  if (tier === "top_20")    return "text-emerald-600";
  if (tier === "bottom_20") return "text-rose-600";
  return "text-slate-500";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function gradeBadgeClass(tone: string) {
  const m: Record<string, string> = {
    success:  "bg-emerald-100 text-emerald-800 border-emerald-200",
    info:     "bg-blue-100 text-blue-800 border-blue-200",
    warning:  "bg-amber-100 text-amber-800 border-amber-200",
    danger:   "bg-rose-100 text-rose-800 border-rose-200",
    critical: "bg-red-200 text-red-900 border-red-300",
  };
  return m[tone] ?? "bg-slate-100 text-slate-600";
}

function barColorClass(tone: string) {
  const m: Record<string, string> = {
    success:  "bg-emerald-500",
    info:     "bg-blue-500",
    warning:  "bg-amber-500",
    danger:   "bg-rose-500",
    critical: "bg-red-600",
  };
  return m[tone] ?? "bg-slate-400";
}

function govScoreColorClass(tone: string) {
  const m: Record<string, string> = {
    success:  "text-emerald-700",
    info:     "text-blue-700",
    warning:  "text-amber-700",
    danger:   "text-rose-700",
    critical: "text-red-800",
  };
  return m[tone] ?? "text-slate-700";
}

function formatRelative(iso: string | null | undefined) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
}

// ── Add Member Dialog ─────────────────────────────────────────────────────────

function AddMemberDialog({
  open,
  onOpenChange,
  projectId,
  existingIds,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: number;
  existingIds: number[];
  onAdded: () => void;
}) {
  const [allConsultants, setAllConsultants] = useState<ConsultantItem[]>([]);
  const [search, setSearch]               = useState("");
  const [selectedId, setSelectedId]       = useState<number | null>(null);
  const [cohort, setCohort]               = useState<Cohort>("bedrock");
  const [perfTier, setPerfTier]           = useState<PerfTier>("middle");
  const [role, setRole]                   = useState("");
  const [loading, setLoading]             = useState(false);
  const [saving, setSaving]               = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getConsultantsApi({ per_page: -1 })
      .then((r) => setAllConsultants(r.data ?? []))
      .catch(() => toast.error("Failed to load consultants"))
      .finally(() => setLoading(false));
  }, [open]);

  const available = allConsultants.filter(
    (c) =>
      !existingIds.includes(c.id) &&
      (c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.emp_id ?? "").toLowerCase().includes(search.toLowerCase())),
  );

  const handleAdd = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await addMember(projectId, { consultant_id: selectedId, cohort, perf_tier: perfTier, role_in_project: role });
      toast.success("Member added");
      onAdded();
      onOpenChange(false);
      setSelectedId(null); setSearch(""); setCohort("bedrock"); setPerfTier("middle"); setRole("");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to add member");
    } finally {
      setSaving(false);
    }
  };

  const selected = allConsultants.find((c) => c.id === selectedId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-blue-500" />
            Add Team Member
          </DialogTitle>
        </DialogHeader>

        {/* Search consultant */}
        <div className="space-y-2">
          <Label className="text-xs">Search Consultant</Label>
          <Input
            placeholder="Name or Emp ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-sm"
          />
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
            </div>
          ) : (
            <div className="max-h-44 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-50">
              {available.slice(0, 20).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 transition-colors ${
                    selectedId === c.id ? "bg-blue-50" : ""
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{c.name}</p>
                    <p className="text-xs text-slate-400">{c.emp_id} • {c.skill}</p>
                  </div>
                  {selectedId === c.id && (
                    <div className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                  )}
                </button>
              ))}
              {available.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-4">No consultants found</p>
              )}
            </div>
          )}
        </div>

        {/* Cohort + Tier + Role */}
        {selected && (
          <div className="space-y-3 pt-1 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Assignment for {selected.name}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Cohort Badge</Label>
                <Select value={cohort} onValueChange={(v) => setCohort(v as Cohort)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COHORTS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Performance Tier</Label>
                <Select value={perfTier} onValueChange={(v) => setPerfTier(v as PerfTier)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PERF_TIERS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Role in Project <span className="text-slate-400">(optional)</span></Label>
              <Input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. Tech Lead, Frontend Developer…"
                className="h-8 text-sm"
              />
            </div>
          </div>
        )}

        <Button
          onClick={handleAdd}
          disabled={!selectedId || saving}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <UserPlus className="h-4 w-4 mr-1.5" />}
          Add to Project
        </Button>
      </DialogContent>
    </Dialog>
  );
}

// ── Member Row ────────────────────────────────────────────────────────────────

function MemberRow({
  member,
  projectId,
  onUpdated,
  onRemoved,
  onNavigate,
}: {
  member: ProjectMember;
  projectId: number;
  onUpdated: () => void;
  onRemoved: () => void;
  onNavigate: () => void;
}) {
  const [editing, setEditing]           = useState(false);
  const [cohort, setCohort]             = useState<Cohort>(member.cohort);
  const [tier, setTier]                 = useState<PerfTier>(member.perf_tier);
  const [saving, setSaving]             = useState(false);
  const [removing, setRemoving]         = useState(false);
  const [kpiExpanded, setKpiExpanded]   = useState(false);
  const [kpiScores, setKpiScores]       = useState<ScoreEntry[] | null>(null);
  const [kpiLoading, setKpiLoading]     = useState(false);

  const govPct = member.gov_possible > 0
    ? Math.round((member.gov_score / member.gov_possible) * 100)
    : 0;

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateMember(projectId, member.consultant_id, { cohort, perf_tier: tier });
      toast.success("Updated");
      setEditing(false);
      onUpdated();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await removeMember(projectId, member.consultant_id);
      toast.success(`${member.name} removed`);
      onRemoved();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to remove");
    } finally {
      setRemoving(false);
    }
  };

  const handleToggleKpis = async () => {
    if (kpiExpanded) { setKpiExpanded(false); return; }
    setKpiExpanded(true);
    if (kpiScores !== null) return;
    setKpiLoading(true);
    try {
      const full = await getFullScores(member.consultant_id);
      setKpiScores(full.scores);
    } catch {
      toast.error("Failed to load KPIs");
    } finally {
      setKpiLoading(false);
    }
  };

  return (
    <>
    <tr className="group hover:bg-slate-50 transition-colors">
      <td className="px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">{member.name}</p>
          <p className="text-xs text-slate-400">{member.emp_id}</p>
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-slate-500">{member.skill || "—"}</td>
      <td className="px-4 py-3">
        {editing ? (
          <Select value={cohort} onValueChange={(v) => setCohort(v as Cohort)}>
            <SelectTrigger className="h-7 text-xs w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COHORTS.map((c) => (
                <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Badge className={`text-[11px] px-2 py-0.5 border font-semibold ${cohortStyle(member.cohort)}`}>
            {cohortLabel(member.cohort)}
          </Badge>
        )}
      </td>
      <td className="px-4 py-3">
        {editing ? (
          <Select value={tier} onValueChange={(v) => setTier(v as PerfTier)}>
            <SelectTrigger className="h-7 text-xs w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERF_TIERS.map((t) => (
                <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className={`text-xs font-semibold ${perfTierColor(member.perf_tier)}`}>
            {perfTierLabel(member.perf_tier)}
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold ${govScoreColorClass(member.gov_tone)}`}>
            {member.gov_score}
            <span className="text-xs text-slate-400 font-normal">/{member.gov_possible}</span>
          </span>
          <span className="text-[10px] text-slate-400">{govPct}%</span>
          <Badge className={`text-[10px] px-1.5 border ml-1 ${gradeBadgeClass(member.gov_tone)}`}>
            {member.gov_grade}
          </Badge>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {editing ? (
            <>
              <Button size="sm" onClick={handleSave} disabled={saving} className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white px-2">
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setEditing(false); setCohort(member.cohort); setTier(member.perf_tier); }} className="h-7 text-xs px-2">
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => setEditing(true)} className="h-7 text-xs px-2">
                <Settings2 className="h-3 w-3" />
              </Button>
              <Button size="sm" variant="outline" onClick={handleRemove} disabled={removing} className="h-7 text-xs px-2 text-rose-500 hover:text-rose-600 hover:border-rose-300">
                {removing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleToggleKpis}
                title="Show live KPIs"
                className={`h-7 text-xs px-2 ${kpiExpanded ? "bg-blue-50 border-blue-200 text-blue-600" : ""}`}
              >
                <Sliders className="h-3 w-3" />
              </Button>
              <Button size="sm" variant="outline" onClick={onNavigate} className="h-7 text-xs px-2">
                <ArrowRight className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>
      </td>
    </tr>
    {kpiExpanded && (
      <tr>
        <td colSpan={6} className="px-4 py-3 bg-slate-50 border-t border-slate-100">
          {kpiLoading ? (
            <div className="flex items-center gap-2 py-1">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
              <span className="text-xs text-slate-400">Loading KPIs…</span>
            </div>
          ) : kpiScores && kpiScores.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
              {kpiScores.map((s) => {
                const pct = s.max_score > 0 ? Math.round((s.net_score / s.max_score) * 100) : 0;
                const barColor = pct >= 75 ? "bg-emerald-400" : pct >= 50 ? "bg-amber-400" : "bg-rose-400";
                return (
                  <div key={s.category_key} className="bg-white rounded-lg border border-slate-100 px-3 py-2 space-y-1">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide truncate">{s.category_label}</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-base font-black text-slate-800">{s.net_score}</span>
                      <span className="text-xs text-slate-400">/{s.max_score}</span>
                      <span className="text-[10px] text-slate-400 ml-auto">{pct}%</span>
                    </div>
                    <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-[10px] text-slate-400 truncate">{s.option_label}</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-400 py-1">No active KPIs found.</p>
          )}
        </td>
      </tr>
    )}
    </>
  );
}

// ── Comment Result ────────────────────────────────────────────────────────────

function TeamCommentResultCard({ result }: { result: TeamCommentResult }) {
  const changed = Object.values(result.changes).filter((c) => Object.keys(c.changes_detail).length > 0);
  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700">
          {result.targeted_count} member{result.targeted_count !== 1 ? "s" : ""} updated
        </span>
        <span className={`text-sm font-bold ${result.score_delta >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
          {result.score_delta >= 0 ? "+" : ""}{result.score_delta}% avg
          <span className="text-slate-500 font-normal ml-1">({result.score_before}% → {result.score_after}%)</span>
        </span>
      </div>
      {changed.length > 0 && (
        <div className="space-y-2">
          {changed.map((c) => (
            <div key={c.name} className="bg-white rounded-md border border-blue-100 px-3 py-2 space-y-1">
              <p className="text-xs font-semibold text-slate-700">{c.name}</p>
              {Object.entries(c.changes_detail).map(([k, ch]) => (
                <div key={k} className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500 w-28 shrink-0 truncate">{ch.category_label}</span>
                  <span className={`font-bold ${ch.score_diff >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {ch.score_diff >= 0 ? "+" : ""}{ch.score_diff}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      {result.explanation && (
        <p className="text-xs text-slate-500 italic border-t border-blue-100 pt-2">{result.explanation}</p>
      )}
    </div>
  );
}

// ── History Card ──────────────────────────────────────────────────────────────

function HistoryCard({ entry }: { entry: ProjectCommentHistory }) {
  const [expanded, setExpanded] = useState(false);
  const delta = entry.score_delta ?? 0;
  const changes = entry.changes_detail ?? {};
  const hasChanges = Object.keys(changes).length > 0;

  return (
    <div className="border border-slate-100 rounded-xl overflow-hidden hover:shadow-sm transition-shadow">
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
      >
        <div className="mt-0.5 shrink-0">
          {delta > 0 ? (
            <div className="h-6 w-6 rounded-full bg-emerald-100 flex items-center justify-center">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
            </div>
          ) : delta < 0 ? (
            <div className="h-6 w-6 rounded-full bg-rose-100 flex items-center justify-center">
              <TrendingDown className="h-3.5 w-3.5 text-rose-600" />
            </div>
          ) : (
            <div className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center">
              <Minus className="h-3.5 w-3.5 text-slate-400" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-700 line-clamp-2">"{entry.comment}"</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-slate-400">{formatRelative(entry.created_at)}</span>
            <span className="text-xs text-slate-400">
              {entry.targeted_consultant_ids.length > 0
                ? `${entry.targeted_consultant_ids.length} member${entry.targeted_consultant_ids.length > 1 ? "s" : ""} targeted`
                : "All members"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-sm font-bold ${delta > 0 ? "text-emerald-600" : delta < 0 ? "text-rose-600" : "text-slate-400"}`}>
            {delta !== 0 ? (delta > 0 ? `+${delta}%` : `${delta}%`) : "—"}
          </span>
          {hasChanges && (expanded ? <ChevronUp className="h-3.5 w-3.5 text-slate-400" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />)}
        </div>
      </button>
      {expanded && hasChanges && (
        <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 space-y-2">
          {Object.entries(changes).map(([cid, data]) => (
            <div key={cid}>
              <p className="text-xs font-semibold text-slate-600 mb-1">{data.name}</p>
              {Object.entries(data.changes_detail ?? {}).map(([k, ch]) => (
                <div key={k} className="flex items-center gap-2 text-xs pl-2">
                  <span className="text-slate-500 w-24 shrink-0">{ch.category_label}</span>
                  <span className="line-through text-slate-400 flex-1 truncate">{ch.from_label}</span>
                  <span className="text-slate-700 flex-1 truncate">{ch.to_label}</span>
                  <span className={`font-bold ${ch.score_diff >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {ch.score_diff >= 0 ? "+" : ""}{ch.score_diff}
                  </span>
                </div>
              ))}
            </div>
          ))}
          {entry.explanation && (
            <p className="text-xs text-slate-500 italic pt-1 border-t border-slate-100">{entry.explanation}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Score Graph ───────────────────────────────────────────────────────────────

function ScoreGraphTab({
  history,
  currentPct,
  tone,
}: {
  history: ProjectCommentHistory[];
  currentPct: number;
  tone: string;
}) {
  const lineColor: Record<string, string> = {
    success:  "#10b981",
    info:     "#3b82f6",
    warning:  "#f59e0b",
    danger:   "#f43f5e",
    critical: "#dc2626",
  };
  const color = lineColor[tone] ?? "#3b82f6";

  // Build chronological series from comment history (history arrives newest-first)
  const chronological = [...history].reverse();

  const chartData: { label: string; score: number; comment?: string }[] =
    chronological.length === 0
      ? [{ label: "Now", score: currentPct }]
      : [
          {
            label:   "Start",
            score:   chronological[0].score_before ?? currentPct,
          },
          ...chronological.map((h) => ({
            label:   h.created_at
              ? new Date(h.created_at).toLocaleDateString("en-IN", {
                  day:   "numeric",
                  month: "short",
                })
              : "—",
            score:   h.score_after ?? currentPct,
            comment: h.comment.length > 60 ? h.comment.slice(0, 57) + "…" : h.comment,
          })),
        ];

  const minScore = Math.max(0,  Math.min(...chartData.map((d) => d.score)) - 10);
  const maxScore = Math.min(100, Math.max(...chartData.map((d) => d.score)) + 10);

  const delta = chronological.length > 0
    ? (chronological[chronological.length - 1].score_after ?? currentPct) -
      (chronological[0].score_before ?? currentPct)
    : 0;

  if (chronological.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400 space-y-2">
        <TrendingUp className="h-10 w-10 text-slate-200" />
        <p className="text-sm">No score history yet</p>
        <p className="text-xs">Add team observations to track score trends over time</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-100 bg-white p-4 text-center">
          <p className="text-xs text-slate-400 mb-1">Starting Score</p>
          <p className="text-2xl font-black text-slate-800">
            {chronological[0].score_before ?? 0}%
          </p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-4 text-center">
          <p className="text-xs text-slate-400 mb-1">Current Score</p>
          <p className={`text-2xl font-black ${govScoreColorClass(tone)}`}>{currentPct}%</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-4 text-center">
          <p className="text-xs text-slate-400 mb-1">Total Change</p>
          <p className={`text-2xl font-black ${delta >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
            {delta >= 0 ? "+" : ""}{delta}%
          </p>
        </div>
      </div>

      {/* Chart */}
      <div className="rounded-xl border border-slate-100 bg-white p-5">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">
          Team Governance Score Over Time
        </p>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[minScore, maxScore]}
              tickFormatter={(v) => `${v}%`}
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              width={42}
            />
            <Tooltip
              contentStyle={{
                background: "#fff",
                border: "1px solid #e2e8f0",
                borderRadius: "10px",
                fontSize: "12px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
              }}
              formatter={(value: number) => [`${value}%`, "Score"]}
              labelFormatter={(label, payload) => {
                const comment = payload?.[0]?.payload?.comment;
                return comment ? `${label} — "${comment}"` : label;
              }}
            />
            <ReferenceLine y={75} stroke="#10b981" strokeDasharray="4 4" strokeOpacity={0.4} />
            <ReferenceLine y={50} stroke="#f59e0b" strokeDasharray="4 4" strokeOpacity={0.4} />
            <Line
              type="monotone"
              dataKey="score"
              stroke={color}
              strokeWidth={2.5}
              dot={{ r: 5, fill: color, strokeWidth: 2, stroke: "#fff" }}
              activeDot={{ r: 7, fill: color, stroke: "#fff", strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
        <div className="flex items-center gap-4 mt-2 justify-end">
          <div className="flex items-center gap-1.5">
            <div className="h-px w-6 border-t-2 border-dashed border-emerald-400" />
            <span className="text-[10px] text-slate-400">75% (Good)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-px w-6 border-t-2 border-dashed border-amber-400" />
            <span className="text-[10px] text-slate-400">50% (At Risk)</span>
          </div>
        </div>
      </div>

      {/* Timeline of comments */}
      <div className="rounded-xl border border-slate-100 bg-white p-5 space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Score Timeline</p>
        {chronological.map((h, i) => {
          const d = h.score_delta ?? 0;
          return (
            <div key={h.id} className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                <div className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${
                  d > 0 ? "bg-emerald-100" : d < 0 ? "bg-rose-100" : "bg-slate-100"
                }`}>
                  {d > 0
                    ? <TrendingUp className="h-3 w-3 text-emerald-600" />
                    : d < 0
                    ? <TrendingDown className="h-3 w-3 text-rose-600" />
                    : <Minus className="h-3 w-3 text-slate-400" />}
                </div>
                {i < chronological.length - 1 && (
                  <div className="w-px flex-1 bg-slate-100 mt-1 mb-1 min-h-[16px]" />
                )}
              </div>
              <div className="flex-1 min-w-0 pb-2">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-bold ${d > 0 ? "text-emerald-600" : d < 0 ? "text-rose-600" : "text-slate-400"}`}>
                    {h.score_before}% → {h.score_after}%
                    <span className="ml-1 text-xs font-normal">
                      ({d >= 0 ? "+" : ""}{d}%)
                    </span>
                  </span>
                  <span className="text-xs text-slate-400 ml-auto shrink-0">
                    {h.created_at
                      ? new Date(h.created_at).toLocaleDateString("en-IN", {
                          day: "numeric", month: "short", year: "2-digit",
                        })
                      : ""}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">"{h.comment}"</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Edit Project Dialog ───────────────────────────────────────────────────────

function EditProjectDialog({
  open,
  onOpenChange,
  project,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: ProjectSummary;
  onSaved: (updated: ProjectSummary) => void;
}) {
  const [name, setName]         = useState(project.name);
  const [desc, setDesc]         = useState(project.description ?? "");
  const [status, setStatus]     = useState(project.status ?? "active");
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    if (open) {
      setName(project.name);
      setDesc(project.description ?? "");
      setStatus(project.status ?? "active");
    }
  }, [open, project]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const updated = await updateProject(project.id, {
        name: name.trim(),
        description: desc.trim(),
        status,
      });
      toast.success("Project updated");
      onSaved(updated);
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to update project");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-blue-500" />
            Edit Project
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label className="text-xs">Project Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name"
              className="text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description <span className="text-slate-400">(optional)</span></Label>
            <Textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Brief description…"
              rows={3}
              className="text-sm resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!name.trim() || saving}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Save Changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete Project Dialog ─────────────────────────────────────────────────────

function DeleteProjectDialog({
  open,
  onOpenChange,
  projectName,
  onConfirmed,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectName: string;
  onConfirmed: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      onConfirmed();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-600">
            <AlertTriangle className="h-4 w-4" />
            Delete Project
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Are you sure you want to delete <span className="font-semibold text-slate-900">"{projectName}"</span>?
            This will remove all members and comment history for this project. This action cannot be undone.
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1 bg-rose-600 hover:bg-rose-700 text-white"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Trash2 className="h-4 w-4 mr-1.5" />}
              Delete Project
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── KPI defaults matching backend CATEGORY_MAP ────────────────────────────────

const DEFAULT_KPIS: Array<Omit<ProjectKpiDefinition, "id" | "sort_order">> = [
  { category_key: "timing",          label: "Timing Adherence",   max_score: 12, escalation_base: 2, description: "", is_custom: false, options: null },
  { category_key: "attendance",       label: "Attendance",          max_score: 12, escalation_base: 2, description: "", is_custom: false, options: null },
  { category_key: "leave_management", label: "Leave Management",    max_score: 8,  escalation_base: 2, description: "", is_custom: false, options: null },
  { category_key: "wfo_wfh",          label: "WFO/WFH Adherence",  max_score: 10, escalation_base: 2, description: "", is_custom: false, options: null },
  { category_key: "performance",      label: "Performance",         max_score: 18, escalation_base: 3, description: "", is_custom: false, options: null },
  { category_key: "upskilling",       label: "Upskilling",          max_score: 10, escalation_base: 2, description: "", is_custom: false, options: null },
  { category_key: "conduct",          label: "Conduct",             max_score: 12, escalation_base: 2, description: "", is_custom: false, options: null },
  { category_key: "reporting",        label: "Reporting",           max_score: 8,  escalation_base: 2, description: "", is_custom: false, options: null },
  { category_key: "skill_alignment",  label: "Skill Alignment",     max_score: 10, escalation_base: 2, description: "", is_custom: false, options: null },
];

// ── Project KPIs Tab ──────────────────────────────────────────────────────────

function ProjectKpisTab({
  projectId,
  kpiDefs,
  loading,
  onSaved,
}: {
  projectId: number;
  kpiDefs: ProjectKpiDefinition[];
  loading: boolean;
  onSaved: (updated: ProjectKpiDefinition[]) => void;
}) {
  // selected standard keys
  const existing = kpiDefs.map((k) => k.category_key);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(existing.filter((k) => !k.startsWith("custom_"))),
  );
  const [customs, setCustoms] = useState<Array<{ key: string; label: string; max_score: number }>>(
    kpiDefs
      .filter((k) => k.is_custom)
      .map((k) => ({ key: k.category_key, label: k.label, max_score: k.max_score })),
  );
  const [newCustomLabel, setNewCustomLabel] = useState("");
  const [newCustomMax,   setNewCustomMax]   = useState(10);
  const [saving, setSaving] = useState(false);

  // keep local state in sync when kpiDefs change (after save)
  useEffect(() => {
    setSelected(new Set(kpiDefs.filter((k) => !k.is_custom).map((k) => k.category_key)));
    setCustoms(kpiDefs.filter((k) => k.is_custom).map((k) => ({ key: k.category_key, label: k.label, max_score: k.max_score })));
  }, [kpiDefs]);

  const toggleDefault = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const addCustom = () => {
    const label = newCustomLabel.trim();
    if (!label) return;
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30);
    const key = `custom_${slug}`;
    if (customs.some((c) => c.key === key)) return;
    setCustoms((prev) => [...prev, { key, label, max_score: newCustomMax }]);
    setNewCustomLabel("");
    setNewCustomMax(10);
  };

  const removeCustom = (key: string) => setCustoms((prev) => prev.filter((c) => c.key !== key));

  const handleSave = async () => {
    setSaving(true);
    try {
      const standardKpis = DEFAULT_KPIS.filter((d) => selected.has(d.category_key));
      const customKpis = customs.map((c) => ({
        category_key: c.key,
        label:         c.label,
        max_score:     c.max_score,
        escalation_base: 2,
        description:   "",
        is_custom:     true,
        options:       null,
      }));
      const updated = await setProjectKpis(projectId, [...standardKpis, ...customKpis]);
      onSaved(updated);
      toast.success("Project KPIs saved");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save KPIs");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-800 text-sm">Project KPIs</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Select the governance categories that apply to this project. These will be synced to any
            consultant added to the project.
          </p>
        </div>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving}
          className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
          Save KPIs
        </Button>
      </div>

      {/* Standard categories */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Standard Categories</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {DEFAULT_KPIS.map((kpi) => {
            const on = selected.has(kpi.category_key);
            return (
              <button
                key={kpi.category_key}
                type="button"
                onClick={() => toggleDefault(kpi.category_key)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                  on
                    ? "border-blue-300 bg-blue-50 text-blue-800"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                <div className={`h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 ${on ? "border-blue-500 bg-blue-500" : "border-slate-300"}`}>
                  {on && <Check className="h-2.5 w-2.5 text-white" />}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{kpi.label}</p>
                  <p className="text-[10px] text-slate-400">max {kpi.max_score} pts</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom categories */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Custom Categories</p>
        {customs.length > 0 && (
          <div className="space-y-1.5">
            {customs.map((c) => (
              <div key={c.key} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-purple-200 bg-purple-50">
                <GripVertical className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                <span className="text-xs font-medium text-purple-800 flex-1 truncate">{c.label}</span>
                <span className="text-[10px] text-purple-400">max {c.max_score} pts</span>
                <button
                  type="button"
                  onClick={() => removeCustom(c.key)}
                  className="h-5 w-5 flex items-center justify-center rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors ml-1"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={newCustomLabel}
            onChange={(e) => setNewCustomLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCustom()}
            placeholder="Custom category name"
            className="flex-1 text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
          />
          <input
            type="number"
            value={newCustomMax}
            min={1}
            max={50}
            onChange={(e) => setNewCustomMax(Number(e.target.value))}
            className="w-16 text-xs border border-slate-200 rounded-lg px-2 py-2 text-center focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
          />
          <Button size="sm" variant="outline" onClick={addCustom} className="h-8 text-xs px-3">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <p className="text-[10px] text-slate-400">Name + max score (pts) then press Enter or +</p>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

function ProjectDetailPage() {
  const { projectId } = Route.useParams();
  const nav = useNavigate();

  const [project,   setProject]   = useState<ProjectSummary | null>(null);
  const [members,   setMembers]   = useState<ProjectMember[]>([]);
  const [history,   setHistory]   = useState<ProjectCommentHistory[]>([]);
  const [loading,   setLoading]   = useState(true);

  const [activeTab,   setActiveTab]   = useState<"team" | "comments" | "score_graph" | "kpis">("team");
  const [addOpen,     setAddOpen]     = useState(false);
  const [editOpen,    setEditOpen]    = useState(false);
  const [deleteOpen,  setDeleteOpen]  = useState(false);
  const [kpiDefs,     setKpiDefs]     = useState<ProjectKpiDefinition[]>([]);
  const [kpiLoading,  setKpiLoading]  = useState(false);

  const [comment,    setComment]    = useState("");
  const [analyzing,  setAnalyzing]  = useState(false);
  const [lastResult, setLastResult] = useState<TeamCommentResult | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [proj, mems, hist] = await Promise.all([
        getProject(Number(projectId)),
        listMembers(Number(projectId)),
        getProjectCommentHistory(Number(projectId)),
      ]);
      setProject(proj);
      setMembers(mems);
      setHistory(hist);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load project");
      console.error("[project] loadData error:", e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const loadKpis = useCallback(async () => {
    setKpiLoading(true);
    try {
      const data = await getProjectKpis(Number(projectId));
      setKpiDefs(data);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load KPIs");
    } finally {
      setKpiLoading(false);
    }
  }, [projectId]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { if (activeTab === "kpis") loadKpis(); }, [activeTab, loadKpis]);

  const refreshMembers = useCallback(async () => {
    try {
      const [proj, mems] = await Promise.all([
        getProject(Number(projectId)),
        listMembers(Number(projectId)),
      ]);
      setProject(proj);
      setMembers(mems);
    } catch {
      toast.error("Failed to refresh");
    }
  }, [projectId]);

  const handleAnalyze = async () => {
    if (!comment.trim()) return;
    setAnalyzing(true);
    setLastResult(null);
    try {
      const result = await analyzeTeamComment(Number(projectId), comment.trim());
      setLastResult(result);
      setComment("");
      toast.success("Team scores updated");
      await loadData();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDeleteProject = async () => {
    try {
      await deleteProject(Number(projectId));
      toast.success("Project deleted");
      nav({ to: "/projects" });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to delete project");
      setDeleteOpen(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <TopBar title="Projects" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      </div>
    );
  }

  const scorePct = project?.avg_pct ?? 0;
  const tone     = project?.tone ?? "info";
  const grade    = project?.grade ?? "—";

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Projects" />
      <div className="flex-1 overflow-auto p-6 space-y-5">

        {/* Back */}
        <button
          type="button"
          onClick={() => nav({ to: "/projects" })}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to all projects
        </button>

        {/* Hero Card */}
        <div className="w-full rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
          <div className="flex items-start gap-5">
            <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center shrink-0 shadow-sm">
              <Users className="h-7 w-7 text-blue-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-slate-900 truncate">{project?.name}</h1>
                <button
                  type="button"
                  onClick={() => setEditOpen(true)}
                  className="h-7 w-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors shrink-0"
                  title="Edit project"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteOpen(true)}
                  className="h-7 w-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors shrink-0"
                  title="Delete project"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {project?.description && (
                <p className="text-sm text-slate-400 mt-0.5">{project.description}</p>
              )}
              <p className="text-xs text-slate-400 mt-1">
                {project?.member_count ?? 0} member{(project?.member_count ?? 0) !== 1 ? "s" : ""}
                {project?.status === "archived" && (
                  <Badge className="ml-2 text-[10px] bg-slate-100 text-slate-500 border border-slate-200">Archived</Badge>
                )}
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className="flex items-baseline gap-1 justify-end">
                <span className="text-7xl font-black text-slate-900 leading-none">{scorePct}</span>
                <span className="text-2xl text-slate-400 font-medium">%</span>
              </div>
              <Badge className={`mt-1 text-sm px-2 py-0.5 border ${gradeBadgeClass(tone)}`}>{grade}</Badge>
            </div>
          </div>
          <div className="mt-5">
            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${barColorClass(tone)}`}
                style={{ width: `${scorePct}%` }}
              />
            </div>
            <p className="text-xs text-slate-400 text-right mt-1">Average governance score</p>
          </div>
        </div>

        {/* Two-column content */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

          {/* Left: tabs */}
          <div className="xl:col-span-2 space-y-4">
            <div className="flex items-center gap-1 border-b border-slate-200">
              {(["team", "comments", "score_graph", "kpis"] as const).map((tab) => {
                const icons  = { team: BarChart3, comments: History, score_graph: TrendingUp, kpis: Sliders };
                const labels = {
                  team:        `Team (${members.length})`,
                  comments:    `Comments (${history.length})`,
                  score_graph: "Score Graph",
                  kpis:        "KPIs",
                };
                const Icon = icons[tab];
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                      activeTab === tab
                        ? "border-blue-500 text-blue-600"
                        : "border-transparent text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {labels[tab]}
                  </button>
                );
              })}
            </div>

            {/* Team tab */}
            {activeTab === "team" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-400">{members.length} member{members.length !== 1 ? "s" : ""} in project</p>
                  <Button
                    size="sm"
                    onClick={() => setAddOpen(true)}
                    className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                    Add Member
                  </Button>
                </div>

                {members.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-slate-400 space-y-2">
                    <Users className="h-10 w-10 text-slate-200" />
                    <p className="text-sm">No members yet</p>
                    <Button size="sm" onClick={() => setAddOpen(true)} className="mt-1 bg-blue-600 hover:bg-blue-700 text-white">
                      <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                      Add First Member
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-100 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500">Name</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500">Skill</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500">Cohort</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500">Perf Tier</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500">Gov. Score</th>
                          <th className="px-4 py-2.5" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {members.map((m) => (
                          <MemberRow
                            key={m.consultant_id}
                            member={m}
                            projectId={Number(projectId)}
                            onUpdated={refreshMembers}
                            onRemoved={refreshMembers}
                            onNavigate={() =>
                              nav({
                                to: "/governance/$consultantId",
                                params: { consultantId: String(m.consultant_id) },
                              })
                            }
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Comments tab */}
            {activeTab === "comments" && (
              <div className="space-y-2">
                {history.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-slate-400 space-y-2">
                    <MessageSquare className="h-10 w-10 text-slate-200" />
                    <p className="text-sm">No team comments yet</p>
                    <p className="text-xs">Add an observation on the right to update team scores</p>
                  </div>
                ) : (
                  history.map((h) => <HistoryCard key={h.id} entry={h} />)
                )}
              </div>
            )}

            {/* Score Graph tab */}
            {activeTab === "score_graph" && (
              <ScoreGraphTab history={history} currentPct={scorePct} tone={tone} />
            )}

            {/* KPIs tab */}
            {activeTab === "kpis" && (
              <ProjectKpisTab
                projectId={Number(projectId)}
                kpiDefs={kpiDefs}
                loading={kpiLoading}
                onSaved={(updated) => setKpiDefs(updated)}
              />
            )}
          </div>

          {/* Right: Team comment input */}
          <div className="xl:col-span-1">
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 space-y-4 sticky top-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-blue-500" />
                <h3 className="font-semibold text-slate-800">Add Team Observation</h3>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Describe what you observed. The AI will identify which team members are relevant and update their governance scores.
                Mention names for individual updates, or leave blank to apply to all.
              </p>
              <Textarea
                placeholder={`e.g. "John has improved his attendance this week. The team overall delivered on time despite a tight deadline."`}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleAnalyze(); }}
                rows={6}
                className="text-sm resize-none"
                disabled={analyzing}
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">Ctrl+Enter to submit</span>
                <Button
                  onClick={handleAnalyze}
                  disabled={!comment.trim() || analyzing || members.length === 0}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {analyzing
                    ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Analysing…</>
                    : <><Send className="h-4 w-4 mr-1.5" />Analyse & Update</>
                  }
                </Button>
              </div>
              {lastResult && <TeamCommentResultCard result={lastResult} />}
            </div>
          </div>
        </div>
      </div>

      <AddMemberDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        projectId={Number(projectId)}
        existingIds={members.map((m) => m.consultant_id)}
        onAdded={refreshMembers}
      />

      {project && (
        <EditProjectDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          project={project}
          onSaved={(updated) => setProject(updated)}
        />
      )}

      <DeleteProjectDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        projectName={project?.name ?? ""}
        onConfirmed={handleDeleteProject}
      />
    </div>
  );
}
