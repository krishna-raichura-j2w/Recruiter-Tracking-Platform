import { useRef, useState } from "react";
import {
  CheckCircle2, Clock, Circle, Mail, FileText, FormInput,
  BarChart2, FileSearch, MessageCircle, RefreshCw, Upload, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { submitTicketStep, uploadTicketFile } from "@/apiService/ticketApi";
import type { SopDefinition, StepSubmission, StepMedium } from "@/apiService/ticketTypes";
import { toast } from "sonner";

// ── types ────────────────────────────────────────────────────────────────────

type SopStep = SopDefinition["steps_definition"][number];

interface MediumConfig {
  instruction?: string;
  placeholder?: string;
  template_id?: string;
  form_schema?: Array<{ key: string; label: string; type: string; required: boolean }>;
  rag_options?: Array<{ value: string; label: string; description: string }>;
  status_options?: Array<{ value: string; label: string }>;
  extra_fields?: Array<{ key: string; label: string; type: string; required: boolean }>;
  accepted_formats?: string[];
}

interface StepActionPanelProps {
  ticketId: number;
  hierarchyStepNumber: number;
  sopSteps: SopStep[];
  submissions: StepSubmission[];
  isMyTurn: boolean;
  onSubmitted: (submission: StepSubmission) => void;
  /** Called when all sopSteps in this level have a submission — enables Resolve */
  onAllStepsDone: () => void;
  /** Pre-populated values keyed by form field key (e.g. current_ctc, exit_date) */
  prefillData?: Record<string, unknown>;
}

// ── medium metadata ──────────────────────────────────────────────────────────

const MEDIUM_META: Record<StepMedium, { label: string; icon: React.ElementType; color: string }> = {
  email:               { label: "Send Email",        icon: Mail,          color: "text-sky-600 bg-sky-50 border-sky-200" },
  document:            { label: "Upload Document",   icon: FileText,      color: "text-amber-600 bg-amber-50 border-amber-200" },
  form:                { label: "Fill Form",          icon: FormInput,     color: "text-violet-600 bg-violet-50 border-violet-200" },
  rag:                 { label: "RAG Classification",icon: BarChart2,     color: "text-rose-600 bg-rose-50 border-rose-200" },
  document_ai_summary: { label: "Doc + AI Summary",  icon: FileSearch,    color: "text-teal-600 bg-teal-50 border-teal-200" },
  comment:             { label: "Comment",            icon: MessageCircle, color: "text-gray-600 bg-gray-50 border-gray-200" },
  status_update:       { label: "Status Update",     icon: RefreshCw,     color: "text-indigo-600 bg-indigo-50 border-indigo-200" },
};

const RAG_STYLE: Record<string, string> = {
  red:   "border-red-400 bg-red-50 text-red-700 hover:bg-red-100",
  amber: "border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100",
  green: "border-green-500 bg-green-50 text-green-700 hover:bg-green-100",
};

const RAG_SELECTED: Record<string, string> = {
  red:   "ring-2 ring-red-500 scale-105",
  amber: "ring-2 ring-amber-500 scale-105",
  green: "ring-2 ring-green-500 scale-105",
};

// ── submission summary ───────────────────────────────────────────────────────

function SubmissionSummary({ sub, medium }: { sub: StepSubmission; medium: StepMedium }) {
  const meta = MEDIUM_META[medium] ?? MEDIUM_META.comment;
  const Icon = meta.icon;

  const body = (() => {
    if (!sub.form_data) return null;
    if (medium === "rag") {
      const val = sub.form_data.rag_value as string;
      return (
        <span className={cn(
          "inline-block px-3 py-0.5 rounded-full text-xs font-bold border uppercase",
          val === "red" ? "bg-red-100 text-red-700 border-red-300"
          : val === "amber" ? "bg-amber-100 text-amber-700 border-amber-300"
          : "bg-green-100 text-green-700 border-green-300",
        )}>
          {val}
        </span>
      );
    }
    if (medium === "email") {
      return <p className="text-xs text-gray-600">Email sent ✓</p>;
    }
    if (medium === "status_update") {
      return <p className="text-xs text-gray-600">Status: <strong>{sub.form_data.status as string}</strong></p>;
    }
    if (medium === "comment") {
      return <p className="text-xs text-gray-600 line-clamp-2">{sub.form_data.content as string}</p>;
    }
    if (medium === "form") {
      return (
        <ul className="text-xs text-gray-600 space-y-0.5">
          {Object.entries(sub.form_data).map(([k, v]) => (
            <li key={k}><span className="text-gray-400">{k}:</span> {String(v)}</li>
          ))}
        </ul>
      );
    }
    if (sub.attachments.length) {
      return <p className="text-xs text-gray-600">{sub.attachments.length} file(s) uploaded</p>;
    }
    if (sub.ai_summary) {
      return <p className="text-xs text-gray-600 line-clamp-2">{sub.ai_summary}</p>;
    }
    return null;
  })();

  return (
    <div className="flex items-start gap-2 mt-2 p-2 rounded-lg bg-green-50 border border-green-200">
      <Icon className="w-3.5 h-3.5 text-green-600 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold text-green-700 uppercase tracking-wide">Submitted</p>
        {body}
      </div>
    </div>
  );
}

// ── per-medium widgets ───────────────────────────────────────────────────────

function EmailWidget({ config, onSubmit, submitting }: {
  config: MediumConfig;
  onSubmit: (data: Record<string, unknown>) => void;
  submitting: boolean;
}) {
  return (
    <div className="space-y-2">
      {config.instruction && <p className="text-xs text-gray-500">{config.instruction}</p>}
      {config.template_id && (
        <p className="text-xs font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded px-2 py-1">
          Template: {config.template_id}
        </p>
      )}
      <Button size="sm" disabled={submitting} onClick={() => onSubmit({ sent: true })}
        className="w-full gap-2 bg-sky-600 hover:bg-sky-700 text-white text-xs">
        {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
        Mark Email as Sent
      </Button>
    </div>
  );
}

function DocumentWidget({ config, onSubmit, submitting }: {
  config: MediumConfig;
  onSubmit: (data: Record<string, unknown>, attachments: string[]) => void;
  submitting: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState<string[]>([]);
  const ref = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const path = await uploadTicketFile(file);
      setUploaded((p) => [...p, path]);
      toast.success("File uploaded");
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      {config.instruction && <p className="text-xs text-gray-500">{config.instruction}</p>}
      <div
        onClick={() => ref.current?.click()}
        className="flex flex-col items-center justify-center gap-1 border-2 border-dashed border-gray-300 rounded-lg py-4 cursor-pointer hover:border-amber-400 hover:bg-amber-50 transition-colors"
      >
        {uploading ? <Loader2 className="w-5 h-5 animate-spin text-amber-500" /> : <Upload className="w-5 h-5 text-gray-400" />}
        <p className="text-xs text-gray-500">{uploading ? "Uploading…" : "Click to upload"}</p>
        {config.accepted_formats && (
          <p className="text-[10px] text-gray-400">{config.accepted_formats.join(", ").toUpperCase()}</p>
        )}
      </div>
      <input ref={ref} type="file" className="hidden" onChange={handleFile}
        accept={config.accepted_formats?.map((f) => `.${f}`).join(",")} />
      {uploaded.length > 0 && (
        <ul className="text-xs text-green-700 space-y-0.5">
          {uploaded.map((p, i) => <li key={i} className="truncate">✓ {p.split("/").pop()}</li>)}
        </ul>
      )}
      <Button size="sm" disabled={submitting || uploaded.length === 0} onClick={() => onSubmit({}, uploaded)}
        className="w-full gap-2 bg-amber-600 hover:bg-amber-700 text-white text-xs">
        {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
        Submit Document
      </Button>
    </div>
  );
}

function FormWidget({ config, onSubmit, submitting, prefillData = {} }: {
  config: MediumConfig;
  onSubmit: (data: Record<string, unknown>) => void;
  submitting: boolean;
  prefillData?: Record<string, unknown>;
}) {
  const fields = config.form_schema ?? [];
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    // Seed state with any prefill values that match form fields
    const init: Record<string, unknown> = {};
    for (const f of fields) {
      if (prefillData[f.key] !== undefined && prefillData[f.key] !== null) {
        init[f.key] = prefillData[f.key];
      }
    }
    return init;
  });

  function set(key: string, value: unknown) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  const isComplete = fields.filter((f) => f.required).every((f) => {
    const v = values[f.key];
    return v !== undefined && v !== "" && v !== null;
  });

  return (
    <div className="space-y-2">
      {config.instruction && <p className="text-xs text-gray-500">{config.instruction}</p>}
      <div className="space-y-2">
        {fields.map((field) => {
          const isPrefilled = prefillData[field.key] !== undefined && prefillData[field.key] !== null;
          return (
          <div key={field.key}>
            <label className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
              {field.label}{field.required && <span className="text-red-500 ml-0.5">*</span>}
              {isPrefilled && (
                <span className="text-[9px] font-semibold text-violet-600 bg-violet-50 border border-violet-200 px-1 py-0.5 rounded">
                  auto-filled
                </span>
              )}
            </label>
            {field.type === "boolean" ? (
              <div className="flex gap-2 mt-1">
                {["Yes", "No"].map((opt) => (
                  <button key={opt} type="button"
                    onClick={() => set(field.key, opt === "Yes")}
                    className={cn(
                      "flex-1 py-1.5 text-xs rounded-lg border font-medium transition-colors",
                      values[field.key] === (opt === "Yes")
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-gray-600 border-gray-300 hover:border-blue-400",
                    )}
                  >{opt}</button>
                ))}
              </div>
            ) : field.type === "textarea" ? (
              <textarea rows={2} placeholder={field.label}
                value={String(values[field.key] ?? "")}
                onChange={(e) => set(field.key, e.target.value)}
                className="mt-1 w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-violet-400" />
            ) : (
              <input type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                placeholder={field.label}
                value={String(values[field.key] ?? "")}
                onChange={(e) => set(field.key, field.type === "number" ? Number(e.target.value) : e.target.value)}
                className="mt-1 w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-400" />
            )}
          </div>
          );
        })}
      </div>
      <Button size="sm" disabled={submitting || !isComplete} onClick={() => onSubmit(values)}
        className="w-full gap-2 bg-violet-600 hover:bg-violet-700 text-white text-xs">
        {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FormInput className="w-3.5 h-3.5" />}
        Submit Form
      </Button>
    </div>
  );
}

function RagWidget({ config, onSubmit, submitting }: {
  config: MediumConfig;
  onSubmit: (data: Record<string, unknown>) => void;
  submitting: boolean;
}) {
  const options = config.rag_options ?? [];
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      {config.instruction && <p className="text-xs text-gray-500">{config.instruction}</p>}
      <div className="grid grid-cols-3 gap-2">
        {options.map((opt) => (
          <button key={opt.value} type="button" onClick={() => setSelected(opt.value)}
            className={cn(
              "rounded-xl border-2 py-3 px-2 text-center transition-all",
              RAG_STYLE[opt.value] ?? "border-gray-300 bg-gray-50 text-gray-700",
              selected === opt.value && (RAG_SELECTED[opt.value] ?? "ring-2 ring-gray-400"),
            )}
          >
            <p className="text-sm font-black">{opt.label}</p>
            <p className="text-[10px] mt-0.5 leading-tight opacity-80">{opt.description}</p>
          </button>
        ))}
      </div>
      <Button size="sm" disabled={submitting || !selected} onClick={() => onSubmit({ rag_value: selected })}
        className="w-full gap-2 bg-rose-600 hover:bg-rose-700 text-white text-xs">
        {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BarChart2 className="w-3.5 h-3.5" />}
        Confirm Classification
      </Button>
    </div>
  );
}

function StatusUpdateWidget({ config, onSubmit, submitting, prefillData = {} }: {
  config: MediumConfig;
  onSubmit: (data: Record<string, unknown>) => void;
  submitting: boolean;
  prefillData?: Record<string, unknown>;
}) {
  const options = config.status_options ?? [];
  const extraFields = config.extra_fields ?? [];
  const [status, setStatus] = useState<string>("");
  const [extras, setExtras] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {};
    for (const f of extraFields) {
      if (prefillData[f.key] !== undefined && prefillData[f.key] !== null) {
        init[f.key] = prefillData[f.key];
      }
    }
    return init;
  });

  function setExtra(key: string, value: unknown) {
    setExtras((p) => ({ ...p, [key]: value }));
  }

  const isComplete = !!status && extraFields.filter((f) => f.required).every((f) => {
    const v = extras[f.key];
    return v !== undefined && v !== "" && v !== null;
  });

  return (
    <div className="space-y-2">
      {config.instruction && <p className="text-xs text-gray-500">{config.instruction}</p>}
      <div className="space-y-1">
        {options.map((opt) => (
          <button key={opt.value} type="button" onClick={() => setStatus(opt.value)}
            className={cn(
              "w-full text-left text-xs px-3 py-2 rounded-lg border transition-colors",
              status === opt.value
                ? "border-indigo-500 bg-indigo-50 text-indigo-800 font-medium"
                : "border-gray-200 bg-white text-gray-700 hover:border-indigo-300",
            )}
          >{opt.label}</button>
        ))}
      </div>
      {extraFields.map((field) => (
        <div key={field.key}>
          <label className="text-xs font-medium text-gray-700">
            {field.label}{field.required && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          {field.type === "textarea" ? (
            <textarea rows={2} placeholder={field.label}
              value={String(extras[field.key] ?? "")}
              onChange={(e) => setExtra(field.key, e.target.value)}
              className="mt-1 w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-400" />
          ) : (
            <input type={field.type} placeholder={field.label}
              value={String(extras[field.key] ?? "")}
              onChange={(e) => setExtra(field.key, e.target.value)}
              className="mt-1 w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
          )}
        </div>
      ))}
      <Button size="sm" disabled={submitting || !isComplete}
        onClick={() => onSubmit({ status, ...extras })}
        className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs">
        {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        Submit Status
      </Button>
    </div>
  );
}

function CommentWidget({ config, onSubmit, submitting }: {
  config: MediumConfig;
  onSubmit: (data: Record<string, unknown>) => void;
  submitting: boolean;
}) {
  const [text, setText] = useState("");
  return (
    <div className="space-y-2">
      {config.instruction && <p className="text-xs text-gray-500">{config.instruction}</p>}
      <textarea rows={3} placeholder={config.placeholder ?? "Write a comment…"}
        value={text} onChange={(e) => setText(e.target.value)}
        className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-gray-400" />
      <Button size="sm" disabled={submitting || !text.trim()}
        onClick={() => onSubmit({ content: text })}
        className="w-full gap-2 bg-gray-700 hover:bg-gray-800 text-white text-xs">
        {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageCircle className="w-3.5 h-3.5" />}
        Submit Comment
      </Button>
    </div>
  );
}

// ── main panel ───────────────────────────────────────────────────────────────

export function StepActionPanel({
  ticketId,
  sopSteps,
  submissions,
  isMyTurn,
  onSubmitted,
  onAllStepsDone,
  prefillData = {},
}: StepActionPanelProps) {
  const [submittingStep, setSubmittingStep] = useState<number | null>(null);
  // local copy of submissions so UI updates optimistically
  const [localSubs, setLocalSubs] = useState<StepSubmission[]>(submissions);

  // Keep localSubs in sync when parent refreshes ticket
  const prevSubsRef = useRef(submissions);
  if (submissions !== prevSubsRef.current) {
    prevSubsRef.current = submissions;
    setLocalSubs(submissions);
  }

  function isSubmitted(stepNumber: number) {
    return localSubs.some((s) => s.step_number === stepNumber);
  }
  function getSubmission(stepNumber: number) {
    return localSubs.find((s) => s.step_number === stepNumber) ?? null;
  }

  // First unsubmitted step = active
  const activeStepNumber = sopSteps.find((s) => !isSubmitted(s.number))?.number ?? null;
  const allDone = sopSteps.every((s) => isSubmitted(s.number));

  async function handleSubmit(
    stepNumber: number,
    medium: StepMedium,
    formData: Record<string, unknown>,
    attachments: string[] = [],
  ) {
    setSubmittingStep(stepNumber);
    try {
      const result = await submitTicketStep(ticketId, stepNumber, { medium, form_data: formData, attachments });
      setLocalSubs((prev) => [...prev, result]);
      onSubmitted(result);
      toast.success(`Step ${stepNumber} submitted`);
      // Check if all steps are now done after this submission
      const newSubs = [...localSubs, result];
      if (sopSteps.every((s) => newSubs.some((sub) => sub.step_number === s.number))) {
        onAllStepsDone();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmittingStep(null);
    }
  }

  return (
    <div className="space-y-2">
      {sopSteps.map((sopStep, idx) => {
        const submitted = isSubmitted(sopStep.number);
        const isActive = sopStep.number === activeStepNumber && isMyTurn && !submitted;
        const isFuture = !submitted && sopStep.number !== activeStepNumber;
        const sub = getSubmission(sopStep.number);
        const medium = (sopStep.medium ?? "comment") as StepMedium;
        const config = (sopStep.medium_config ?? {}) as MediumConfig;
        const meta = MEDIUM_META[medium] ?? MEDIUM_META.comment;
        const MediumIcon = meta.icon;
        const submitting = submittingStep === sopStep.number;

        return (
          <div key={sopStep.number}
            className={cn(
              "rounded-xl border transition-all",
              submitted && "border-green-200 bg-green-50",
              isActive && "border-blue-300 bg-white shadow-sm",
              isFuture && "border-gray-100 bg-gray-50 opacity-50",
            )}
          >
            {/* Step header */}
            <div className="flex items-start gap-2.5 px-3 pt-3 pb-2">
              <div className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-[10px] font-bold",
                submitted ? "bg-green-500 text-white"
                : isActive ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-500",
              )}>
                {submitted ? <CheckCircle2 className="w-3 h-3" /> : isActive ? <Clock className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-gray-400 font-medium">Step {sopStep.number}</span>
                  <span className={cn(
                    "inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border",
                    meta.color,
                  )}>
                    <MediumIcon className="w-2.5 h-2.5" />
                    {meta.label}
                  </span>
                </div>
                <p className={cn(
                  "text-xs font-semibold mt-0.5",
                  submitted ? "text-green-800" : isActive ? "text-gray-900" : "text-gray-400",
                )}>
                  {sopStep.action_label}
                </p>
                {isActive && sopStep.action_detail && (
                  <p className="text-[10px] text-gray-500 mt-0.5 leading-relaxed">{sopStep.action_detail}</p>
                )}
              </div>
              {idx + 1 < sopSteps.length && (
                <div className={cn(
                  "text-[10px] font-medium px-1.5 py-0.5 rounded",
                  submitted ? "text-green-600 bg-green-100" : "text-gray-400 bg-gray-100",
                )}>
                  {submitted ? "Done" : "Pending"}
                </div>
              )}
            </div>

            {/* Submission summary (done) */}
            {submitted && sub && (
              <div className="px-3 pb-3">
                <SubmissionSummary sub={sub} medium={medium} />
              </div>
            )}

            {/* Widget (active only) */}
            {isActive && (
              <div className="px-3 pb-3 pt-1 border-t border-blue-100">
                {medium === "email" && (
                  <EmailWidget config={config} submitting={submitting}
                    onSubmit={(d) => handleSubmit(sopStep.number, medium, d)} />
                )}
                {(medium === "document") && (
                  <DocumentWidget config={config} submitting={submitting}
                    onSubmit={(d, a) => handleSubmit(sopStep.number, medium, d, a)} />
                )}
                {medium === "document_ai_summary" && (
                  <DocumentWidget config={config} submitting={submitting}
                    onSubmit={(d, a) => handleSubmit(sopStep.number, medium, d, a)} />
                )}
                {medium === "form" && (
                  <FormWidget config={config} submitting={submitting} prefillData={prefillData}
                    onSubmit={(d) => handleSubmit(sopStep.number, medium, d)} />
                )}
                {medium === "rag" && (
                  <RagWidget config={config} submitting={submitting}
                    onSubmit={(d) => handleSubmit(sopStep.number, medium, d)} />
                )}
                {medium === "status_update" && (
                  <StatusUpdateWidget config={config} submitting={submitting} prefillData={prefillData}
                    onSubmit={(d) => handleSubmit(sopStep.number, medium, d)} />
                )}
                {medium === "comment" && (
                  <CommentWidget config={config} submitting={submitting}
                    onSubmit={(d) => handleSubmit(sopStep.number, medium, d)} />
                )}
              </div>
            )}
          </div>
        );
      })}

      {allDone && isMyTurn && (
        <div className="rounded-xl border border-green-300 bg-green-50 px-3 py-2.5 text-xs text-green-800 font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
          All steps complete — use <strong>Resolve &amp; Pass to Next</strong> above to advance.
        </div>
      )}
    </div>
  );
}
