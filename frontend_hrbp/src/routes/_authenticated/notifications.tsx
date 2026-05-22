import { createFileRoute } from "@tanstack/react-router";
import { TopBar } from "@/components/TopBar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { notifications } from "@/lib/mockData";
import { Bell, AlertTriangle, FileClock, TrendingDown, Phone, ArrowUpRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationsPage,
});

const iconMap = {
  pip: AlertTriangle,
  renewal: FileClock,
  nps: TrendingDown,
  bh: Phone,
  escalation: ArrowUpRight,
};

function NotificationsPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <TopBar
        title="Notifications"
        subtitle="Recent alerts across PIPs, renewals, NPS, BH calls and escalations."
      />
      <main className="flex-1 p-6">
        <Card>
          <CardContent className="p-0">
            {notifications.length === 0 && (
              <div className="p-10 text-center">
                <Bell className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">You're all caught up.</p>
              </div>
            )}
            <div className="divide-y">
              {notifications.map((n) => {
                const Icon = iconMap[n.type];
                return (
                  <div
                    key={n.id}
                    className={`flex items-start gap-3 p-4 hover:bg-accent/40 transition-colors ${!n.read ? "bg-primary/5" : ""}`}
                  >
                    <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center shrink-0">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-medium">{n.title}</h4>
                        {!n.read && (
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-primary text-primary-foreground border-primary"
                          >
                            New
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">{n.message}</p>
                      <p className="text-xs text-muted-foreground mt-1">{n.at}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
