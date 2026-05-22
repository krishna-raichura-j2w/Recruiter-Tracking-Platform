import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import dayjs, { Dayjs } from "dayjs"

interface CustomDatePickerProps {
  value: Dayjs | null;
  onChange: (value: Dayjs | null) => void;
  className?: string;
  placeholder?: string;
}

export function CustomDatePicker({
  value,
  onChange,
  className,
  placeholder = "MM/DD/YYYY",
}: CustomDatePickerProps) {
  const [date, setDate] = React.useState<Date | undefined>(
    value ? value.toDate() : undefined
  )

  // Sync state if value prop changes
  React.useEffect(() => {
    setDate(value ? value.toDate() : undefined);
  }, [value]);

  const handleSelect = (selectedDate: Date | undefined) => {
    setDate(selectedDate)
    if (selectedDate) {
      onChange(dayjs(selectedDate))
    } else {
      onChange(null)
    }
  }

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            className={cn(
              "w-full justify-between text-left font-normal h-9 bg-white text-xs border-slate-200 shadow-sm pr-2",
              !date && "text-slate-400"
            )}
          >
            {date ? (
              format(date, "MM/dd/y")
            ) : (
              <span>{placeholder}</span>
            )}
            <div className="flex items-center gap-1.5 ml-auto">
              {date && (
                <div
                  role="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onChange(null);
                  }}
                  className="p-0.5 rounded-sm hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                  title="Clear date"
                >
                  <X className="h-3.5 w-3.5" />
                </div>
              )}
              <CalendarIcon className="h-4 w-4 text-slate-500" />
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={handleSelect}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
