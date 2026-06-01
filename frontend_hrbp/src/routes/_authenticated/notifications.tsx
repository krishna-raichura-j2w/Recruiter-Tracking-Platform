import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { TopBar } from "@/components/TopBar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CustomTablePagination } from "@/components/CustomPagination";
import {
  Bell,
  ArrowUpRight,
  CheckCheck,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { toast } from "react-toastify";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { formatDistanceToNow } from "date-fns";
import {
  listNotificationsApi,
  markNotificationReadApi,
  markAllNotificationsReadApi,
  deleteNotificationApi,
  type HRBPNotification,
} from "@/apiService/notificationApi";
import { SectionLoader } from "@/components/Loader";

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationsPage,
});

const NOTIF_TYPE_CONFIG: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  sla_breach: { label: "SLA Breach",  className: "bg-red-100 text-red-700 border-red-200",     icon: ArrowUpRight },
  general:    { label: "General",     className: "bg-slate-100 text-slate-600 border-slate-200", icon: Bell        },
};

function getTypeConfig(type: string) {
  return NOTIF_TYPE_CONFIG[type] ?? NOTIF_TYPE_CONFIG.general;
}

const ROWS_PER_PAGE_OPTIONS = [10, 20, 50];

function NotificationsPage() {
  const [notifications, setNotifications] = useState<HRBPNotification[]>([]);
  const [total, setTotal]                 = useState(0);
  const [unreadCount, setUnreadCount]     = useState(0);
  const [loading, setLoading]             = useState(false);

  // Pagination — 0-based for MUI display, converted to 1-based for API
  const [page, setPage]               = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Filter
  const [unreadOnly, setUnreadOnly] = useState(false);

  // Clear all confirmation
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  // Single delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listNotificationsApi({
        unread_only: unreadOnly,
        page_no: page + 1,
        per_page: rowsPerPage,
      });
      setNotifications(res.items);
      setTotal(res.total);
      setUnreadCount(res.unread_count);
    } catch {
      toast.error("Failed to load notifications.");
    } finally {
      setLoading(false);
    }
  }, [unreadOnly, page, rowsPerPage]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Reset to page 0 when filter changes
  useEffect(() => {
    setPage(0);
  }, [unreadOnly]);

  const handleMarkOne = async (id: number) => {
    try {
      await markNotificationReadApi(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      toast.success("Notification marked as read.");
    } catch {
      toast.error("Failed to mark as read.");
    }
  };

  const handleMarkAll = async () => {
    try {
      const { marked_read } = await markAllNotificationsReadApi();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
      toast.success(`${marked_read} notification${marked_read !== 1 ? "s" : ""} marked as read.`);
    } catch {
      toast.error("Failed to mark all as read.");
    }
  };

  const handleDelete = async () => {
    if (deleteTarget === null) return;
    try {
      await deleteNotificationApi(deleteTarget);
      setNotifications((prev) => prev.filter((n) => n.id !== deleteTarget));
      setTotal((t) => Math.max(0, t - 1));
      toast.success("Notification deleted.");
    } catch {
      toast.error("Failed to delete notification.");
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleClearAll = async () => {
    // Delete all visible items one by one — a bulk-delete endpoint could be added later
    try {
      await Promise.all(notifications.map((n) => deleteNotificationApi(n.id)));
      setNotifications([]);
      setTotal(0);
      toast.success("All notifications cleared.");
    } catch {
      toast.error("Failed to clear all notifications.");
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-800">
      <TopBar
        title="Notifications"
        subtitle="SLA breach alerts and ticket updates."
      />

      <main className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full">
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant={unreadOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setUnreadOnly(!unreadOnly)}
              className="text-xs"
            >
              {unreadOnly ? "Showing unread" : "All notifications"}
            </Button>
            {unreadCount > 0 && (
              <span className="text-xs text-slate-500">
                {unreadCount} unread
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchNotifications}
              disabled={loading}
              className="text-xs gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            {unreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleMarkAll}
                className="text-xs gap-1.5"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </Button>
            )}
            {notifications.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setClearConfirmOpen(true)}
                className="text-xs gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear all
              </Button>
            )}
          </div>
        </div>

        {/* List */}
        <Card className="shadow-sm">
          <CardContent className="p-0">
            {loading && notifications.length === 0 ? (
              <SectionLoader />
            ) : notifications.length === 0 ? (
              <div className="py-16 text-center">
                <Bell className="h-9 w-9 mx-auto text-slate-300 mb-3" />
                <p className="text-sm font-medium text-slate-500">
                  {unreadOnly ? "No unread notifications." : "You're all caught up."}
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {notifications.map((n) => {
                  const cfg = getTypeConfig(n.notif_type);
                  const Icon = cfg.icon;
                  return (
                    <div
                      key={n.id}
                      className={`flex items-start gap-3 px-5 py-4 hover:bg-accent/30 transition-colors ${!n.is_read ? "bg-blue-50/50" : ""}`}
                    >
                      {/* Icon */}
                      <div className="h-9 w-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                        <Icon className="h-4 w-4 text-slate-500" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {!n.is_read && (
                            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                          )}
                          <span className="text-sm font-semibold text-slate-800">
                            {n.title}
                          </span>
                          {!n.is_read && (
                            <Badge variant="outline" className="text-[10px] bg-blue-600 text-white border-blue-600 py-0">
                              New
                            </Badge>
                          )}
                          <Badge variant="outline" className={`text-[10px] py-0 ${cfg.className}`}>
                            {cfg.label}
                          </Badge>
                          {n.ticket_id && (
                            <span className="text-[10px] text-slate-400">
                              Ticket #{n.ticket_id}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
                        <p className="text-[11px] text-slate-400 mt-1">
                          {n.created_at
                            ? formatDistanceToNow(new Date(n.created_at), { addSuffix: true })
                            : ""}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        {!n.is_read && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-slate-400 hover:text-blue-600"
                            title="Mark as read"
                            onClick={() => handleMarkOne(n.id)}
                          >
                            <CheckCheck className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-slate-400 hover:text-red-600"
                          title="Delete"
                          onClick={() => setDeleteTarget(n.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {total > 0 && (
              <div className="border-t px-4 py-1">
                <CustomTablePagination
                  count={total}
                  page={page}
                  rowsPerPage={rowsPerPage}
                  rowsPerPageOptions={ROWS_PER_PAGE_OPTIONS}
                  onPageChange={(_: unknown, newPage: number) => setPage(newPage)}
                  onRowsPerPageChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    setRowsPerPage(parseInt(e.target.value, 10));
                    setPage(0);
                  }}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete notification?"
        description="This notification will be permanently deleted. This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
        onConfirm={handleDelete}
      />

      <ConfirmDialog
        open={clearConfirmOpen}
        onOpenChange={setClearConfirmOpen}
        title="Clear all notifications?"
        description="This will permanently delete all notifications on this page. This action cannot be undone."
        confirmText="Clear all"
        cancelText="Cancel"
        variant="destructive"
        onConfirm={handleClearAll}
      />
    </div>
  );
}
