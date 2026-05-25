import { useState } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, GripVertical } from "lucide-react";
import type { HierarchyStep, SopDefinition, UserOption } from "@/apiService/ticketTypes";
import { cn } from "@/lib/utils";

interface Step5HierarchyProps {
  hierarchy: HierarchyStep[];
  onChange: (steps: HierarchyStep[]) => void;
  selectedSop: SopDefinition | null;
  allUsers: UserOption[];
}

const ROLE_LABEL: Record<string, string> = {
  hrbp:     "HRBP",
  bh:       "Business Head",
  ops_head: "Operations Head",
  priti:    "Priti (MD)",
  coo:      "COO",
};

const ROLE_COLOR: Record<string, string> = {
  hrbp:     "bg-blue-100 text-blue-800",
  bh:       "bg-purple-100 text-purple-800",
  ops_head: "bg-orange-100 text-orange-800",
  priti:    "bg-red-100 text-red-800",
  coo:      "bg-gray-100 text-gray-700",
};

export function Step5Hierarchy({
  hierarchy,
  onChange,
  selectedSop,
  allUsers,
}: Step5HierarchyProps) {
  const [useCustom, setUseCustom] = useState(false);

  function applySOPHierarchy() {
    if (!selectedSop) return;
    onChange(
      selectedSop.persons_hierarchy.map((step) => ({
        ...step,
        user_id: null,
        user_name: null,
        user_email: null,
        resolved_at: null,
        resolved_by_id: null,
        resolved_by_name: null,
      })),
    );
    setUseCustom(false);
  }

  function addStep() {
    const next: HierarchyStep = {
      order: hierarchy.length + 1,
      role: "hrbp",
      label: "HRBP",
      user_id: null,
      user_name: null,
      user_email: null,
      sla_window: null,
      resolved_at: null,
      resolved_by_id: null,
      resolved_by_name: null,
    };
    onChange([...hierarchy, next]);
  }

  function removeStep(idx: number) {
    const updated = hierarchy
      .filter((_, i) => i !== idx)
      .map((s, i) => ({ ...s, order: i + 1 }));
    onChange(updated);
  }

  function updateStepUser(idx: number, userId: string) {
    const user = allUsers.find((u) => u.id === Number(userId));
    const updated = hierarchy.map((s, i) =>
      i === idx
        ? {
            ...s,
            user_id: user?.id ?? null,
            user_name: user?.name ?? null,
            user_email: user?.email ?? null,
            role: user?.role ?? s.role,
            label: user ? (ROLE_LABEL[user.role] ?? user.role) : s.label,
          }
        : s,
    );
    onChange(updated);
  }

  function updateStepSla(idx: number, sla: string) {
    onChange(hierarchy.map((s, i) => (i === idx ? { ...s, sla_window: sla } : s)));
  }

  return (
    <div className="space-y-4">
      {/* Toggle */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => { setUseCustom(false); applySOPHierarchy(); }}
          className={cn(
            "px-3 py-1.5 rounded-lg text-sm font-medium border transition-all",
            !useCustom
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-gray-300 text-gray-600 hover:border-gray-400",
          )}
        >
          SOP-Based Hierarchy
        </button>
        <button
          type="button"
          onClick={() => setUseCustom(true)}
          className={cn(
            "px-3 py-1.5 rounded-lg text-sm font-medium border transition-all",
            useCustom
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-gray-300 text-gray-600 hover:border-gray-400",
          )}
        >
          Custom Hierarchy
        </button>
      </div>

      {/* SOP explanation when SOP-based */}
      {!useCustom && selectedSop && (
        <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          Using hierarchy from <strong>{selectedSop.name}</strong> ({selectedSop.sop_type}).
          Switch to Custom to override.
        </div>
      )}

      {/* Hierarchy steps */}
      <div className="space-y-2">
        <Label>Resolution Flow</Label>
        {hierarchy.length === 0 && (
          <p className="text-sm text-gray-400 italic">
            {selectedSop ? "Select SOP-Based to auto-fill." : "No SOP selected. Use Custom to build manually."}
          </p>
        )}

        <div className="space-y-2">
          {hierarchy.map((step, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 p-3 border border-gray-200 rounded-xl bg-white"
            >
              {/* Step number */}
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                {step.order}
              </div>

              <div className="flex-1 space-y-2">
                {/* Role badge + label */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={cn(
                      "text-xs px-2 py-0.5 rounded-full font-medium",
                      ROLE_COLOR[step.role] ?? "bg-gray-100 text-gray-600",
                    )}
                  >
                    {ROLE_LABEL[step.role] ?? step.role}
                  </span>
                  {step.sla_window && (
                    <span className="text-xs text-gray-500">⏱ {step.sla_window}</span>
                  )}
                </div>

                {/* Assign user (custom mode or to resolve actual user in SOP mode) */}
                <Select
                  value={step.user_id ? String(step.user_id) : ""}
                  onValueChange={(v) => updateStepUser(idx, v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue
                      placeholder={
                        step.user_name
                          ? step.user_name
                          : `Pick user for ${ROLE_LABEL[step.role] ?? step.role}…`
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {allUsers.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)} className="text-xs">
                        {u.name}{" "}
                        <span className="text-gray-400 ml-1">
                          ({ROLE_LABEL[u.role] ?? u.role})
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* SLA override (custom mode) */}
                {useCustom && (
                  <input
                    type="text"
                    placeholder="SLA window (e.g. 0 to 8 hrs)"
                    value={step.sla_window ?? ""}
                    onChange={(e) => updateStepSla(idx, e.target.value)}
                    className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                )}
              </div>

              {/* Remove (custom only) */}
              {useCustom && (
                <button
                  type="button"
                  onClick={() => removeStep(idx)}
                  className="text-gray-400 hover:text-red-500 transition-colors mt-1"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        {useCustom && (
          <Button type="button" variant="outline" size="sm" onClick={addStep} className="gap-2">
            <Plus className="w-3.5 h-3.5" />
            Add Step
          </Button>
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
