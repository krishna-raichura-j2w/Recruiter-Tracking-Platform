import type { CSSProperties } from "react";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { AICopilotWidget } from "@/components/AICopilotWidget";
import { isAuthed } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    if (typeof window !== "undefined") {
      if (!isAuthed()) {
        throw redirect({ to: "/login" });
      }
      // Enforce password change — check the stored user object
      try {
        const raw = localStorage.getItem("j2w_user");
        if (raw) {
          const u = JSON.parse(raw);
          if (u.must_change_password) {
            throw redirect({ to: "/change-password" });
          }
        }
      } catch (e) {
        // If it's our redirect, re-throw it; otherwise ignore parse errors
        if (e && typeof e === "object" && "to" in e) throw e;
      }
    }
  },
  component: AuthLayout,
});

function AuthLayout() {
  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "16rem",
          "--sidebar-width-icon": "4.5rem",
          "--sidebar": "#ffffff",
          "--sidebar-foreground": "#505f76",
          "--sidebar-border": "#e2e8f0",
          "--sidebar-accent": "#dbeafe",
          "--sidebar-accent-foreground": "#1e40af",
        } as CSSProperties
      }
    >
      <div className="h-screen overflow-hidden flex w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex-1 min-w-0 overflow-y-auto">
          <Outlet />
        </SidebarInset>
      </div>
      <AICopilotWidget />
    </SidebarProvider>
  );
}
