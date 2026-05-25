import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2, XCircle, RefreshCw, Pin, PinOff } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { toast } from "sonner";

import { TicketPriorityBadge } from "@/components/tickets/TicketPriorityBadge";
import { TicketStatusBadge } from "@/components/tickets/TicketStatusBadge";
import { SLACountdown } from "@/components/tickets/SLACountdown";
import { TicketHierarchyProgress } from "@/components/tickets/TicketHierarchyProgress";
import { TicketCommentThread } from "@/components/tickets/TicketCommentThread";
import { RichTextEditor } from "@/components/tickets/RichTextEditor";

import {
  getTicket,
  addTicketComment,
  closeTicket,
} from "@/apiService/ticketApi";
import { fetchPinnedTicket, pinTicket, unpinTicket } from "@/apiService/dashboardApi";
import type { Ticket, ActivityLogEntry } from "@/apiService/ticketTypes";

export const Route = createFileRoute("/_authenticated/tickets/$ticketId")({
  component: TicketDetailPage,
});

function formatInr(v: number | null): string {
  if (!v) return "—";
  if (v >= 10_00_000) return `₹${(v / 10_00_000).toFixed(2)}L`;
  return `₹${v.toLocaleString("en-IN")}`;
}

function formatTs(ts: string | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const ACTION_LABELS: Record<string, string> = {
  created:       "Ticket created",
  commented:     "Comment added",
  step_advanced: "Step advanced",
  closed:        "Ticket closed",
  updated:       "Ticket updated",
};

function ActivityItem({ entry }: { entry: ActivityLogEntry }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <div className="w-2 h-2 rounded-full bg-blue-400 mt-2 flex-shrink-0" />
      <div className="flex-1">
        <p className="text-sm text-gray-800">
          <span className="font-medium">{entry.actor_name ?? "System"}</span>{" "}
          {ACTION_LABELS[entry.action] ?? entry.action}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">{formatTs(entry.created_at)}</p>
      </div>
    </div>
  );
}

function TicketDetailPage() {
  const { ticketId } = Route.useParams();
  const { user } = useAuth();

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [pinLoading, setPinLoading] = useState(false);

  const fetchTicket = useCallback(async () => {
    try {
      const t = await getTicket(Number(ticketId));
      setTicket(t);
    } catch {
      toast.error("Failed to load ticket");
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => { fetchTicket(); }, [fetchTicket]);

  // Check if this ticket is currently pinned
  useEffect(() => {
    fetchPinnedTicket()
      .then((p: any) => setIsPinned(p?.id === Number(ticketId)))
      .catch(() => {});
  }, [ticketId]);

  async function handlePin() {
    setPinLoading(true);
    try {
      await pinTicket(Number(ticketId));
      setIsPinned(true);
      toast.success("Ticket pinned to dashboard");
    } catch {
      toast.error("Failed to pin ticket");
    } finally {
      setPinLoading(false);
    }
  }

  async function handleUnpin() {
    setPinLoading(true);
    try {
      await unpinTicket();
      setIsPinned(false);
      toast.success("Ticket unpinned");
    } catch {
      toast.error("Failed to unpin ticket");
    } finally {
      setPinLoading(false);
    }
  }

  const currentHierarchyStep = ticket?.hierarchy_json?.[ticket.current_step - 1];
  const isMyTurn =
    ticket?.status === "open" &&
    currentHierarchyStep?.user_id === user?.id;
  const isCreator = ticket?.raised_by_id === user?.id;

  async function handleComment(content: string, isResolution: boolean) {
    if (!ticket) return;
    try {
      const updated = await addTicketComment(ticket.id, { content, is_resolution: isResolution });
      setTicket(updated);
      if (isResolution) toast.success("Step resolved and passed to next");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add comment");
      throw err;
    }
  }

  async function handleClose() {
    if (!ticket) return;
    setClosing(true);
    try {
      const updated = await closeTicket(ticket.id);
      setTicket(updated);
      toast.success("Ticket closed");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to close ticket");
    } finally {
      setClosing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full bg-gray-50">
        <TopBar title="Ticket" subtitle="Loading…" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="flex flex-col h-full bg-gray-50">
        <TopBar title="Ticket" subtitle="Not found" />
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <p>Ticket not found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <TopBar title={ticket.ticket_number} subtitle={ticket.title} />

      <div className="flex-1 overflow-auto px-6 py-5">
        {/* Back + actions */}
        <div className="flex items-center justify-between mb-5">
          <BackButton to="/tickets" label="Back to Tickets" />

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={fetchTicket} title="Refresh">
              <RefreshCw className="w-4 h-4" />
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={isPinned ? handleUnpin : handlePin}
              disabled={pinLoading}
              className={`gap-1.5 text-xs ${isPinned ? "text-amber-600 border-amber-300 hover:bg-amber-50" : "text-slate-600 border-slate-200 hover:bg-slate-50"}`}
              title={isPinned ? "Unpin from dashboard" : "Pin to dashboard"}
            >
              {pinLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : isPinned ? (
                <PinOff className="w-3.5 h-3.5" />
              ) : (
                <Pin className="w-3.5 h-3.5" />
              )}
              {isPinned ? "Unpin" : "Pin"}
            </Button>

            {isCreator && ticket.status === "open" && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
                    disabled={closing}
                  >
                    {closing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <XCircle className="w-4 h-4" />
                    )}
                    Close Ticket
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Close this ticket?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will mark the ticket as <strong>Closed</strong>. Only the person who raised
                      it ({ticket.raised_by_name}) can close it. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleClose} className="bg-red-600 hover:bg-red-700">
                      Yes, Close Ticket
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* ── Left (2/3) ── */}
          <div className="lg:col-span-2 space-y-5">
            {/* Header card */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-mono text-sm font-bold text-blue-600">
                      {ticket.ticket_number}
                    </span>
                    <span className="text-gray-300">•</span>
                    <span className="text-sm text-gray-500">{ticket.sop_type}</span>
                    <span className="text-gray-300">•</span>
                    <span className="text-sm text-gray-500">{ticket.sop_name}</span>
                  </div>
                  <h1 className="text-lg font-semibold text-gray-900">{ticket.title}</h1>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <TicketPriorityBadge priority={ticket.priority} />
                  <TicketStatusBadge status={ticket.status} />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <p className="text-gray-400 uppercase tracking-wide mb-0.5">Raised By</p>
                  <p className="font-medium text-gray-700">{ticket.raised_by_name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-gray-400 uppercase tracking-wide mb-0.5">Escalation Mgr</p>
                  <p className="font-medium text-gray-700">{ticket.escalation_mgr_name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-gray-400 uppercase tracking-wide mb-0.5">Client</p>
                  <p className="font-medium text-gray-700">{ticket.client_name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-gray-400 uppercase tracking-wide mb-0.5">SLA Deadline</p>
                  <SLACountdown deadline={ticket.sla_deadline} compact />
                </div>
              </div>

              {ticket.po_risk_amount != null && (
                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2">
                  <span className="text-xs text-gray-500">PO at Risk:</span>
                  <span className="text-base font-bold text-red-600">
                    {formatInr(ticket.po_risk_amount)}
                  </span>
                </div>
              )}
            </div>

            {/* Consultants */}
            {ticket.consultants.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Consultants ({ticket.consultants.length})
                </p>
                <div className="divide-y divide-gray-50">
                  {ticket.consultants.map((c) => (
                    <div key={c.id} className="flex items-center justify-between py-2">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{c.name}</p>
                        <p className="text-xs text-gray-400">
                          {c.emp_id} · {c.cohort?.replace(/_/g, " ")}
                        </p>
                      </div>
                      <div className="text-right">
                        {c.monthly_po && (
                          <p className="text-xs text-gray-600">{formatInr(c.monthly_po)}/mo</p>
                        )}
                        {c.po_risk != null && (
                          <p className="text-xs font-semibold text-red-600">
                            {formatInr(c.po_risk)} at risk
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Description + Comments + Activity tabs */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <Tabs defaultValue="description">
                <TabsList className="w-full justify-start rounded-none border-b border-gray-100 bg-gray-50 px-4 pt-2">
                  <TabsTrigger value="description">Description</TabsTrigger>
                  <TabsTrigger value="comments">
                    Comments
                    {ticket.comments.length > 0 && (
                      <span className="ml-1 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                        {ticket.comments.length}
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="activity">Activity Log</TabsTrigger>
                </TabsList>

                <TabsContent value="description" className="p-5">
                  {ticket.description ? (
                    <RichTextEditor value={ticket.description} onChange={() => {}} readOnly />
                  ) : (
                    <p className="text-sm text-gray-400 italic">No description provided.</p>
                  )}
                </TabsContent>

                <TabsContent value="comments" className="p-5">
                  <TicketCommentThread
                    comments={ticket.comments}
                    currentStep={ticket.current_step}
                    hierarchy={ticket.hierarchy_json}
                    currentUserId={user?.id ?? 0}
                    ticketStatus={ticket.status}
                    isMyTurn={isMyTurn}
                    onAddComment={handleComment}
                  />
                </TabsContent>

                <TabsContent value="activity" className="p-5">
                  {ticket.activity_log.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">No activity yet.</p>
                  ) : (
                    <div>
                      {ticket.activity_log.map((entry) => (
                        <ActivityItem key={entry.id} entry={entry} />
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </div>

          {/* ── Right (1/3) ── */}
          <div className="space-y-5">
            {/* Current step callout */}
            {ticket.status === "open" && currentHierarchyStep && (
              <div
                className={`rounded-xl border p-4 ${
                  isMyTurn ? "border-blue-300 bg-blue-50" : "border-gray-200 bg-gray-50"
                }`}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                  Current Step ({ticket.current_step}/{ticket.hierarchy_json.length})
                </p>
                <p className="text-base font-bold text-gray-800">{currentHierarchyStep.label}</p>
                {currentHierarchyStep.user_name && (
                  <p className="text-sm text-gray-600 mt-0.5">{currentHierarchyStep.user_name}</p>
                )}
                {isMyTurn && (
                  <p className="text-xs text-blue-700 font-medium mt-2">
                    ✋ Action required from you — go to Comments tab to respond.
                  </p>
                )}
              </div>
            )}

            {ticket.status === "closed" && (
              <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                <p className="text-sm font-semibold text-green-800">✅ Ticket Closed</p>
                <p className="text-xs text-green-600 mt-1">{formatTs(ticket.closed_at)}</p>
              </div>
            )}

            {/* Hierarchy progress */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
                Resolution Flow
              </p>
              {ticket.hierarchy_json.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No hierarchy defined.</p>
              ) : (
                <TicketHierarchyProgress
                  hierarchy={ticket.hierarchy_json}
                  currentStep={ticket.current_step}
                  currentUserId={user?.id}
                  status={ticket.status}
                />
              )}
            </div>

            {/* Timestamps */}
            <div className="text-xs text-gray-400 px-1 space-y-1">
              <p>Created: {formatTs(ticket.created_at)}</p>
              <p>Updated: {formatTs(ticket.updated_at)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
