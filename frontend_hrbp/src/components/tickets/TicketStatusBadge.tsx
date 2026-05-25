import { cn } from "@/lib/utils";

interface TicketStatusBadgeProps {
  status: string;
  className?: string;
}

const CONFIG: Record<string, { label: string; className: string; dot: string }> = {
  open:   { label: "Open",   className: "bg-blue-100 text-blue-800",   dot: "bg-blue-500" },
  closed: { label: "Closed", className: "bg-green-100 text-green-800", dot: "bg-green-500" },
};

export function TicketStatusBadge({ status, className }: TicketStatusBadgeProps) {
  const cfg = CONFIG[status] ?? { label: status, className: "bg-gray-100 text-gray-600", dot: "bg-gray-400" };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", cfg.className, className)}>
      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}
