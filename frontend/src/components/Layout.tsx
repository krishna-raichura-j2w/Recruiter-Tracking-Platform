import { type ReactNode } from 'react';
import { Bell, X, CheckCheck } from 'lucide-react';
import { useState } from 'react';
import Sidebar from './Sidebar';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../context/RealtimeContext';

interface LayoutProps {
  title: string;
  children: ReactNode;
}

const roleLabels: Record<string, string> = {
  admin:         'Admin',
  kam:           'KAM',
  delivery_lead: 'Delivery Lead',
  recruiter:     'Recruiter',
};
const roleColors: Record<string, string> = {
  admin:         'bg-red-100 text-red-700',
  kam:           'bg-purple-100 text-purple-700',
  delivery_lead: 'bg-orange-100 text-orange-700',
  recruiter:     'bg-blue-100 text-blue-700',
};

export default function Layout({ title, children }: LayoutProps) {
  const { user } = useAuth();
  const { notifications, unread, toasts, dismissToast, markAllRead, markOneRead } = useRealtime();
  const [showNotifs, setShowNotifs] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <div className="flex-shrink-0">
        <Sidebar />
      </div>

      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Top bar */}
        <header className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm">
          <h1 className="text-xl font-bold text-slate-800">{title}</h1>

          <div className="flex items-center gap-4">
            {/* Bell */}
            <div className="relative">
              <button
                onClick={() => setShowNotifs((v) => !v)}
                className="relative p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <Bell size={20} />
                {unread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-4 h-4 rounded-full text-white text-[10px] font-bold bg-blue-500">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </button>

              {showNotifs && (
                <div className="absolute right-0 mt-2 w-96 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700">Notifications</span>
                    <div className="flex items-center gap-2">
                      {unread > 0 && (
                        <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                          {unread} new
                        </span>
                      )}
                      {unread > 0 && (
                        <button
                          onClick={markAllRead}
                          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
                        >
                          <CheckCheck size={13} /> All read
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="max-h-80 overflow-y-auto scrollbar-thin">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-8 text-center text-sm text-slate-400">No notifications yet</div>
                    ) : (
                      notifications.slice(0, 20).map((n) => (
                        <div
                          key={n.id}
                          onClick={() => !n.is_read && markOneRead(n.id)}
                          className={`px-4 py-3 border-b border-slate-50 cursor-pointer transition-colors ${
                            !n.is_read ? 'bg-blue-50/40 hover:bg-blue-50/70' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            {!n.is_read && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-slate-700 leading-snug">{n.message}</p>
                              <p className="text-xs text-slate-400 mt-0.5">
                                {new Date(n.created_at).toLocaleString('en-IN', {
                                  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                                })}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User chip */}
            {user && (
              <div className="flex items-center gap-3">
                <p className="text-sm font-semibold text-slate-800 hidden sm:block">{user.name}</p>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${roleColors[user.role] ?? 'bg-slate-100 text-slate-700'}`}>
                  {roleLabels[user.role] ?? user.role}
                </span>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto scrollbar-thin p-6">
          {showNotifs && <div className="fixed inset-0 z-40" onClick={() => setShowNotifs(false)} />}
          {children}
        </main>
      </div>

      {/* Toast stack */}
      <div className="fixed bottom-5 right-5 z-[200] flex flex-col gap-2 pointer-events-none" style={{ maxWidth: 360 }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg text-sm animate-slide-in ${t.colorClass}`}
          >
            <Bell size={14} className="flex-shrink-0 mt-0.5 opacity-60" />
            <p className="flex-1 leading-snug">{t.message}</p>
            <button onClick={() => dismissToast(t.id)} className="flex-shrink-0 opacity-40 hover:opacity-80 transition-opacity">
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
