import { useRef, useMemo } from "react";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/tickets/RichTextEditor";
import { Paperclip, X, FileText, TrendingDown, Clock, IndianRupee } from "lucide-react";

interface ConsultantForRisk {
  id: number;
  name: string;
  monthly_po: number | null;
  po_end_date: string | null;
  join_date: string | null;
  po_risk: number | null;
}

interface Step4Data {
  description: string;
  poRiskAmount: number | null;
  poRiskOverride: boolean;
  attachmentFiles: File[];
}

interface Step4DescriptionProps {
  data: Step4Data;
  onChange: (data: Step4Data) => void;
  consultants: ConsultantForRisk[];
}

function toNum(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return isNaN(n) ? null : n;
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

function formatInr(amount: number): string {
  if (!isFinite(amount)) return "—";
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function Step4Description({ data, onChange, consultants }: Step4DescriptionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (!picked.length) return;
    const merged = [
      ...data.attachmentFiles,
      ...picked.filter(
        (f) => !data.attachmentFiles.some((x) => x.name === f.name && x.size === f.size),
      ),
    ];
    onChange({ ...data, attachmentFiles: merged });
    e.target.value = "";
  }

  function removeFile(index: number) {
    const next = data.attachmentFiles.filter((_, i) => i !== index);
    onChange({ ...data, attachmentFiles: next });
  }

  // Always compute from monthly_po × tenure_left — never use the consultant.po_risk override
  const perConsultantRisk = useMemo(
    () =>
      consultants.map((c) => {
        const monthlyPo = toNum(c.monthly_po);
        const tenureLeft = calcTenureLeft(c.po_end_date);
        const poAtRisk = monthlyPo !== null ? monthlyPo * tenureLeft : null;
        return { ...c, monthlyPo, tenureLeft, poAtRisk };
      }),
    [consultants],
  );

  const totalRisk = useMemo(() => {
    const values = perConsultantRisk
      .map((c) => c.poAtRisk)
      .filter((v): v is number => v !== null);
    if (values.length === 0) return null;
    return values.reduce((sum, v) => sum + v, 0);
  }, [perConsultantRisk]);

  function handleManualRisk(e: React.ChangeEvent<HTMLInputElement>) {
    const v = parseFloat(e.target.value);
    onChange({ ...data, poRiskOverride: true, poRiskAmount: isNaN(v) ? null : v });
  }

  function handleRevertToComputed() {
    onChange({ ...data, poRiskOverride: false, poRiskAmount: null });
  }

  const inputValue = data.poRiskOverride ? (data.poRiskAmount ?? "") : (totalRisk ?? "");

  return (
    <div className="space-y-5">
      {/* Rich text description */}
      <div className="space-y-2">
        <Label>
          Description <span className="text-red-500">*</span>
          <span className="text-gray-400 text-xs font-normal ml-1">
            — paste from email, write your own, or use Bold / Italic / Tables
          </span>
        </Label>
        <RichTextEditor
          value={data.description}
          onChange={(html) => onChange({ ...data, description: html })}
          placeholder="Provide detailed context for this ticket. You can paste email content here…"
        />
      </div>

      {/* Attachments */}
      <div className="space-y-2">
        <Label>
          Supporting Documents
          <span className="text-gray-400 text-xs font-normal ml-1">
            — optional, multiple files allowed
          </span>
        </Label>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFilePick}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-200 rounded-xl w-full text-sm text-gray-500 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
        >
          <Paperclip className="w-4 h-4 flex-shrink-0" />
          Click to attach files
        </button>
        {data.attachmentFiles.length > 0 && (
          <ul className="space-y-1.5 mt-1">
            {data.attachmentFiles.map((file, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100 text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
                  <span className="truncate text-gray-700">{file.name}</span>
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    ({(file.size / 1024).toFixed(0)} KB)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="text-gray-400 hover:text-red-500 flex-shrink-0 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* PO Risk section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>
            PO at Risk
            <span className="text-gray-400 text-xs font-normal ml-1">
              {data.poRiskOverride ? "— manual override" : "— auto-calculated"}
            </span>
          </Label>
          {data.poRiskOverride && (
            <button
              type="button"
              onClick={handleRevertToComputed}
              className="text-xs px-2 py-0.5 rounded-full border border-orange-400 text-orange-700 bg-orange-50 hover:bg-orange-100 transition-colors"
            >
              Revert to computed
            </button>
          )}
        </div>

        {/* Per-consultant breakdown */}
        {perConsultantRisk.length > 0 && (
          <div className="rounded-xl border border-gray-200 overflow-hidden text-sm">
            {perConsultantRisk.map((c, idx) => (
              <div
                key={c.id}
                className={`px-4 py-3 ${idx !== 0 ? "border-t border-gray-100" : ""}`}
              >
                <p className="font-semibold text-gray-800 mb-2">{c.name}</p>
                <div className="grid grid-cols-3 gap-3">
                  {/* Monthly PO */}
                  <div className="flex flex-col gap-1 bg-blue-50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-1 text-blue-500">
                      <IndianRupee className="w-3.5 h-3.5" />
                      <span className="text-xs font-medium">Monthly PO</span>
                    </div>
                    <span className="text-sm font-bold text-blue-700">
                      {c.monthlyPo !== null ? formatInr(c.monthlyPo) : "—"}
                    </span>
                  </div>

                  {/* Tenure Left */}
                  <div className="flex flex-col gap-1 bg-amber-50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-1 text-amber-500">
                      <Clock className="w-3.5 h-3.5" />
                      <span className="text-xs font-medium">Tenure Left</span>
                    </div>
                    <span className="text-sm font-bold text-amber-700">
                      {c.po_end_date ? `${c.tenureLeft} mo` : "—"}
                    </span>
                  </div>

                  {/* PO at Risk */}
                  <div className="flex flex-col gap-1 bg-red-50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-1 text-red-500">
                      <TrendingDown className="w-3.5 h-3.5" />
                      <span className="text-xs font-medium">PO at Risk</span>
                    </div>
                    <span className="text-sm font-bold text-red-700">
                      {c.poAtRisk !== null && c.poAtRisk > 0 ? formatInr(c.poAtRisk) : "—"}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            {/* Total row */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-200">
              <span className="font-semibold text-gray-700">Total PO at Risk</span>
              <span className="font-bold text-red-700 text-base">
                {totalRisk !== null && totalRisk > 0 ? formatInr(totalRisk) : "—"}
              </span>
            </div>
          </div>
        )}

        {/* Override input */}
        <div className="flex items-center gap-2">
          <span className="text-gray-500 text-sm">₹</span>
          <input
            type="number"
            min={0}
            step={1000}
            value={inputValue}
            onChange={handleManualRisk}
            placeholder={totalRisk !== null ? String(totalRisk) : "Enter amount"}
            className={`flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              data.poRiskOverride ? "border-orange-300 bg-white" : "border-gray-200 bg-white"
            }`}
          />
          <span className="text-xs text-gray-400 whitespace-nowrap">INR</span>
        </div>
        {!data.poRiskOverride && (
          <p className="text-xs text-gray-400">
            {totalRisk !== null
              ? "Calculated as Monthly PO × Tenure Left for each consultant. Edit above to override."
              : "No PO data found for selected consultants. Enter the at-risk amount manually."}
          </p>
        )}
      </div>
    </div>
  );
}
