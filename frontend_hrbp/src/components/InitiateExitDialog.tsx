import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "react-toastify";
import dayjs, { type Dayjs } from "dayjs";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CustomDatePicker } from "@/components/CustomDatePicker";
import { getClientsApi, getConsultantsApi } from "@/apiService/api";
import { createExit } from "@/apiService/exitApi";
import type { ExitCreate, ExitReason } from "@/apiService/exitApi";
import { useAuth } from "@/lib/auth";

const EXIT_REASONS: { value: ExitReason; label: string }[] = [
  { value: "resignation",      label: "Resignation"      },
  { value: "project_roll_off", label: "Project Roll Off" },
  { value: "contract_closure", label: "Contract Closure" },
  { value: "conversion",       label: "Conversion"       },
  { value: "absconding",       label: "Absconding"       },
  { value: "no_show",          label: "No Show"          },
  { value: "termination",      label: "Termination"      },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export function InitiateExitDialog({ open, onClose, onCreated }: Props) {
  const { user } = useAuth();

  const [clients, setClients]           = useState<{ id: number; name: string }[]>([]);
  const [consultants, setConsultants]   = useState<{ id: number; name: string; client_id: number; monthly_po: number | null }[]>([]);
  const [loadingData, setLoadingData]   = useState(false);
  const [saving, setSaving]             = useState(false);

  const [form, setForm] = useState<{
    client_id:           string;
    consultant_id:       string;
    exit_reason:         ExitReason | "";
    exit_type:           "voluntary" | "involuntary" | "";
    exit_date:           Dayjs | null;
    notice_period_start: Dayjs | null;
    replacement_needed:  boolean;
    notes:               string;
  }>({
    client_id: "", consultant_id: "", exit_reason: "", exit_type: "",
    exit_date: null, notice_period_start: null, replacement_needed: false, notes: "",
  });

  useEffect(() => {
    if (!open) return;
    setLoadingData(true);
    Promise.all([
      getClientsApi({ per_page: 500, is_active: true }),
      getConsultantsApi({ per_page: -1, is_active: true }),
    ])
      .then(([c, cs]) => {
        setClients((c.data ?? []).map((x: any) => ({ id: x.id, name: x.name })));
        setConsultants((cs.data ?? []).map((x: any) => ({
          id: x.id, name: x.name, client_id: x.client_id, monthly_po: x.monthly_po ?? null,
        })));
      })
      .catch(() => toast.error("Failed to load clients/consultants"))
      .finally(() => setLoadingData(false));
  }, [open]);

  function reset() {
    setForm({ client_id: "", consultant_id: "", exit_reason: "", exit_type: "",
      exit_date: null, notice_period_start: null, replacement_needed: false, notes: "" });
  }

  const filteredConsultants = useMemo(
    () => form.client_id ? consultants.filter((c) => c.client_id === Number(form.client_id)) : consultants,
    [form.client_id, consultants],
  );

  const selectedConsultant = useMemo(
    () => consultants.find((c) => c.id === Number(form.consultant_id)),
    [form.consultant_id, consultants],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.consultant_id || !form.client_id || !form.exit_reason || !form.exit_type) {
      toast.error("Please fill all required fields");
      return;
    }
    setSaving(true);
    try {
      const payload: ExitCreate = {
        consultant_id:       Number(form.consultant_id),
        client_id:           Number(form.client_id),
        initiated_by_id:     user?.id ?? 0,
        exit_reason:         form.exit_reason as ExitReason,
        exit_type:           form.exit_type as "voluntary" | "involuntary",
        exit_date:           form.exit_date ? form.exit_date.format("YYYY-MM-DD") : undefined,
        notice_period_start: form.notice_period_start ? form.notice_period_start.format("YYYY-MM-DD") : undefined,
        replacement_needed:  form.replacement_needed,
        notes:               form.notes || undefined,
      };
      await createExit(payload);
      toast.success("Exit initiated successfully");
      reset();
      onCreated?.();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "Failed to initiate exit");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Initiate Exit</DialogTitle>
        </DialogHeader>

        {loadingData ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Client <span className="text-red-500">*</span></Label>
              <Select value={form.client_id} onValueChange={(v) => setForm((f) => ({ ...f, client_id: v, consultant_id: "" }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select client…" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Consultant <span className="text-red-500">*</span></Label>
              <Select value={form.consultant_id} onValueChange={(v) => setForm((f) => ({ ...f, consultant_id: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select consultant…" /></SelectTrigger>
                <SelectContent>
                  {filteredConsultants.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {selectedConsultant?.monthly_po != null && (
                <p className="text-xs text-slate-500">
                  Monthly PO: <span className="font-semibold text-slate-700">
                    ₹{selectedConsultant.monthly_po.toLocaleString("en-IN")}
                  </span> — will be snapshotted as PO impact.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Exit Reason <span className="text-red-500">*</span></Label>
                <Select value={form.exit_reason} onValueChange={(v) => setForm((f) => ({ ...f, exit_reason: v as ExitReason }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Reason…" /></SelectTrigger>
                  <SelectContent>
                    {EXIT_REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Exit Type <span className="text-red-500">*</span></Label>
                <Select value={form.exit_type} onValueChange={(v) => setForm((f) => ({ ...f, exit_type: v as "voluntary" | "involuntary" }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Type…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="voluntary">Voluntary</SelectItem>
                    <SelectItem value="involuntary">Involuntary</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Notice Period Start</Label>
                <CustomDatePicker value={form.notice_period_start} onChange={(v) => setForm((f) => ({ ...f, notice_period_start: v }))} placeholder="Notice start date" />
              </div>
              <div className="space-y-1">
                <Label>Exit Date</Label>
                <CustomDatePicker value={form.exit_date} onChange={(v) => setForm((f) => ({ ...f, exit_date: v }))} placeholder="Last working day" />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input id="exit-replacement" type="checkbox" checked={form.replacement_needed}
                onChange={(e) => setForm((f) => ({ ...f, replacement_needed: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300" />
              <Label htmlFor="exit-replacement" className="cursor-pointer font-normal">Replacement needed</Label>
            </div>

            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea placeholder="Any additional context…" value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="text-sm resize-none" rows={3} />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
              <Button type="submit" disabled={saving} className="bg-sky-600 hover:bg-sky-500 text-white">
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                {saving ? "Saving…" : "Initiate Exit"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
