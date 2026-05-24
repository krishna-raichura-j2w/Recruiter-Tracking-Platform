import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface SLACountdownProps {
  deadline: string | null;
  compact?: boolean;
  className?: string;
}

function formatDuration(ms: number): string {
  const abs = Math.abs(ms);
  const totalMins = Math.floor(abs / 60_000);
  const days  = Math.floor(totalMins / 1440);
  const hours = Math.floor((totalMins % 1440) / 60);
  const mins  = totalMins % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function SLACountdown({ deadline, compact = false, className }: SLACountdownProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!deadline) {
    return <span className={cn("text-xs text-gray-400", className)}>No deadline</span>;
  }

  const diff = new Date(deadline).getTime() - now;
  const breached = diff < 0;
  const urgent = !breached && diff < 4 * 60 * 60 * 1000; // < 4 hours

  const label = breached
    ? `Breached ${formatDuration(diff)} ago`
    : `${formatDuration(diff)} left`;

  const colorClass = breached
    ? "text-red-600 font-semibold"
    : urgent
    ? "text-orange-600 font-medium"
    : "text-gray-600";

  if (compact) {
    return (
      <span className={cn("text-xs", colorClass, className)}>
        {breached && "⚠️ "}{label}
      </span>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 text-sm",
        colorClass,
        className,
      )}
    >
      <span>{breached ? "⚠️" : "⏱"}</span>
      <span>{label}</span>
    </div>
  );
}
