import { Link } from "@tanstack/react-router";
import { Calendar, User, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  findConsultant,
  riskBadgeStyles,
  type RiskLevel,
  type Ticket,
  type TicketStatus,
} from "@/lib/mockData";

const riskOrder: Record<RiskLevel, number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
};

function sortByUrgency(items: Ticket[]) {
  return [...items].sort(
    (a, b) => riskOrder[a.riskLevel] - riskOrder[b.riskLevel] || b.daysOpen - a.daysOpen,
  );
}

const COLUMNS: {
  status: TicketStatus;
  title: string;
  accent: string;
  headerBg: string;
}[] = [
  {
    status: "Open",
    title: "Open",
    accent: "bg-blue-500",
    headerBg: "bg-blue-50/80",
  },
  {
    status: "In Progress",
    title: "In Progress",
    accent: "bg-indigo-500",
    headerBg: "bg-indigo-50/80",
  },
  {
    status: "Awaiting Approval",
    title: "Awaiting Approval",
    accent: "bg-amber-500",
    headerBg: "bg-amber-50/80",
  },
  {
    status: "Resolved",
    title: "Resolved",
    accent: "bg-emerald-500",
    headerBg: "bg-emerald-50/80",
  },
  {
    status: "Closed",
    title: "Closed",
    accent: "bg-slate-500",
    headerBg: "bg-slate-100/80",
  },
];

const sopTagStyles: Record<string, string> = {
  "SOP-2 Resignation": "bg-violet-100 text-violet-800",
  "SOP-3 Contract Renewal": "bg-sky-100 text-sky-800",
  "SOP-4 Conversion": "bg-teal-100 text-teal-800",
  "SOP-5 PIP": "bg-orange-100 text-orange-800",
  "SOP-6 Misconduct": "bg-red-100 text-red-800",
  "SOP-7 Absconding": "bg-rose-100 text-rose-800",
  "SOP-8 Medical": "bg-cyan-100 text-cyan-800",
  "Rate Revision": "bg-fuchsia-100 text-fuchsia-800",
  "Hike Planning": "bg-lime-100 text-lime-800",
};

function stepProgress(ticket: Ticket) {
  const total = ticket.steps.length;
  if (total === 0) return 0;
  return Math.round((ticket.steps.filter((s) => s.done).length / total) * 100);
}

function isOverdue(ticket: Ticket) {
  return ticket.daysOpen > 10 && ticket.status !== "Closed" && ticket.status !== "Resolved";
}

function TicketKanbanCard({ ticket }: { ticket: Ticket }) {
  const consultant = findConsultant(ticket.consultantId);
  const progress = stepProgress(ticket);
  const overdue = isOverdue(ticket);
  const sopClass = sopTagStyles[ticket.sopType] ?? "bg-muted text-muted-foreground";

  return (
    <Link
      to="/tickets/$ticketId"
      params={{ ticketId: ticket.id }}
      className="block rounded-lg border border-border/80 bg-card p-3 shadow-sm transition-shadow hover:border-primary/30 hover:shadow-md"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <span
          className={cn(
            "inline-block max-w-full truncate rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
            sopClass,
          )}
        >
          {ticket.sopType}
        </span>
        {overdue && (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-orange-500" aria-label="Overdue" />
        )}
      </div>

      <p className="text-sm font-semibold leading-snug text-foreground hover:text-primary">
        {ticket.id}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
        {consultant?.name ?? "Unknown consultant"}
      </p>

      <p className="mt-2 text-xs leading-relaxed text-muted-foreground line-clamp-2">
        {ticket.currentStep}
      </p>

      <div className="mt-3 space-y-1">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>Workflow</span>
          <span className="font-medium">{progress}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              progress >= 100 ? "bg-emerald-500" : progress >= 50 ? "bg-indigo-500" : "bg-blue-400",
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-2">
        <Badge
          variant="outline"
          className={cn("text-[10px] px-1.5 py-0", riskBadgeStyles[ticket.riskLevel])}
        >
          {ticket.riskLevel}
        </Badge>
        <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
          <User className="h-3 w-3" />
          <span className="max-w-[72px] truncate">{ticket.owner.split(" ")[0]}</span>
        </span>
      </div>

      <div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
        <Calendar className="h-3 w-3 shrink-0" />
        <span>Due {ticket.deadline}</span>
        <span className="text-muted-foreground/60">·</span>
        <span>{ticket.daysOpen}d open</span>
      </div>
    </Link>
  );
}

export function TicketKanbanBoard({
  tickets,
  compact = false,
}: {
  tickets: Ticket[];
  compact?: boolean;
}) {
  const grouped = COLUMNS.reduce(
    (acc, col) => {
      acc[col.status] = sortByUrgency(tickets.filter((t) => t.status === col.status));
      return acc;
    },
    {} as Record<TicketStatus, Ticket[]>,
  );

  return (
    <div
      className={cn(
        "flex gap-4 overflow-x-auto pb-2 -mx-1 px-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]",
        compact ? "min-h-[420px]" : "min-h-[520px]",
      )}
    >
      {COLUMNS.map((col) => {
        const columnTickets = grouped[col.status] ?? [];
        return (
          <div
            key={col.status}
            className="flex flex-1 min-w-[280px] flex-col rounded-xl border border-border/60 bg-muted/30"
          >
            <div
              className={cn(
                "flex items-center gap-2 rounded-t-xl border-b border-border/60 px-3 py-2.5",
                col.headerBg,
              )}
            >
              <span className={cn("h-2 w-2 shrink-0 rounded-full", col.accent)} />
              <h3 className="text-sm font-semibold text-foreground">{col.title}</h3>
              <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-background/80 px-1.5 text-xs font-medium text-muted-foreground">
                {columnTickets.length}
              </span>
            </div>

            <div
              className={cn(
                "flex flex-1 flex-col gap-2 overflow-y-auto p-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]",
                compact ? "max-h-[480px]" : "max-h-[calc(100vh-320px)]",
              )}
            >
              {columnTickets.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">No tickets</p>
              ) : (
                columnTickets.map((ticket) => <TicketKanbanCard key={ticket.id} ticket={ticket} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
