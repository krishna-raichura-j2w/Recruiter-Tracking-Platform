import * as React from "react"
import { Clock, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface CustomTimePickerProps {
  value: string; // e.g. "10:30"
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}

export function CustomTimePicker({
  value,
  onChange,
  className,
  placeholder = "Select time",
}: CustomTimePickerProps) {
  const [open, setOpen] = React.useState(false)

  // Generate times from 00:00 to 23:45 in 15-minute increments
  const times = React.useMemo(() => {
    const arr = []
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 15) {
        const hh = h.toString().padStart(2, "0")
        const mm = m.toString().padStart(2, "0")
        arr.push(`${hh}:${mm}`)
      }
    }
    return arr
  }, [])

  const formatTime12Hour = (time24: string) => {
    if (!time24) return "";
    const [h, m] = time24.split(":");
    const hours = parseInt(h, 10);
    const ampm = hours >= 12 ? "PM" : "AM";
    const dispHrs = hours % 12 || 12;
    return `${dispHrs}:${m} ${ampm}`;
  };

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={"outline"}
            className={cn(
              "w-full justify-between text-left font-normal h-9 bg-white text-xs border-slate-200 shadow-sm pr-2",
              !value && "text-slate-400"
            )}
          >
            {value ? (
              formatTime12Hour(value)
            ) : (
              <span>{placeholder}</span>
            )}
            <div className="flex items-center gap-1.5 ml-auto">
              {value && (
                <div
                  role="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onChange("");
                  }}
                  className="p-0.5 rounded-sm hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                  title="Clear time"
                >
                  <X className="h-3.5 w-3.5" />
                </div>
              )}
              <Clock className="h-4 w-4 text-slate-500" />
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-0" align="start">
          <div className="max-h-[300px] overflow-y-auto p-1 custom-scrollbar">
            {times.map((t) => (
              <Button
                key={t}
                variant="ghost"
                className={cn(
                  "w-full justify-start font-normal text-xs mb-0.5 h-8",
                  value === t && "bg-sky-50 text-sky-600 hover:bg-sky-100 font-semibold"
                )}
                onClick={() => {
                  onChange(t)
                  setOpen(false)
                }}
              >
                {formatTime12Hour(t)}
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
