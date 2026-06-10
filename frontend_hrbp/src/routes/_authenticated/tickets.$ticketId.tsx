import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Loader2, Paperclip, Upload, XCircle, RefreshCw, Pin, PinOff, ExternalLink, CalendarClock, UserRoundCog, IndianRupee, Clock, TrendingDown, Send, CheckCircle2, ChevronDown, ChevronUp, Copy, AlertTriangle, ShieldCheck } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { toast } from "sonner";

import { TicketPriorityBadge } from "@/components/tickets/TicketPriorityBadge";
import { TicketStatusBadge } from "@/components/tickets/TicketStatusBadge";
import { SLACountdown } from "@/components/tickets/SLACountdown";
import { TicketHierarchyProgress } from "@/components/tickets/TicketHierarchyProgress";
import { StepActionPanel } from "@/components/tickets/StepActionPanel";
import { TicketCommentThread } from "@/components/tickets/TicketCommentThread";
import { RichTextEditor } from "@/components/tickets/RichTextEditor";
import { fmtDateTime } from "@/lib/formatDate";
import { PageLoader } from "@/components/Loader";

import {
  getTicket,
  addTicketComment,
  advanceTicketStep,
  closeTicket,
  updateTicket,
  uploadTicketFile,
  extendStepSla,
  reassignStep,
  listAllHrbpUsers,
  getSopDefinition,
  listEmailTemplates,
} from "@/apiService/ticketApi";
import { fetchPinnedTicket, pinTicket, unpinTicket } from "@/apiService/dashboardApi";
import type { Ticket, ActivityLogEntry, UserOption, SopDefinition, EmailTemplateResponse, CloseTicketPayload } from "@/apiService/ticketTypes";
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
import { CustomDatePicker } from "@/components/CustomDatePicker";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Dayjs } from "dayjs";

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

// ── Email template card ────────────────────────────────────────────────────

const GROUP_BADGE: Record<string, string> = {
  routine:   "bg-blue-50 text-blue-700 border-blue-200",
  incident:  "bg-red-50 text-red-700 border-red-200",
  commercial:"bg-amber-50 text-amber-700 border-amber-200",
  medical:   "bg-green-50 text-green-700 border-green-200",
};

function EmailTemplateCard({ tpl }: { tpl: EmailTemplateResponse }) {
  const [expanded, setExpanded] = useState(false);
  const badgeCls = GROUP_BADGE[tpl.group_name] ?? "bg-gray-50 text-gray-600 border-gray-200";

  return (
    <div className="rounded-xl border border-gray-100 overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-4 py-3 bg-gray-50">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <p className="text-sm font-semibold text-gray-800">{tpl.name}</p>
            <span className={`text-xs px-1.5 py-0.5 rounded-full border font-medium capitalize ${badgeCls}`}>
              {tpl.group_name}
            </span>
          </div>
          {tpl.subject_tpl && (
            <p className="text-xs text-gray-500 truncate" title={tpl.subject_tpl}>
              Subject: {tpl.subject_tpl}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(tpl.body_tpl);
              toast.success("Body copied");
            }}
            className="p-1.5 text-gray-400 hover:text-blue-600 rounded-md hover:bg-blue-50 transition-colors"
            title="Copy body"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-md hover:bg-gray-100 transition-colors"
            title={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="px-4 py-3 border-t border-gray-100">
          <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
            {tpl.body_tpl}
          </pre>
          {tpl.required_vars && tpl.required_vars.length > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-gray-400">Variables:</span>
              {tpl.required_vars.map((v) => (
                <span key={v} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono">
                  {`{{${v}}}`}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EmailTemplatesPanel({
  templates,
  sopTemplateIds,
}: {
  templates: EmailTemplateResponse[];
  sopTemplateIds: string[] | null;
}) {
  const sopTemplates = sopTemplateIds
    ? templates.filter((t) => sopTemplateIds.includes(t.id))
    : [];

  return (
    <Tabs defaultValue="sop-related">
      <TabsList className="mb-4">
        <TabsTrigger value="sop-related" className="gap-1.5">
          SOP Related Templates
          {sopTemplates.length > 0 && (
            <span className="ml-1 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
              {sopTemplates.length}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="all-templates" className="gap-1.5">
          All Templates
          {templates.length > 0 && (
            <span className="ml-1 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
              {templates.length}
            </span>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="sop-related">
        {sopTemplates.length === 0 ? (
          <p className="text-sm text-gray-400 italic">
            {sopTemplateIds === null
              ? "No SOP linked to this ticket."
              : "No email templates linked to this SOP."}
          </p>
        ) : (
          <div className="space-y-3">
            {sopTemplates.map((tpl) => (
              <EmailTemplateCard key={tpl.id} tpl={tpl} />
            ))}
          </div>
        )}
      </TabsContent>

      <TabsContent value="all-templates">
        {templates.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No email templates found.</p>
        ) : (
          <div className="space-y-3">
            {templates.map((tpl) => (
              <EmailTemplateCard key={tpl.id} tpl={tpl} />
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}

// ── Close Ticket Dialog ────────────────────────────────────────────────────

type CloseStage = "outcome" | "retained" | "loss";

const EXIT_REASONS = [
  { value: "resignation",       label: "Resignation"       },
  { value: "end_of_contract",   label: "End of Contract"   },
  { value: "termination",       label: "Termination"       },
  { value: "mutual_separation", label: "Mutual Separation" },
];

interface CloseTicketDialogProps {
  open: boolean;
  onClose: () => void;
  consultants: Ticket["consultants"];
  submitting: boolean;
  onSubmit: (payload: CloseTicketPayload) => void;
}

function CloseTicketDialog({ open, onClose, consultants, submitting, onSubmit }: CloseTicketDialogProps) {
  const [stage, setStage] = useState<CloseStage>("outcome");

  // PO Retained form state
  const [newPoEndDate, setNewPoEndDate] = useState<Dayjs | null>(null);
  const [newPoMonthly, setNewPoMonthly] = useState("");
  const [newMargin, setNewMargin]       = useState("");
  const [newCtc, setNewCtc]             = useState("");

  // PO Loss / exit state
  const [consultantExited, setConsultantExited] = useState<boolean | null>(null);
  const [exitDate, setExitDate]     = useState<Dayjs | null>(null);
  const [exitReason, setExitReason] = useState("");
  const [exitType, setExitType]     = useState("");
  const [replacementNeeded, setReplacementNeeded] = useState(false);
  const [exitNotes, setExitNotes]   = useState("");

  function reset() {
    setStage("outcome");
    setNewPoEndDate(null);
    setNewPoMonthly(""); setNewMargin(""); setNewCtc("");
    setConsultantExited(null);
    setExitDate(null); setExitReason(""); setExitType("");
    setReplacementNeeded(false); setExitNotes("");
  }

  function handleOpenChange(v: boolean) {
    if (!v) { reset(); onClose(); }
  }

  function submitRetained() {
    onSubmit({
      po_outcome:      "retained",
      new_po_end_date: newPoEndDate ? newPoEndDate.format("YYYY-MM-DD") : null,
      new_po_monthly:  newPoMonthly ? Number(newPoMonthly) : null,
      new_margin:      newMargin    ? Number(newMargin)    : null,
      new_ctc:         newCtc       ? Number(newCtc)       : null,
    });
  }

  function submitLoss() {
    onSubmit({
      po_outcome:         "loss",
      consultant_exited:  consultantExited === true,
      exit_date:          exitDate    ? exitDate.format("YYYY-MM-DD") : null,
      exit_reason:        exitReason  || null,
      exit_type:          exitType    || null,
      replacement_needed: replacementNeeded,
      notes:              exitNotes   || null,
    });
  }

  function submitSkip() {
    onSubmit({});
  }

  // Derive PO loss summary across all consultants
  const lossSummary = consultants.map((c) => {
    const tenure = calcTenureLeft(c.po_end_date);
    const monthly = c.monthly_po ?? 0;
    return { ...c, tenure, lossAmount: monthly * tenure };
  });
  const totalLoss = lossSummary.reduce((s, c) => s + c.lossAmount, 0);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        {/* ── Stage 1: choose outcome ── */}
        {stage === "outcome" && (
          <>
            <DialogHeader>
              <DialogTitle>Close Ticket — PO Outcome</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-slate-500 mt-1">
              What is the PO outcome for this ticket? This helps track consultant retention and revenue risk.
            </p>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <button
                type="button"
                onClick={() => setStage("retained")}
                className="flex flex-col items-center gap-2 rounded-xl border-2 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 px-4 py-5 transition-colors text-center"
              >
                <ShieldCheck className="w-7 h-7 text-emerald-600" />
                <span className="font-semibold text-emerald-800 text-sm">PO Retained</span>
                <span className="text-xs text-emerald-600">PO has been renewed or extended</span>
              </button>
              <button
                type="button"
                onClick={() => setStage("loss")}
                className="flex flex-col items-center gap-2 rounded-xl border-2 border-red-200 bg-red-50 hover:bg-red-100 px-4 py-5 transition-colors text-center"
              >
                <AlertTriangle className="w-7 h-7 text-red-600" />
                <span className="font-semibold text-red-800 text-sm">PO Loss</span>
                <span className="text-xs text-red-600">PO has ended or been terminated</span>
              </button>
            </div>
            <DialogFooter className="mt-4">
              <Button variant="ghost" size="sm" onClick={() => handleOpenChange(false)}>Cancel</Button>
              <Button variant="outline" size="sm" onClick={submitSkip} disabled={submitting}>
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                Skip &amp; Close
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── Stage 2a: PO Retained ── */}
        {stage === "retained" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-emerald-700">
                <ShieldCheck className="w-5 h-5" /> PO Retained — New PO Details
              </DialogTitle>
            </DialogHeader>
            <p className="text-xs text-slate-400 mt-1">All fields are optional. Fill in what has changed.</p>
            <div className="space-y-3 mt-3">
              <div className="space-y-1">
                <Label className="text-xs">New PO End Date</Label>
                <CustomDatePicker value={newPoEndDate} onChange={setNewPoEndDate} placeholder="Select date…" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Monthly PO (₹)</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={newPoMonthly}
                    onChange={(e) => setNewPoMonthly(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Margin (₹)</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={newMargin}
                    onChange={(e) => setNewMargin(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">CTC (₹)</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={newCtc}
                    onChange={(e) => setNewCtc(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button variant="ghost" size="sm" onClick={() => setStage("outcome")}>Back</Button>
              <Button
                onClick={submitRetained}
                disabled={submitting}
                className="bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                Close Ticket
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── Stage 2b: PO Loss ── */}
        {stage === "loss" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-700">
                <AlertTriangle className="w-5 h-5" /> PO Loss Summary
              </DialogTitle>
            </DialogHeader>

            {/* Per-consultant loss breakdown */}
            <div className="mt-2 space-y-2">
              {lossSummary.map((c) => (
                <div key={c.id} className="rounded-lg border border-red-100 bg-red-50 px-3 py-2.5 text-xs">
                  <p className="font-semibold text-red-800 mb-1">{c.name}</p>
                  <div className="grid grid-cols-3 gap-x-3 text-slate-600">
                    <span>Monthly PO: <span className="font-medium text-slate-800">{formatInr(c.monthly_po)}</span></span>
                    <span>PO End: <span className="font-medium text-slate-800">{c.po_end_date ?? "—"}</span></span>
                    <span>Tenure Left: <span className="font-medium text-slate-800">{c.tenure} mo</span></span>
                  </div>
                  <p className="mt-1.5 text-red-700 font-semibold">
                    Estimated Loss: {formatInr(c.lossAmount)}
                  </p>
                </div>
              ))}
              {lossSummary.length > 1 && (
                <p className="text-xs font-semibold text-red-700 text-right pr-1">
                  Total: {formatInr(totalLoss)}
                </p>
              )}
            </div>

            {/* Exit question */}
            <div className="mt-4 space-y-3">
              <Label className="text-sm font-medium">Has the consultant exited?</Label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setConsultantExited(true)}
                  className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                    consultantExited === true
                      ? "border-red-400 bg-red-100 text-red-800"
                      : "border-slate-200 hover:bg-slate-50 text-slate-700"
                  }`}
                >
                  Yes, Exited
                </button>
                <button
                  type="button"
                  onClick={() => setConsultantExited(false)}
                  className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                    consultantExited === false
                      ? "border-slate-400 bg-slate-100 text-slate-800"
                      : "border-slate-200 hover:bg-slate-50 text-slate-700"
                  }`}
                >
                  Not Yet
                </button>
              </div>

              {consultantExited === true && (
                <div className="space-y-3 pt-1">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Exit Reason</Label>
                      <Select value={exitReason} onValueChange={setExitReason}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
                        <SelectContent>
                          {EXIT_REASONS.map((r) => (
                            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Exit Type</Label>
                      <Select value={exitType} onValueChange={setExitType}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="voluntary">Voluntary</SelectItem>
                          <SelectItem value="involuntary">Involuntary</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Exit Date</Label>
                    <CustomDatePicker value={exitDate} onChange={setExitDate} placeholder="Last working day…" />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="replacement_needed"
                      checked={replacementNeeded}
                      onChange={(e) => setReplacementNeeded(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-slate-300"
                    />
                    <Label htmlFor="replacement_needed" className="text-xs font-normal cursor-pointer">
                      Replacement needed
                    </Label>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Notes</Label>
                    <Textarea
                      value={exitNotes}
                      onChange={(e) => setExitNotes(e.target.value)}
                      placeholder="Any additional context…"
                      rows={2}
                      className="text-xs resize-none"
                    />
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="mt-4">
              <Button variant="ghost" size="sm" onClick={() => setStage("outcome")}>Back</Button>
              <Button
                onClick={submitLoss}
                disabled={submitting || consultantExited === null}
                className="bg-red-600 hover:bg-red-500 text-white"
              >
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                Close Ticket
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function TicketDetailPage() {
  const { ticketId } = Route.useParams();
  const { user } = useAuth();

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [sopDef, setSopDef] = useState<SopDefinition | null>(null);
  const [sopSteps, setSopSteps] = useState<SopDefinition["steps_definition"] | null>(null);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplateResponse[]>([]);
  const [closing, setClosing] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);

  // Description edit state
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [descriptionSaving, setDescriptionSaving] = useState(false);

  // Sidebar comment input state
  const [commentText, setCommentText] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [resolveSubmitting, setResolveSubmitting] = useState(false);
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
      const [t, templates] = await Promise.all([
        getTicket(Number(ticketId)),
        listEmailTemplates(),
      ]);
      setTicket(t);
      setEmailTemplates(templates);
      if (t.sop_id) {
        getSopDefinition(t.sop_id)
          .then((sop) => {
            if (sop) {
              setSopDef(sop);
              setSopSteps(sop.steps_definition);
            }
          })
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

  // With per-step hierarchy, current_step == sop step number — find it directly
  const currentSopStep = sopSteps?.find((s) => s.number === ticket?.current_step) ?? null;

  // Resolve is only allowed once the current step's medium action has been submitted
  const currentStepSubmitted = (ticket?.step_submissions ?? []).some(
    (s) => s.step_number === ticket?.current_step,
  );

  // Prefill data for form/status_update widgets — sourced from the primary consultant
  const primaryConsultant = ticket?.consultants?.[0] ?? null;
  const stepPrefillData: Record<string, unknown> = {
    current_ctc:  primaryConsultant?.monthly_po ?? undefined,
    exit_date:    primaryConsultant?.po_end_date ?? undefined,
    consultant:   primaryConsultant?.name ?? undefined,
  };

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

  async function handleSaveDescription() {
    if (!ticket) return;
    setDescriptionSaving(true);
    try {
      const updated = await updateTicket(ticket.id, { description: descriptionDraft });
      setTicket(updated);
      setEditingDescription(false);
      toast.success("Description updated");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update description");
    } finally {
      setDescriptionSaving(false);
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

  async function handleSidebarComment(isResolution: boolean) {
    if (!commentText.trim()) return;
    setCommentSubmitting(true);
    try {
      await handleComment(commentText.trim(), isResolution);
      setCommentText("");
    } finally {
      setCommentSubmitting(false);
    }
  }

  async function handleResolve() {
    if (!ticket) return;
    setResolveSubmitting(true);
    try {
      const updated = await advanceTicketStep(ticket.id);
      setTicket(updated);
      toast.success("Step resolved — advanced to next");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to advance step");
    } finally {
      setResolveSubmitting(false);
    }
  }

  async function handleClose(payload: CloseTicketPayload) {
    if (!ticket) return;
    setClosing(true);
    try {
      const updated = await closeTicket(ticket.id, payload);
      setTicket(updated);
      setCloseDialogOpen(false);
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
        <main className="flex-1 overflow-y-auto p-6">
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
      <TopBar
        title={ticket.ticket_number}
        subtitle={
          ticket.consultants.length > 0
            ? `${ticket.title} · ${ticket.consultants.map((c) => c.emp_id).join(", ")}`
            : ticket.title
        }
      />

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
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
                  disabled={closing}
                  onClick={() => setCloseDialogOpen(true)}
                >
                  {closing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <XCircle className="w-4 h-4" />
                  )}
                  Close Ticket
                </Button>
                <CloseTicketDialog
                  open={closeDialogOpen}
                  onClose={() => setCloseDialogOpen(false)}
                  consultants={ticket.consultants}
                  submitting={closing}
                  onSubmit={handleClose}
                />
              </>
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
                  <h1 className="text-lg font-semibold text-gray-900">
                    {ticket.title}
                    {ticket.consultants.length > 0 && (
                      <span className="font-bold text-black">
                        {" · "}
                        {ticket.consultants.map((c) => c.emp_id).join(", ")}
                      </span>
                    )}
                  </h1>
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

            {/* Description + Email Templates + Activity + Comments History tabs */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <Tabs defaultValue="description">
                <TabsList className="w-full justify-start rounded-none border-b border-gray-100 bg-gray-50 px-4 pt-2">
                  <TabsTrigger value="description">Description</TabsTrigger>
                  <TabsTrigger value="email-templates">Email Templates</TabsTrigger>
                  <TabsTrigger value="activity">Activity Log</TabsTrigger>
                  <TabsTrigger value="comments-history">
                    Comments History
                    {ticket.comments.length > 0 && (
                      <span className="ml-1 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                        {ticket.comments.length}
                      </span>
                    )}
                  </TabsTrigger>
                </TabsList>

                {/* ── Tab 1: Description ── */}
                <TabsContent value="description" className="p-5 space-y-5">
                  {editingDescription ? (
                    <div className="space-y-3">
                      <RichTextEditor
                        value={descriptionDraft}
                        onChange={setDescriptionDraft}
                        placeholder="Provide detailed context for this ticket…"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-xs"
                          disabled={descriptionSaving}
                          onClick={() => setEditingDescription(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          className="gap-1.5 text-xs bg-blue-600 hover:bg-blue-700"
                          disabled={descriptionSaving}
                          onClick={handleSaveDescription}
                        >
                          {descriptionSaving ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : null}
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {isCreator && ticket.status === "open" && (
                        <div className="flex justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-xs h-7"
                            onClick={() => {
                              setDescriptionDraft(ticket.description ?? "");
                              setEditingDescription(true);
                            }}
                          >
                            Edit Description
                          </Button>
                        </div>
                      )}
                      {ticket.description ? (
                        <RichTextEditor value={ticket.description} onChange={() => {}} readOnly />
                      ) : (
                        <p className="text-sm text-gray-400 italic">No description provided.</p>
                      )}
                    </div>
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

                {/* ── Tab 2: Email Templates ── */}
                <TabsContent value="email-templates" className="p-5">
                  <EmailTemplatesPanel
                    templates={emailTemplates}
                    sopTemplateIds={sopDef?.email_templates ?? null}
                  />
                </TabsContent>

                {/* ── Tab 3: Activity Log ── */}
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

                {/* ── Tab 4: Comments History ── */}
                <TabsContent value="comments-history" className="p-5">
                  <TicketCommentThread
                    comments={ticket.comments}
                    currentStep={ticket.current_step}
                    hierarchy={ticket.hierarchy_json}
                    currentUserId={user?.id ?? 0}
                    ticketStatus={ticket.status}
                    isMyTurn={isMyTurn}
                    onAddComment={handleComment}
                    readOnly
                  />
                  {ticket.comments.length === 0 && (
                    <p className="text-sm text-gray-400 italic">No comments yet.</p>
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

                {/* Per-step action widget */}
                {currentSopStep != null && (
                  <div className="mt-3">
                    <StepActionPanel
                      ticketId={ticket.id}
                      hierarchyStepNumber={ticket.current_step}
                      sopSteps={[currentSopStep]}
                      submissions={ticket.step_submissions ?? []}
                      isMyTurn={isMyTurn}
                      onSubmitted={() => fetchTicket()}
                      onAllStepsDone={() => {}}
                      prefillData={stepPrefillData}
                    />
                  </div>
                )}

                {/* Comment box — always visible when ticket is open */}
                <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                  <p className="text-xs font-medium text-gray-500">
                    {isMyTurn ? "Add a comment (optional)" : "Add an internal note"}
                  </p>
                  <textarea
                    placeholder="Write a comment…"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    rows={2}
                    className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm"
                      disabled={!commentText.trim() || commentSubmitting}
                      onClick={() => handleSidebarComment(false)}
                      className="flex-1 gap-1.5 text-xs h-8">
                      {commentSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      Comment
                    </Button>
                    {isMyTurn && (
                      <Button type="button" size="sm"
                        disabled={resolveSubmitting || (currentSopStep != null && !currentStepSubmitted)}
                        onClick={handleResolve}
                        title={currentSopStep != null && !currentStepSubmitted ? "Complete the step action above before resolving" : ""}
                        className="flex-1 gap-1.5 text-xs h-8 bg-green-600 hover:bg-green-700 disabled:opacity-50">
                        {resolveSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        Resolve & Pass
                      </Button>
                    )}
                  </div>
                  {/* Hint when step action is pending */}
                  {isMyTurn && currentSopStep != null && !currentStepSubmitted && (
                    <p className="text-[10px] text-amber-600 font-medium">
                      ⚠ Complete the step action above to enable Resolve.
                    </p>
                  )}
                </div>

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
                  comments={ticket.comments}
                  stepSubmissions={ticket.step_submissions ?? []}
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
