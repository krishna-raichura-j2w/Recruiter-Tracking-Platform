import type { SopDefinition } from "@/apiService/ticketTypes";
import { cn } from "@/lib/utils";

const SOP_ICONS: Record<string, string> = {
  "SOP-2": "🚪",
  "SOP-3": "📄",
  "SOP-4": "🔄",
  "SOP-5": "📊",
  "SOP-6": "⚠️",
  "SOP-7": "🏃",
  "SOP-8": "🏥",
  "SOP-9": "💰",
};

interface Step2SOPProps {
  sops: SopDefinition[];
  selectedSopId: number | null;
  onSelect: (sop: SopDefinition) => void;
}

export function Step2SOP({ sops, selectedSopId, onSelect }: Step2SOPProps) {
  const selected = sops.find((s) => s.id === selectedSopId) ?? null;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-gray-600 mb-3">
          Select the request type (SOP) that best describes this situation.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {sops.map((sop) => {
            const isSelected = sop.id === selectedSopId;
            return (
              <button
                key={sop.id}
                type="button"
                onClick={() => onSelect(sop)}
                className={cn(
                  "text-left p-4 rounded-xl border-2 transition-all",
                  isSelected
                    ? "border-blue-600 bg-blue-50 shadow-sm"
                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50",
                )}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl leading-none mt-0.5">
                    {SOP_ICONS[sop.sop_type] ?? "📋"}
                  </span>
                  <div>
                    <p
                      className={cn(
                        "font-semibold text-sm leading-snug",
                        isSelected ? "text-blue-700" : "text-gray-800",
                      )}
                    >
                      {sop.name}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{sop.sop_type}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* SOP definition panel */}
      {selected && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 space-y-3">
          <div>
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">
              SOP Definition
            </p>
            <p className="text-sm text-gray-700">{selected.description}</p>
          </div>

          {selected.steps_definition?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">
                Steps Overview ({selected.steps_definition.length} steps)
              </p>
              <div className="space-y-1">
                {selected.steps_definition.slice(0, 4).map((step) => (
                  <div key={step.number} className="flex items-start gap-2 text-xs text-gray-600">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-200 text-blue-800 flex items-center justify-center font-bold text-xs">
                      {step.number}
                    </span>
                    <span>{step.action_label}</span>
                  </div>
                ))}
                {selected.steps_definition.length > 4 && (
                  <p className="text-xs text-gray-400 pl-7">
                    +{selected.steps_definition.length - 4} more steps…
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center gap-4 text-xs text-gray-500 pt-1 border-t border-blue-100">
            <span>
              KRA:{" "}
              <span className="font-medium text-gray-700">
                {selected.kra_tags?.join(", ") || "—"}
              </span>
            </span>
            <span>
              Control:{" "}
              <span className="font-medium text-gray-700">{selected.control_level}</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
