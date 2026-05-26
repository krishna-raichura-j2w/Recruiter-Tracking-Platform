import { CheckCircle2, Circle, Clock } from "lucide-react";
import type { HierarchyStep } from "@/apiService/ticketTypes";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/formatDate";

interface TicketHierarchyProgressProps {
  hierarchy: HierarchyStep[];
  currentStep: number;
  currentUserId?: number;
  status: string;
}

const ROLE_COLOR: Record<string, string> = {
  hrbp:     "bg-blue-100 text-blue-800 border-blue-200",
  bh:       "bg-purple-100 text-purple-800 border-purple-200",
  ops_head: "bg-orange-100 text-orange-800 border-orange-200",
  ceo:      "bg-red-100 text-red-800 border-red-200",
  coo:      "bg-gray-100 text-gray-700 border-gray-200",
};

const formatTs = fmtDateTime;

export function TicketHierarchyProgress({
  hierarchy,
  currentStep,
  currentUserId,
  status,
}: TicketHierarchyProgressProps) {
  return (
    <div className="space-y-0">
      {hierarchy.map((step, idx) => {
        const stepNum = idx + 1;
        const isDone = stepNum < currentStep || status === "closed";
        const isActive = stepNum === currentStep && status === "open";
        const isFuture = stepNum > currentStep;
        const isMyTurn = isActive && step.user_id === currentUserId;

        return (
          <div key={idx} className="flex gap-4">
            {/* Line + icon column */}
            <div className="flex flex-col items-center w-8 flex-shrink-0">
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center z-10 border-2",
                  isDone
                    ? "bg-green-500 border-green-500 text-white"
                    : isActive
                    ? "bg-blue-600 border-blue-600 text-white animate-pulse"
                    : "bg-white border-gray-300 text-gray-400",
                )}
              >
                {isDone ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : isActive ? (
                  <Clock className="w-4 h-4" />
                ) : (
                  <Circle className="w-4 h-4" />
                )}
              </div>
              {idx < hierarchy.length - 1 && (
                <div className={cn("w-0.5 flex-1 mt-1", isDone ? "bg-green-300" : "bg-gray-200")} />
              )}
            </div>

            {/* Content */}
            <div className={cn("flex-1 pb-5", idx === hierarchy.length - 1 && "pb-0")}>
              <div
                className={cn(
                  "rounded-xl border p-3 transition-all",
                  isDone && "border-green-100 bg-green-50",
                  isActive && isMyTurn && "border-blue-300 bg-blue-50 shadow-sm",
                  isActive && !isMyTurn && "border-blue-100 bg-blue-50/50",
                  isFuture && "border-gray-100 bg-gray-50 opacity-60",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={cn(
                          "text-xs px-2 py-0.5 rounded-full font-medium border",
                          ROLE_COLOR[step.role] ?? "bg-gray-100 text-gray-600 border-gray-200",
                        )}
                      >
                        {step.label}
                      </span>
                      {isMyTurn && (
                        <span className="text-xs font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                          Your Turn
                        </span>
                      )}
                    </div>
                    {step.user_name && (
                      <p className="text-sm font-medium text-gray-800 mt-1">{step.user_name}</p>
                    )}
                    {step.user_email && (
                      <p className="text-xs text-gray-400">{step.user_email}</p>
                    )}
                  </div>
                  <div className="text-right text-xs text-gray-500 flex-shrink-0">
                    {step.sla_window && (
                      <p className="text-gray-400">SLA: {step.sla_window}</p>
                    )}
                  </div>
                </div>

                {isDone && step.resolved_at && (
                  <div className="mt-2 pt-2 border-t border-green-200 text-xs text-green-700">
                    ✓ Resolved by <strong>{step.resolved_by_name ?? "—"}</strong> on{" "}
                    {formatTs(step.resolved_at)}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
