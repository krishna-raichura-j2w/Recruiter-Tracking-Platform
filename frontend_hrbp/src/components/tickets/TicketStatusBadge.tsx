import { cn } from "@/lib/utils";

interface TicketStatusBadgeProps {
  status: string;
  className?: string;
}

const CONFIG: Record<string, { label: string; className: string }> = {
  open:   { label: "Open",   className: "bg-blue-100 text-blue-800" },
  closed: { label: "Closed", className: "bg-gray-100 text-gray-600" },
};

export function TicketStatusBadge({ status, className }: TicketStatusBadgeProps) {
  const cfg = CONFIG[status] ?? { label: status, className: "bg-gray-100 text-gray-600" };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", cfg.className, className)}>
      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${status === "open" ? "bg-blue-500" : "bg-gray-400"}`} />
      {cfg.label}
    </span>
  );
}
