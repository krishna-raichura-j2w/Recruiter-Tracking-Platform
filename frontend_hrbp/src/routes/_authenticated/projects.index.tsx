import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { TopBar } from "@/components/TopBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FolderKanban,
  Plus,
  Search,
  Loader2,
  ArrowRight,
  Users,
  Check,
  X,
  ChevronRight,
} from "lucide-react";
import {
  listProjects,
  createProject,
  setProjectKpis,
  type ProjectSummary,
  type ProjectKpiDefinition,
} from "@/apiService/projectApi";
import { toast } from "react-toastify";

export const Route = createFileRoute("/_authenticated/projects/")({
  component: ProjectsPage,
});

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

function ProjectCard({ project, onClick }: { project: ProjectSummary; onClick: () => void }) {
  return (
    <div
      className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md hover:border-blue-200 transition-all cursor-pointer group"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-slate-900 text-base truncate group-hover:text-blue-700 transition-colors">
            {project.name}
          </h3>
          {project.description && (
            <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{project.description}</p>
          )}
        </div>
        <Badge className={`shrink-0 text-xs px-2 py-0.5 border ${gradeBadgeClass(project.tone)}`}>
          {project.grade}
        </Badge>
      </div>

      <div className="flex items-end justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-baseline gap-1 mb-1.5">
            <span className="text-3xl font-black text-slate-900">{project.avg_pct}</span>
            <span className="text-sm text-slate-400 font-medium">%</span>
            <span className="ml-auto text-xs text-slate-400 flex items-center gap-1">
              <Users className="h-3 w-3" />
              {project.member_count} member{project.member_count !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${barColorClass(project.tone)}`}
              style={{ width: `${project.avg_pct}%` }}
            />
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all shrink-0" />
      </div>

      {project.status === "archived" && (
        <div className="mt-3">
          <Badge className="text-[10px] px-1.5 bg-slate-100 text-slate-500 border border-slate-200">
            Archived
          </Badge>
        </div>
      )}
    </div>
  );
}

const DEFAULT_KPIS_LIST: Array<Omit<ProjectKpiDefinition, "id" | "sort_order">> = [
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

function ProjectsPage() {
  const nav = useNavigate();
  const [projects, setProjects]     = useState<ProjectSummary[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating]     = useState(false);
  const [newName, setNewName]       = useState("");
  const [newDesc, setNewDesc]       = useState("");
  // Step 2 – KPI selection
  const [createStep, setCreateStep]         = useState<1 | 2>(1);
  const [kpiSelected, setKpiSelected]       = useState<Set<string>>(
    new Set(DEFAULT_KPIS_LIST.map((k) => k.category_key)),
  );
  const [kpiCustoms, setKpiCustoms]         = useState<Array<{ key: string; label: string; max_score: number }>>([]);
  const [kpiCustomLabel, setKpiCustomLabel] = useState("");
  const [kpiCustomMax,   setKpiCustomMax]   = useState(10);

  const loadProjects = useCallback(async () => {
    try {
      const data = await listProjects();
      setProjects(data);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const resetCreateDialog = () => {
    setNewName(""); setNewDesc(""); setCreateStep(1);
    setKpiSelected(new Set(DEFAULT_KPIS_LIST.map((k) => k.category_key)));
    setKpiCustoms([]); setKpiCustomLabel(""); setKpiCustomMax(10);
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const proj = await createProject({ name: newName.trim(), description: newDesc.trim() });
      // Save KPI definitions if any selections were made
      const stdKpis = DEFAULT_KPIS_LIST.filter((k) => kpiSelected.has(k.category_key));
      const custKpis = kpiCustoms.map((c) => ({
        category_key: c.key, label: c.label, max_score: c.max_score,
        escalation_base: 2, description: "", is_custom: true as const, options: null,
      }));
      const kpis = [...stdKpis, ...custKpis];
      if (kpis.length > 0) await setProjectKpis(proj.id, kpis);
      toast.success("Project created");
      setCreateOpen(false);
      resetCreateDialog();
      await loadProjects();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to create project");
    } finally {
      setCreating(false);
    }
  };

  const toggleKpiDefault = (key: string) => {
    setKpiSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const addKpiCustom = () => {
    const label = kpiCustomLabel.trim();
    if (!label) return;
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30);
    const key = `custom_${slug}`;
    if (kpiCustoms.some((c) => c.key === key)) return;
    setKpiCustoms((prev) => [...prev, { key, label, max_score: kpiCustomMax }]);
    setKpiCustomLabel(""); setKpiCustomMax(10);
  };

  const filtered = projects.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.description || "").toLowerCase().includes(search.toLowerCase()),
  );
  const active   = filtered.filter((p) => p.status === "active");
  const archived = filtered.filter((p) => p.status === "archived");

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Projects" />
      <div className="flex-1 overflow-auto p-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search projects…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
          <Button
            onClick={() => setCreateOpen(true)}
            size="sm"
            className="bg-sky-600 hover:bg-sky-500 text-white font-semibold shadow-sm h-9"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            New Project
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400 space-y-3">
            <FolderKanban className="h-14 w-14 text-slate-200" />
            <p className="text-sm font-medium">No projects yet</p>
            <p className="text-xs">Create your first project to start tracking team governance</p>
            <Button
              onClick={() => setCreateOpen(true)}
              size="sm"
              className="mt-2 bg-sky-600 hover:bg-sky-500 text-white font-semibold shadow-sm"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              New Project
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Active */}
            {active.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Active ({active.length})
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {active.map((p) => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      onClick={() => nav({ to: "/projects/$projectId", params: { projectId: String(p.id) } })}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Archived */}
            {archived.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  Archived ({archived.length})
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 opacity-60">
                  {archived.map((p) => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      onClick={() => nav({ to: "/projects/$projectId", params: { projectId: String(p.id) } })}
                    />
                  ))}
                </div>
              </div>
            )}

            {filtered.length === 0 && search && (
              <p className="text-sm text-slate-400 text-center py-10">
                No projects match "{search}"
              </p>
            )}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={(v) => { if (!v) resetCreateDialog(); setCreateOpen(v); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderKanban className="h-4 w-4 text-blue-500" />
              New Project
              <span className="ml-auto text-xs font-normal text-slate-400">Step {createStep} of 2</span>
            </DialogTitle>
          </DialogHeader>

          {createStep === 1 ? (
            <div className="space-y-4 pt-1">
              <div className="space-y-1.5">
                <Label className="text-sm">Project Name <span className="text-rose-500">*</span></Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Q3 Delivery Team"
                  className="h-9 text-sm"
                  onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) setCreateStep(2); }}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Description <span className="text-slate-400">(optional)</span></Label>
                <Textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Brief description of this project…"
                  rows={3}
                  className="text-sm resize-none"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => { setCreateOpen(false); resetCreateDialog(); }}>
                  Cancel
                </Button>
                <Button
                  onClick={() => setCreateStep(2)}
                  disabled={!newName.trim()}
                  className="flex-1 bg-sky-600 hover:bg-sky-500 text-white font-semibold shadow-sm"
                >
                  Next: Configure KPIs
                  <ChevronRight className="h-4 w-4 ml-1.5" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 pt-1">
              <p className="text-xs text-slate-500">
                Select which governance KPIs apply to <span className="font-semibold text-slate-700">{newName}</span>.
                These will be synced to every consultant added to this project.
              </p>

              {/* Standard KPIs */}
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Standard Categories</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {DEFAULT_KPIS_LIST.map((kpi) => {
                    const on = kpiSelected.has(kpi.category_key);
                    return (
                      <button
                        key={kpi.category_key}
                        type="button"
                        onClick={() => toggleKpiDefault(kpi.category_key)}
                        className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left text-xs transition-colors ${
                          on ? "border-blue-300 bg-blue-50 text-blue-800" : "border-slate-200 text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        <div className={`h-3.5 w-3.5 rounded border-2 flex items-center justify-center shrink-0 ${on ? "border-blue-500 bg-blue-500" : "border-slate-300"}`}>
                          {on && <Check className="h-2 w-2 text-white" />}
                        </div>
                        <span className="truncate">{kpi.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom KPIs */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Custom KPIs</p>
                {kpiCustoms.map((c) => (
                  <div key={c.key} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-purple-200 bg-purple-50 text-xs">
                    <span className="flex-1 font-medium text-purple-800 truncate">{c.label}</span>
                    <span className="text-purple-400">{c.max_score} pts</span>
                    <button type="button" onClick={() => setKpiCustoms((prev) => prev.filter((x) => x.key !== c.key))} className="text-slate-400 hover:text-rose-500">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={kpiCustomLabel}
                    onChange={(e) => setKpiCustomLabel(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addKpiCustom()}
                    placeholder="Custom KPI name"
                    className="flex-1 text-xs border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                  />
                  <input
                    type="number"
                    value={kpiCustomMax}
                    min={1}
                    max={50}
                    onChange={(e) => setKpiCustomMax(Number(e.target.value))}
                    className="w-14 text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                  />
                  <Button size="sm" variant="outline" onClick={addKpiCustom} className="h-7 text-xs px-2">
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setCreateStep(1)}>
                  Back
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={creating}
                  className="flex-1 bg-sky-600 hover:bg-sky-500 text-white font-semibold shadow-sm"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />}
                  Create Project
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
