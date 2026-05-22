import { useState } from "react";
import type React from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  LayoutDashboard,
  Building2,
  Ticket,
  Mail,
  Bell,
  LogOut,
  User,
  ChevronLeft,
  ChevronRight,
  CalendarClock,
  AlertTriangle,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import type { Module } from "@/lib/permissions";

const ALL_NAV_ITEMS: { title: string; url: string; icon: React.ElementType; module: Module }[] = [
  { title: "Overview",          url: "/dashboard",       icon: LayoutDashboard, module: "dashboard"     },
  { title: "Incident Engine",   url: "/incident-engine", icon: AlertTriangle,   module: "incidents"     },
  { title: "Cadence Scheduler", url: "/cadence",         icon: CalendarClock,   module: "cadence"       },
  { title: "Clients",           url: "/clients",         icon: Building2,       module: "clients"       },
  { title: "Tickets",           url: "/tickets",         icon: Ticket,          module: "tickets"       },
  { title: "Communication Hub", url: "/communication",   icon: Mail,            module: "communication" },
  { title: "Notifications",     url: "/notifications",   icon: Bell,            module: "notifications" },
];

const iconOnlyButtonClass = (isItemActive: boolean, collapsed: boolean) =>
  cn(
    "rounded-lg font-semibold transition-all duration-200",
    "text-slate-300 hover:bg-white/10 hover:text-white",
    collapsed && [
      "!size-10 !p-0",
      "flex items-center justify-center",
      "[&>span]:hidden",
      "[&>a]:flex [&>a]:size-full [&>a]:items-center [&>a]:justify-center",
    ],
    isItemActive && [
      "bg-sky-600 text-white shadow-md shadow-sky-600/10",
      "hover:bg-sky-500 hover:text-white",
      "data-[active=true]:bg-sky-600 data-[active=true]:text-white",
    ],
  );

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const path = useRouterState({ select: (s) => s.location.pathname });
  const nav = useNavigate();
  const { user, logout, can } = useAuth();
  const active = (url: string) => path === url || path.startsWith(url + "/");
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const items = ALL_NAV_ITEMS.filter((it) => can(it.module, "read"));

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader
        className={cn("border-b border-sidebar-border", collapsed ? "px-2 py-4" : "px-3 py-3")}
      >
        {collapsed ? (
          <div className="flex flex-col items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-sidebar-border"
              title="J2W"
            >
              <img src="/J2W_Logo.png" alt="J2W" className="h-9 w-9 object-contain" />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-400 hover:text-white hover:bg-white/10 transition-all duration-200"
              onClick={toggleSidebar}
              aria-label="Expand sidebar"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3 px-1 py-1">
            <img
              src="/J2W_Logo.png"
              alt="J2W Logo"
              className="h-11 w-auto shrink-0 object-contain"
            />
            <div className="h-8 w-[1px] bg-slate-700/50 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-base font-black tracking-wider text-white uppercase leading-none">
                HRBP System
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-slate-400 hover:text-white hover:bg-white/10 transition-all duration-200"
              onClick={toggleSidebar}
              aria-label="Collapse sidebar"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className={cn(collapsed && "overflow-visible px-2")}>
        <SidebarGroup className={cn(collapsed ? "p-0" : "p-2")}>
          {!collapsed && (
            <SidebarGroupLabel className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Navigation
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu className={cn(collapsed && "items-center gap-2 py-1")}>
              {items.map((it) => (
                <SidebarMenuItem key={it.url} className={cn(collapsed && "flex justify-center")}>
                  <SidebarMenuButton
                    asChild
                    isActive={active(it.url)}
                    tooltip={it.title}
                    className={iconOnlyButtonClass(active(it.url), collapsed)}
                  >
                    <Link to={it.url}>
                      <it.icon className="!size-[18px] shrink-0" />
                      {!collapsed && <span>{it.title}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter
        className={cn("border-t border-sidebar-border", collapsed ? "px-2 py-3" : "p-2")}
      >
        <SidebarMenu className={cn(collapsed && "items-center gap-2")}>
          <SidebarMenuItem className={cn(collapsed && "flex justify-center")}>
            <SidebarMenuButton
              asChild
              tooltip={user?.name ?? "Profile"}
              className={cn(
                "rounded-lg text-slate-300 hover:bg-white/10 hover:text-white transition-all duration-200",
                collapsed && [
                  "!size-10 !p-0",
                  "flex items-center justify-center",
                  "[&>span]:hidden",
                ],
              )}
            >
              <Link to="/profile" className="flex items-center gap-2 w-full">
                <div className="h-7 w-7 shrink-0 rounded-full bg-slate-100 flex items-center justify-center p-[2px] shadow-sm border border-slate-600/50 group-hover:bg-white transition-colors">
                  <img src="/profile-icon.svg" className="h-full w-full object-contain" alt="Profile" />
                </div>
                {!collapsed && (
                  <div className="flex min-w-0 flex-col items-start text-left leading-tight">
                    <span className="truncate text-sm font-semibold text-white">{user?.name}</span>
                    <span className="truncate text-xs text-slate-400">{user?.role}</span>
                  </div>
                )}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem className={cn(collapsed && "flex justify-center")}>
            <SidebarMenuButton
              tooltip="Logout"
              className={cn(
                "rounded-lg text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-all duration-200",
                collapsed && [
                  "!size-10 !p-0",
                  "flex items-center justify-center",
                  "[&>span]:hidden",
                ],
              )}
              onClick={() => {
                setShowLogoutConfirm(true);
              }}
            >
              <LogOut className="!size-[18px] shrink-0" />
              {!collapsed && <span>Logout</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
      <ConfirmDialog
        open={showLogoutConfirm}
        onOpenChange={setShowLogoutConfirm}
        title="Confirm Logout"
        description="Are you sure you want to log out of the HRBP System?"
        confirmText="Log out"
        variant="destructive"
        onConfirm={() => {
          logout();
          nav({ to: "/login" });
        }}
      />
    </Sidebar>
  );
}
