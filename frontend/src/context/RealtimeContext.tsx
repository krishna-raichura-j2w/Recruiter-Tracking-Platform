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
  useEffect(() => {
    if (!user?.access_token) return;
    const token = user.access_token;

    const connect = () => {
      const base = (api.defaults.baseURL ?? '').replace(/\/api$/, '');
      const url = `${base}/api/notifications/stream?token=${encodeURIComponent(token)}`;
      const es = new EventSource(url);
      esRef.current = es;

      es.onmessage = (e) => {
        const raw = e.data as string;
        if (!raw || raw.startsWith(':')) return;
        try {
          const data = JSON.parse(raw);
          if (data.type === 'connected') return;

          // Add to notification list
          const notif: Notification = {
            id:         data.id,
            message:    data.message,
            notif_type: data.notif_type,
            is_read:    false,
            created_at: data.created_at ?? new Date().toISOString(),
          };
          setNotifications((prev) => [notif, ...prev.slice(0, 49)]);
          setUnread((n) => n + 1);

          // Show toast
          const tid = ++toastIdRef.current;
          const colorClass = NOTIF_COLORS[data.notif_type] ?? NOTIF_COLORS.general;
          setToasts((prev) => [...prev, { id: tid, message: data.message, notif_type: data.notif_type, colorClass }]);
          setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== tid)), 6000);

          // Increment refresh signals for affected domains
          const domains = REFRESH_MAP[data.notif_type] ?? [];
          if (domains.length) {
            setSignals((prev) => {
              const next = { ...prev };
              domains.forEach((d) => { next[d] = (next[d] ?? 0) + 1; });
              return next;
            });
          }
        } catch {
          // non-JSON ping — ignore
        }
      };

      es.onerror = () => {
        es.close();
        setTimeout(connect, 10000);
      };
    };

    connect();
    return () => { esRef.current?.close(); };
  }, [user?.access_token]);

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
