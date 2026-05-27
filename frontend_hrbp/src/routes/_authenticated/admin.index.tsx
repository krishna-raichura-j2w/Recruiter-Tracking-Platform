import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { TopBar } from "@/components/TopBar";
import { ChevronRight } from "lucide-react";
import { LottieIcon } from "@/components/LottieIcon";
import { getAdminStats, type AdminStats } from "@/apiService/adminApi";
import { SectionLoader } from "@/components/Loader";
import { toast } from "react-toastify";

export const Route = createFileRoute("/_authenticated/admin/")({
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      const raw = localStorage.getItem("j2w_user");
      if (raw) {
        try {
          const u = JSON.parse(raw);
          if (u.role !== "admin") throw redirect({ to: "/dashboard" });
        } catch (e) {
          if (e && typeof e === "object" && "href" in (e as any)) throw e;
        }
      }
    }
  },
  component: AdminOverview,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ── KPI Card — identical pattern to HRBP dashboard ───────────────────────────

function KpiCard({
  icon, label, value, accentText, sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  accentText: string;
  sub?: string;
}) {
  return (
    <div className="flex items-center gap-4 bg-white border border-slate-200 rounded-xl px-5 py-4 shadow-sm flex-1 min-w-[160px]">
      <div className="shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider leading-none">{label}</p>
        <p className={`text-2xl font-bold leading-tight mt-1 ${accentText}`}>{value}</p>
        {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Quick action button — identical to HRBP dashboard ────────────────────────

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
      <div className="shrink-0 group-hover:scale-105 transition-transform">{icon}</div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800 leading-none">{label}</p>
        <p className="text-[10px] text-slate-400 mt-1 leading-snug">{description}</p>
      </div>
      <ChevronRight className="w-3.5 h-3.5 text-slate-300 ml-auto shrink-0" />
    </button>
  );
}

// ── Admin Overview ────────────────────────────────────────────────────────────

function AdminOverview() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  const load = useCallback(async () => {
    setLoadingStats(true);
    getAdminStats()
      .then((r) => setStats(r.data))
      .catch(() => toast.error("Failed to load stats"))
      .finally(() => setLoadingStats(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 text-slate-800">
      <TopBar title="Admin Overview" subtitle="System-wide snapshot — users, clients, consultants and tickets." />

      <main className="flex-1 p-6 space-y-5">

        {/* Greeting Banner */}
        <div className="bg-white border border-slate-200 rounded-xl px-6 py-5 shadow-sm">
          <h1 className="text-2xl font-extrabold text-slate-900 leading-tight">
            👋 {greeting()}, {user?.name?.split(" ")[0] ?? "Admin"}.
          </h1>
          <p className="text-sm text-slate-500 mt-1.5">
            Here's the system-wide status across users, clients, consultants and tickets.
          </p>
        </div>

        {/* KPI Cards */}
        <div className="flex gap-4 flex-wrap">
          <KpiCard
            icon={<LottieIcon src="/json/business-team-working-on-business-idea.json" size={40} />}
            label="Total Users"
            value={loadingStats ? "—" : (stats?.total_users ?? 0)}
            accentText="text-blue-600"
            sub="Active accounts"
          />
          <KpiCard
            icon={<LottieIcon src="/json/successful-business-agreement.json" size={40} />}
            label="Active Clients"
            value={loadingStats ? "—" : (stats?.total_clients ?? 0)}
            accentText="text-emerald-600"
            sub="Managed accounts"
          />
          <KpiCard
            icon={<LottieIcon src="/json/employee-colored.json" size={40} />}
            label="Active Consultants"
            value={loadingStats ? "—" : (stats?.total_consultants ?? 0)}
            accentText="text-violet-600"
            sub="On engagement"
          />
          <KpiCard
            icon={<LottieIcon src="/json/helpful-tips-for-business.json" size={40} />}
            label="Open Tickets"
            value={loadingStats ? "—" : (stats?.open_tickets ?? 0)}
            accentText="text-orange-600"
            sub="Awaiting resolution"
          />
        </div>

        {/* Quick Actions */}
        <div>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2.5 px-0.5">
            Quick Actions
          </p>
          <div className="flex gap-3 flex-wrap">
            <QuickAction
              icon={<LottieIcon src="/json/business-team-emotions.json" size={36} />}
              label="Manage Users"
              description="Create new HRBPs, BHs, and leadership accounts"
              onClick={() => navigate({ to: "/admin/users" })}
            />
            <QuickAction
              icon={<LottieIcon src="/json/business-meeting.json" size={36} />}
              label="Manage Clients"
              description="Assign or reassign HRBP & BH to clients"
              onClick={() => navigate({ to: "/admin/clients" })}
            />
            <QuickAction
              icon={<LottieIcon src="/json/employee-development.json" size={36} />}
              label="Add Consultant"
              description="Create a new consultant and assign to a client"
              onClick={() => navigate({ to: "/admin/consultants" })}
            />
            <QuickAction
              icon={<LottieIcon src="/json/checking-resume.json" size={36} />}
              label="View All Tickets"
              description="Read-only view of all system tickets and SLA status"
              onClick={() => navigate({ to: "/admin/tickets" })}
            />
          </div>
        </div>

        {/* System Status */}
        <div>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2.5 px-0.5">
            System Status
          </p>
          {loadingStats ? (
            <SectionLoader />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                {
                  label: "Users",
                  value: stats?.total_users ?? 0,
                  sub: "Active system accounts",
                  icon: "/json/business-team-working-on-business-idea.json",
                  color: "border-l-blue-400",
                  to: "/admin/users",
                },
                {
                  label: "Clients",
                  value: stats?.total_clients ?? 0,
                  sub: "Active client accounts",
                  icon: "/json/successful-business-agreement.json",
                  color: "border-l-emerald-400",
                  to: "/admin/clients",
                },
                {
                  label: "Consultants",
                  value: stats?.total_consultants ?? 0,
                  sub: "Currently on engagement",
                  icon: "/json/employee-colored.json",
                  color: "border-l-violet-400",
                  to: "/admin/consultants",
                },
                {
                  label: "Open Tickets",
                  value: stats?.open_tickets ?? 0,
                  sub: "Pending resolution",
                  icon: "/json/helpful-tips-for-business.json",
                  color: "border-l-orange-400",
                  to: "/admin/tickets",
                },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={() => navigate({ to: item.to as any })}
                  className={`bg-white border border-slate-200 border-l-4 ${item.color} rounded-xl px-4 py-4 shadow-sm hover:shadow-md transition-shadow text-left w-full`}
                >
                  <div className="flex items-center gap-3">
                    <LottieIcon src={item.icon} size={36} />
                    <div>
                      <p className="text-2xl font-bold text-slate-800">{item.value}</p>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{item.label}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{item.sub}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
