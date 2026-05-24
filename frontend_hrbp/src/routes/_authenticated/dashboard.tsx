import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import {
  Ticket,
  AlertTriangle,
  CalendarClock,
  Pin,
  PinOff,
  Loader2,
  RefreshCw,
  Phone,
  Mail,
  ChevronRight,
  Plus,
  ShieldAlert,
  Users,
  Clock,
  Activity,
  TrendingDown,
} from "lucide-react";
import { toast } from "react-toastify";

import {
  fetchKpis,
  fetchMyTickets,
  fetchTodayCadence,
  fetchPinnedTicket,
  unpinTicket,
  fetchConsultantsAtRisk,
  fetchRecentActivity,
  type DashboardKpis,
  type MyTicketItem,
  type TodayCadenceItem,
  type ConsultantAtRisk,
  type ActivityItem,
} from "@/apiService/dashboardApi";
import { ScrollList } from "@/components/ScrollList";
import type { Ticket as TicketDetail } from "@/apiService/ticketTypes";

import { TicketStatusBadge } from "@/components/tickets/TicketStatusBadge";
import { TicketPriorityBadge } from "@/components/tickets/TicketPriorityBadge";
import { SLACountdown } from "@/components/tickets/SLACountdown";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtInr(v: number): string {
  if (!v || !isFinite(v)) return "₹0";
  if (v >= 10_00_000) return `₹${(v / 10_00_000).toFixed(1)}L`;
  if (v >= 1_000) return `₹${(v / 1_000).toFixed(0)}K`;
  return `₹${v.toFixed(0)}`;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
  icon, label, value, accentBg, accentText, sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  accentBg: string;
  accentText: string;
  sub?: string;
}) {
  return (
    <div className="flex items-center gap-4 bg-white border border-slate-200 rounded-xl px-5 py-4 shadow-sm flex-1 min-w-[160px]">
      <div className={`p-2.5 rounded-xl ${accentBg} shrink-0`}>
        <div className={accentText}>{icon}</div>
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider leading-none">{label}</p>
        <p className={`text-2xl font-bold leading-tight mt-1 ${accentText}`}>{value}</p>
        {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── SLA pill ──────────────────────────────────────────────────────────────────

function SlaPill({ status }: { status: MyTicketItem["sla_status"] }) {
  const map: Record<string, string> = {
    breached: "bg-red-100 text-red-700 border-red-200",
    warning:  "bg-orange-100 text-orange-700 border-orange-200",
    ok:       "bg-emerald-100 text-emerald-700 border-emerald-200",
    none:     "bg-slate-100 text-slate-400 border-slate-200",
  };
  const label: Record<string, string> = {
    breached: "Breached", warning: "Due soon", ok: "On track", none: "No SLA",
  };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${map[status] ?? map.none}`}>
      {label[status] ?? status}
    </span>
  );
}

// ── Cadence avatar colour ─────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-blue-500", "bg-violet-500", "bg-emerald-500", "bg-orange-500",
  "bg-pink-500", "bg-sky-500", "bg-amber-500", "bg-teal-500",
];
function avatarColor(name: string) {
  let n = 0;
  for (const c of name) n += c.charCodeAt(0);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

// ── Quick action button ───────────────────────────────────────────────────────

function QuickAction({
  icon, label, description, onClick, accent,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
  accent: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3.5 hover:border-slate-300 hover:shadow-sm transition-all text-left flex-1 min-w-[180px] group"
    >
      <div className={`p-2 rounded-lg ${accent} shrink-0 group-hover:scale-105 transition-transform`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800 leading-none">{label}</p>
        <p className="text-[10px] text-slate-400 mt-1 leading-snug">{description}</p>
      </div>
      <ChevronRight className="w-3.5 h-3.5 text-slate-300 ml-auto shrink-0" />
    </button>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [kpis, setKpis]                       = useState<DashboardKpis | null>(null);
  const [myTickets, setMyTickets]             = useState<MyTicketItem[]>([]);
  const [cadence, setCadence]                 = useState<TodayCadenceItem[]>([]);
  const [pinned, setPinned]                   = useState<TicketDetail | null>(null);
  const [atRisk, setAtRisk]                   = useState<ConsultantAtRisk[]>([]);
  const [activity, setActivity]               = useState<ActivityItem[]>([]);

  const [loadingKpis, setLoadingKpis]               = useState(true);
  const [loadingTickets, setLoadingTickets]         = useState(true);
  const [loadingCadence, setLoadingCadence]         = useState(true);
  const [loadingPinned, setLoadingPinned]           = useState(true);
  const [loadingAtRisk, setLoadingAtRisk]           = useState(true);
  const [loadingActivity, setLoadingActivity]       = useState(true);
  const [unpinning, setUnpinning]                   = useState(false);

  const load = useCallback(async () => {
    setLoadingKpis(true);
    setLoadingTickets(true);
    setLoadingCadence(true);
    setLoadingPinned(true);
    setLoadingAtRisk(true);
    setLoadingActivity(true);

    fetchKpis()
      .then(setKpis)
      .catch(() => toast.error("Failed to load KPIs"))
      .finally(() => setLoadingKpis(false));

    fetchMyTickets(5)
      .then(setMyTickets)
      .catch(() => {})
      .finally(() => setLoadingTickets(false));

    fetchTodayCadence()
      .then(setCadence)
      .catch(() => {})
      .finally(() => setLoadingCadence(false));

    fetchPinnedTicket()
      .then((d) => setPinned(d as TicketDetail | null))
      .catch(() => {})
      .finally(() => setLoadingPinned(false));

    fetchConsultantsAtRisk(8)
      .then(setAtRisk)
      .catch(() => {})
      .finally(() => setLoadingAtRisk(false));

    fetchRecentActivity(10)
      .then(setActivity)
      .catch(() => {})
      .finally(() => setLoadingActivity(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleUnpin() {
    setUnpinning(true);
    try {
      await unpinTicket();
      setPinned(null);
      toast.success("Ticket unpinned");
    } catch {
      toast.error("Failed to unpin ticket");
    } finally {
      setUnpinning(false);
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 text-slate-800">
      <TopBar title="Overview" subtitle="Your HR Operations snapshot — tickets, cadence, and consultant health at a glance." />

      <main className="flex-1 p-6 space-y-5">

        {/* Greeting Banner */}
        <div className="bg-white border border-slate-200 rounded-xl px-6 py-5 shadow-sm">
          <h1 className="text-2xl font-extrabold text-slate-900 leading-tight">
            👋 {greeting()}, {user?.name?.split(" ")[0] ?? "there"}.
          </h1>
          <p className="text-sm text-slate-500 mt-1.5">
            Here's what's happening across your HR operations today.
          </p>
        </div>

        {/* KPI Cards */}
        <div className="flex gap-4 flex-wrap">
          <KpiCard
            icon={<Ticket className="w-5 h-5" />}
            label="Open Tickets"
            value={loadingKpis ? "—" : (kpis?.open_tickets ?? 0)}
            accentBg="bg-sky-100" accentText="text-sky-600" sub="Status: open"
          />
          <KpiCard
            icon={<AlertTriangle className="w-5 h-5" />}
            label="SLA Breaches"
            value={loadingKpis ? "—" : (kpis?.sla_breaches ?? 0)}
            accentBg="bg-red-100" accentText="text-red-600" sub="Deadline passed"
          />
          <KpiCard
            icon={<span className="text-base font-extrabold leading-none">₹</span>}
            label="PO at Risk"
            value={loadingKpis ? "—" : fmtInr(kpis?.po_at_risk ?? 0)}
            accentBg="bg-orange-100" accentText="text-orange-600" sub="From open tickets"
          />
          <KpiCard
            icon={<CalendarClock className="w-5 h-5" />}
            label="Cadence Overdue"
            value={loadingKpis ? "—" : (kpis?.cadence_overdue ?? 0)}
            accentBg="bg-violet-100" accentText="text-violet-600" sub="Sessions pending"
          />
        </div>

        {/* Quick Actions */}
        <div>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2.5 px-0.5">Quick Actions</p>
          <div className="flex gap-3 flex-wrap">
            <QuickAction
              icon={<Plus className="w-4 h-4 text-sky-600" />}
              label="New Ticket"
              description={
                user?.role === "hrbp" ? "Raise a ticket for your consultant"
                : user?.role === "bh"  ? "Raise a ticket for your business unit"
                : "Raise a new HR operations ticket"
              }
              accent="bg-sky-50"
              onClick={() => navigate({ to: "/tickets" })}
            />
            <QuickAction
              icon={<ShieldAlert className="w-4 h-4 text-red-600" />}
              label="Breached SLAs"
              description="View all overdue tickets"
              accent="bg-red-50"
              onClick={() => navigate({ to: "/tickets" })}
            />
            <QuickAction
              icon={<Users className="w-4 h-4 text-orange-600" />}
              label="Clients"
              description="Manage clients & consultants"
              accent="bg-orange-50"
              onClick={() => navigate({ to: "/clients" })}
            />
            <QuickAction
              icon={<CalendarClock className="w-4 h-4 text-violet-600" />}
              label="Cadence Scheduler"
              description="View & schedule cadence"
              accent="bg-violet-50"
              onClick={() => navigate({ to: "/cadence" })}
            />
          </div>
        </div>

        {/* My Tickets + Today's Cadence */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* My Open Tickets */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
              <div>
                <h2 className="text-sm font-bold text-slate-800">My Open Tickets</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">Latest 5 in your scope</p>
              </div>
              <Button variant="ghost" size="sm" className="text-sky-600 text-xs font-semibold gap-1 hover:bg-sky-50"
                onClick={() => navigate({ to: "/tickets" })}>
                View All <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
            {loadingTickets ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
              </div>
            ) : myTickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-slate-400">
                <Ticket className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm font-medium">No open tickets</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {myTickets.map((t) => (
                  <div key={t.id} onClick={() => navigate({ to: `/tickets/${t.id}` })}
                    className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 cursor-pointer transition-colors">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-mono text-xs font-bold text-sky-600">{t.ticket_number}</span>
                        <TicketPriorityBadge priority={t.priority} />
                      </div>
                      <p className="text-xs text-slate-600 truncate max-w-[220px]">{t.title}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{t.client_name ?? "—"}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 ml-3 shrink-0">
                      <SlaPill status={t.sla_status} />
                      <TicketStatusBadge status={t.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Today's Cadence */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
              <div>
                <h2 className="text-sm font-bold text-slate-800">Today's Cadence</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
                </p>
              </div>
              <Button variant="ghost" size="sm" className="text-violet-600 text-xs font-semibold gap-1 hover:bg-violet-50"
                onClick={() => navigate({ to: "/cadence" })}>
                Scheduler <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
            {loadingCadence ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
              </div>
            ) : cadence.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-slate-400">
                <CalendarClock className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm font-medium">No cadence today</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {cadence.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 px-5 py-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${avatarColor(c.consultant_name ?? "?")}`}>
                      {c.consultant_initials || "?"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800 truncate">{c.consultant_name}</p>
                      <p className="text-[10px] text-slate-400">
                        {c.client_name}
                        {c.meeting_time ? ` · ${c.meeting_time.slice(0, 5)}` : ""}
                        {c.project_name ? ` · ${c.project_name}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {c.consultant_phone && (
                        <a href={`tel:${c.consultant_phone}`} onClick={(e) => e.stopPropagation()}
                          className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors">
                          <Phone className="w-3.5 h-3.5" />
                        </a>
                      )}
                      {c.consultant_email && (
                        <a href={`mailto:${c.consultant_email}`} onClick={(e) => e.stopPropagation()}
                          className="p-1.5 rounded-lg bg-sky-50 text-sky-600 hover:bg-sky-100 transition-colors">
                          <Mail className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Consultants at Risk + Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Consultants at Risk */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-orange-500" />
                <div>
                  <h2 className="text-sm font-bold text-slate-800">Consultants at Risk</h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">PO risk or expiring within 60 days</p>
                </div>
              </div>
            </div>
            {loadingAtRisk ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
              </div>
            ) : atRisk.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-slate-400">
                <Users className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm font-medium">No consultants at risk</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {atRisk.map((c) => {
                  const daysLeft = c.days_until_expiry;
                  const expirySeverity =
                    daysLeft === null ? "none"
                    : daysLeft < 0    ? "expired"
                    : daysLeft <= 14  ? "critical"
                    : daysLeft <= 30  ? "warning"
                    : "ok";
                  const expiryColor: Record<string, string> = {
                    expired:  "text-red-600 bg-red-50 border-red-200",
                    critical: "text-red-600 bg-red-50 border-red-200",
                    warning:  "text-orange-600 bg-orange-50 border-orange-200",
                    ok:       "text-emerald-600 bg-emerald-50 border-emerald-200",
                    none:     "text-slate-400 bg-slate-50 border-slate-200",
                  };
                  return (
                    <div key={c.id} className="flex items-center gap-3 px-5 py-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${avatarColor(c.name)}`}>
                        {c.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800 truncate">{c.name}</p>
                        <p className="text-[10px] text-slate-400">{c.client_name ?? "—"}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {c.po_risk > 0 && (
                          <span className="text-[10px] font-bold text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">
                            Risk {fmtInr(c.po_risk)}
                          </span>
                        )}
                        {daysLeft !== null && (
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${expiryColor[expirySeverity]}`}>
                            {daysLeft < 0 ? `Expired ${Math.abs(daysLeft)}d ago` : daysLeft === 0 ? "Expires today" : `${daysLeft}d left`}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent Activity Feed */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-sky-500" />
                <div>
                  <h2 className="text-sm font-bold text-slate-800">Recent Activity</h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">Latest actions on your tickets</p>
                </div>
              </div>
            </div>
            {loadingActivity ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
              </div>
            ) : activity.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-slate-400">
                <Activity className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm font-medium">No recent activity</p>
              </div>
            ) : (
              <ScrollList maxHeight="320px">
                {activity.map((a) => (
                  <div key={a.id}
                    className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50 cursor-pointer transition-colors"
                    onClick={() => a.ticket_id && navigate({ to: `/tickets/${a.ticket_id}` })}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0 mt-0.5 ${avatarColor(a.actor_name)}`}>
                      {a.actor_name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-700 leading-snug">
                        <span className="font-semibold">{a.actor_name}</span>
                        {" "}<span className="text-slate-500">{a.action}</span>
                        {a.ticket_number && (
                          <span className="font-mono font-bold text-sky-600 ml-1">{a.ticket_number}</span>
                        )}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Clock className="w-2.5 h-2.5 text-slate-300" />
                        <span className="text-[10px] text-slate-400">{timeAgo(a.created_at)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </ScrollList>
            )}
          </div>
        </div>

        {/* Pinned Ticket — full width */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Pin className="w-4 h-4 text-amber-500" />
              <h2 className="text-sm font-bold text-slate-800">Pinned Ticket</h2>
            </div>
            <div className="flex items-center gap-1">
              {pinned && (
                <Button variant="ghost" size="sm" disabled={unpinning}
                  className="text-slate-400 text-xs gap-1 hover:text-red-600 hover:bg-red-50"
                  onClick={handleUnpin}>
                  {unpinning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PinOff className="w-3.5 h-3.5" />}
                  Unpin
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-700" onClick={load}>
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {loadingPinned ? (
            <div className="flex items-center justify-center h-28">
              <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
            </div>
          ) : !pinned ? (
            <div className="flex flex-col items-center justify-center h-28 text-slate-400 gap-2 px-6 text-center">
              <Pin className="w-9 h-9 opacity-15" />
              <p className="text-sm font-semibold text-slate-500">No pinned ticket</p>
              <p className="text-xs text-slate-400">Open any ticket and click the Pin button to keep it here for quick access.</p>
            </div>
          ) : (
            <div className="px-5 py-4 cursor-pointer hover:bg-slate-50 transition-colors"
              onClick={() => navigate({ to: `/tickets/${pinned.id}` })}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-mono text-sm font-bold text-sky-600">{pinned.ticket_number}</span>
                    <span className="text-slate-200">·</span>
                    <span className="text-xs text-slate-400">{pinned.sop_type ?? pinned.sop_name}</span>
                    <TicketPriorityBadge priority={pinned.priority} />
                    <TicketStatusBadge status={pinned.status} />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900 mb-3 leading-snug">{pinned.title}</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div>
                      <p className="text-slate-400 uppercase tracking-wide text-[10px]">Client</p>
                      <p className="font-medium text-slate-700 mt-0.5">{pinned.client_name ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 uppercase tracking-wide text-[10px]">Raised By</p>
                      <p className="font-medium text-slate-700 mt-0.5">{pinned.raised_by_name ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 uppercase tracking-wide text-[10px]">SLA</p>
                      <div className="mt-0.5"><SLACountdown deadline={pinned.sla_deadline} compact /></div>
                    </div>
                    <div>
                      <p className="text-slate-400 uppercase tracking-wide text-[10px]">Current Step</p>
                      <p className="font-medium text-slate-700 mt-0.5">
                        {pinned.current_step}/{pinned.hierarchy_json?.length ?? "?"} — {pinned.hierarchy_json?.[pinned.current_step - 1]?.label ?? "—"}
                      </p>
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 shrink-0 mt-1" />
              </div>
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
