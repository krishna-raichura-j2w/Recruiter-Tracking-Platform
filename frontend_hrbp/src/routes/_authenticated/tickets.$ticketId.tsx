import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { FileText, Loader2, Paperclip, Upload, XCircle, RefreshCw, Pin, PinOff, ExternalLink, CalendarClock, UserRoundCog, IndianRupee, Clock, TrendingDown } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { toast } from "sonner";

import { TicketPriorityBadge } from "@/components/tickets/TicketPriorityBadge";
import { TicketStatusBadge } from "@/components/tickets/TicketStatusBadge";
import { SLACountdown } from "@/components/tickets/SLACountdown";
import { TicketHierarchyProgress } from "@/components/tickets/TicketHierarchyProgress";
import { TicketCommentThread } from "@/components/tickets/TicketCommentThread";
import { RichTextEditor } from "@/components/tickets/RichTextEditor";
import { fmtDateTime } from "@/lib/formatDate";
import { PageLoader } from "@/components/Loader";

import {
  getTicket,
  addTicketComment,
  closeTicket,
  updateTicket,
  uploadTicketFile,
  extendStepSla,
  reassignStep,
  listAllHrbpUsers,
  getSopDefinition,
} from "@/apiService/ticketApi";
import { fetchPinnedTicket, pinTicket, unpinTicket } from "@/apiService/dashboardApi";
import type { Ticket, ActivityLogEntry, UserOption, SopDefinition } from "@/apiService/ticketTypes";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DateTimePicker } from "@/components/CustomDateTimePicker";

export const Route = createFileRoute("/_authenticated/tickets/$ticketId")({
  component: TicketDetailPage,
});

function formatInr(v: number | null | undefined): string {
  if (v == null || !isFinite(v) || v === 0) return "—";
  if (v >= 10_00_000) return `₹${(v / 10_00_000).toFixed(2)}L`;
  if (v >= 1_000) return `₹${(v / 1_000).toFixed(1)}K`;
  return `₹${v.toFixed(0)}`;
}

function calcTenureLeft(poEndDate: string | null): number {
  if (!poEndDate) return 0;
  const end = new Date(poEndDate);
  if (isNaN(end.getTime())) return 0;
  const now = new Date();
  const diff =
    (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth());
  return Math.max(0, diff);
}

const formatTs = fmtDateTime;

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
  const [sopSteps, setSopSteps] = useState<SopDefinition["steps_definition"] | null>(null);
  const [closing, setClosing] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [pinLoading, setPinLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  // Step SLA extension dialog
  const [slaDialogOpen, setSlaDialogOpen] = useState(false);
  const [slaExtendUntil, setSlaExtendUntil] = useState("");
  const [slaReason, setSlaReason] = useState("");
  const [slaSubmitting, setSlaSubmitting] = useState(false);

  // Step reassignment dialog
  const [reassignDialogOpen, setReassignDialogOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<UserOption[]>([]);
  const [reassignUserId, setReassignUserId] = useState<number | "">("");
  const [reassignReason, setReassignReason] = useState("");
  const [reassignSubmitting, setReassignSubmitting] = useState(false);

  const fetchTicket = useCallback(async () => {
    try {
      const t = await getTicket(Number(ticketId));
      setTicket(t);
      if (t.sop_id) {
        getSopDefinition(t.sop_id)
          .then((sop) => { if (sop) setSopSteps(sop.steps_definition); })
          .catch(() => {});
      }
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

  const SLA_MANAGE_ROLES = ["admin", "ops_head", "coo", "ceo"];
  const isCanManageStep =
    !!ticket &&
    ticket.status !== "closed" &&
    (isCreator ||
      ticket.escalation_mgr_id === user?.id ||
      SLA_MANAGE_ROLES.includes(user?.role ?? ""));

  // Load users when reassign dialog opens
  useEffect(() => {
    if (!reassignDialogOpen) return;
    listAllHrbpUsers().then(setAllUsers).catch(() => {});
  }, [reassignDialogOpen]);

  async function handleExtendSla() {
    if (!ticket || !slaExtendUntil || !slaReason.trim()) return;
    setSlaSubmitting(true);
    try {
      const updated = await extendStepSla(ticket.id, {
        extend_until: slaExtendUntil,
        reason: slaReason.trim(),
      });
      setTicket(updated);
      setSlaDialogOpen(false);
      setSlaExtendUntil("");
      setSlaReason("");
      toast.success("Step SLA extended successfully");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to extend SLA");
    } finally {
      setSlaSubmitting(false);
    }
  }

  async function handleReassign() {
    if (!ticket || !reassignUserId || !reassignReason.trim()) return;
    const selected = allUsers.find((u) => u.id === reassignUserId);
    if (!selected) return;
    setReassignSubmitting(true);
    try {
      const updated = await reassignStep(ticket.id, {
        user_id: selected.id,
        user_name: selected.name,
        user_email: selected.email ?? null,
        reason: reassignReason.trim(),
      });
      setTicket(updated);
      setReassignDialogOpen(false);
      setReassignUserId("");
      setReassignReason("");
      toast.success("Step reassigned successfully");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to reassign step");
    } finally {
      setReassignSubmitting(false);
    }
  }

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

  async function handleAttachmentUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!ticket) return;
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      const newUrls: string[] = [];
      for (const file of files) {
        const url = await uploadTicketFile(file);
        newUrls.push(url);
      }
      const merged = [...(ticket.attachments ?? []), ...newUrls];
      const updated = await updateTicket(ticket.id, { attachments: merged });
      setTicket(updated);
      toast.success(`${newUrls.length} file(s) uploaded`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (attachmentInputRef.current) attachmentInputRef.current.value = "";
    }
  }

  async function handleRemoveAttachment(url: string) {
    if (!ticket) return;
    const next = (ticket.attachments ?? []).filter((u) => u !== url);
    try {
      const updated = await updateTicket(ticket.id, { attachments: next });
      setTicket(updated);
      toast.success("Attachment removed");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to remove attachment");
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full bg-gray-50">
        <TopBar title="Ticket" subtitle="Loading…" />
        <main className="flex-1 p-6">
          <PageLoader message="Loading ticket details…" />
        </main>
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

              {ticket.consultants.length > 0 && (() => {
                const totalMonthlyPo = ticket.consultants.reduce(
                  (s, c) => s + (c.monthly_po ?? 0), 0,
                );
                const totalPoAtRisk = ticket.consultants.reduce((s, c) => {
                  if (!c.monthly_po || !c.po_end_date) return s;
                  return s + c.monthly_po * calcTenureLeft(c.po_end_date);
                }, 0);
                const minTenure = ticket.consultants.reduce((min, c) => {
                  if (!c.po_end_date) return min;
                  const t = calcTenureLeft(c.po_end_date);
                  return min === null ? t : Math.min(min, t);
                }, null as number | null);
                return (
                  <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-3 gap-3">
                    <div className="flex flex-col gap-1 bg-blue-50 rounded-lg px-3 py-2.5">
                      <div className="flex items-center gap-1 text-blue-500">
                        <IndianRupee className="w-3.5 h-3.5" />
                        <span className="text-xs font-medium">Monthly PO</span>
                      </div>
                      <span className="text-sm font-bold text-blue-700">
                        {totalMonthlyPo > 0 ? formatInr(totalMonthlyPo) : "—"}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 bg-amber-50 rounded-lg px-3 py-2.5">
                      <div className="flex items-center gap-1 text-amber-500">
                        <Clock className="w-3.5 h-3.5" />
                        <span className="text-xs font-medium">Tenure Left</span>
                      </div>
                      <span className="text-sm font-bold text-amber-700">
                        {minTenure !== null ? `${minTenure} mo` : "—"}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 bg-red-50 rounded-lg px-3 py-2.5">
                      <div className="flex items-center gap-1 text-red-500">
                        <TrendingDown className="w-3.5 h-3.5" />
                        <span className="text-xs font-medium">Total PO at Risk</span>
                      </div>
                      <span className="text-sm font-bold text-red-700">
                        {totalPoAtRisk > 0 ? formatInr(totalPoAtRisk) : "—"}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Consultants */}
            {ticket.consultants.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Consultants ({ticket.consultants.length})
                </p>
                <div className="space-y-3">
                  {ticket.consultants.map((c) => {
                    const tenureLeft = calcTenureLeft(c.po_end_date ?? null);
                    const poAtRisk =
                      c.monthly_po != null && c.po_end_date
                        ? c.monthly_po * tenureLeft
                        : null;
                    return (
                      <div key={c.id} className="rounded-xl border border-gray-100 overflow-hidden">
                        <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-gray-800">{c.name}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {c.emp_id}{c.cohort ? ` · ${c.cohort.replace(/_/g, " ")}` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3 p-3">
                          <div className="flex flex-col gap-1 bg-blue-50 rounded-lg px-3 py-2">
                            <div className="flex items-center gap-1 text-blue-500">
                              <IndianRupee className="w-3 h-3" />
                              <span className="text-xs font-medium">Monthly PO</span>
                            </div>
                            <span className="text-sm font-bold text-blue-700">
                              {c.monthly_po != null ? formatInr(c.monthly_po) : "—"}
                            </span>
                          </div>
                          <div className="flex flex-col gap-1 bg-amber-50 rounded-lg px-3 py-2">
                            <div className="flex items-center gap-1 text-amber-500">
                              <Clock className="w-3 h-3" />
                              <span className="text-xs font-medium">Tenure Left</span>
                            </div>
                            <span className="text-sm font-bold text-amber-700">
                              {c.po_end_date ? `${tenureLeft} mo` : "—"}
                            </span>
                          </div>
                          <div className="flex flex-col gap-1 bg-red-50 rounded-lg px-3 py-2">
                            <div className="flex items-center gap-1 text-red-500">
                              <TrendingDown className="w-3 h-3" />
                              <span className="text-xs font-medium">PO at Risk</span>
                            </div>
                            <span className="text-sm font-bold text-red-700">
                              {poAtRisk != null && poAtRisk > 0 ? formatInr(poAtRisk) : "—"}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
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

                <TabsContent value="description" className="p-5 space-y-5">
                  {ticket.description ? (
                    <RichTextEditor value={ticket.description} onChange={() => {}} readOnly />
                  ) : (
                    <p className="text-sm text-gray-400 italic">No description provided.</p>
                  )}

                  {/* Attachments section */}
                  <div className="border-t border-gray-100 pt-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                        <Paperclip className="w-3.5 h-3.5" />
                        Supporting Documents
                        {ticket.attachments?.length > 0 && (
                          <span className="ml-1 bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full text-xs font-medium">
                            {ticket.attachments.length}
                          </span>
                        )}
                      </p>
                      {isCreator && ticket.status === "open" && (
                        <>
                          <input
                            ref={attachmentInputRef}
                            type="file"
                            multiple
                            className="hidden"
                            onChange={handleAttachmentUpload}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => attachmentInputRef.current?.click()}
                            disabled={uploading}
                            className="gap-1.5 text-xs h-7"
                          >
                            {uploading ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Upload className="w-3 h-3" />
                            )}
                            {uploading ? "Uploading…" : "Upload Files"}
                          </Button>
                        </>
                      )}
                    </div>

                    {(!ticket.attachments || ticket.attachments.length === 0) ? (
                      <p className="text-sm text-gray-400 italic">No attachments.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {ticket.attachments.map((url, i) => {
                          const name = url.split("/").pop() ?? `File ${i + 1}`;
                          return (
                            <li
                              key={url}
                              className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100 text-sm"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
                                <span className="truncate text-gray-700" title={name}>{name}</span>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-gray-400 hover:text-blue-600 transition-colors p-0.5"
                                  title="Open"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </a>
                                {isCreator && ticket.status === "open" && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveAttachment(url)}
                                    className="text-gray-400 hover:text-red-500 transition-colors p-0.5"
                                    title="Remove"
                                  >
                                    <XCircle className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
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

                {isCanManageStep && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-gray-200">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1.5 text-xs h-8"
                      onClick={() => setSlaDialogOpen(true)}
                    >
                      <CalendarClock className="w-3.5 h-3.5" />
                      Extend SLA
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1.5 text-xs h-8"
                      onClick={() => setReassignDialogOpen(true)}
                    >
                      <UserRoundCog className="w-3.5 h-3.5" />
                      Reassign
                    </Button>
                  </div>
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
                  sopSteps={sopSteps ?? undefined}
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

      {/* ── Extend Step SLA Dialog ── */}
      <Dialog open={slaDialogOpen} onOpenChange={setSlaDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-blue-600" />
              Extend Step SLA
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-600">
                Current step: <span className="text-gray-900">{currentHierarchyStep?.label}</span>
              </Label>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sla-extend-until" className="text-xs font-medium">
                Extend SLA Until <span className="text-red-500">*</span>
              </Label>
              <DateTimePicker
                value={slaExtendUntil}
                onChange={setSlaExtendUntil}
                placeholder="Pick a date and time"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sla-reason" className="text-xs font-medium">
                Reason <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="sla-reason"
                placeholder="e.g. Assignee is on emergency leave until next Monday…"
                value={slaReason}
                onChange={(e) => setSlaReason(e.target.value)}
                rows={3}
                className="text-sm resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSlaDialogOpen(false)} disabled={slaSubmitting}>
              Cancel
            </Button>
            <Button
              onClick={handleExtendSla}
              disabled={slaSubmitting || !slaExtendUntil || !slaReason.trim()}
              className="gap-1.5"
            >
              {slaSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />}
              Extend SLA
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reassign Step Dialog ── */}
      <Dialog open={reassignDialogOpen} onOpenChange={setReassignDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserRoundCog className="w-4 h-4 text-blue-600" />
              Reassign Step
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-600">
                Current step: <span className="text-gray-900">{currentHierarchyStep?.label}</span>
              </Label>
              {currentHierarchyStep?.user_name && (
                <p className="text-xs text-gray-500">
                  Currently assigned to: <span className="font-medium">{currentHierarchyStep.user_name}</span>
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reassign-user" className="text-xs font-medium">
                Assign To <span className="text-red-500">*</span>
              </Label>
              <select
                id="reassign-user"
                value={reassignUserId}
                onChange={(e) => setReassignUserId(e.target.value ? Number(e.target.value) : "")}
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
              >
                <option value="">Select a user…</option>
                {allUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reassign-reason" className="text-xs font-medium">
                Reason <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="reassign-reason"
                placeholder="e.g. Original assignee is on leave; reassigning to cover…"
                value={reassignReason}
                onChange={(e) => setReassignReason(e.target.value)}
                rows={3}
                className="text-sm resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReassignDialogOpen(false)} disabled={reassignSubmitting}>
              Cancel
            </Button>
            <Button
              onClick={handleReassign}
              disabled={reassignSubmitting || !reassignUserId || !reassignReason.trim()}
              className="gap-1.5"
            >
              {reassignSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserRoundCog className="w-4 h-4" />}
              Reassign Step
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
