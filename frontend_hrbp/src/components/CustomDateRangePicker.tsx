import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon, X } from "lucide-react"
import { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import dayjs, { Dayjs } from "dayjs"

interface CustomDateRangePickerProps {
  value: [Dayjs | null, Dayjs | null];
  onChange: (value: [Dayjs | null, Dayjs | null]) => void;
  className?: string;
}

export function CustomDateRangePicker({
  value,
  onChange,
  className,
}: CustomDateRangePickerProps) {
  const [date, setDate] = React.useState<DateRange | undefined>({
    from: value[0] ? value[0].toDate() : undefined,
    to: value[1] ? value[1].toDate() : undefined,
  })

  // Sync state if value prop changes
  React.useEffect(() => {
    setDate({
      from: value[0] ? value[0].toDate() : undefined,
      to: value[1] ? value[1].toDate() : undefined,
    });
  }, [value[0], value[1]]);

  const handleSelect = (selectedDate: DateRange | undefined) => {
    setDate(selectedDate)
    if (selectedDate?.from && selectedDate?.to) {
      onChange([dayjs(selectedDate.from), dayjs(selectedDate.to)])
    } else if (selectedDate?.from && !selectedDate?.to) {
      onChange([dayjs(selectedDate.from), null])
    } else {
      onChange([null, null])
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
              "w-[220px] justify-between text-left font-normal h-9 bg-white text-xs border-slate-200 shadow-sm pr-2",
              !date?.from && "text-slate-400"
            )}
          >
            {date?.from ? (
              date.to ? (
                <>
                  {format(date.from, "MM/dd/y")} - {format(date.to, "MM/dd/y")}
                </>
              ) : (
                format(date.from, "MM/dd/y")
              )
            ) : (
              <span>MM/DD/Y</span>
            )}
            <div className="flex items-center gap-1.5 ml-auto">
              {date?.from && (
                <div
                  role="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onChange([null, null]);
                  }}
                  className="p-0.5 rounded-sm hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                  title="Clear date filter"
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
            initialFocus
            mode="range"
            defaultMonth={date?.from}
            selected={date}
            onSelect={handleSelect}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
