import {
  CheckCircle2, Circle, Clock, MessageSquare,
  Mail, FileText, FormInput, BarChart2, FileSearch, MessageCircle, RefreshCw,
  Paperclip,
} from "lucide-react";
import type { HierarchyStep, SopDefinition, TicketComment, StepSubmission } from "@/apiService/ticketTypes";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/formatDate";

interface TicketHierarchyProgressProps {
  hierarchy: HierarchyStep[];
  currentStep: number;
  currentUserId?: number;
  status: string;
  sopSteps?: SopDefinition["steps_definition"];
  comments?: TicketComment[];
  stepSubmissions?: StepSubmission[];
}

type SopStep = SopDefinition["steps_definition"][number];

const ROLE_COLOR: Record<string, string> = {
  hrbp:     "bg-blue-100 text-blue-800 border-blue-200",
  bh:       "bg-purple-100 text-purple-800 border-purple-200",
  ops_head: "bg-orange-100 text-orange-800 border-orange-200",
  ceo:      "bg-red-100 text-red-800 border-red-200",
  coo:      "bg-gray-100 text-gray-700 border-gray-200",
};

const ROLE_LABEL: Record<string, string> = {
  hrbp:     "HRBP",
  bh:       "Business Head",
  ops_head: "OPS Head",
  coo:      "COO",
  ceo:      "CEO",
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

const formatTs = fmtDateTime;

/** Compact display of a submitted step action. */
function StepSubmissionCard({ sub }: { sub: StepSubmission }) {
  const meta = MEDIUM_META[sub.medium] ?? MEDIUM_META.comment;
  const Icon = meta.icon;

  const body = (() => {
    const fd = sub.form_data;
    if (sub.medium === "rag" && fd?.rag_value) {
      const v = fd.rag_value as string;
      return (
        <span className={cn(
          "inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase",
          v === "red"   ? "bg-red-100 text-red-700 border-red-300"
          : v === "amber" ? "bg-amber-100 text-amber-700 border-amber-300"
          :                 "bg-green-100 text-green-700 border-green-300",
        )}>
          {v}
        </span>
      );
    }
    if (sub.medium === "email") {
      return <span className="text-[11px] text-green-700">Email marked as sent</span>;
    }
    if (sub.medium === "status_update" && fd?.status) {
      return (
        <span className="text-[11px] text-gray-700">
          Status set to: <strong>{fd.status as string}</strong>
        </span>
      );
    }
    if (sub.medium === "comment" && fd?.content) {
      return (
        <p className="text-[11px] text-gray-700 line-clamp-3 leading-relaxed">
          {fd.content as string}
        </p>
      );
    }
    if (sub.medium === "form" && fd) {
      return (
        <ul className="text-[11px] text-gray-700 space-y-0.5">
          {Object.entries(fd).slice(0, 4).map(([k, v]) => (
            <li key={k}>
              <span className="text-gray-400 capitalize">{k.replace(/_/g, " ")}:</span>{" "}
              <strong>{String(v)}</strong>
            </li>
          ))}
        </ul>
      );
    }
    if (sub.attachments?.length) {
      return (
        <div className="space-y-0.5">
          {sub.attachments.map((url, i) => (
            <a key={i} href={url} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 text-[11px] text-blue-600 hover:underline truncate">
              <Paperclip className="w-2.5 h-2.5 flex-shrink-0" />
              {url.split("/").pop() ?? `File ${i + 1}`}
            </a>
          ))}
        </div>
      );
    }
    if (sub.ai_summary) {
      return <p className="text-[11px] text-gray-700 line-clamp-3 leading-relaxed">{sub.ai_summary}</p>;
    }
    return <span className="text-[11px] text-green-700">Submitted</span>;
  })();

  return (
    <div className="mt-2 rounded-lg border border-green-200 bg-green-50 px-2.5 py-2">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3 h-3 text-green-600 flex-shrink-0" />
        <span className="text-[10px] font-semibold text-green-700 uppercase tracking-wide">
          {meta.label}
        </span>
        {sub.submitted_by_name && (
          <span className="text-[10px] text-gray-400 ml-auto">
            by {sub.submitted_by_name}
          </span>
        )}
      </div>
      {body}
      {sub.submitted_at && (
        <p className="text-[10px] text-gray-400 mt-1">{formatTs(sub.submitted_at)}</p>
      )}
    </div>
  );
}

/** Partition sopSteps into consecutive groups by owner_role. */
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

/**
 * Build a map from sopStep.number → HierarchyStep for user/resolved info.
 * Handles both per-step hierarchy (lengths match) and role-level hierarchy.
 */
function buildStepUserMap(
  hierarchy: HierarchyStep[],
  sopSteps: SopStep[],
): Map<number, HierarchyStep> {
  const map = new Map<number, HierarchyStep>();
  if (!sopSteps.length || !hierarchy.length) return map;

  if (hierarchy.length === sopSteps.length) {
    // Per-step: direct index mapping
    sopSteps.forEach((s, i) => map.set(s.number, hierarchy[i]));
    return map;
  }

  // Role-level: use consecutive role-group algorithm
  const groups = groupSopStepsByRole(sopSteps);
  const roleOcc: Record<string, number> = {};
  for (const group of groups) {
    const role = group[0].owner_role;
    const occ = roleOcc[role] ?? 0;
    roleOcc[role] = occ + 1;
    let count = 0;
    for (const h of hierarchy) {
      if (h.role === role) {
        if (count === occ) {
          for (const s of group) map.set(s.number, h);
          break;
        }
        count++;
      }
    }
  }
  return map;
}

/**
 * Compute which sop step number range is done vs active vs future.
 * Returns doneUpTo (inclusive), activeFrom, activeTo (inclusive).
 */
function computeStepRanges(
  hierarchy: HierarchyStep[],
  sopSteps: SopStep[],
  currentStep: number,
  status: string,
): { doneUpTo: number; activeFrom: number; activeTo: number } {
  if (!sopSteps.length) {
    return { doneUpTo: currentStep - 1, activeFrom: currentStep, activeTo: currentStep };
  }

  if (status === "closed") {
    const last = sopSteps[sopSteps.length - 1].number;
    return { doneUpTo: last, activeFrom: last + 1, activeTo: last + 1 };
  }

  // Per-step: current_step IS the sop step number
  if (hierarchy.length === sopSteps.length) {
    return { doneUpTo: currentStep - 1, activeFrom: currentStep, activeTo: currentStep };
  }

  // Role-level: map currentStep (role-group index, 1-based) to sop step range
  const groups = groupSopStepsByRole(sopSteps);
  const groupIdx = currentStep - 1;

  let doneUpTo = 0;
  for (let i = 0; i < groupIdx && i < groups.length; i++) {
    const g = groups[i];
    doneUpTo = Math.max(doneUpTo, g[g.length - 1].number);
  }

  const currentGroup = groups[groupIdx];
  const activeFrom = currentGroup?.[0]?.number ?? doneUpTo + 1;
  const activeTo   = currentGroup?.[currentGroup.length - 1]?.number ?? activeFrom;

  return { doneUpTo, activeFrom, activeTo };
}

export function TicketHierarchyProgress({
  hierarchy,
  currentStep,
  currentUserId,
  status,
  sopSteps = [],
  comments = [],
  stepSubmissions = [],
}: TicketHierarchyProgressProps) {

  // ── Per-step rendering (primary path when sopSteps available) ──────────
  if (sopSteps.length > 0) {
    const isPerStep  = hierarchy.length === sopSteps.length;
    const stepUserMap = buildStepUserMap(hierarchy, sopSteps);
    const { doneUpTo, activeFrom, activeTo } = computeStepRanges(hierarchy, sopSteps, currentStep, status);

    // Set of last-step-in-group numbers (for resolved_at display on role-level tickets)
    const lastInGroupSet = new Set<number>();
    for (const group of groupSopStepsByRole(sopSteps)) {
      lastInGroupSet.add(group[group.length - 1].number);
    }

    return (
      <div className="space-y-0">
        {sopSteps.map((sopStep, idx) => {
          const h         = stepUserMap.get(sopStep.number) ?? null;
          const isDone    = sopStep.number <= doneUpTo || status === "closed";
          const isActive  = !isDone && sopStep.number >= activeFrom && sopStep.number <= activeTo;
          const isFuture  = !isDone && !isActive;
          const isMyTurn  = isActive && h?.user_id === currentUserId;

          const medium    = MEDIUM_META[sopStep.medium] ?? MEDIUM_META.comment;
          const MediumIcon = medium.icon;

          // Comments: per-step tickets key by sop step number; role-level by hierarchy index
          const hierIdx = h ? hierarchy.indexOf(h) + 1 : -1;
          const stepComments = comments.filter((c) =>
            isPerStep
              ? c.hierarchy_step === sopStep.number
              : c.hierarchy_step === hierIdx && lastInGroupSet.has(sopStep.number),
          );

          // Show resolved_at on the last step in the role group (avoids repeating it 5 times)
          const showResolved = isDone && h?.resolved_at && (isPerStep || lastInGroupSet.has(sopStep.number));

          return (
            <div key={sopStep.number} className="flex gap-4">
              {/* Timeline column */}
              <div className="flex flex-col items-center w-8 flex-shrink-0">
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center z-10 border-2 flex-shrink-0",
                    isDone    ? "bg-green-500 border-green-500 text-white"
                    : isActive ? "bg-blue-600 border-blue-600 text-white animate-pulse"
                    :            "bg-white border-gray-300 text-gray-400",
                  )}
                >
                  {isDone    ? <CheckCircle2 className="w-4 h-4" />
                  : isActive  ? <Clock className="w-4 h-4" />
                  :             <Circle className="w-4 h-4" />}
                </div>
                {idx < sopSteps.length - 1 && (
                  <div className={cn("w-0.5 flex-1 mt-1", isDone ? "bg-green-300" : "bg-gray-200")} />
                )}
              </div>

              {/* Card */}
              <div className={cn("flex-1 pb-4", idx === sopSteps.length - 1 && "pb-0")}>
                <div
                  className={cn(
                    "rounded-xl border p-3 transition-all",
                    isDone    && "border-green-100 bg-green-50",
                    isActive  && isMyTurn  && "border-blue-300 bg-blue-50 shadow-sm",
                    isActive  && !isMyTurn && "border-blue-100 bg-blue-50/50",
                    isFuture  && "border-gray-100 bg-gray-50 opacity-60",
                  )}
                >
                  {/* Top row: badges + SLA */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Role badge */}
                        <span
                          className={cn(
                            "text-xs px-2 py-0.5 rounded-full font-medium border",
                            ROLE_COLOR[sopStep.owner_role] ?? "bg-gray-100 text-gray-600 border-gray-200",
                          )}
                        >
                          {ROLE_LABEL[sopStep.owner_role] ?? sopStep.owner_role.toUpperCase()}
                        </span>
                        {/* Medium badge */}
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border",
                            medium.color,
                          )}
                        >
                          <MediumIcon className="w-2.5 h-2.5" />
                          {medium.label}
                        </span>
                        {isMyTurn && (
                          <span className="text-xs font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                            Your Turn
                          </span>
                        )}
                      </div>

                      {/* Step number + action label */}
                      <p
                        className={cn(
                          "text-xs font-semibold mt-1.5",
                          isDone   ? "text-green-800"
                          : isActive ? "text-blue-800"
                          :           "text-gray-600",
                        )}
                      >
                        <span className="opacity-50 mr-1">Step {sopStep.number}.</span>
                        {sopStep.action_label}
                      </p>

                      {/* Action detail */}
                      {sopStep.action_detail && (
                        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                          {sopStep.action_detail}
                        </p>
                      )}
                    </div>

                    {/* SLA */}
                    {sopStep.sla_working_hours != null && (
                      <span className="text-[10px] text-gray-400 flex-shrink-0 whitespace-nowrap mt-0.5">
                        {sopStep.sla_working_hours}h SLA
                      </span>
                    )}
                  </div>

                  {/* Assignee */}
                  {h?.user_name && (
                    <p className="text-xs text-gray-500 mt-1.5">
                      <span className="font-medium text-gray-700">{h.user_name}</span>
                      {h.user_email && (
                        <span className="text-gray-400 ml-1">· {h.user_email}</span>
                      )}
                    </p>
                  )}

                  {/* Step submission — shown for done and active steps */}
                  {(() => {
                    const sub = stepSubmissions.find((s) => s.step_number === sopStep.number);
                    return sub ? <StepSubmissionCard sub={sub} /> : null;
                  })()}

                  {/* Resolved info */}
                  {showResolved && (
                    <div className="mt-2 pt-2 border-t border-green-200 text-xs text-green-700">
                      ✓ Resolved by{" "}
                      <strong>{h!.resolved_by_name ?? "—"}</strong> on{" "}
                      {formatTs(h!.resolved_at!)}
                    </div>
                  )}

                  {/* Comments */}
                  {stepComments.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-200 space-y-2">
                      {stepComments.map((c) => (
                        <div key={c.id} className="flex gap-2">
                          <MessageSquare className="w-3 h-3 text-gray-400 flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-gray-700 leading-relaxed break-words">
                              {c.content}
                            </p>
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              {formatTs(c.created_at)}
                            </p>
                          </div>
                        </div>
                      ))}
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

  // ── Fallback: role-level rendering when no sopSteps ────────────────────
  return (
    <div className="space-y-0">
      {hierarchy.map((step, idx) => {
        const stepNum  = idx + 1;
        const isDone   = stepNum < currentStep || status === "closed";
        const isActive = stepNum === currentStep && status === "open";
        const isFuture = stepNum > currentStep;
        const isMyTurn = isActive && step.user_id === currentUserId;

        const stepComments = comments.filter(
          (c) => c.hierarchy_step === stepNum && c.author_id === step.user_id,
        );

        return (
          <div key={idx} className="flex gap-4">
            <div className="flex flex-col items-center w-8 flex-shrink-0">
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center z-10 border-2",
                  isDone    ? "bg-green-500 border-green-500 text-white"
                  : isActive  ? "bg-blue-600 border-blue-600 text-white animate-pulse"
                  :             "bg-white border-gray-300 text-gray-400",
                )}
              >
                {isDone    ? <CheckCircle2 className="w-4 h-4" />
                : isActive  ? <Clock className="w-4 h-4" />
                :             <Circle className="w-4 h-4" />}
              </div>
              {idx < hierarchy.length - 1 && (
                <div className={cn("w-0.5 flex-1 mt-1", isDone ? "bg-green-300" : "bg-gray-200")} />
              )}
            </div>

            <div className={cn("flex-1 pb-5", idx === hierarchy.length - 1 && "pb-0")}>
              <div
                className={cn(
                  "rounded-xl border p-3 transition-all",
                  isDone    && "border-green-100 bg-green-50",
                  isActive  && isMyTurn  && "border-blue-300 bg-blue-50 shadow-sm",
                  isActive  && !isMyTurn && "border-blue-100 bg-blue-50/50",
                  isFuture  && "border-gray-100 bg-gray-50 opacity-60",
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
                    {step.user_name  && <p className="text-sm font-medium text-gray-800 mt-1">{step.user_name}</p>}
                    {step.user_email && <p className="text-xs text-gray-400">{step.user_email}</p>}
                  </div>
                  {step.sla_window && (
                    <p className="text-xs text-gray-400 flex-shrink-0">SLA: {step.sla_window}</p>
                  )}
                </div>

                {isDone && step.resolved_at && (
                  <div className="mt-2 pt-2 border-t border-green-200 text-xs text-green-700">
                    ✓ Resolved by <strong>{step.resolved_by_name ?? "—"}</strong> on{" "}
                    {formatTs(step.resolved_at)}
                  </div>
                )}

                {stepComments.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-200 space-y-2">
                    {stepComments.map((c) => (
                      <div key={c.id} className="flex gap-2">
                        <MessageSquare className="w-3 h-3 text-gray-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-700 leading-relaxed break-words">{c.content}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">{formatTs(c.created_at)}</p>
                        </div>
                      </div>
                    ))}
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
