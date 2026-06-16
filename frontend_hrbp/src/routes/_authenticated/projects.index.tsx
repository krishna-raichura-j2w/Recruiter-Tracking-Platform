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
} from "lucide-react";
import {
  listProjects,
  createProject,
  type ProjectSummary,
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

function ProjectsPage() {
  const nav = useNavigate();
  const [projects, setProjects]     = useState<ProjectSummary[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating]     = useState(false);
  const [newName, setNewName]       = useState("");
  const [newDesc, setNewDesc]       = useState("");

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

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createProject({ name: newName.trim(), description: newDesc.trim() });
      toast.success("Project created");
      setCreateOpen(false);
      setNewName(""); setNewDesc("");
      await loadProjects();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to create project");
    } finally {
      setCreating(false);
    }
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
            className="bg-blue-600 hover:bg-blue-700 text-white h-9"
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
              className="mt-2 bg-blue-600 hover:bg-blue-700 text-white"
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
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderKanban className="h-4 w-4 text-blue-500" />
              New Project
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label className="text-sm">Project Name <span className="text-rose-500">*</span></Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Q3 Delivery Team"
                className="h-9 text-sm"
                onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) handleCreate(); }}
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
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setCreateOpen(false); setNewName(""); setNewDesc(""); }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />}
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
