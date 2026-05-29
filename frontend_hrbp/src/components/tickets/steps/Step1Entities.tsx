import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import type { UserOption } from "@/apiService/ticketTypes";

interface Client {
  id: number;
  name: string;
  bh_id?: number;
}

interface Consultant {
  id: number;
  name: string;
  emp_id: string;
  cohort: string | null;
  monthly_po: number | null;
  client_id: number;
}

interface Step1Data {
  raisedByName: string;
  escalationMgrId: number | null;
  clientId: number | null;
  consultantIds: number[];
}

interface Step1EntitiesProps {
  data: Step1Data;
  onChange: (data: Step1Data) => void;
  clients: Client[];
  consultants: Consultant[];
  bhUsers: UserOption[];
  onClientChange: (clientId: number) => void;
}

const COHORT_COLORS: Record<string, string> = {
  star:           "bg-yellow-100 text-yellow-800",
  high_performer: "bg-green-100 text-green-800",
  rising:         "bg-blue-100 text-blue-800",
  bedrock:        "bg-gray-100 text-gray-700",
  new_joiner:     "bg-purple-100 text-purple-800",
  watch_exit:     "bg-red-100 text-red-800",
  watch_rate_rev: "bg-orange-100 text-orange-800",
  watch_general:  "bg-orange-50 text-orange-700",
  rescue:         "bg-red-200 text-red-900",
};

export function Step1Entities({
  data,
  onChange,
  clients,
  consultants,
  bhUsers,
  onClientChange,
}: Step1EntitiesProps) {
  const filteredConsultants = data.clientId
    ? consultants.filter((c) => c.client_id === data.clientId)
    : [];

  const selectedConsultants = filteredConsultants.filter((c) =>
    data.consultantIds.includes(c.id),
  );

  function toggleConsultant(id: number) {
    const next = data.consultantIds.includes(id)
      ? data.consultantIds.filter((x) => x !== id)
      : [...data.consultantIds, id];
    onChange({ ...data, consultantIds: next });
  }

  function handleClientChange(val: string) {
    const id = Number(val);
    // Auto-fill escalation manager from client's BH if available
    const client = clients.find((c) => c.id === id);
    onChange({
      ...data,
      clientId: id,
      consultantIds: [],
      escalationMgrId: client?.bh_id ?? data.escalationMgrId,
    });
    onClientChange(id);
  }

  return (
    <div className="space-y-5">
      {/* Raised by — read-only */}
      <div className="space-y-1.5">
        <Label>Raised By</Label>
        <Input value={data.raisedByName} readOnly className="bg-gray-50 text-gray-600 cursor-default" />
      </div>

      {/* Client */}
      <div className="space-y-1.5">
        <Label>
          Client <span className="text-red-500">*</span>
        </Label>
        <Select
          value={data.clientId ? String(data.clientId) : ""}
          onValueChange={handleClientChange}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select client…" />
          </SelectTrigger>
          <SelectContent>
            {clients.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Consultants */}
      <div className="space-y-1.5">
        <Label>
          Consultant(s) <span className="text-red-500">*</span>
          <span className="text-gray-400 text-xs font-normal ml-1">— select one or more</span>
        </Label>

        {!data.clientId && (
          <p className="text-sm text-gray-400 italic">Select a client first to load consultants.</p>
        )}

        {data.clientId && filteredConsultants.length === 0 && (
          <p className="text-sm text-gray-400 italic">No active consultants for this client.</p>
        )}

        {/* Selected pills */}
        {selectedConsultants.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {selectedConsultants.map((c) => (
              <span
                key={c.id}
                className="flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-xs bg-blue-600 text-white"
              >
                {c.name}
                <button
                  type="button"
                  onClick={() => toggleConsultant(c.id)}
                  className="rounded-full hover:bg-blue-700 p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Consultant list */}
        {filteredConsultants.length > 0 && (
          <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
            {filteredConsultants.map((c) => {
              const selected = data.consultantIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleConsultant(c.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-left text-sm transition-colors
                    ${selected ? "bg-blue-50" : "hover:bg-gray-50"}`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center
                        ${selected ? "border-blue-600 bg-blue-600" : "border-gray-300"}`}
                    >
                      {selected && <span className="text-white text-xs leading-none">✓</span>}
                    </div>
                    <span className="font-medium text-gray-800">{c.name}</span>
                    <span className="text-gray-400 text-xs">{c.emp_id}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {c.monthly_po && (
                      <span className="text-xs text-gray-500">
                        ₹{(c.monthly_po / 100000).toFixed(1)}L/mo
                      </span>
                    )}
                    {c.cohort && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${COHORT_COLORS[c.cohort] ?? "bg-gray-100 text-gray-600"}`}
                      >
                        {c.cohort.replace(/_/g, " ")}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Escalation Manager (BH) */}
      <div className="space-y-1.5">
        <Label>
          Escalation Manager <span className="text-gray-400 text-xs font-normal">(Business Head)</span>
        </Label>
        <Select
          value={data.escalationMgrId ? String(data.escalationMgrId) : ""}
          onValueChange={(v) => onChange({ ...data, escalationMgrId: Number(v) })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select Business Head…" />
          </SelectTrigger>
          <SelectContent>
            {bhUsers.map((u) => (
              <SelectItem key={u.id} value={String(u.id)}>
                {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
