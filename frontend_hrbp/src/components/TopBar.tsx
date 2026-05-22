import { Button } from "@/components/ui/button";
import { Bell, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { notifications } from "@/lib/mockData";
import { Link } from "@tanstack/react-router";
import { toast } from "react-toastify";

import * as React from "react";

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
  const unread = notifications.filter((n) => !n.read).length;
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative text-slate-600 hover:bg-slate-100 rounded-full"
            >
              <Bell className="h-4 w-4" />
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-medium flex items-center justify-center">
                  {unread}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel>Notifications</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {notifications.map((n) => (
              <DropdownMenuItem key={n.id} className="flex flex-col items-start gap-0.5 py-2">
                <span className="text-sm font-medium">{n.title}</span>
                <span className="text-xs text-muted-foreground line-clamp-2">{n.message}</span>
                <span className="text-[10px] text-muted-foreground">{n.at}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/notifications" className="w-full text-center text-sm">
                View all
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
