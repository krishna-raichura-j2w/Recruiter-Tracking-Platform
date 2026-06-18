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
  Dot,
} from "recharts";
import { TopBar } from "@/components/TopBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Send,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  BarChart3,
  History,
  LineChart as LineChartIcon,
  Trash2,
  Plus,
  RotateCcw,
  Settings2,
  User,
  X,
  FolderKanban,
  AlertTriangle,
} from "lucide-react";
import { getConsultantDetailsApi } from "@/apiService/api";
import {
  getFullScores,
  analyzeComment,
  getCommentHistory,
  deactivateCategory,
  restoreCategory,
  addCustomCategory,
  deleteCustomCategory,
  resetConsultantScores,
  type ScoreEntry,
  type InactiveDefault,
  type CommentHistoryEntry,
  type CommentAnalysisResult,
  type ScoreSummary,
} from "@/apiService/governanceApi";
import type { ConsultantItem } from "@/apiService/types";
import { toast } from "react-toastify";

export const Route = createFileRoute("/_authenticated/governance/$consultantId")({
  component: GovernanceDetailPage,
});

// ── Grade helpers ─────────────────────────────────────────────────────────────

function getGrade(score: number, max: number): { grade: string; tone: string } {
  const pct = max > 0 ? (score / max) * 100 : 0;
  if (pct >= 90) return { grade: "Excellent", tone: "success" };
  if (pct >= 75) return { grade: "Good", tone: "info" };
  if (pct >= 55) return { grade: "Average", tone: "warning" };
  if (pct >= 35) return { grade: "Below Average", tone: "danger" };
  return { grade: "Critical", tone: "critical" };
}

function gradeBadgeClass(tone: string) {
  const m: Record<string, string> = {
    success: "bg-emerald-100 text-emerald-800 border-emerald-200",
    info: "bg-blue-100 text-blue-800 border-blue-200",
    warning: "bg-amber-100 text-amber-800 border-amber-200",
    danger: "bg-rose-100 text-rose-800 border-rose-200",
    critical: "bg-red-200 text-red-900 border-red-300",
  };
  return m[tone] ?? "bg-slate-100 text-slate-600 border-slate-200";
}

function barColorClass(tone: string) {
  const m: Record<string, string> = {
    success: "bg-emerald-500",
    info: "bg-blue-500",
    warning: "bg-amber-500",
    danger: "bg-rose-500",
    critical: "bg-red-600",
  };
  return m[tone] ?? "bg-slate-400";
}

function cardBgClass(tone: string) {
  const m: Record<string, string> = {
    success: "bg-emerald-50 border-emerald-100",
    info: "bg-blue-50 border-blue-100",
    warning: "bg-amber-50 border-amber-100",
    danger: "bg-rose-50 border-rose-100",
    critical: "bg-red-50 border-red-200",
  };
  return m[tone] ?? "bg-slate-50 border-slate-100";
}

function scoreTextClass(tone: string) {
  const m: Record<string, string> = {
    success: "text-emerald-700",
    info: "text-blue-700",
    warning: "text-amber-700",
    danger: "text-rose-700",
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

function formatShortDate(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// ── KPI Category Card ─────────────────────────────────────────────────────────

function CategoryKPICard({
  entry,
  highlight,
  onDelete,
}: {
  entry: ScoreEntry;
  highlight?: { score_diff: number };
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const pct = Math.round((entry.net_score / entry.max_score) * 100);
  const { tone } = getGrade(entry.net_score, entry.max_score);

  return (
    <div className={`group relative rounded-xl border transition-all duration-200 overflow-hidden ${cardBgClass(tone)} hover:shadow-md`}>
      {/* Card header */}
      <div className="px-4 pt-4 pb-0">
        <div className="flex items-start justify-between gap-1 mb-3">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider leading-snug flex-1">
            {entry.category_label}
            {entry.is_custom && (
              <span className="ml-1 text-[9px] bg-violet-100 text-violet-700 px-1 py-0.5 rounded font-semibold">CUSTOM</span>
            )}
          </span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="opacity-0 group-hover:opacity-100 transition-opacity h-5 w-5 flex items-center justify-center rounded text-slate-300 hover:text-rose-500 hover:bg-white/60 shrink-0"
            title="Remove category"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Score hero */}
        <div className="flex items-baseline gap-1 mb-1">
          <span className={`text-3xl font-black ${scoreTextClass(tone)}`}>{entry.net_score}</span>
          <span className="text-sm text-slate-400 font-medium">/{entry.max_score}</span>
          {highlight && (
            <span className={`ml-auto text-xs font-bold ${highlight.score_diff >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {highlight.score_diff >= 0 ? "+" : ""}{highlight.score_diff}
            </span>
          )}
        </div>

        {/* Current level */}
        <p className="text-[11px] text-slate-500 line-clamp-2 min-h-[30px] leading-snug mb-3">
          {entry.option_label}
        </p>

        {/* Progress bar */}
        <div className="h-1.5 bg-white/60 rounded-full overflow-hidden mb-1">
          <div
            className={`h-full rounded-full transition-all duration-700 ${barColorClass(tone)}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-[10px] text-slate-400 text-right mb-3">{pct}%</p>
      </div>

      {/* Expand toggle */}
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center justify-center gap-1 py-1.5 text-[11px] text-slate-400 hover:text-slate-600 border-t border-white/40 hover:bg-white/30 transition-colors"
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {expanded ? "Hide levels" : "Show levels"}
      </button>

      {/* Expanded option list */}
      {expanded && (
        <div className="bg-white/70 border-t border-white/40 px-3 py-2 space-y-1">
          {entry.options.map((opt) => (
            <div
              key={opt.index}
              className={`flex items-center gap-2 px-2 py-1 rounded text-xs ${
                opt.index === entry.option_index
                  ? "bg-white shadow-sm border border-blue-200 font-semibold text-blue-800"
                  : "text-slate-500"
              }`}
            >
              <span className="font-mono text-slate-300 w-3 shrink-0">{opt.index}</span>
              <span className="flex-1 leading-snug">{opt.label}</span>
              <span className="text-slate-400 shrink-0">{opt.score}</span>
            </div>
          ))}
          {entry.escalations > 0 && (
            <p className="text-[10px] text-rose-500 mt-1 pl-1">
              ⚠ {entry.escalations} escalation{entry.escalations > 1 ? "s" : ""} — deduction applied
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Manage Categories Dialog ──────────────────────────────────────────────────

function ManageCategoriesDialog({
  open,
  onOpenChange,
  consultantId,
  activeScores,
  inactiveDefaults,
  onRefresh,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  consultantId: number;
  activeScores: ScoreEntry[];
  inactiveDefaults: InactiveDefault[];
  onRefresh: () => void;
}) {
  const [addLabel, setAddLabel] = useState("");
  const [addMaxScore, setAddMaxScore] = useState("10");
  const [addDesc, setAddDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionKey, setActionKey] = useState<string | null>(null);

  const handleRemove = async (entry: ScoreEntry) => {
    setActionKey(entry.category_key);
    try {
      if (entry.is_custom) {
        await deleteCustomCategory(consultantId, entry.category_key);
        toast.success(`"${entry.category_label}" removed`);
      } else {
        await deactivateCategory(consultantId, entry.category_key);
        toast.success(`"${entry.category_label}" removed`);
      }
      onRefresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to remove");
    } finally {
      setActionKey(null);
    }
  };

  const handleRestore = async (def: InactiveDefault) => {
    setActionKey(def.key);
    try {
      await restoreCategory(consultantId, def.key);
      toast.success(`"${def.label}" restored`);
      onRefresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to restore");
    } finally {
      setActionKey(null);
    }
  };

  const handleAddCustom = async () => {
    if (!addLabel.trim() || !Number(addMaxScore)) return;
    setSaving(true);
    try {
      await addCustomCategory(consultantId, {
        label: addLabel.trim(),
        max_score: Number(addMaxScore),
        description: addDesc.trim(),
      });
      toast.success(`"${addLabel}" added`);
      setAddLabel(""); setAddMaxScore("10"); setAddDesc("");
      onRefresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-blue-500" />
            Manage Categories
          </DialogTitle>
        </DialogHeader>

        {/* Active categories */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Active ({activeScores.length})
          </p>
          {activeScores.map((s) => (
            <div key={s.category_key} className="flex items-center justify-between px-3 py-2 rounded-lg border border-slate-100 bg-slate-50">
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-slate-700">{s.category_label}</span>
                {s.is_custom && (
                  <Badge className="ml-2 text-[10px] px-1 bg-violet-100 text-violet-700 border-violet-200">Custom</Badge>
                )}
                <span className="text-xs text-slate-400 ml-2">{s.net_score}/{s.max_score}</span>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(s)}
                disabled={actionKey === s.category_key}
                className="h-7 w-7 flex items-center justify-center rounded text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors disabled:opacity-40"
              >
                {actionKey === s.category_key ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          ))}
        </div>

        {/* Removed defaults — can restore */}
        {inactiveDefaults.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Removed (can restore)
            </p>
            {inactiveDefaults.map((d) => (
              <div key={d.key} className="flex items-center justify-between px-3 py-2 rounded-lg border border-dashed border-slate-200 bg-white">
                <div>
                  <span className="text-sm text-slate-500">{d.label}</span>
                  <span className="text-xs text-slate-400 ml-2">max {d.max_score}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRestore(d)}
                  disabled={actionKey === d.key}
                  className="h-7 px-2 flex items-center gap-1 rounded text-xs text-blue-600 hover:bg-blue-50 border border-blue-200 transition-colors disabled:opacity-40"
                >
                  {actionKey === d.key ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3 w-3" />
                  )}
                  Restore
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add custom category */}
        <div className="space-y-3 pt-2 border-t border-slate-100">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Add Custom Category</p>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Label</Label>
              <Input
                value={addLabel}
                onChange={(e) => setAddLabel(e.target.value)}
                placeholder="e.g. Client Satisfaction"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Max Score</Label>
              <Input
                type="number"
                min={1}
                max={30}
                value={addMaxScore}
                onChange={(e) => setAddMaxScore(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description (optional)</Label>
            <Input
              value={addDesc}
              onChange={(e) => setAddDesc(e.target.value)}
              placeholder="Brief description of this category"
              className="h-8 text-sm"
            />
          </div>
          <Button
            onClick={handleAddCustom}
            disabled={saving || !addLabel.trim() || !Number(addMaxScore)}
            size="sm"
            className="w-full bg-sky-600 hover:bg-sky-500 text-white font-semibold shadow-sm"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />}
            Add Category
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Comment result card ────────────────────────────────────────────────────────

function CommentResultCard({ result }: { result: CommentAnalysisResult }) {
  const hasChanges = Object.keys(result.changes_detail).length > 0;
  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700">Score updated</span>
        <span className={`text-sm font-bold ${result.score_delta >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
          {result.score_delta >= 0 ? "+" : ""}{result.score_delta} pts
          <span className="text-slate-500 font-normal ml-1">({result.score_before} → {result.score_after})</span>
        </span>
      </div>
      {hasChanges ? (
        <div className="space-y-1.5">
          {Object.entries(result.changes_detail).map(([key, change]) => (
            <div key={key} className="flex items-start gap-2 text-xs bg-white rounded-md px-3 py-2 border border-blue-100">
              <span className="font-semibold text-slate-700 w-28 shrink-0">{change.category_label}</span>
              <div className="flex-1 min-w-0">
                <span className="line-through text-slate-400 block truncate">{change.from_label}</span>
                <span className="text-slate-700 font-medium block truncate">{change.to_label}</span>
              </div>
              <span className={`shrink-0 font-bold ${change.score_diff >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {change.score_diff >= 0 ? "+" : ""}{change.score_diff}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-500">No score changes — comment noted.</p>
      )}
      {result.explanation && (
        <p className="text-xs text-slate-500 italic border-t border-blue-100 pt-2">{result.explanation}</p>
      )}
    </div>
  );
}

// ── History card ───────────────────────────────────────────────────────────────

function HistoryCard({ entry }: { entry: CommentHistoryEntry }) {
  const [expanded, setExpanded] = useState(false);
  const delta = entry.score_delta ?? 0;
  const hasChanges = entry.changes_detail && Object.keys(entry.changes_detail).length > 0;

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
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className="text-xs text-slate-400">{formatRelative(entry.created_at)}</span>
            {entry.score_before !== null && entry.score_after !== null && (
              <span className="text-xs text-slate-400">{entry.score_before} → {entry.score_after}</span>
            )}
            {entry.source === "project" && entry.project_name && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">
                <FolderKanban className="h-3 w-3" />
                via {entry.project_name}
              </span>
            )}
          </div>
        </div>
        <span className={`text-sm font-bold shrink-0 ${delta > 0 ? "text-emerald-600" : delta < 0 ? "text-rose-600" : "text-slate-400"}`}>
          {delta !== 0 ? (delta > 0 ? `+${delta}` : delta) : "—"}
        </span>
      </button>
      {expanded && hasChanges && entry.changes_detail && (
        <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 space-y-2">
          {Object.entries(entry.changes_detail).map(([key, change]) => (
            <div key={key} className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-slate-600 w-24 shrink-0">{change.category_label}</span>
              <span className="line-through text-slate-400 flex-1 truncate">{change.from_label}</span>
              <span className="text-slate-700 flex-1 truncate">{change.to_label}</span>
              <span className={`font-bold ${change.score_diff >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {change.score_diff >= 0 ? "+" : ""}{change.score_diff}
              </span>
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

// ── Score Graph ────────────────────────────────────────────────────────────────

interface ChartPoint {
  label: string;
  score: number;
  delta?: number;
  comment?: string;
  isBaseline?: boolean;
}

function ScoreGraph({
  history,
  currentScore,
  totalPossible,
}: {
  history: CommentHistoryEntry[];
  currentScore: number;
  totalPossible: number;
}) {
  const data: ChartPoint[] = [];

  if (history.length === 0) {
    data.push({ label: "Current", score: currentScore, isBaseline: true });
  } else {
    const chronological = [...history].reverse();
    data.push({
      label: "Baseline",
      score: chronological[0].score_before ?? currentScore,
      isBaseline: true,
    });
    chronological.forEach((h) => {
      data.push({
        label: formatShortDate(h.created_at),
        score: h.score_after ?? 0,
        delta: h.score_delta ?? 0,
        comment: h.comment.length > 60 ? h.comment.slice(0, 60) + "…" : h.comment,
      });
    });
  }

  const thresholdGood = Math.round(totalPossible * 0.75);
  const thresholdAvg = Math.round(totalPossible * 0.55);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const point: ChartPoint = payload[0].payload;
    return (
      <div className="bg-white shadow-lg rounded-xl border border-slate-100 px-4 py-3 max-w-[200px]">
        <p className="text-xs text-slate-400 mb-1">{label}</p>
        <p className="text-lg font-black text-slate-900">{point.score}<span className="text-sm text-slate-400 font-normal">/{totalPossible}</span></p>
        {point.delta !== undefined && point.delta !== 0 && (
          <p className={`text-xs font-semibold mt-0.5 ${point.delta > 0 ? "text-emerald-600" : "text-rose-600"}`}>
            {point.delta > 0 ? "+" : ""}{point.delta} pts
          </p>
        )}
        {point.comment && (
          <p className="text-[11px] text-slate-500 italic mt-1.5 border-t border-slate-100 pt-1.5">"{point.comment}"</p>
        )}
      </div>
    );
  };

  if (data.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 space-y-2">
        <LineChartIcon className="h-12 w-12 text-slate-200" />
        <p className="text-sm">Add comments to track score over time</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-xs text-slate-400">
        <span className="flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-blue-400 border-dashed border-t-2 border-blue-300" /> Good threshold ({thresholdGood})</span>
        <span className="flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-amber-400 border-dashed border-t-2 border-amber-300" /> Average threshold ({thresholdAvg})</span>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, totalPossible]}
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={thresholdGood} stroke="#93c5fd" strokeDasharray="4 3" strokeWidth={1.5} />
          <ReferenceLine y={thresholdAvg} stroke="#fcd34d" strokeDasharray="4 3" strokeWidth={1.5} />
          <Line
            type="monotone"
            dataKey="score"
            stroke="#3b82f6"
            strokeWidth={2.5}
            dot={(props: any) => {
              const { cx, cy, payload } = props;
              return (
                <Dot
                  key={`dot-${payload.label}`}
                  cx={cx}
                  cy={cy}
                  r={payload.isBaseline ? 4 : 5}
                  fill={payload.isBaseline ? "#94a3b8" : "#3b82f6"}
                  stroke="#ffffff"
                  strokeWidth={2}
                />
              );
            }}
            activeDot={{ r: 7, fill: "#2563eb", stroke: "#fff", strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Reset Scores Dialog ────────────────────────────────────────────────────────

function ResetScoresDialog({
  open,
  onOpenChange,
  consultantName,
  onConfirmed,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  consultantName: string;
  onConfirmed: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-4 w-4" />
            Reset Governance Scores
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            This will reset all active governance scores for{" "}
            <span className="font-semibold text-slate-900">{consultantName}</span> back to the
            best-case baseline (option 0, no escalations). Score history is preserved.
            This action cannot be undone.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => { onOpenChange(false); onConfirmed(); }}
              className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"
            >
              <RotateCcw className="h-4 w-4 mr-1.5" />
              Reset Scores
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

function GovernanceDetailPage() {
  const { consultantId } = Route.useParams();
  const nav = useNavigate();

  const [consultant, setConsultant] = useState<ConsultantItem | null>(null);
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [inactiveDefaults, setInactiveDefaults] = useState<InactiveDefault[]>([]);
  const [summary, setSummary] = useState<ScoreSummary | null>(null);
  const [history, setHistory] = useState<CommentHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [comment, setComment] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [lastResult, setLastResult] = useState<CommentAnalysisResult | null>(null);
  const [activeHighlights, setActiveHighlights] = useState<Record<string, { score_diff: number }>>({});

  const [activeTab, setActiveTab] = useState<"scores" | "history" | "graph">("scores");
  const [manageOpen, setManageOpen] = useState(false);
  const [resetOpen, setResetOpen]   = useState(false);

  const loadData = useCallback(async () => {
    try {
      const consultantRes = await getConsultantDetailsApi(Number(consultantId));
      setConsultant(consultantRes.data);

      const [fullRes, historyRes] = await Promise.all([
        getFullScores(Number(consultantId)),
        getCommentHistory(Number(consultantId)),
      ]);
      setScores(fullRes.scores);
      setInactiveDefaults(fullRes.inactive_defaults);
      setSummary(fullRes.summary);
      setHistory(historyRes);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load governance data";
      toast.error(msg);
      console.error("[governance] loadData error:", e);
    } finally {
      setLoading(false);
    }
  }, [consultantId]);

  useEffect(() => { loadData(); }, [loadData]);

  const refreshScores = useCallback(async () => {
    try {
      const [fullRes, historyRes] = await Promise.all([
        getFullScores(Number(consultantId)),
        getCommentHistory(Number(consultantId)),
      ]);
      setScores(fullRes.scores);
      setInactiveDefaults(fullRes.inactive_defaults);
      setSummary(fullRes.summary);
      setHistory(historyRes);
    } catch {
      toast.error("Failed to refresh scores");
    }
  }, [consultantId]);

  const handleAnalyze = async () => {
    if (!comment.trim() || !consultant) return;
    setAnalyzing(true);
    setLastResult(null);
    setActiveHighlights({});
    try {
      const result = await analyzeComment(Number(consultantId), comment.trim(), consultant.name);
      setLastResult(result);
      const highlights: Record<string, { score_diff: number }> = {};
      Object.entries(result.changes_detail).forEach(([k, v]) => {
        highlights[k] = { score_diff: v.score_diff };
      });
      setActiveHighlights(highlights);
      await refreshScores();
      setComment("");
      toast.success("Scores updated");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleReset = async () => {
    try {
      await resetConsultantScores(Number(consultantId));
      await refreshScores();
      toast.success("Scores reset to baseline");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Reset failed");
    }
  };

  const handleDeleteCategory = async (entry: ScoreEntry) => {
    try {
      if (entry.is_custom) {
        await deleteCustomCategory(Number(consultantId), entry.category_key);
      } else {
        await deactivateCategory(Number(consultantId), entry.category_key);
      }
      toast.success(`"${entry.category_label}" removed`);
      await refreshScores();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to remove");
    }
  };

  const totalScore = summary?.total_score ?? 0;
  const totalPossible = summary?.total_possible ?? 100;
  const { grade, tone } = getGrade(totalScore, totalPossible);
  const scorePct = totalPossible > 0 ? Math.round((totalScore / totalPossible) * 100) : 0;

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <TopBar title="Governance Score" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Governance Score" />
      <div className="flex-1 overflow-auto p-6 space-y-5">

        {/* Back */}
        <button
          type="button"
          onClick={() => nav({ to: "/governance" })}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to all consultants
        </button>

        {/* ── Full-width Hero Card ── */}
        <div className="w-full rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
          <div className="flex items-center gap-5">
            <div className="h-14 w-14 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center shrink-0 shadow-sm">
              <User className="h-7 w-7 text-blue-500" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-black text-slate-900 truncate">{consultant?.name || "–"}</h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                <span className="text-sm text-slate-500 font-medium">{consultant?.emp_id}</span>
                {consultant?.skill && <span className="text-sm text-slate-400">• {consultant.skill}</span>}
                {consultant?.designation && <span className="text-sm text-slate-400">• {consultant.designation}</span>}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="flex items-center justify-end gap-2 mb-1">
                <button
                  type="button"
                  onClick={() => setResetOpen(true)}
                  title="Reset all scores to baseline"
                  className="h-7 w-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-baseline gap-1 justify-end">
                <span className="text-7xl font-black text-slate-900 leading-none">{scorePct}</span>
                <span className="text-2xl text-slate-400 font-medium">%</span>
              </div>
              <Badge className={`mt-1 text-sm px-2 py-0.5 ${gradeBadgeClass(tone)}`}>{grade}</Badge>
            </div>
          </div>
          <div className="mt-5">
            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${barColorClass(tone)}`}
                style={{ width: `${scorePct}%` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-xs text-slate-400">{scores.length} active categor{scores.length !== 1 ? "ies" : "y"}</span>
              <span className="text-xs text-slate-400">{scorePct}%</span>
            </div>
          </div>
        </div>

        {/* ── Two-column content ── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

          {/* Left: tabs + content */}
          <div className="xl:col-span-2 space-y-4">
            {/* Tab bar */}
            <div className="flex items-center gap-1 border-b border-slate-200">
              {(["scores", "history", "graph"] as const).map((tab) => {
                const icons = { scores: BarChart3, history: History, graph: LineChartIcon };
                const labels = { scores: "Score Breakdown", history: `History (${history.length})`, graph: "Score Graph" };
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

            {/* Score Breakdown */}
            {activeTab === "scores" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-400">{scores.length} categories · total possible {totalPossible} pts</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1.5 border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600"
                    onClick={() => setManageOpen(true)}
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                    Manage Categories
                  </Button>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 items-start">
                  {scores.map((entry) => (
                    <CategoryKPICard
                      key={entry.category_key}
                      entry={entry}
                      highlight={activeHighlights[entry.category_key]}
                      onDelete={() => handleDeleteCategory(entry)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* History */}
            {activeTab === "history" && (
              <div className="space-y-2">
                {history.length === 0 ? (
                  <div className="text-center py-16 text-slate-400 space-y-2">
                    <History className="h-10 w-10 text-slate-200 mx-auto" />
                    <p className="text-sm">No comments yet — add your first observation</p>
                  </div>
                ) : (
                  history.map((h) => <HistoryCard key={h.id} entry={h} />)
                )}
              </div>
            )}

            {/* Graph */}
            {activeTab === "graph" && (
              <div className="rounded-xl border border-slate-100 bg-white p-5">
                <h3 className="text-sm font-semibold text-slate-700 mb-4">Score over time</h3>
                <ScoreGraph
                  history={history}
                  currentScore={totalScore}
                  totalPossible={totalPossible}
                />
              </div>
            )}
          </div>

          {/* Right: sticky comment input */}
          <div className="xl:col-span-1">
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 space-y-4 sticky top-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-blue-500" />
                <h3 className="font-semibold text-slate-800">Add Observation</h3>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Describe what you observed. The AI will analyse your comment and update the relevant governance scores.
              </p>
              <Textarea
                placeholder="e.g. Employee arrived late three times this week and client raised a concern about missed deliverables."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleAnalyze(); }}
                rows={5}
                className="text-sm resize-none"
                disabled={analyzing}
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">Ctrl+Enter to submit</span>
                <Button
                  onClick={handleAnalyze}
                  disabled={!comment.trim() || analyzing}
                  size="sm"
                  className="bg-sky-600 hover:bg-sky-500 text-white font-semibold shadow-sm"
                >
                  {analyzing ? (
                    <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Analysing…</>
                  ) : (
                    <><Send className="h-4 w-4 mr-1.5" />Analyse & Update</>
                  )}
                </Button>
              </div>
              {lastResult && <CommentResultCard result={lastResult} />}
            </div>
          </div>
        </div>
      </div>

      {/* Manage categories dialog */}
      <ManageCategoriesDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        consultantId={Number(consultantId)}
        activeScores={scores}
        inactiveDefaults={inactiveDefaults}
        onRefresh={async () => { await refreshScores(); }}
      />

      <ResetScoresDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        consultantName={consultant?.name ?? "this consultant"}
        onConfirmed={handleReset}
      />
    </div>
  );
}
