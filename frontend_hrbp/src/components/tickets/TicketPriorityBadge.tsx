import { cn } from "@/lib/utils";

interface TicketPriorityBadgeProps {
  priority: string;
  className?: string;
}

const CONFIG: Record<string, { label: string; dot: string; text: string }> = {
  critical: { label: "Critical", dot: "bg-red-500",    text: "text-red-700 bg-red-50 border-red-200" },
  high:     { label: "High",     dot: "bg-orange-500", text: "text-orange-700 bg-orange-50 border-orange-200" },
  medium:   { label: "Medium",   dot: "bg-blue-500",   text: "text-blue-700 bg-blue-50 border-blue-200" },
  low:      { label: "Low",      dot: "bg-green-500",  text: "text-green-700 bg-green-50 border-green-200" },
};

export function TicketPriorityBadge({ priority, className }: TicketPriorityBadgeProps) {
  const cfg = CONFIG[priority] ?? { label: priority, dot: "bg-gray-400", text: "text-gray-600 bg-gray-50 border-gray-200" };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border",
        cfg.text,
        className,
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", cfg.dot)} />
      {cfg.label}
    </span>
  );
}
