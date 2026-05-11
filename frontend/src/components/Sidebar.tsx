import { useAuth } from '../context/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Briefcase,
  Users,
  CheckCircle,
  Send,
  UserCheck,
  ClipboardList,
  LogOut,
  Activity,
  Mail,
} from 'lucide-react';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

const navConfig: Record<string, NavItem[]> = {
  admin: [
    { label: 'Dashboard',           path: '/dashboard',      icon: <LayoutDashboard size={18} /> },
    { label: 'Jobs',                path: '/jobs',           icon: <Briefcase size={18} /> },
    { label: 'All Candidates',      path: '/candidates',     icon: <Users size={18} /> },
    { label: 'Validation Queue',    path: '/validation',     icon: <CheckCircle size={18} /> },
    { label: 'Submit to Client',    path: '/submissions',    icon: <Send size={18} /> },
    { label: 'Interview Tracking',  path: '/pipeline',       icon: <Activity size={18} /> },
    { label: 'Mail Tracker',        path: '/mail-tracker',   icon: <Mail size={18} /> },
    { label: 'Users',               path: '/users',          icon: <UserCheck size={18} /> },
  ],
  kam: [
    { label: 'Dashboard',          path: '/dashboard',   icon: <LayoutDashboard size={18} /> },
    { label: 'Jobs',               path: '/jobs',        icon: <Briefcase size={18} /> },
    { label: 'Submit to Client',   path: '/submissions', icon: <Send size={18} /> },
    { label: 'Interview Tracking', path: '/pipeline',    icon: <Activity size={18} /> },
  ],
  delivery_lead: [
    { label: 'Dashboard',          path: '/dashboard',    icon: <LayoutDashboard size={18} /> },
    { label: 'JD Review Queue',    path: '/jobs',         icon: <Briefcase size={18} /> },
    { label: 'My Team',            path: '/users',        icon: <UserCheck size={18} /> },
    { label: 'Candidates',         path: '/candidates',   icon: <Users size={18} /> },
    { label: 'Validation Queue',   path: '/validation',   icon: <CheckCircle size={18} /> },
    { label: 'Submit to Client',   path: '/submissions',  icon: <Send size={18} /> },
    { label: 'Interview Tracking', path: '/pipeline',     icon: <Activity size={18} /> },
    { label: 'Mail Tracker',       path: '/mail-tracker', icon: <Mail size={18} /> },
  ],
  recruiter: [
    { label: 'Dashboard',     path: '/dashboard',    icon: <LayoutDashboard size={18} /> },
    { label: 'My JDs',        path: '/jobs',         icon: <Briefcase size={18} /> },
    { label: 'My Candidates', path: '/candidates',   icon: <ClipboardList size={18} /> },
    { label: 'Mail Tracker',  path: '/mail-tracker', icon: <Mail size={18} /> },
  ],
};

const roleLabels: Record<string, string> = {
  admin:         'Admin',
  kam:      'KAM',
  recruiter:     'Recruiter',
  delivery_lead: 'Delivery Lead',
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function Sidebar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (!user) return null;

  const navItems = navConfig[user.role] ?? [];

  const isActive = (path: string) => {
    if (path === '/dashboard') return location.pathname === '/dashboard';
    return location.pathname.startsWith(path);
  };

  return (
    <div
      className="flex flex-col h-screen"
      style={{ width: 240, minWidth: 240, backgroundColor: '#1a2744' }}
    >
      {/* Logo */}
      <div className="px-4 py-4 border-b border-white/10 flex items-center justify-center">
        <img
          src="/logo.jpg"
          alt="Joules to Watts"
          className="object-contain"
          style={{ maxHeight: 56, maxWidth: 192 }}
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto scrollbar-thin">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest px-3 mb-3">
          Navigation
        </p>
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.path + item.label}>
              <button
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 text-left ${isActive(item.path)
                    ? 'text-white shadow-lg'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                style={
                  isActive(item.path)
                    ? { backgroundColor: '#3b82f6' }
                    : {}
                }
              >
                <span className="flex-shrink-0">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* User Profile + Logout */}
      <div className="px-3 py-4 border-t border-white/10">
        <div className="flex items-center gap-3 px-3 py-2 mb-2">
          <div
            className="flex items-center justify-center rounded-full text-white text-xs font-bold flex-shrink-0"
            style={{ width: 36, height: 36, backgroundColor: '#3b82f6' }}
          >
            {getInitials(user.name)}
          </div>
          <div className="overflow-hidden">
            <p className="text-white text-sm font-semibold truncate">{user.name}</p>
            <p className="text-blue-300 text-xs truncate">{roleLabels[user.role] ?? user.role}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-red-400 hover:bg-red-400/10 transition-all duration-150"
        >
          <LogOut size={18} />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
}
