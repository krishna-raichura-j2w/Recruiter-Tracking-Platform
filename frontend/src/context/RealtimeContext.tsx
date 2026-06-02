import {
  createContext, useContext, useEffect, useRef, useState,
  useCallback, type ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import api from '../api/client';
import type { Notification } from '../types';

// Which domains to refresh for each notification type
const REFRESH_MAP: Record<string, string[]> = {
  jd_created:          ['jobs', 'dashboard'],
  jd_assigned:         ['jobs', 'candidates', 'dashboard'],
  candidate_sourced:   ['candidates', 'dashboard'],
  ready_for_validation:['candidates', 'validation', 'dashboard'],
  candidate_validated: ['candidates', 'submissions', 'dashboard'],
  validation_done:     ['candidates', 'dashboard'],
  stage_updated:       ['submissions', 'pipeline', 'dashboard'],
  general:             ['dashboard'],
};

const NOTIF_COLORS: Record<string, string> = {
  jd_created:          'bg-indigo-50 border-indigo-200 text-indigo-700',
  jd_assigned:         'bg-blue-50 border-blue-200 text-blue-700',
  candidate_sourced:   'bg-cyan-50 border-cyan-200 text-cyan-700',
  ready_for_validation:'bg-amber-50 border-amber-200 text-amber-700',
  candidate_validated: 'bg-green-50 border-green-200 text-green-700',
  validation_done:     'bg-green-50 border-green-200 text-green-700',
  stage_updated:       'bg-violet-50 border-violet-200 text-violet-700',
  general:             'bg-slate-50 border-slate-200 text-slate-700',
};

export interface Toast {
  id: number;
  message: string;
  notif_type: string;
  colorClass: string;
}

interface RealtimeCtx {
  // Per-domain refresh signals — pages watch these in useEffect deps
  signals: Record<string, number>;
  // Notifications state for the bell
  notifications: Notification[];
  unread: number;
  toasts: Toast[];
  dismissToast: (id: number) => void;
  markAllRead: () => void;
  markOneRead: (id: number) => void;
}

const Ctx = createContext<RealtimeCtx | null>(null);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [signals, setSignals] = useState<Record<string, number>>({});
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);
  const esRef = useRef<EventSource | null>(null);

  // ── Fetch initial notifications ────────────────────────────────────────
  const fetchNotifications = useCallback(() => {
    if (!user) return;
    api.get<{ notifications: Notification[]; unread_count: number }>('/dashboard/notifications')
      .then((r) => {
        setNotifications(r.data.notifications ?? []);
        setUnread(r.data.unread_count ?? 0);
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  // ── SSE connection ────────────────────────────────────────────────────
  // TEMPORARILY DISABLED for DB-load relief. The live notification stream
  // polled the DB every 5s per user and was overloading the database. The
  // notification bell still works from the initial /dashboard/notifications
  // fetch above; live toasts/auto-refresh are paused until the stream is
  // re-enabled. (Backend /notifications/stream is also a heartbeat-only no-op.)
  //
  // useEffect(() => {
  //   if (!user?.access_token) return;
  //   ... EventSource connection (disabled) ...
  // }, [user?.access_token]);
  // Suppress unused-var warnings for refs/setters only used by the disabled stream.
  void esRef;
  void toastIdRef;
  void setSignals;

  // ── Notification actions ───────────────────────────────────────────────
  const markAllRead = useCallback(async () => {
    await api.post('/notifications/mark-all-read').catch(() => {});
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnread(0);
  }, []);

  const markOneRead = useCallback(async (id: number) => {
    await api.post(`/notifications/${id}/read`).catch(() => {});
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
    setUnread((c) => Math.max(0, c - 1));
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <Ctx.Provider value={{ signals, notifications, unread, toasts, dismissToast, markAllRead, markOneRead }}>
      {children}
    </Ctx.Provider>
  );
}

export function useRealtime() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useRealtime must be inside RealtimeProvider');
  return ctx;
}

/** Subscribe to a specific domain signal. Re-renders when that domain's data changes. */
export function useSignal(domain: string): number {
  const { signals } = useRealtime();
  return signals[domain] ?? 0;
}
