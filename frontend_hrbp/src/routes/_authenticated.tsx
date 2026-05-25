import type { CSSProperties } from "react";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { AICopilotWidget } from "@/components/AICopilotWidget";
import { isAuthed } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: () => {
    if (typeof window !== "undefined" && !isAuthed()) {
      throw redirect({ to: "/login" });
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
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex-1 min-w-0">
          <Outlet />
        </SidebarInset>
      </div>
      <AICopilotWidget />
    </SidebarProvider>
  );
}
