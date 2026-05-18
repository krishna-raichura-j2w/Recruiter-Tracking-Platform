import { useAuth } from '../context/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Briefcase, Users, CheckCircle, Send,
  UserCheck, ClipboardList, LogOut, Activity,
  Building2, BarChart2, GitBranch, TrendingUp, Settings, Trophy,
  ChevronRight, X, Menu,
} from 'lucide-react';
import { useState } from 'react';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  highlight?: boolean;
}
interface NavGroup {
  section?: string;
  items: NavItem[];
}

const navConfig: Record<string, NavGroup[]> = {
  admin: [
    { items: [{ label: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard size={16} /> }] },
    {
      section: 'Recruitment',
      items: [
        { label: 'Jobs',             path: '/jobs',        icon: <Briefcase size={16} /> },
        { label: 'All Candidates',   path: '/candidates',  icon: <Users size={16} /> },
        { label: 'Validation Queue', path: '/validation',  icon: <CheckCircle size={16} /> },
        { label: 'Submit to Client', path: '/submissions', icon: <Send size={16} /> },
      ],
    },
    {
      section: 'Pipeline',
      items: [
        { label: 'Interview Tracking', path: '/pipeline',      icon: <Activity size={16} /> },
        { label: 'Mail Tracker',       path: '/mail-tracker',  icon: <Send size={16} /> },
        { label: 'Recruiter Story',    path: '/followup',      icon: <GitBranch size={16} /> },
      ],
    },
    {
      section: 'Management',
      items: [
        { label: 'Clients',          path: '/clients',       icon: <Building2 size={16} /> },
        { label: 'Demand Status',    path: '/demand-status', icon: <TrendingUp size={16} /> },
        { label: 'Export / Reports', path: '/export',        icon: <BarChart2 size={16} /> },
        { label: 'Leaderboard',      path: '/leaderboard',   icon: <Trophy size={16} /> },
        { label: 'Users',            path: '/users',         icon: <UserCheck size={16} /> },
        { label: 'Form Builder',     path: '/form-builder',  icon: <Settings size={16} /> },
      ],
    },
  ],
  kam: [
    { items: [{ label: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard size={16} /> }] },
    {
      section: 'My Work',
      items: [
        { label: 'Jobs',               path: '/jobs',         icon: <Briefcase size={16} />, highlight: true },
        { label: 'Submit to Client',   path: '/submissions',  icon: <Send size={16} /> },
        { label: 'Interview Tracking', path: '/pipeline',     icon: <Activity size={16} /> },
      ],
    },
    {
      section: 'Clients',
      items: [
        { label: 'Clients',           path: '/clients',       icon: <Building2 size={16} /> },
        { label: 'Demand Status',     path: '/demand-status', icon: <TrendingUp size={16} /> },
        { label: 'Export / Reports',  path: '/export',        icon: <BarChart2 size={16} /> },
      ],
    },
  ],
  delivery_lead: [
    { items: [{ label: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard size={16} /> }] },
    {
      section: 'My Workflow',
      items: [
        { label: 'JD Review Queue',  path: '/jobs',        icon: <Briefcase size={16} />, highlight: true },
        { label: 'My Team',          path: '/users',       icon: <UserCheck size={16} /> },
        { label: 'Candidates',       path: '/candidates',  icon: <Users size={16} /> },
        { label: 'Validation Queue', path: '/validation',  icon: <CheckCircle size={16} /> },
        { label: 'Submit to Client', path: '/submissions', icon: <Send size={16} /> },
      ],
    },
    {
      section: 'Tracking',
      items: [
        { label: 'Interview Tracking', path: '/pipeline',      icon: <Activity size={16} /> },
        { label: 'Demand Status',      path: '/demand-status', icon: <TrendingUp size={16} /> },
        { label: 'Export / Reports',   path: '/export',        icon: <BarChart2 size={16} /> },
      ],
    },
    {
      section: 'Clients',
      items: [
        { label: 'Clients', path: '/clients', icon: <Building2 size={16} /> },
      ],
    },
  ],
  recruiter: [
    { items: [{ label: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard size={16} /> }] },
    {
      section: 'My Work',
      items: [
        { label: 'My JDs',          path: '/jobs',         icon: <Briefcase size={16} />, highlight: true },
        { label: 'My Candidates',   path: '/candidates',   icon: <ClipboardList size={16} /> },
        { label: 'Mail Tracker',    path: '/mail-tracker', icon: <Send size={16} /> },
        { label: 'Recruiter Story', path: '/followup',     icon: <GitBranch size={16} /> },
      ],
    },
  ],
};

const roleLabels: Record<string, { title: string; sub: string; color: string }> = {
  admin:         { title: 'Admin',         sub: 'Full system access',           color: '#EF4444' },
  kam:           { title: 'KAM',           sub: 'Manages client demands',       color: '#A855F7' },
  delivery_lead: { title: 'Delivery Lead', sub: 'Manages recruitment pipeline', color: '#F97316' },
  recruiter:     { title: 'Recruiter',     sub: 'Sources & screens candidates', color: '#3B82F6' },
};

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (!user) return null;

  const groups = navConfig[user.role] ?? [];
  const roleInfo = roleLabels[user.role];

  const isActive = (path: string) =>
    path === '/dashboard' ? location.pathname === '/dashboard' : location.pathname.startsWith(path);

  const handleNav = (path: string) => {
    navigate(path);
    onClose?.();
  };

  return (
    <div className="flex flex-col h-full" style={{ background: 'linear-gradient(180deg, #0B1437 0%, #0F1B3F 100%)' }}>
      {/* Logo + close (mobile) */}
      <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between flex-shrink-0">
        <img src="/logo.jpg" alt="J2W" className="object-contain" style={{ maxHeight: 44, maxWidth: 150 }} />
        {onClose && (
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors">
            <X size={18} />
          </button>
        )}
      </div>

      {/* Role context */}
      <div className="mx-4 mt-4 mb-2 px-3 py-2.5 rounded-xl flex-shrink-0" style={{ background: 'rgba(255,255,255,0.05)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-[11px] font-black flex-shrink-0"
            style={{ backgroundColor: roleInfo?.color ?? '#3B82F6' }}>
            {getInitials(user.name)}
          </div>
          <div className="min-w-0">
            <p className="text-white text-xs font-bold truncate leading-tight">{user.name}</p>
            <p className="text-[11px] truncate leading-tight" style={{ color: roleInfo?.color ?? '#3B82F6' }}>
              {roleInfo?.title ?? user.role}
            </p>
          </div>
        </div>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 px-3 py-2 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
        {groups.map((group, gi) => (
          <div key={gi} className={gi > 0 ? 'mt-4' : ''}>
            {group.section && (
              <p className="text-[10px] font-bold uppercase tracking-widest px-3 mb-1.5"
                style={{ color: 'rgba(255,255,255,0.25)' }}>
                {group.section}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map(item => {
                const active = isActive(item.path);
                return (
                  <li key={item.path + item.label}>
                    <button
                      onClick={() => handleNav(item.path)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 text-left group"
                      style={active
                        ? { backgroundColor: '#2563EB', color: '#FFFFFF' }
                        : { color: 'rgba(255,255,255,0.55)' }
                      }
                      onMouseEnter={e => { if (!active) { const el = e.currentTarget as HTMLElement; el.style.backgroundColor = 'rgba(255,255,255,0.07)'; el.style.color = '#FFFFFF'; }}}
                      onMouseLeave={e => { if (!active) { const el = e.currentTarget as HTMLElement; el.style.backgroundColor = 'transparent'; el.style.color = 'rgba(255,255,255,0.55)'; }}}
                    >
                      <span className="flex-shrink-0 opacity-80">{item.icon}</span>
                      <span className="flex-1 leading-none">{item.label}</span>
                      {item.highlight && !active && (
                        <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400" />
                      )}
                      {active && <ChevronRight size={12} className="flex-shrink-0 opacity-60" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 pb-4 border-t border-white/8 pt-3 flex-shrink-0">
        <p className="text-[10px] px-3 mb-2 leading-relaxed" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {roleInfo?.sub}
        </p>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150"
          style={{ color: 'rgba(255,255,255,0.4)' }}
          onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.backgroundColor = 'rgba(239,68,68,0.12)'; el.style.color = '#FCA5A5'; }}
          onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.backgroundColor = 'transparent'; el.style.color = 'rgba(255,255,255,0.4)'; }}
        >
          <LogOut size={15} />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
}

export { SidebarContent };

export default function Sidebar() {
  return (
    <div className="hidden lg:flex flex-col h-screen flex-shrink-0" style={{ width: 248, minWidth: 248 }}>
      <SidebarContent />
    </div>
  );
}

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="lg:hidden flex items-center justify-center w-9 h-9 rounded-xl transition-colors"
      style={{ color: '#64748B' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F1F5F9'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      <Menu size={20} />
    </button>
  );
}

export function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden flex">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        style={{ animation: 'fadeIn 0.2s ease' }}
      />
      {/* Drawer */}
      <div
        className="relative flex flex-col h-full"
        style={{ width: 272, animation: 'slideInLeft 0.25s ease' }}
      >
        <SidebarContent onClose={onClose} />
      </div>
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideInLeft { from { transform: translateX(-100%) } to { transform: translateX(0) } }
      `}</style>
    </div>
  );
}
