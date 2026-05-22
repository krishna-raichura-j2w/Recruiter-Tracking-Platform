import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { TopBar } from "@/components/TopBar";
import { NewTicketDialog } from "@/components/NewTicketDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TicketKanbanBoard } from "@/components/TicketKanbanBoard";
import {
  Users,
  Building2,
  AlertTriangle,
  CheckCircle2,
  LifeBuoy,
  Star,
  Eye,
  UserPlus,
  TrendingUp,
  FileClock,
  BarChart3,
  ShieldCheck,
  Clock,
} from "lucide-react";
import {
  kpis,
  tickets,
  actionQueue,
  fmtINR,
  riskBadgeStyles,
  findConsultant,
} from "@/lib/mockData";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

const kpiDefs = [
  {
    key: "totalConsultants",
    label: "Total Consultants",
    icon: Users,
    value: kpis.totalConsultants,
    trend: "+3 this week",
  },
  {
    key: "totalClients",
    label: "Total Clients",
    icon: Building2,
    value: kpis.totalClients,
    trend: "stable",
  },
  {
    key: "activeIncidents",
    label: "Active Incidents",
    icon: AlertTriangle,
    value: kpis.activeIncidents,
    trend: "+2 today",
    accent: "text-orange-600",
  },
  {
    key: "closedThisMonth",
    label: "Closed This Month",
    icon: CheckCircle2,
    value: kpis.closedThisMonth,
    trend: "↑ 18%",
    accent: "text-emerald-600",
  },
  {
    key: "rescuePip",
    label: "Rescue / PIP",
    icon: LifeBuoy,
    value: kpis.rescuePip,
    trend: "2 critical",
    accent: "text-red-600",
  },
  {
    key: "starPerformers",
    label: "Star Performers",
    icon: Star,
    value: kpis.starPerformers,
    trend: "↑ 1",
    accent: "text-amber-600",
  },
  {
    key: "watchlist",
    label: "Watchlist",
    icon: Eye,
    value: kpis.watchlist,
    trend: "review weekly",
  },
  {
    key: "newJoiners",
    label: "New Joiners",
    icon: UserPlus,
    value: kpis.newJoiners,
    trend: "30-day window",
  },
  {
    key: "rateRevisionPending",
    label: "Rate Revision Pending",
    icon: TrendingUp,
    value: kpis.rateRevisionPending,
    trend: "3 overdue",
  },
  {
    key: "poRenewalsUnder90",
    label: "PO Renewals <90d",
    icon: FileClock,
    value: kpis.poRenewalsUnder90,
    trend: "act this week",
  },
  {
    key: "npsResponsePct",
    label: "NPS Response %",
    icon: BarChart3,
    value: `${kpis.npsResponsePct}%`,
    trend: "target 85%",
  },
  {
    key: "revenueProtected",
    label: "Revenue Protected",
    icon: ShieldCheck,
    value: fmtINR(kpis.revenueProtected),
    trend: "FYTD",
    accent: "text-emerald-600",
  },
];

function Dashboard() {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const { can } = useAuth();

  const filtered = filter
    ? tickets.filter((t) => t.riskLevel === filter || t.status === filter)
    : tickets;

  return (
    <div className="flex flex-col min-h-screen bg-white text-slate-800">
      <TopBar
        title="HRBP Overview"
        subtitle="Real-time pulse of consultant operations, incidents and retention."
        onNewTicket={can("tickets", "create") ? () => setOpen(true) : undefined}
      />
      <NewTicketDialog open={open} onOpenChange={setOpen} />
      <main className="flex-1 p-6 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {kpiDefs.map((k) => (
            <Card
              key={k.key}
              className="cursor-pointer hover:border-primary/50 hover:shadow-sm transition-all"
              onClick={() => setFilter(null)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <k.icon className={`h-4 w-4 ${k.accent ?? "text-muted-foreground"}`} />
                  <span className="text-[10px] text-muted-foreground">{k.trend}</span>
                </div>
                <div className="text-2xl font-semibold leading-tight">{k.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{k.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <Card className="xl:col-span-2">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h2 className="font-semibold">Active Incidents</h2>
                <p className="text-xs text-muted-foreground">
                  {filtered.length} tickets · sorted by urgency
                </p>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {["Critical", "High", "Open", "Awaiting Approval"].map((f) => (
                  <Button
                    key={f}
                    size="sm"
                    variant={filter === f ? "default" : "outline"}
                    className="h-7 text-xs"
                    onClick={() => setFilter(filter === f ? null : f)}
                  >
                    {f}
                  </Button>
                ))}
                {filter && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => setFilter(null)}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>
            <div className="p-4 bg-muted/20">
              {filtered.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  No incidents match the selected filter.
                </p>
              ) : (
                <TicketKanbanBoard tickets={filtered} compact />
              )}
            </div>
          </Card>

          <Card>
            <div className="p-4 border-b">
              <h2 className="font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Today's Action Queue
              </h2>
              <p className="text-xs text-muted-foreground">{actionQueue.length} pending actions</p>
            </div>
            <div className="divide-y">
              {actionQueue.map((a) => {
                const c = findConsultant(a.consultantId);
                return (
                  <div key={a.id} className="p-3 hover:bg-accent/40 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{c?.name}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2">{a.action}</p>
                        {a.ticketId && (
                          <Link
                            to="/tickets/$ticketId"
                            params={{ ticketId: a.ticketId }}
                            className="text-[11px] text-primary hover:underline"
                          >
                            {a.ticketId}
                          </Link>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Badge
                          variant="outline"
                          className={riskBadgeStyles[a.urgency] + " text-[10px]"}
                        >
                          {a.urgency}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">{a.due}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
