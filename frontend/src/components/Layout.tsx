import { type ReactNode } from 'react';
import { Bell, X, CheckCheck, Zap } from 'lucide-react';
import { useState } from 'react';
import Sidebar from './Sidebar';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../context/RealtimeContext';

interface LayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

const roleColors: Record<string, string> = {
  admin:         'bg-red-100 text-red-700 border-red-200',
  kam:           'bg-purple-100 text-purple-700 border-purple-200',
  delivery_lead: 'bg-orange-100 text-orange-700 border-orange-200',
  recruiter:     'bg-blue-100 text-blue-700 border-blue-200',
};
const roleLabels: Record<string, string> = {
  admin: 'Admin', kam: 'KAM', delivery_lead: 'Delivery Lead', recruiter: 'Recruiter',
};

const notifTypeIcon: Record<string, string> = {
  jd_created:       '📋',
  jd_assigned:      '🎯',
  candidate_sourced:'👤',
  deadline_warning: '⚠️',
  deadline_alert:   '🔴',
};

export default function Layout({ title, subtitle, children }: LayoutProps) {
  const { user } = useAuth();
  const { notifications, unread, toasts, dismissToast, markAllRead, markOneRead } = useRealtime();
  const [showNotifs, setShowNotifs] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#F1F5F9' }}>
      <div className="flex-shrink-0">
        <Sidebar />
      </div>

      <div className="flex flex-col flex-1 overflow-hidden">
        {/* ── Top bar ─────────────────────────────────────────────── */}
        <header
          className="flex-shrink-0 px-6 py-0 flex items-center justify-between border-b"
          style={{ height: 60, background: '#FFFFFF', borderColor: '#E8EDF3' }}
        >
          {/* Page title */}
          <div className="flex items-baseline gap-3">
            <h1 className="text-base font-bold text-slate-800 leading-none">{title}</h1>
            {subtitle && (
              <span className="text-xs text-slate-400 font-medium leading-none">{subtitle}</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Bell */}
            <div className="relative">
              <button
                onClick={() => setShowNotifs(v => !v)}
                className="relative flex items-center justify-center w-9 h-9 rounded-xl transition-colors"
                style={{ background: showNotifs ? '#EFF6FF' : 'transparent' }}
                onMouseEnter={e => { if (!showNotifs) (e.currentTarget as HTMLElement).style.background = '#F8FAFC'; }}
                onMouseLeave={e => { if (!showNotifs) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <Bell size={17} className="text-slate-500" />
                {unread > 0 && (
                  <span
                    className="absolute -top-0.5 -right-0.5 flex items-center justify-center rounded-full text-white text-[9px] font-bold"
                    style={{ width: 16, height: 16, background: '#2563EB', minWidth: 16 }}
                  >
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </button>

              {/* Notification panel */}
              {showNotifs && (
                <div
                  className="absolute right-0 mt-2 bg-white rounded-2xl shadow-2xl border z-50 overflow-hidden"
                  style={{ width: 380, borderColor: '#E8EDF3', boxShadow: '0 20px 60px rgba(0,0,0,0.12)' }}
                >
                  <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: '#F1F5F9' }}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-800">Notifications</span>
                      {unread > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-600 text-white">
                          {unread} new
                        </span>
                      )}
                    </div>
                    {unread > 0 && (
                      <button
                        onClick={markAllRead}
                        className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-blue-600 transition-colors"
                      >
                        <CheckCheck size={12} /> Mark all read
                      </button>
                    )}
                  </div>
                  <div className="overflow-y-auto" style={{ maxHeight: 340 }}>
                    {notifications.length === 0 ? (
                      <div className="py-12 text-center">
                        <Bell size={24} className="mx-auto mb-2 text-slate-200" />
                        <p className="text-xs text-slate-400">No notifications yet</p>
                      </div>
                    ) : (
                      notifications.slice(0, 20).map(n => (
                        <div
                          key={n.id}
                          onClick={() => !n.is_read && markOneRead(n.id)}
                          className="px-5 py-3 border-b cursor-pointer transition-colors"
                          style={{
                            borderColor: '#F8FAFC',
                            background: n.is_read ? 'transparent' : '#EFF6FF',
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = n.is_read ? '#F8FAFC' : '#DBEAFE'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = n.is_read ? 'transparent' : '#EFF6FF'; }}
                        >
                          <div className="flex items-start gap-3">
                            <span className="text-base flex-shrink-0 mt-0.5">
                              {notifTypeIcon[n.type] ?? '🔔'}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-slate-700 leading-relaxed">{n.message}</p>
                              <p className="text-[10px] text-slate-400 mt-1">
                                {new Date(n.created_at).toLocaleString('en-IN', {
                                  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                                })}
                              </p>
                            </div>
                            {!n.is_read && (
                              <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="w-px h-6 bg-slate-200" />

            {/* User */}
            {user && (
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-black text-white flex-shrink-0"
                  style={{ background: '#2563EB' }}
                >
                  {user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                </div>
                <div className="hidden sm:block">
                  <p className="text-xs font-bold text-slate-800 leading-tight">{user.name}</p>
                  <p className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md inline-block border leading-tight mt-0.5 ${roleColors[user.role] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                    {roleLabels[user.role] ?? user.role}
                  </p>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* ── Main content ─────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto p-6" style={{ scrollbarWidth: 'thin' }}>
          {showNotifs && <div className="fixed inset-0 z-40" onClick={() => setShowNotifs(false)} />}
          {children}
        </main>
      </div>

      {/* ── Toast stack ──────────────────────────────────────────── */}
      <div className="fixed bottom-5 right-5 z-[200] flex flex-col gap-2 pointer-events-none" style={{ maxWidth: 360 }}>
        {toasts.map(t => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-2xl border shadow-xl text-xs font-medium ${t.colorClass}`}
            style={{ backdropFilter: 'blur(8px)', animation: 'slideInRight 0.25s ease' }}
          >
            <Zap size={13} className="flex-shrink-0 mt-0.5 opacity-70" />
            <p className="flex-1 leading-relaxed">{t.message}</p>
            <button onClick={() => dismissToast(t.id)} className="flex-shrink-0 opacity-40 hover:opacity-80 transition-opacity mt-0.5">
              <X size={12} />
            </button>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(20px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}
