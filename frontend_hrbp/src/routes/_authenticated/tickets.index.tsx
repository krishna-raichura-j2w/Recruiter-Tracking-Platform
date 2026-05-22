import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { TopBar } from "@/components/TopBar";
import { NewTicketDialog } from "@/components/NewTicketDialog";
import { TicketKanbanBoard } from "@/components/TicketKanbanBoard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tickets, findConsultant, type SOPType } from "@/lib/mockData";
import { Search, Plus, AlertCircle, AlertTriangle, Clock, CheckCircle2, Timer } from "lucide-react";

export const Route = createFileRoute("/_authenticated/tickets/")({ component: TicketsPage });

const sopList: SOPType[] = [
  "SOP-2 Resignation",
  "SOP-3 Contract Renewal",
  "SOP-4 Conversion",
  "SOP-5 PIP",
  "SOP-6 Misconduct",
  "SOP-7 Absconding",
  "SOP-8 Medical",
  "Rate Revision",
  "Hike Planning",
];

function TicketsPage() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const { can } = useAuth();
  const [sop, setSop] = useState<SOPType | null>(null);

  const stats = {
    open: tickets.filter((t) => t.status === "Open" || t.status === "In Progress").length,
    critical: tickets.filter((t) => t.riskLevel === "Critical").length,
    overdue: tickets.filter((t) => t.daysOpen > 10 && t.status !== "Closed").length,
    resolved: tickets.filter((t) => t.status === "Resolved" || t.status === "Closed").length,
    avgRes: "4.2d",
  };

  const filtered = tickets.filter((t) => {
    if (sop && t.sopType !== sop) return false;
    const c = findConsultant(t.consultantId);
    const blob = `${t.id} ${t.sopType} ${t.currentStep} ${c?.name ?? ""}`.toLowerCase();
    return blob.includes(q.toLowerCase());
  });

  return (
    <div className="flex flex-col min-h-screen bg-white text-slate-800">
      <TopBar
        title="Tickets"
        subtitle="Incident management across SOPs"
        onNewTicket={can("tickets", "create") ? () => setOpen(true) : undefined}
      />
      <NewTicketDialog open={open} onOpenChange={setOpen} />
      <main className="flex-1 p-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { l: "Open", v: stats.open, i: AlertCircle, c: "text-blue-600" },
            { l: "Critical", v: stats.critical, i: AlertTriangle, c: "text-red-600" },
            { l: "Overdue", v: stats.overdue, i: Clock, c: "text-orange-600" },
            { l: "Resolved", v: stats.resolved, i: CheckCircle2, c: "text-emerald-600" },
            { l: "Avg Resolution", v: stats.avgRes, i: Timer, c: "text-muted-foreground" },
          ].map((s) => (
            <Card key={s.l}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <s.i className={`h-4 w-4 ${s.c}`} />
                </div>
                <div className="text-2xl font-semibold">{s.v}</div>
                <div className="text-xs text-muted-foreground mt-1">{s.l}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="overflow-hidden">
          <div className="p-3 border-b space-y-2 bg-card">
            <div className="flex items-center gap-2">
              <div className="relative max-w-sm flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search tickets..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant={sop === null ? "default" : "outline"}
                className="h-7 text-xs"
                onClick={() => setSop(null)}
              >
                All SOPs
              </Button>
              {sopList.map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={sop === s ? "default" : "outline"}
                  className="h-7 text-xs"
                  onClick={() => setSop(s)}
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>

          <div className="p-4 bg-muted/20">
            {filtered.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                No tickets match your filters.
              </p>
            ) : (
              <TicketKanbanBoard tickets={filtered} />
            )}
          </div>
        </Card>
      </main>
    </div>
  );
}
