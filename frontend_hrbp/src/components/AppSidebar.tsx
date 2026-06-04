import { useState } from "react";
import type React from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  LayoutDashboard,
  Building2,
  Ticket,
  Bell,
  LogOut,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Users,
  UserCheck,
  DoorOpen,
  ActivitySquare,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
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
  { title: "Cadence Scheduler", url: "/cadence",         icon: CalendarClock,   module: "cadence"       },
  { title: "Clients",           url: "/clients",         icon: Building2,       module: "clients"       },
  { title: "Tickets",           url: "/tickets",         icon: Ticket,          module: "tickets"       },
  // { title: "Communication Hub", url: "/communication",   icon: Mail,            module: "communication" },
  { title: "Exit Tracking",     url: "/exits",           icon: DoorOpen,        module: "exits"         },
  { title: "Notifications",     url: "/notifications",   icon: Bell,            module: "notifications" },
  { title: "Activity Log",      url: "/activity-log",    icon: ActivitySquare,  module: "activity_log"  },
];

const ADMIN_NAV_ITEMS: { title: string; url: string; icon: React.ElementType }[] = [
  { title: "Admin Overview",  url: "/admin",              icon: ShieldCheck     },
  { title: "Users",           url: "/admin/users",        icon: Users           },
  { title: "Clients",         url: "/admin/clients",      icon: Building2       },
  { title: "Consultants",     url: "/admin/consultants",  icon: UserCheck       },
  { title: "Tickets",         url: "/admin/tickets",      icon: Ticket          },
  { title: "Activity Log",    url: "/activity-log",       icon: ActivitySquare  },
];

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const path = useRouterState({ select: (s) => s.location.pathname });
  const nav = useNavigate();
  const { user, logout, can } = useAuth();
  const active = (url: string) => path === url || path.startsWith(url + "/");
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const isAdmin = user?.role === "admin";
  const items = isAdmin ? [] : ALL_NAV_ITEMS.filter((it) => can(it.module, "read"));

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-slate-200 bg-white shadow-sm"
    >
      {/* Header — Logo + Brand */}
      <SidebarHeader
        className={cn(
          "border-b border-slate-100",
          collapsed ? "px-2 py-3" : "px-4 py-3",
        )}
      >
        {collapsed ? (
          <div className="flex flex-col items-center gap-1.5">
            <img src="/J2W_Logo.png" alt="J2W" className="h-7 w-7 object-contain" />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all duration-200"
              onClick={toggleSidebar}
              aria-label="Expand sidebar"
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2.5 min-w-0">
              <img src="/J2W_Logo.png" alt="J2W" className="h-8 w-auto shrink-0 object-contain" />
              <div className="h-6 w-px bg-slate-200 shrink-0" />
              <div className="min-w-0">
                <p className="text-[13px] font-black text-blue-700 leading-tight tracking-tight uppercase whitespace-nowrap">
                  HRBP System
                </p>
                <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-400 leading-tight">
                  HR Operations
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all duration-200"
              onClick={toggleSidebar}
              aria-label="Collapse sidebar"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        )}
      </SidebarHeader>

      {/* Nav Items */}
      <SidebarContent className={cn("py-4", collapsed && "overflow-visible px-2")}>
        {/* Regular nav — hidden for admin */}
        {!isAdmin && (
          <SidebarGroup className={cn(collapsed ? "p-0" : "px-3")}>
            <SidebarGroupContent>
              <SidebarMenu className={cn("gap-1.5", collapsed && "items-center gap-2 py-1")}>
                {items.map((it) => {
                  const isActive = active(it.url);
                  return (
                    <SidebarMenuItem key={it.url} className={cn(collapsed && "flex justify-center")}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={it.title}
                        className={cn(
                          "rounded-lg font-medium transition-all duration-150 active:scale-[0.98] h-10",
                          "text-slate-700 hover:bg-slate-100 hover:text-slate-900",
                          isActive && [
                            "bg-blue-50 text-blue-700 font-semibold",
                            "hover:bg-blue-100 hover:text-blue-800",
                            "data-[active=true]:bg-blue-50 data-[active=true]:text-blue-700",
                          ],
                          collapsed && "!size-10 !p-0 flex items-center justify-center [&>span]:hidden",
                        )}
                      >
                        <Link to={it.url}>
                          <it.icon
                            className={cn(
                              "!size-[18px] shrink-0",
                              isActive ? "text-blue-600" : "text-slate-500",
                            )}
                          />
                          {!collapsed && <span>{it.title}</span>}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Admin nav */}
        {isAdmin && (
          <SidebarGroup className={cn(collapsed ? "p-0" : "px-3")}>
            {!collapsed && (
              <p className="px-2 mb-1 text-[10px] font-bold uppercase tracking-widest text-red-500">
                Admin
              </p>
            )}
            <SidebarGroupContent>
              <SidebarMenu className={cn("gap-1.5", collapsed && "items-center gap-2 py-1")}>
                {ADMIN_NAV_ITEMS.map((it) => {
                  const isActive = it.url === "/admin" ? path === "/admin" : active(it.url);
                  return (
                    <SidebarMenuItem key={it.url} className={cn(collapsed && "flex justify-center")}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={it.title}
                        className={cn(
                          "rounded-lg font-medium transition-all duration-150 active:scale-[0.98] h-10",
                          "text-slate-700 hover:bg-red-50 hover:text-red-700",
                          isActive && [
                            "bg-red-50 text-red-700 font-semibold",
                            "hover:bg-red-100 hover:text-red-800",
                          ],
                          collapsed && "!size-10 !p-0 flex items-center justify-center [&>span]:hidden",
                        )}
                      >
                        <Link to={it.url}>
                          <it.icon
                            className={cn(
                              "!size-[18px] shrink-0",
                              isActive ? "text-red-600" : "text-slate-500",
                            )}
                          />
                          {!collapsed && <span>{it.title}</span>}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* Footer — Profile + Logout */}
      <SidebarFooter
        className={cn(
          "border-t border-slate-100",
          collapsed ? "px-2 py-3" : "px-3 py-3",
        )}
      >
        <SidebarMenu className={cn("gap-1", collapsed && "items-center gap-2")}>
          {/* Profile */}
          <SidebarMenuItem className={cn(collapsed && "flex justify-center")}>
            <SidebarMenuButton
              asChild
              tooltip={user?.name ?? "Profile"}
              className={cn(
                "rounded-lg text-slate-600 hover:bg-slate-100 transition-all duration-150",
                collapsed && "!size-10 !p-0 flex items-center justify-center [&>span]:hidden",
              )}
            >
              <Link to="/profile" className="flex items-center gap-2.5 w-full">
                <img
                  src={user?.profile_url || `${import.meta.env.BASE_URL}profile-icon.svg`}
                  alt="Profile"
                  className="h-7 w-7 shrink-0 rounded-full object-cover"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).src = `${import.meta.env.BASE_URL}profile-icon.svg`; }}
                />
                {!collapsed && (
                  <div className="flex min-w-0 flex-col items-start text-left leading-tight">
                    <span className="truncate text-sm font-semibold text-slate-800">{user?.name}</span>
                    <span className="truncate text-xs text-slate-400">{user?.role?.toUpperCase()}</span>
                  </div>
                )}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>

          {/* Separator */}
          {!collapsed && <div className="mx-1 border-t border-slate-100 my-1" />}

          {/* Logout */}
          <SidebarMenuItem className={cn(collapsed && "flex justify-center")}>
            <SidebarMenuButton
              tooltip="Logout"
              className={cn(
                "rounded-lg text-slate-800 hover:bg-red-50 hover:text-red-500 transition-all duration-150",
                collapsed && "!size-10 !p-0 flex items-center justify-center [&>span]:hidden",
              )}
              onClick={() => setShowLogoutConfirm(true)}
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
