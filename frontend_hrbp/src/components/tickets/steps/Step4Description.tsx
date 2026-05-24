import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/tickets/RichTextEditor";

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

function calcRemainingMonths(poEndDate: string | null): number {
  if (!poEndDate) return 0;
  const end = new Date(poEndDate);
  if (isNaN(end.getTime())) return 0;
  const now = new Date();
  const diff = (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth());
  return Math.max(0, diff);
}

function calcPoRisk(c: ConsultantForRisk): number | null {
  const poRisk = toNum(c.po_risk);
  if (poRisk !== null) return poRisk;
  const monthlyPo = toNum(c.monthly_po);
  if (monthlyPo === null) return null;
  const months = calcRemainingMonths(c.po_end_date);
  return months * monthlyPo;
}

function formatInr(amount: number): string {
  if (!isFinite(amount)) return "—";
  if (amount >= 10_00_000) return `₹${(amount / 10_00_000).toFixed(2)}L`;
  if (amount >= 1_000) return `₹${(amount / 1_000).toFixed(0)}K`;
  return `₹${amount.toFixed(0)}`;
}

export function Step4Description({ data, onChange, consultants }: Step4DescriptionProps) {
  const perConsultantRisk = useMemo(
    () =>
      consultants.map((c) => ({
        ...c,
        computed: calcPoRisk(c),
        remainingMonths: calcRemainingMonths(c.po_end_date),
        isOverride: toNum(c.po_risk) !== null,
      })),
    [consultants],
  );

  const totalRisk = useMemo(() => {
    const values = perConsultantRisk.map((c) => c.computed).filter((v): v is number => v !== null);
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

  // What to show in the editable input
  const inputValue = data.poRiskOverride
    ? (data.poRiskAmount ?? "")
    : (totalRisk ?? "");

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

      {/* PO Risk section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>
            Amount at Risk (PO Risk)
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
          <div className="border border-gray-100 rounded-xl divide-y divide-gray-100 text-sm">
            {perConsultantRisk.map((c) => {
              const monthlyPo = toNum(c.monthly_po);
              return (
                <div key={c.id} className="flex items-center justify-between px-3 py-2.5">
                  <div>
                    <span className="font-medium text-gray-800">{c.name}</span>
                    {c.isOverride && (
                      <span className="ml-2 text-xs text-orange-600 font-medium">manual</span>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5">
                      {monthlyPo ? formatInr(monthlyPo) + "/mo" : "No PO rate"} ·{" "}
                      {c.po_end_date
                        ? `${c.remainingMonths} months remaining`
                        : "No end date"}
                    </p>
                  </div>
                  <span className={`font-semibold ${c.computed !== null && c.computed > 0 ? "text-red-600" : "text-gray-400"}`}>
                    {c.computed !== null && c.computed > 0 ? formatInr(c.computed) : "—"}
                  </span>
                </div>
              );
            })}
            <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 rounded-b-xl">
              <span className="font-semibold text-gray-700">Total PO at Risk</span>
              <span className="font-bold text-red-700 text-base">
                {totalRisk !== null && totalRisk > 0 ? formatInr(totalRisk) : "—"}
              </span>
            </div>
          </div>
        )}

        {/* Always-editable amount field */}
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
              data.poRiskOverride
                ? "border-orange-300 bg-white"
                : "border-gray-200 bg-white"
            }`}
          />
          <span className="text-xs text-gray-400 whitespace-nowrap">INR</span>
        </div>
        {!data.poRiskOverride && (
          <p className="text-xs text-gray-400">
            {totalRisk !== null
              ? "Auto-calculated from PO rates and remaining months. Edit the field above to override."
              : "No PO data found for selected consultants. Enter the at-risk amount manually."}
          </p>
        )}
      </div>
    </div>
  );
}
