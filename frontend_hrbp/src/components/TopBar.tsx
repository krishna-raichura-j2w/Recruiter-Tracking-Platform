import { Button } from "@/components/ui/button";
import { Bell, Plus, CheckCheck, ExternalLink } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import * as React from "react";
import {
  listNotificationsApi,
  markAllNotificationsReadApi,
  markNotificationReadApi,
  type HRBPNotification,
} from "@/apiService/notificationApi";
import { formatDistanceToNow } from "date-fns";

export function TopBar({
  title,
  subtitle,
  actions,
  onNewTicket,
}: {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  onNewTicket?: () => void;
}) {
  const { user } = useAuth();

  const [notifications, setNotifications] = React.useState<HRBPNotification[]>([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [open, setOpen] = React.useState(false);
  const [markingAll, setMarkingAll] = React.useState(false);

  const fetchNotifications = React.useCallback(async () => {
    try {
      const res = await listNotificationsApi({ page_no: 1, per_page: 5 });
      setNotifications(res.items);
      setUnreadCount(res.unread_count);
    } catch {
      // silently fail — bell is non-critical
    }
  }, []);

  // Poll every 30 seconds
  React.useEffect(() => {
    fetchNotifications();
    const id = setInterval(fetchNotifications, 30_000);
    return () => clearInterval(id);
  }, [fetchNotifications]);

  // Re-fetch when dropdown opens
  React.useEffect(() => {
    if (open) fetchNotifications();
  }, [open, fetchNotifications]);

  const handleMarkOne = async (id: number) => {
    try {
      await markNotificationReadApi(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {}
  };

  const handleMarkAll = async () => {
    setMarkingAll(true);
    try {
      await markAllNotificationsReadApi();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {}
    setMarkingAll(false);
  };

  const notifTypeColor: Record<string, string> = {
    sla_breach: "bg-red-100 text-red-700",
    general:    "bg-slate-100 text-slate-600",
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-100 bg-white/80 backdrop-blur-md px-6 shadow-sm">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex flex-col min-w-0">
          <h1 className="text-sm font-extrabold text-slate-900 tracking-tight leading-none uppercase md:text-base">
            {title ?? "Dashboard"}
          </h1>
          {subtitle && (
            <p className="text-[11px] text-slate-500 mt-1.5 truncate max-w-[280px] sm:max-w-[400px] md:max-w-[500px] lg:max-w-[700px] font-medium leading-none">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3.5 shrink-0 ml-4">
        {actions}
        {onNewTicket && (
          <Button
            size="sm"
            onClick={onNewTicket}
            className="bg-sky-600 hover:bg-sky-500 text-white font-semibold transition-all duration-200"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            New ticket
          </Button>
        )}

        {/* Notification bell */}
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative text-slate-600 hover:bg-slate-100 rounded-full"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-medium flex items-center justify-center">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-96 p-0" sideOffset={8}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <DropdownMenuLabel className="p-0 text-sm font-semibold text-slate-800">
                Notifications
                {unreadCount > 0 && (
                  <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700">
                    {unreadCount} new
                  </span>
                )}
              </DropdownMenuLabel>
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-slate-500 hover:text-slate-800 gap-1"
                  onClick={handleMarkAll}
                  disabled={markingAll}
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Mark all read
                </Button>
              )}
            </div>

            {/* Items */}
            <div className="max-h-[360px] overflow-y-auto divide-y">
              {notifications.length === 0 ? (
                <div className="py-10 text-center">
                  <Bell className="h-7 w-7 mx-auto text-slate-300 mb-2" />
                  <p className="text-sm text-muted-foreground">You're all caught up.</p>
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`flex items-start gap-3 px-4 py-3 hover:bg-accent/40 transition-colors cursor-default ${!n.is_read ? "bg-blue-50/60" : ""}`}
                    onClick={() => !n.is_read && handleMarkOne(n.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {!n.is_read && (
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                        )}
                        <span className="text-xs font-semibold text-slate-800 truncate">{n.title}</span>
                        <span className={`ml-auto shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${notifTypeColor[n.notif_type] ?? notifTypeColor.general}`}>
                          {n.notif_type.replace("_", " ")}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 line-clamp-2">{n.message}</p>
                      <p className="text-[10px] text-slate-400 mt-1">
                        {n.created_at
                          ? formatDistanceToNow(new Date(n.created_at), { addSuffix: true })
                          : ""}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <DropdownMenuSeparator />
            <div className="px-4 py-2.5">
              <Link
                to="/notifications"
                className="flex items-center justify-center gap-1.5 text-xs text-sky-600 hover:text-sky-800 font-medium"
                onClick={() => setOpen(false)}
              >
                View all notifications
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User profile */}
        {user && (
          <div className="flex items-center gap-2.5 pl-3.5 border-l border-slate-200 ml-1">
            <img
              src={user?.profile_url || `${import.meta.env.BASE_URL}profile-icon.svg`}
              alt="Profile"
              className="h-8 w-8 shrink-0 rounded-full object-cover"
              onError={(e) => { (e.currentTarget as HTMLImageElement).src = `${import.meta.env.BASE_URL}profile-icon.svg`; }}
            />
            <div className="hidden lg:flex flex-col items-end leading-tight">
              <span className="text-sm font-semibold text-slate-800 leading-none">{user.name}</span>
              <span className="text-[11px] text-slate-400 mt-0.5 leading-none">{user.role?.toUpperCase()}</span>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
