import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, CheckCircle2 } from "lucide-react";
import type { TicketComment, HierarchyStep } from "@/apiService/ticketTypes";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/formatDate";

interface TicketCommentThreadProps {
  comments: TicketComment[];
  currentStep: number;
  hierarchy: HierarchyStep[];
  currentUserId: number;
  ticketStatus: string;
  isMyTurn: boolean;
  onAddComment: (content: string, isResolution: boolean) => Promise<void>;
  readOnly?: boolean;
}

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

const formatTs = fmtDateTime;

export function TicketCommentThread({
  comments,
  currentStep,
  hierarchy,
  currentUserId,
  ticketStatus,
  isMyTurn,
  onAddComment,
  readOnly = false,
}: TicketCommentThreadProps) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isClosed = ticketStatus === "closed";

  async function handleSend(isResolution: boolean) {
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      await onAddComment(text.trim(), isResolution);
      setText("");
    } finally {
      setSubmitting(false);
    }
  }

  // Group comments by hierarchy step for display
  const commentsByStep = comments.reduce<Record<number, TicketComment[]>>((acc, c) => {
    if (!acc[c.hierarchy_step]) acc[c.hierarchy_step] = [];
    acc[c.hierarchy_step].push(c);
    return acc;
  }, {});

  const stepsWithComments = Object.keys(commentsByStep)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <div className="space-y-4">
      {/* Past step comments (collapsed headers) */}
      {stepsWithComments.map((stepNum) => {
        const stepHierarchy = hierarchy[stepNum - 1];
        const stepComments = commentsByStep[stepNum];
        const isCurrentStep = stepNum === currentStep;

        return (
          <div key={stepNum}>
            <div className="flex items-center gap-2 mb-2">
              <div
                className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold",
                  stepNum < currentStep
                    ? "bg-green-500 text-white"
                    : "bg-blue-600 text-white",
                )}
              >
                {stepNum < currentStep ? (
                  <CheckCircle2 className="w-3 h-3" />
                ) : (
                  stepNum
                )}
              </div>
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Step {stepNum}
                {stepHierarchy ? ` — ${stepHierarchy.label}` : ""}
              </p>
              {isCurrentStep && (
                <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">
                  Active
                </span>
              )}
            </div>

            <div className="space-y-2 ml-7">
              {stepComments.map((c) => {
                const isMine = c.author_id === currentUserId;
                return (
                  <div
                    key={c.id}
                    className={cn(
                      "rounded-xl p-3 text-sm",
                      c.is_resolution
                        ? "bg-green-50 border border-green-200"
                        : isMine
                        ? "bg-blue-50 border border-blue-100"
                        : "bg-gray-50 border border-gray-100",
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600 flex-shrink-0">
                        {initials(c.author_name ?? "?")}
                      </div>
                      <span className="font-medium text-gray-800 text-xs">
                        {c.author_name ?? "Unknown"}
                      </span>
                      <span className="text-gray-400 text-xs">{formatTs(c.created_at)}</span>
                      {c.is_resolution && (
                        <span className="ml-auto text-xs text-green-700 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Resolved
                        </span>
                      )}
                    </div>
                    <p className="text-gray-700 leading-relaxed">{c.content}</p>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Input area */}
      {!isClosed && !readOnly && (
        <div className="border-t border-gray-100 pt-4">
          <p className="text-xs text-gray-500 mb-2 font-medium">
            {isMyTurn
              ? "It's your turn — add a comment or mark as resolved to advance."
              : "Add an internal note (visible to all parties on this ticket)."}
          </p>
          <Textarea
            placeholder="Write a comment…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            className="text-sm resize-none"
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-gray-400">{text.length} chars</span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!text.trim() || submitting}
                onClick={() => handleSend(false)}
                className="gap-1.5 text-xs"
              >
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Comment
              </Button>
              {isMyTurn && (
                <Button
                  type="button"
                  size="sm"
                  disabled={!text.trim() || submitting}
                  onClick={() => handleSend(true)}
                  className="gap-1.5 text-xs bg-green-600 hover:bg-green-700"
                >
                  {submitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  Resolve & Pass to Next
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
