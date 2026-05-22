import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { TopBar } from "@/components/TopBar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  tickets,
  findConsultant,
  findClient,
  riskBadgeStyles,
  cohortBadgeStyles,
  type Ticket,
} from "@/lib/mockData";
import { ArrowLeft, Lock, ArrowUpRight, Check } from "lucide-react";
import { toast } from "react-toastify";

export const Route = createFileRoute("/_authenticated/tickets/$ticketId")({
  loader: ({ params }) => {
    const t = tickets.find((x) => x.id === params.ticketId);
    if (!t) throw notFound();
    return { t };
  },
  component: TicketDetail,
  notFoundComponent: () => <div className="p-10">Ticket not found.</div>,
});

const escalationChain = ["HRBP", "BH", "Ops Head", "COO"];
const hardGates = [
  { label: "Written withdrawal received", done: false },
  { label: "BH approval obtained", done: true },
  { label: "Client sign-off", done: false },
  { label: "COO approval", done: false },
];

function TicketDetail() {
  const { t } = Route.useLoaderData() as { t: Ticket };
  const c = findConsultant(t.consultantId);
  const cl = c ? findClient(c.clientId) : undefined;

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar
        title={`${t.id} · ${t.sopType}`}
        subtitle={`Opened ${t.createdAt} · Source: ${t.source}`}
        actions={
          <div className="flex gap-2">
            <Badge variant="outline" className={riskBadgeStyles[t.riskLevel]}>
              {t.riskLevel}
            </Badge>
            <Badge variant="outline">{t.status}</Badge>
            <Button
              size="sm"
              variant="outline"
              onClick={() => toast.success("Escalated to next level")}
              className="h-8 py-0"
            >
              <ArrowUpRight className="h-4 w-4 mr-1" />
              Escalate
            </Button>
          </div>
        }
      />
      <main className="flex-1 p-6 space-y-6">
        <Link
          to="/tickets"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          All tickets
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardContent className="p-4">
                <h4 className="font-semibold mb-2">Summary</h4>
                <p className="text-sm text-muted-foreground">{t.description}</p>
                <div className="grid grid-cols-3 gap-3 mt-4 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Owner</div>
                    <div>{t.owner}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Deadline</div>
                    <div>{t.deadline}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Days open</div>
                    <div>{t.daysOpen}d</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <h4 className="font-semibold mb-3">SOP workflow</h4>
                <div className="space-y-2">
                  {t.steps.map((s, i) => (
                    <div
                      key={i}
                      className={`flex items-center justify-between border rounded-md p-3 ${s.done ? "bg-emerald-50/50 border-emerald-200" : ""}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Checkbox
                          checked={s.done}
                          onCheckedChange={() => toast.success(`Step "${s.label}" updated`)}
                        />
                        <div>
                          <div className="text-sm font-medium">{s.label}</div>
                          <div className="text-xs text-muted-foreground">Due {s.due}</div>
                        </div>
                      </div>
                      {s.done && <Check className="h-4 w-4 text-emerald-600" />}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <h4 className="font-semibold mb-3">Notes</h4>
                <div className="space-y-3">
                  {t.notes.map((n, i) => (
                    <div key={i} className="border rounded-md p-3">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{n.author}</span>
                        <span>{n.at}</span>
                      </div>
                      <p className="text-sm mt-1">{n.text}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <h4 className="font-semibold mb-3">Communication log</h4>
                <div className="space-y-2">
                  {t.comms.map((co, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between border rounded-md p-3"
                    >
                      <div>
                        <div className="text-sm font-medium">{co.subject}</div>
                        <div className="text-xs text-muted-foreground">{co.type}</div>
                      </div>
                      <div className="text-xs text-muted-foreground">{co.at}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            {c && (
              <Card>
                <CardContent className="p-4">
                  <h4 className="font-semibold mb-2">Consultant snapshot</h4>
                  <Link
                    to="/consultants/$consultantId"
                    params={{ consultantId: c.id }}
                    className="text-primary hover:underline text-sm font-medium"
                  >
                    {c.name}
                  </Link>
                  <div className="text-xs text-muted-foreground mb-2">{c.empId}</div>
                  <Badge
                    variant="outline"
                    className={cohortBadgeStyles[c.cohort] + " text-xs mb-3"}
                  >
                    {c.cohort}
                  </Badge>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Client</span>
                      <span>{cl?.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Manager</span>
                      <span>{c.manager}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Skill</span>
                      <span>{c.skill}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">NPS</span>
                      <span>{c.nps}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Risk</span>
                      <span>{c.riskScore}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="p-4">
                <h4 className="font-semibold mb-3">Escalation hierarchy</h4>
                <div className="space-y-2">
                  {escalationChain.map((e, i) => (
                    <div
                      key={e}
                      className={`flex items-center gap-3 p-2 rounded-md ${i === 1 ? "bg-primary/5 border border-primary/20" : ""}`}
                    >
                      <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                        {i + 1}
                      </div>
                      <span className="text-sm">{e}</span>
                      {i === 1 && (
                        <Badge variant="outline" className="ml-auto text-[10px]">
                          Current
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  Hard gates
                </h4>
                <div className="space-y-2">
                  {hardGates.map((g) => (
                    <div key={g.label} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={g.done} disabled />
                      <span className={g.done ? "" : "text-muted-foreground"}>{g.label}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  Actions locked until all gates cleared.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
