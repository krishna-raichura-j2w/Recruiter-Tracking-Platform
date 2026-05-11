import { type ReactNode, useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import Sidebar from './Sidebar';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import type { Notification } from '../types';

interface LayoutProps {
  title: string;
  children: ReactNode;
}

const roleLabels: Record<string, string> = {
  admin:         'Admin',
  kam:      'KAM',
  delivery_lead: 'Delivery Lead',
  recruiter:     'Recruiter',
};

const roleColors: Record<string, string> = {
  admin:         'bg-red-100 text-red-700',
  kam:      'bg-purple-100 text-purple-700',
  delivery_lead: 'bg-orange-100 text-orange-700',
  recruiter:     'bg-blue-100 text-blue-700',
};

export default function Layout({ title, children }: LayoutProps) {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifs, setShowNotifs] = useState(false);

  useEffect(() => {
    api
      .get<{ notifications: Notification[]; unread_count: number }>('/dashboard/notifications')
      .then((res) => {
        setNotifications(res.data.notifications ?? []);
        setUnread(res.data.unread_count ?? 0);
      })
      .catch(() => { });
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Sidebar */}
      <div className="flex-shrink-0">
        <Sidebar />
      </div>

      {/* Main content */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Top navbar */}
        <header className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm">
          <h1 className="text-xl font-bold text-slate-800">{title}</h1>

          <div className="flex items-center gap-4">
            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => setShowNotifs(!showNotifs)}
                className="relative p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <Bell size={20} />
                {unread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-4 h-4 rounded-full text-white text-[10px] font-bold"
                    style={{ backgroundColor: '#3b82f6' }}>
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </button>

              {showNotifs && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700">Notifications</span>
                    {unread > 0 && (
                      <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                        {unread} new
                      </span>
                    )}
                  </div>
                  <div className="max-h-72 overflow-y-auto scrollbar-thin">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-6 text-center text-sm text-slate-400">
                        No notifications
                      </div>
                    ) : (
                      notifications.slice(0, 10).map((n) => (
                        <div
                          key={n.id}
                          className={`px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors ${!n.is_read ? 'bg-blue-50/40' : ''
                            }`}
                        >
                          <p className="text-sm text-slate-700">{n.message}</p>
                          <p className="text-xs text-slate-400 mt-1">
                            {new Date(n.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User info */}
            {user && (
              <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-semibold text-slate-800">{user.name}</p>
                </div>
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full ${roleColors[user.role] ?? 'bg-slate-100 text-slate-700'
                    }`}
                >
                  {roleLabels[user.role] ?? user.role}
                </span>
              </div>
            )}
          </div>
        </header>

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto scrollbar-thin p-6">
          {/* Click outside to close notifications */}
          {showNotifs && (
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowNotifs(false)}
            />
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
