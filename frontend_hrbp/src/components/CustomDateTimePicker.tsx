import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon, Clock } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface DateTimePickerProps {
  value: string;            // ISO datetime string or ""
  onChange: (iso: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  disablePast?: boolean;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = "Pick date & time",
  disabled = false,
  className,
  disablePast = true,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);

  const parsed = value ? new Date(value) : null;
  const selectedDate = parsed && !isNaN(parsed.getTime()) ? parsed : undefined;

  const hours   = selectedDate ? pad(selectedDate.getHours())   : "09";
  const minutes = selectedDate ? pad(selectedDate.getMinutes()) : "00";

  function buildISO(date: Date, h: string, m: string): string {
    const d = new Date(date);
    d.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);
    return d.toISOString();
  }

  function handleDaySelect(day: Date | undefined) {
    if (!day) return;
    onChange(buildISO(day, hours, minutes));
  }

  function handleTimeChange(field: "h" | "m", raw: string) {
    const clamped = field === "h"
      ? Math.min(23, Math.max(0, parseInt(raw || "0", 10)))
      : Math.min(59, Math.max(0, parseInt(raw || "0", 10)));
    const newH = field === "h" ? pad(clamped) : hours;
    const newM = field === "m" ? pad(clamped) : minutes;
    const base = selectedDate ?? new Date();
    onChange(buildISO(base, newH, newM));
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal",
            !selectedDate && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          {selectedDate
            ? format(selectedDate, "dd MMM yyyy, HH:mm")
            : placeholder}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleDaySelect}
          disabled={disablePast ? (d) => d < today : undefined}
          initialFocus
        />

        {/* Time picker row */}
        <div className="border-t border-border px-3 py-3 flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm text-muted-foreground">Time</span>

          <div className="flex items-center gap-1 ml-auto">
            <input
              type="number"
              min={0}
              max={23}
              value={hours}
              onChange={(e) => handleTimeChange("h", e.target.value)}
              className="w-12 rounded-md border border-input bg-background px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <span className="text-sm font-semibold text-muted-foreground">:</span>
            <input
              type="number"
              min={0}
              max={59}
              value={minutes}
              onChange={(e) => handleTimeChange("m", e.target.value)}
              className="w-12 rounded-md border border-input bg-background px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <Button
            type="button"
            size="sm"
            className="ml-2"
            onClick={() => setOpen(false)}
          >
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
