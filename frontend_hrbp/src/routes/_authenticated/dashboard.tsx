import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import {
  Pin,
  PinOff,
  Loader2,
  RefreshCw,
  Phone,
  Mail,
  ChevronRight,
  Clock,
  Activity,
  TrendingDown,
  TrendingUp,
  DoorOpen,
  ClipboardList,
  IndianRupee,
  CalendarClock,
  CalendarDays,
  Scale,
  FilePlus,
  CalendarCheck,
  Inbox,
  CalendarOff,
  ShieldCheck,
  MessageSquare,
  CalendarRange,
} from "lucide-react";
import { toast } from "react-toastify";

import dayjs from "dayjs";
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
import { CustomDateRangePicker } from "@/components/CustomDateRangePicker";
import { ScrollList } from "@/components/ScrollList";
import type { Ticket as TicketDetail } from "@/apiService/ticketTypes";

import { TicketStatusBadge } from "@/components/tickets/TicketStatusBadge";
import { TicketPriorityBadge } from "@/components/tickets/TicketPriorityBadge";
import { SLACountdown } from "@/components/tickets/SLACountdown";
import { SectionLoader } from "@/components/Loader";
import { CreateTicketWizard } from "@/components/tickets/CreateTicketWizard";
import { InitiateExitDialog } from "@/components/InitiateExitDialog";

export const Route = createFileRoute("/_authenticated/dashboard")({
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      const raw = localStorage.getItem("j2w_user");
      if (raw) {
        try {
          const u = JSON.parse(raw);
          if (u.role === "admin") throw redirect({ to: "/admin" });
        } catch (e) {
          if (e && typeof e === "object" && "href" in (e as any)) throw e;
        }
      }
    }
  },
  component: Dashboard,
});

// ── Date filter types & helpers ───────────────────────────────────────────────

type FilterPreset = "today" | "this_week" | "last_week" | "this_month" | "last_month" | "overall" | "custom";

interface DateRange {
  date_from: string;
  date_to: string;
}

const FILTER_PRESETS: { key: FilterPreset; label: string }[] = [
  { key: "today",      label: "Today" },
  { key: "this_week",  label: "This Week" },
  { key: "last_week",  label: "Last Week" },
  { key: "this_month", label: "This Month" },
  { key: "last_month", label: "Last Month" },
  { key: "overall",   label: "Overall" },
  { key: "custom",    label: "Custom" },
];

function fmtDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function getPresetRange(preset: FilterPreset, customFrom?: string, customTo?: string): DateRange {
  const today = new Date();
  switch (preset) {
    case "today":
      return { date_from: fmtDate(today), date_to: fmtDate(today) };
    case "this_week": {
      const day = today.getDay();
      const diff = day === 0 ? 6 : day - 1;
      const monday = new Date(today);
      monday.setDate(today.getDate() - diff);
      return { date_from: fmtDate(monday), date_to: fmtDate(today) };
    }
    case "last_week": {
      const day = today.getDay();
      const diff = day === 0 ? 6 : day - 1;
      const thisMonday = new Date(today);
      thisMonday.setDate(today.getDate() - diff);
      const lastMonday = new Date(thisMonday);
      lastMonday.setDate(thisMonday.getDate() - 7);
      const lastSunday = new Date(thisMonday);
      lastSunday.setDate(thisMonday.getDate() - 1);
      return { date_from: fmtDate(lastMonday), date_to: fmtDate(lastSunday) };
    }
    case "this_month": {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      return { date_from: fmtDate(first), date_to: fmtDate(today) };
    }
    case "last_month": {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last  = new Date(today.getFullYear(), today.getMonth(), 0);
      return { date_from: fmtDate(first), date_to: fmtDate(last) };
    }
    case "overall":
      return { date_from: "", date_to: "" };
    case "custom":
      return { date_from: customFrom ?? fmtDate(today), date_to: customTo ?? fmtDate(today) };
  }
}

// ── Date filter bar ───────────────────────────────────────────────────────────

function DateFilterBar({
  preset, customFrom, customTo,
  onChange,
}: {
  preset: FilterPreset;
  customFrom: string;
  customTo: string;
  onChange: (preset: FilterPreset, customFrom?: string, customTo?: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
        {FILTER_PRESETS.filter((p) => p.key !== "custom").map((p) => (
          <button
            key={p.key}
            onClick={() => onChange(p.key)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              preset === p.key
                ? "bg-sky-600 text-white shadow-sm"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            }`}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => onChange("custom", customFrom, customTo)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
            preset === "custom"
              ? "bg-sky-600 text-white shadow-sm"
              : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          }`}
        >
          <CalendarRange className="w-3 h-3" />
          Custom
        </button>
      </div>

      {preset === "custom" && (
        <CustomDateRangePicker
          value={[
            customFrom ? dayjs(customFrom) : null,
            customTo   ? dayjs(customTo)   : null,
          ]}
          onChange={([from, to]) => {
            onChange(
              "custom",
              from ? from.format("YYYY-MM-DD") : customFrom,
              to   ? to.format("YYYY-MM-DD")   : customTo,
            );
          }}
        />
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtInr(v: number): string {
  if (!v || !isFinite(v)) return "₹0";
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
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
  icon, label, value, accentText, sub, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  accentText: string;
  sub?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-4 bg-white border border-slate-200 rounded-xl px-5 py-4 shadow-sm flex-1 min-w-[160px] transition-all ${onClick ? "cursor-pointer hover:border-slate-300 hover:shadow-md hover:-translate-y-0.5" : ""}`}
    >
      <div className="shrink-0">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider leading-none">{label}</p>
        <p className={`text-2xl font-bold leading-tight mt-1 ${accentText}`}>{value}</p>
        {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
      </div>
      {onClick && <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />}
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
  icon, label, description, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3.5 hover:border-slate-300 hover:shadow-sm transition-all text-left flex-1 min-w-[180px] group"
    >
      <div className="shrink-0 group-hover:scale-105 transition-transform">
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

// ── Icon box wrapper ──────────────────────────────────────────────────────────

function IconBox({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${className}`}>
      {children}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [kpis, setKpis]                       = useState<DashboardKpis | null>(null);
  const [overallKpis, setOverallKpis]         = useState<DashboardKpis | null>(null);
  const [myTickets, setMyTickets]             = useState<MyTicketItem[]>([]);
  const [cadence, setCadence]                 = useState<TodayCadenceItem[]>([]);
  const [pinned, setPinned]                   = useState<TicketDetail | null>(null);
  const [atRisk, setAtRisk]                   = useState<ConsultantAtRisk[]>([]);
  const [activity, setActivity]               = useState<ActivityItem[]>([]);

  const [loadingKpis, setLoadingKpis]               = useState(true);
  const [loadingOverallKpis, setLoadingOverallKpis] = useState(true);
  const [loadingTickets, setLoadingTickets]         = useState(true);
  const [loadingCadence, setLoadingCadence]         = useState(true);
  const [loadingPinned, setLoadingPinned]           = useState(true);
  const [loadingAtRisk, setLoadingAtRisk]           = useState(true);
  const [loadingActivity, setLoadingActivity]       = useState(true);
  const [unpinning, setUnpinning]                   = useState(false);
  const [wizardOpen, setWizardOpen]                 = useState(false);
  const [exitOpen, setExitOpen]                     = useState(false);

  // Date filter state — default: today
  const todayStr = fmtDate(new Date());
  const [filterPreset, setFilterPreset] = useState<FilterPreset>("today");
  const [customFrom, setCustomFrom]     = useState(todayStr);
  const [customTo, setCustomTo]         = useState(todayStr);

  const activeDateRange = getPresetRange(filterPreset, customFrom, customTo);

  const loadKpis = useCallback((range: DateRange) => {
    setLoadingKpis(true);
    fetchKpis(range.date_from, range.date_to)
      .then(setKpis)
      .catch(() => toast.error("Failed to load KPIs"))
      .finally(() => setLoadingKpis(false));
  }, []);

  const loadOverallKpisData = useCallback(() => {
    setLoadingOverallKpis(true);
    fetchKpis()
      .then(setOverallKpis)
      .catch(() => {})
      .finally(() => setLoadingOverallKpis(false));
  }, []);

  const load = useCallback(async () => {
    setLoadingTickets(true);
    setLoadingCadence(true);
    setLoadingPinned(true);
    setLoadingAtRisk(true);
    setLoadingActivity(true);

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

  useEffect(() => { load(); loadOverallKpisData(); }, [load, loadOverallKpisData]);
  useEffect(() => {
    if (filterPreset !== "overall") loadKpis(activeDateRange);
  }, [filterPreset, customFrom, customTo]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleFilterChange(preset: FilterPreset, cf?: string, ct?: string) {
    setFilterPreset(preset);
    if (cf !== undefined) setCustomFrom(cf);
    if (ct !== undefined) setCustomTo(ct);
  }

  function handleRefresh() {
    load();
    loadKpis(activeDateRange);
    loadOverallKpisData();
  }

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

  // Dynamic KPI label for "today_tickets" based on active filter
  const ticketsInRangeLabel = filterPreset === "today" ? "Today's Tickets"
    : filterPreset === "this_week"  ? "This Week's Tickets"
    : filterPreset === "last_week"  ? "Last Week's Tickets"
    : filterPreset === "this_month" ? "This Month's Tickets"
    : filterPreset === "last_month" ? "Last Month's Tickets"
    : "Tickets in Range";

  const ticketsInRangeSub = filterPreset === "today" ? "Created today"
    : `${activeDateRange.date_from} → ${activeDateRange.date_to}`;

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-800">
      <TopBar title="Overview" subtitle="Your HR Operations snapshot — tickets, cadence, and consultant health at a glance." />

      <main className="flex-1 overflow-y-auto p-6 space-y-5">

        {/* Greeting Banner + Date Filter */}
        <div className="bg-white border border-slate-200 rounded-xl px-6 py-5 shadow-sm space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900 leading-tight">
                👋 {greeting()}, {user?.name ?? "there"}.
              </h1>
              <p className="text-sm text-slate-500 mt-1.5">
                Here's what's happening across your HR operations today.
              </p>
            </div>
            <DateFilterBar
              preset={filterPreset}
              customFrom={customFrom}
              customTo={customTo}
              onChange={handleFilterChange}
            />
          </div>
        </div>

        {/* KPI Cards */}
        {(() => {
          const isOverall = filterPreset === "overall";
          const d = isOverall ? overallKpis : kpis;
          const loading = isOverall ? loadingOverallKpis : loadingKpis;
          return (<>
            <div className="flex gap-4 flex-wrap">
              <KpiCard
                icon={<IconBox className="bg-sky-100"><ClipboardList className="w-5 h-5 text-sky-600" /></IconBox>}
                label="Open Tickets"
                value={loading ? "—" : (d?.open_tickets ?? 0)}
                accentText="text-sky-600" sub="Status: open"
                onClick={() => navigate({ to: "/tickets" })}
              />
              {user?.role !== "po_finance" && (
                <KpiCard
                  icon={<IconBox className="bg-violet-100"><CalendarClock className="w-5 h-5 text-violet-600" /></IconBox>}
                  label="Cadence Overdue"
                  value={loading ? "—" : (d?.cadence_overdue ?? 0)}
                  accentText="text-violet-600" sub="Sessions pending"
                  onClick={() => navigate({ to: "/cadence" })}
                />
              )}
              <KpiCard
                icon={<IconBox className="bg-indigo-100"><CalendarDays className="w-5 h-5 text-indigo-600" /></IconBox>}
                label={isOverall ? "Total Tickets" : ticketsInRangeLabel}
                value={loading ? "—" : (d?.today_tickets ?? 0)}
                accentText="text-indigo-600"
                sub={isOverall ? "All time" : ticketsInRangeSub}
                onClick={() => navigate({ to: "/tickets" })}
              />
            </div>

            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2.5 px-0.5">PO Outcomes</p>
              <div className="flex gap-4 flex-wrap">
                <KpiCard
                  icon={<IconBox className="bg-orange-100"><Scale className="w-5 h-5 text-orange-600" /></IconBox>}
                  label="PO at Risk"
                  value={loading ? "—" : fmtInr(d?.po_at_risk ?? 0)}
                  accentText="text-orange-600" sub="Open tickets with risk"
                  onClick={() => navigate({ to: "/tickets" })}
                />
                <KpiCard
                  icon={<IconBox className="bg-emerald-100"><TrendingUp className="w-5 h-5 text-emerald-600" /></IconBox>}
                  label="PO Retained"
                  value={loading ? "—" : fmtInr(d?.po_retained ?? 0)}
                  accentText="text-emerald-600" sub="Closed — retained"
                  onClick={() => navigate({ to: "/tickets" })}
                />
                <KpiCard
                  icon={<IconBox className="bg-red-100"><TrendingDown className="w-5 h-5 text-red-600" /></IconBox>}
                  label="PO Loss"
                  value={loading ? "—" : fmtInr(d?.po_loss ?? 0)}
                  accentText="text-red-600" sub="Closed — lost"
                  onClick={() => navigate({ to: "/tickets" })}
                />
              </div>
            </div>
          </>);
        })()}

        {/* Quick Actions */}
        <div>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2.5 px-0.5">Quick Actions</p>
          <div className="flex gap-3 flex-wrap">
            <QuickAction
              icon={<IconBox className="bg-sky-100"><FilePlus className="w-5 h-5 text-sky-600" /></IconBox>}
              label="New Ticket"
              description={
                user?.role === "hrbp" ? "Raise a ticket for your consultant"
                : user?.role === "bh"  ? "Raise a ticket for your business unit"
                : "Raise a new HR operations ticket"
              }
              onClick={() => setWizardOpen(true)}
            />
            {user?.role !== "po_finance" && (
              <QuickAction
                icon={<IconBox className="bg-violet-100"><CalendarCheck className="w-5 h-5 text-violet-600" /></IconBox>}
                label="Create Cadence"
                description="Schedule a new cadence session"
                onClick={() => navigate({ to: "/cadence", search: { create: true } })}
              />
            )}
            <QuickAction
              icon={<IconBox className="bg-rose-100"><DoorOpen className="w-5 h-5 text-rose-600" /></IconBox>}
              label="Initiate Exit"
              description="Log an exit initiation"
              onClick={() => setExitOpen(true)}
            />
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
              <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-700" onClick={handleRefresh}>
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
          {loadingPinned ? (
            <SectionLoader />
          ) : !pinned ? (
            <div className="flex flex-col items-center justify-center h-36 text-slate-400 gap-1.5 px-6 text-center">
              <PinOff className="w-8 h-8 text-slate-300" />
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

        {/* My Tickets + Today's Cadence */}
        <div className={`grid grid-cols-1 gap-5 ${user?.role !== "po_finance" ? "lg:grid-cols-2" : ""}`}>

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
              <SectionLoader />
            ) : myTickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-slate-400 gap-2">
                <Inbox className="w-10 h-10 text-slate-300" />
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
          {user?.role !== "po_finance" && (<div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
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
              <SectionLoader />
            ) : cadence.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-slate-400 gap-2">
                <CalendarOff className="w-10 h-10 text-slate-300" />
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
          </div>)}
        </div>

        {/* Consultants at Risk + Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Consultants at Risk */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-orange-500" />
                <div>
                  <h2 className="text-sm font-bold text-slate-800">Consultants at Risk</h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">PO risk or expiring within 60 days</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="text-orange-600 text-xs font-semibold gap-1 hover:bg-orange-50"
                onClick={() => navigate({ to: "/clients" })}>
                View All <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
            {loadingAtRisk ? (
              <SectionLoader />
            ) : atRisk.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-slate-400 gap-2">
                <ShieldCheck className="w-10 h-10 text-slate-300" />
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
                    <div key={c.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 cursor-pointer transition-colors"
                      onClick={() => navigate({ to: "/clients" })}>
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
          </div>

          {/* Recent Activity Feed */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-sky-500" />
                <div>
                  <h2 className="text-sm font-bold text-slate-800">Recent Activity</h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">Latest actions on your tickets</p>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent divide-y divide-slate-50">
            {loadingActivity ? (
              <SectionLoader />
            ) : activity.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-slate-400 gap-2">
                <MessageSquare className="w-10 h-10 text-slate-300" />
                <p className="text-sm font-medium">No recent activity</p>
              </div>
            ) : (
              activity.map((a) => (
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
              ))
            )}
            </div>
          </div>
        </div>

      </main>

      {/* Dialogs */}
      <CreateTicketWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
      <InitiateExitDialog open={exitOpen} onClose={() => setExitOpen(false)} />
    </div>
  );
}
