import { useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Plus, Trash2, GripVertical,
  Mail, FileText, FormInput, BarChart2, FileSearch, MessageCircle, RefreshCw,
} from "lucide-react";
import type { HierarchyStep, SopDefinition, UserOption } from "@/apiService/ticketTypes";
import { cn } from "@/lib/utils";

interface Step5HierarchyProps {
  hierarchy: HierarchyStep[];
  onChange: (steps: HierarchyStep[]) => void;
  selectedSop: SopDefinition | null;
  usersByRole: Record<string, UserOption[]>;
}

const ROLE_LABEL: Record<string, string> = {
  hrbp:     "HRBP",
  bh:       "Business Head",
  ops_head: "Operations Head",
  ceo:      "CEO",
  coo:      "COO",
};

const ROLE_COLOR: Record<string, string> = {
  hrbp:     "bg-blue-100 text-blue-800 border-blue-200",
  bh:       "bg-purple-100 text-purple-800 border-purple-200",
  ops_head: "bg-orange-100 text-orange-800 border-orange-200",
  ceo:      "bg-red-100 text-red-800 border-red-200",
  coo:      "bg-gray-100 text-gray-700 border-gray-200",
};

const MEDIUM_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  email:               { label: "Email",           icon: Mail,          color: "text-sky-600 bg-sky-50 border-sky-200" },
  document:            { label: "Document Upload", icon: FileText,      color: "text-amber-600 bg-amber-50 border-amber-200" },
  form:                { label: "Fill Form",        icon: FormInput,     color: "text-violet-600 bg-violet-50 border-violet-200" },
  rag:                 { label: "RAG Selection",    icon: BarChart2,     color: "text-rose-600 bg-rose-50 border-rose-200" },
  document_ai_summary: { label: "Doc + AI Summary",icon: FileSearch,    color: "text-teal-600 bg-teal-50 border-teal-200" },
  comment:             { label: "Comment",          icon: MessageCircle, color: "text-gray-600 bg-gray-50 border-gray-200" },
  status_update:       { label: "Status Update",   icon: RefreshCw,     color: "text-indigo-600 bg-indigo-50 border-indigo-200" },
};

type SopStep = SopDefinition["steps_definition"][number];

function groupSopStepsByRole(sopSteps: SopStep[]): SopStep[][] {
  const groups: SopStep[][] = [];
  let currentRole: string | null = null;
  let currentGroup: SopStep[] = [];
  for (const s of sopSteps) {
    if (s.owner_role !== currentRole) {
      if (currentGroup.length) groups.push(currentGroup);
      currentRole = s.owner_role;
      currentGroup = [s];
    } else {
      currentGroup.push(s);
    }
  }
  if (currentGroup.length) groups.push(currentGroup);
  return groups;
}

/** Map each sopStep.number → { hierarchy entry, hierarchy index } */
function buildStepHierMap(
  hierarchy: HierarchyStep[],
  sopGroups: SopStep[][],
): Map<number, { entry: HierarchyStep; idx: number }> {
  const map = new Map<number, { entry: HierarchyStep; idx: number }>();
  const roleOcc: Record<string, number> = {};
  for (const group of sopGroups) {
    const role = group[0].owner_role;
    const occ = roleOcc[role] ?? 0;
    roleOcc[role] = occ + 1;
    let count = 0;
    for (let i = 0; i < hierarchy.length; i++) {
      if (hierarchy[i].role === role) {
        if (count === occ) {
          for (const s of group) map.set(s.number, { entry: hierarchy[i], idx: i });
          break;
        }
        count++;
      }
    }
  }
  return map;
}

export function Step5Hierarchy({
  hierarchy,
  onChange,
  selectedSop,
  usersByRole,
}: Step5HierarchyProps) {
  const [useCustom, setUseCustom] = useState(false);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const dragIdx = useRef<number | null>(null);

  function applySOPHierarchy() {
    if (!selectedSop) return;
    onChange(
      selectedSop.persons_hierarchy.map((step) => ({
        ...step,
        user_id: null, user_name: null, user_email: null,
        resolved_at: null, resolved_by_id: null, resolved_by_name: null,
      })),
    );
    setUseCustom(false);
  }

  function addStep() {
    onChange([...hierarchy, {
      order: hierarchy.length + 1, role: "hrbp", label: "HRBP",
      user_id: null, user_name: null, user_email: null, sla_window: null,
      resolved_at: null, resolved_by_id: null, resolved_by_name: null,
    }]);
  }

  function removeStep(idx: number) {
    onChange(hierarchy.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i + 1 })));
  }

  function updateStepUser(idx: number, userId: string, role: string) {
    const user = (usersByRole[role] ?? []).find((u: UserOption) => u.id === Number(userId));
    onChange(hierarchy.map((s, i) =>
      i === idx ? {
        ...s,
        user_id: user?.id ?? null,
        user_name: user?.name ?? null,
        user_email: user?.email ?? null,
        role: user?.role ?? s.role,
        label: user ? (ROLE_LABEL[user.role] ?? user.role) : s.label,
      } : s,
    ));
  }

  function updateStepSla(idx: number, sla: string) {
    onChange(hierarchy.map((s, i) => (i === idx ? { ...s, sla_window: sla } : s)));
  }

  function handleDragStart(idx: number) { dragIdx.current = idx; }
  function handleDragOver(e: React.DragEvent, idx: number) { e.preventDefault(); setDragOverIdx(idx); }
  function handleDragEnd() { dragIdx.current = null; setDragOverIdx(null); }
  function handleDrop(dropIdx: number) {
    const fromIdx = dragIdx.current;
    if (fromIdx === null || fromIdx === dropIdx) { setDragOverIdx(null); dragIdx.current = null; return; }
    const next = [...hierarchy];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(dropIdx, 0, moved);
    onChange(next.map((s, i) => ({ ...s, order: i + 1 })));
    dragIdx.current = null;
    setDragOverIdx(null);
  }

  const sopSteps = selectedSop?.steps_definition ?? [];
  const sopGroups = sopSteps.length ? groupSopStepsByRole(sopSteps) : [];
  const stepHierMap = buildStepHierMap(hierarchy, sopGroups);

  return (
    <div className="space-y-4">
      {/* Toggle */}
      <div className="flex items-center gap-2">
        <button type="button"
          onClick={() => { setUseCustom(false); applySOPHierarchy(); }}
          className={cn(
            "px-3 py-1.5 rounded-lg text-sm font-medium border transition-all",
            !useCustom ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300 text-gray-600 hover:border-gray-400",
          )}>
          SOP-Based Hierarchy
        </button>
        <button type="button"
          onClick={() => setUseCustom(true)}
          className={cn(
            "px-3 py-1.5 rounded-lg text-sm font-medium border transition-all",
            useCustom ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300 text-gray-600 hover:border-gray-400",
          )}>
          Custom Hierarchy
        </button>
      </div>

      {!useCustom && selectedSop && (
        <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          Using hierarchy from <strong>{selectedSop.name}</strong> ({selectedSop.sop_type}).
          Switch to Custom to override.
        </div>
      )}

      <div className="space-y-2">
        <Label>Resolution Flow</Label>

        {/* ── SOP-based: one card per SOP step ─────────────────────────── */}
        {!useCustom && sopSteps.length > 0 && (
          <div className="space-y-2">
            {sopSteps.map((sopStep, stepIdx) => {
              const hierInfo = stepHierMap.get(sopStep.number);
              const hierEntry = hierInfo?.entry ?? null;
              const hierIdx   = hierInfo?.idx ?? -1;

              const medium    = MEDIUM_META[sopStep.medium] ?? MEDIUM_META.comment;
              const MediumIcon = medium.icon;

              return (
                <div
                  key={sopStep.number}
                  className="flex items-start gap-3 p-3 border border-gray-200 rounded-xl bg-white"
                >
                  {/* Step number circle */}
                  <div className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    {sopStep.number}
                  </div>

                  <div className="flex-1 min-w-0 space-y-1.5">
                    {/* Badges row */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded-full font-medium border",
                        ROLE_COLOR[sopStep.owner_role] ?? "bg-gray-100 text-gray-600 border-gray-200",
                      )}>
                        {ROLE_LABEL[sopStep.owner_role] ?? sopStep.owner_role.toUpperCase()}
                      </span>
                      <span className={cn(
                        "inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border",
                        medium.color,
                      )}>
                        <MediumIcon className="w-2.5 h-2.5" />
                        {medium.label}
                      </span>
                    </div>

                    {/* Action label */}
                    <p className="text-xs font-semibold text-gray-800">{sopStep.action_label}</p>

                    {/* Action detail */}
                    {sopStep.action_detail && (
                      <p className="text-[11px] text-gray-500 leading-relaxed">{sopStep.action_detail}</p>
                    )}

                    {/* User picker — every step shows its own dropdown; all steps in the same
                        consecutive role group share one hierarchy entry so selecting here
                        updates all steps in the group. */}
                    {hierIdx >= 0 && (
                      <Select
                        value={hierEntry?.user_id ? String(hierEntry.user_id) : ""}
                        onValueChange={(v) => updateStepUser(hierIdx, v, sopStep.owner_role)}
                      >
                        <SelectTrigger className="h-7 text-xs mt-1">
                          <SelectValue placeholder={
                            hierEntry?.user_name
                              ? hierEntry.user_name
                              : `Pick user for ${ROLE_LABEL[sopStep.owner_role] ?? sopStep.owner_role}…`
                          } />
                        </SelectTrigger>
                        <SelectContent>
                          {(usersByRole[sopStep.owner_role] ?? []).map((u: UserOption) => (
                            <SelectItem key={u.id} value={String(u.id)} className="text-xs">
                              {u.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {/* SLA hours */}
                  {sopStep.sla_working_hours != null && (
                    <span className="text-[10px] text-gray-400 flex-shrink-0 whitespace-nowrap mt-1">
                      {sopStep.sla_working_hours}h
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!useCustom && sopSteps.length === 0 && (
          <p className="text-sm text-gray-400 italic">
            {selectedSop ? "Select SOP-Based to auto-fill." : "No SOP selected. Use Custom to build manually."}
          </p>
        )}

        {/* ── Custom mode: drag-reorder role-level cards ─────────────── */}
        {useCustom && (
          <>
            {hierarchy.length === 0 && (
              <p className="text-sm text-gray-400 italic">No steps yet. Add one below.</p>
            )}
            <p className="text-xs text-gray-400">Drag cards to reorder the hierarchy.</p>
            <div className="space-y-2">
              {hierarchy.map((step, idx) => (
                <div
                  key={idx}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDrop={() => handleDrop(idx)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    "flex items-start gap-3 p-3 border rounded-xl bg-white transition-all cursor-grab active:cursor-grabbing",
                    dragOverIdx === idx && dragIdx.current !== idx
                      ? "border-blue-400 bg-blue-50 shadow-md scale-[1.01]"
                      : "border-gray-200",
                  )}
                >
                  <div className="flex-shrink-0 flex items-center gap-1.5 mt-0.5">
                    <GripVertical className="w-4 h-4 text-gray-400" />
                    <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
                      {step.order}
                    </div>
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium border", ROLE_COLOR[step.role] ?? "bg-gray-100 text-gray-600 border-gray-200")}>
                        {ROLE_LABEL[step.role] ?? step.role}
                      </span>
                      {step.sla_window && <span className="text-xs text-gray-500">⏱ {step.sla_window}</span>}
                    </div>
                    <Select
                      value={step.user_id ? String(step.user_id) : ""}
                      onValueChange={(v) => updateStepUser(idx, v, step.role)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder={step.user_name ? step.user_name : `Pick user for ${ROLE_LABEL[step.role] ?? step.role}…`} />
                      </SelectTrigger>
                      <SelectContent>
                        {(usersByRole[step.role] ?? []).map((u: UserOption) => (
                          <SelectItem key={u.id} value={String(u.id)} className="text-xs">{u.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <input
                      type="text"
                      placeholder="SLA window (e.g. 0 to 8 hrs)"
                      value={step.sla_window ?? ""}
                      onChange={(e) => updateStepSla(idx, e.target.value)}
                      className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                  </div>
                  <button type="button" onClick={() => removeStep(idx)}
                    className="text-gray-400 hover:text-red-500 transition-colors mt-1 flex-shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addStep} className="gap-2">
              <Plus className="w-3.5 h-3.5" /> Add Step
            </Button>
          </>
        )}
      </div>

      {/* Summary */}
      {hierarchy.length > 0 && (
        <div className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
          <strong>Flow:</strong>{" "}
          {hierarchy.map((s) => s.user_name ?? ROLE_LABEL[s.role] ?? s.role).join(" → ")}
        </div>
      )}
    </div>
  );
}
