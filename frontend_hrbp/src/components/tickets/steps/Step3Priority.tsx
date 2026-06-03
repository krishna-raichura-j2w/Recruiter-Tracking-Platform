import { DateTimePicker } from "@/components/CustomDateTimePicker";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Step3Data {
  priority: "critical" | "high" | "medium" | "low";
  slaDeadline: string;
}

interface Step3PriorityProps {
  data: Step3Data;
  onChange: (data: Step3Data) => void;
  sopSlaHint?: string;
  poRiskAmount?: number | null;
}

const PRIORITIES = [
  {
    value: "critical" as const,
    label: "Critical",
    icon: "🔴",
    desc: "Immediate action needed. Revenue or legal risk.",
    border: "border-red-500",
    bg: "bg-red-50",
    text: "text-red-700",
    selected: "border-red-600 bg-red-50 ring-2 ring-red-200",
  },
  {
    value: "high" as const,
    label: "High",
    icon: "🟠",
    desc: "Urgent. Resolve within 48 hours.",
    border: "border-orange-400",
    bg: "bg-orange-50",
    text: "text-orange-700",
    selected: "border-orange-500 bg-orange-50 ring-2 ring-orange-200",
  },
  {
    value: "medium" as const,
    label: "Medium",
    icon: "🔵",
    desc: "Standard priority. Resolve within 1 week.",
    border: "border-blue-400",
    bg: "bg-blue-50",
    text: "text-blue-700",
    selected: "border-blue-500 bg-blue-50 ring-2 ring-blue-200",
  },
  {
    value: "low" as const,
    label: "Low",
    icon: "🟢",
    desc: "Non-urgent. Resolve when bandwidth allows.",
    border: "border-green-400",
    bg: "bg-green-50",
    text: "text-green-700",
    selected: "border-green-500 bg-green-50 ring-2 ring-green-200",
  },
] as const;

function formatInr(v: number): string {
  if (v >= 10_00_000) return `₹${(v / 10_00_000).toFixed(2)}L`;
  if (v >= 1_000) return `₹${(v / 1_000).toFixed(1)}K`;
  return `₹${v.toFixed(0)}`;
}

export function Step3Priority({ data, onChange, sopSlaHint, poRiskAmount }: Step3PriorityProps) {
  return (
    <div className="space-y-6">
      {/* PO risk context banner */}
      {poRiskAmount != null && poRiskAmount > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <span className="text-lg leading-none">⚠️</span>
          <div>
            <p className="text-sm font-semibold text-amber-800">
              PO at Risk: {formatInr(poRiskAmount)}
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Use this to guide your priority selection below.
            </p>
          </div>
        </div>
      )}

      {/* Priority tiles */}
      <div className="space-y-2">
        <Label>Ticket Priority <span className="text-red-500">*</span></Label>
        <div className="grid grid-cols-2 gap-3">
          {PRIORITIES.map((p) => {
            const isSelected = data.priority === p.value;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => onChange({ ...data, priority: p.value })}
                className={cn(
                  "text-left p-4 rounded-xl border-2 transition-all",
                  isSelected ? p.selected : `border-gray-200 hover:${p.bg} hover:border-gray-300`,
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span>{p.icon}</span>
                  <span className={cn("font-semibold text-sm", isSelected ? p.text : "text-gray-700")}>
                    {p.label}
                  </span>
                </div>
                <p className="text-xs text-gray-500">{p.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* SLA Deadline */}
      <div className="space-y-2">
        <Label>
          SLA Deadline
          <span className="text-gray-400 text-xs font-normal ml-1">
            — deadline by which this ticket must be resolved
          </span>
        </Label>
        {sopSlaHint && (
          <div className="flex items-start gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
            <span className="text-base leading-none">ℹ️</span>
            <span>Auto-suggested from SOP: {sopSlaHint}</span>
          </div>
        )}
        <DateTimePicker
          value={data.slaDeadline}
          onChange={(iso) => onChange({ ...data, slaDeadline: iso })}
          placeholder="Select deadline date & time"
          disablePast
        />
      </div>
    </div>
  );
}
