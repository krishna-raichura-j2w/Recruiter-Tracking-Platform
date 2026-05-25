import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

import { Step1Entities } from "./steps/Step1Entities";
import { Step2SOP } from "./steps/Step2SOP";
import { Step3Priority } from "./steps/Step3Priority";
import { Step4Description } from "./steps/Step4Description";
import { Step5Hierarchy } from "./steps/Step5Hierarchy";

import {
  createTicket,
  listSopDefinitions,
  listAllHrbpUsers,
} from "@/apiService/ticketApi";
import type {
  SopDefinition,
  HierarchyStep,
  UserOption,
} from "@/apiService/ticketTypes";

// These come from the existing getClients / getConsultants calls
interface Client { id: number; name: string; bh_id?: number; }
interface Consultant {
  id: number; name: string; emp_id: string;
  cohort: string | null; monthly_po: number | null;
  po_end_date: string | null; join_date: string | null;
  po_risk: number | null; client_id: number;
}

interface CreateTicketWizardProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  clients: Client[];
  consultants: Consultant[];
}

const STEPS = [
  { id: 1, label: "Entities" },
  { id: 2, label: "Request Type" },
  { id: 3, label: "Priority" },
  { id: 4, label: "Description" },
  { id: 5, label: "Hierarchy" },
];

export function CreateTicketWizard({
  open,
  onClose,
  onCreated,
  clients,
  consultants,
}: CreateTicketWizardProps) {
  const { user } = useAuth();

  // ── Remote data ──────────────────────────────────────────────────────────
  const [sops, setSops] = useState<SopDefinition[]>([]);
  const [sopsLoading, setSopsLoading] = useState(false);
  const [allUsers, setAllUsers] = useState<UserOption[]>([]);

  useEffect(() => {
    if (!open) return;
    setSopsLoading(true);
    listSopDefinitions()
      .then(setSops)
      .catch((err) => toast.error(`Failed to load request types: ${err.message}`))
      .finally(() => setSopsLoading(false));
    listAllHrbpUsers().then(setAllUsers).catch(() => {});
  }, [open]);

  const bhUsers = useMemo(
    () => allUsers.filter((u) => u.role === "bh"),
    [allUsers],
  );

  // ── Wizard state ─────────────────────────────────────────────────────────
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Step 1
  const [step1, setStep1] = useState({
    raisedByName: user?.name ?? "",
    escalationMgrId: null as number | null,
    clientId: null as number | null,
    consultantIds: [] as number[],
  });
  // used to filter consultants by client (already on props, but track change)
  const [, setSelectedClientId] = useState<number | null>(null);

  // Step 2
  const [selectedSopId, setSelectedSopId] = useState<number | null>(null);
  const selectedSop = useMemo(
    () => sops.find((s) => s.id === selectedSopId) ?? null,
    [sops, selectedSopId],
  );

  // Step 3
  const [step3, setStep3] = useState<{
    priority: "critical" | "high" | "medium" | "low";
    slaDeadline: string;
  }>({
    priority: "medium",
    slaDeadline: "",
  });

  // Step 4
  const [step4, setStep4] = useState({
    description: "",
    poRiskAmount: null as number | null,
    poRiskOverride: false,
  });

  // Step 5
  const [hierarchy, setHierarchy] = useState<HierarchyStep[]>([]);

  // Auto-populate hierarchy when SOP changes
  useEffect(() => {
    if (selectedSop) {
      setHierarchy(
        selectedSop.persons_hierarchy.map((s) => ({
          ...s,
          user_id: null,
          user_name: null,
          user_email: null,
          resolved_at: null,
          resolved_by_id: null,
          resolved_by_name: null,
        })),
      );
    }
  }, [selectedSop]);

  // Sync user name from auth
  useEffect(() => {
    if (user) setStep1((s) => ({ ...s, raisedByName: user.name ?? "" }));
  }, [user]);

  // Auto-compute PO risk for step 4 from selected consultants
  const selectedConsultantsData = useMemo(
    () => consultants.filter((c) => step1.consultantIds.includes(c.id)),
    [consultants, step1.consultantIds],
  );

  // ── SLA hint from SOP first step ────────────────────────────────────────
  const sopSlaHint = useMemo(() => {
    if (!selectedSop?.steps_definition?.[0]) return undefined;
    const hours = selectedSop.steps_definition[0].sla_working_hours;
    if (!hours) return undefined;
    return hours < 24 ? `${hours} working hours` : `${Math.round(hours / 24)} working days`;
  }, [selectedSop]);

  // ── Validation ───────────────────────────────────────────────────────────
  function canProceed(): boolean {
    if (step === 1) return !!step1.clientId && step1.consultantIds.length > 0;
    if (step === 2) return selectedSopId !== null;
    if (step === 3) return true;
    if (step === 4) return step4.description.replace(/<[^>]*>/g, "").trim().length > 10;
    if (step === 5) return hierarchy.length > 0;
    return true;
  }

  // ── Reset on close ───────────────────────────────────────────────────────
  function handleClose() {
    setStep(1);
    setStep1({ raisedByName: user?.name ?? "", escalationMgrId: null, clientId: null, consultantIds: [] });
    setSelectedSopId(null);
    setStep3({ priority: "medium", slaDeadline: "" });
    setStep4({ description: "", poRiskAmount: null, poRiskOverride: false });
    setHierarchy([]);
    onClose();
  }

  // ── Submit ───────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!step1.clientId || !selectedSopId) return;
    setSubmitting(true);
    try {
      const computedRisk = step4.poRiskOverride
        ? step4.poRiskAmount
        : selectedConsultantsData.reduce((sum, c) => {
            if (c.po_risk !== null) return sum + c.po_risk;
            if (!c.monthly_po || !c.po_end_date) return sum;
            const end = new Date(c.po_end_date);
            const now = new Date();
            const months = Math.max(
              0,
              (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth()),
            );
            return sum + months * c.monthly_po;
          }, 0);

      await createTicket({
        escalation_mgr_id: step1.escalationMgrId,
        client_id: step1.clientId,
        consultant_ids: step1.consultantIds,
        sop_id: selectedSopId,
        priority: step3.priority,
        sla_deadline: step3.slaDeadline ? new Date(step3.slaDeadline).toISOString() : null,
        description: step4.description,
        po_risk_amount: computedRisk || null,
        hierarchy_json: hierarchy,
      });

      toast.success("Ticket created successfully");
      handleClose();
      onCreated();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create ticket");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-gray-100">
          <DialogTitle className="text-lg font-semibold text-gray-900">
            New Ticket
          </DialogTitle>

          {/* Step indicators */}
          <div className="flex items-center gap-0 mt-3">
            {STEPS.map((s, idx) => {
              const done = step > s.id;
              const active = step === s.id;
              return (
                <div key={s.id} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center gap-1">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors
                        ${done ? "bg-green-500 text-white" : active ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-400"}`}
                    >
                      {done ? <CheckCircle2 className="w-4 h-4" /> : s.id}
                    </div>
                    <span
                      className={`text-xs whitespace-nowrap ${active ? "text-blue-600 font-medium" : "text-gray-400"}`}
                    >
                      {s.label}
                    </span>
                  </div>
                  {idx < STEPS.length - 1 && (
                    <div
                      className={`flex-1 h-0.5 mx-1 mb-4 transition-colors ${done ? "bg-green-400" : "bg-gray-200"}`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 1 && (
            <Step1Entities
              data={step1}
              onChange={setStep1}
              clients={clients}
              consultants={consultants}
              bhUsers={bhUsers}
              onClientChange={setSelectedClientId}
            />
          )}
          {step === 2 && (
            sopsLoading ? (
              <div className="flex items-center justify-center py-12 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Loading request types…
              </div>
            ) : (
              <Step2SOP
                sops={sops}
                selectedSopId={selectedSopId}
                onSelect={(sop) => setSelectedSopId(sop.id)}
              />
            )
          )}
          {step === 3 && (
            <Step3Priority
              data={step3}
              onChange={setStep3}
              sopSlaHint={sopSlaHint}
            />
          )}
          {step === 4 && (
            <Step4Description
              data={step4}
              onChange={setStep4}
              consultants={selectedConsultantsData}
            />
          )}
          {step === 5 && (
            <Step5Hierarchy
              hierarchy={hierarchy}
              onChange={setHierarchy}
              selectedSop={selectedSop}
              allUsers={allUsers}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50">
          <div className="flex items-center gap-2">
            {step > 1 && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep((s) => s - 1)}
                className="gap-1"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
            {step < 5 ? (
              <Button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                disabled={!canProceed()}
                className="gap-1"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !canProceed()}
                className="gap-2 bg-blue-600 hover:bg-blue-700"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {submitting ? "Creating…" : "Create Ticket"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
