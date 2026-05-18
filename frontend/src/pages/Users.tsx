import { useEffect, useState, useCallback, type ComponentType } from 'react';
import { useForm } from 'react-hook-form';
import {
  Plus, X, Trash2, UserPlus, UserMinus, Pencil,
  RefreshCw, Search, Briefcase, Phone, Calendar, UserCheck, KeyRound,
  Activity, Mail, FileText, Bell, Users as UsersIcon,
} from 'lucide-react';
import Layout from '../components/Layout';
import PaginationBar from '../components/PaginationBar';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import type { User, TeamLoads, TeamMemberLoad } from '../types';

interface UserForm { name: string; email: string; role: string; secondary_role?: string; }

interface TeamAssignment {
  id: number; name: string; recruiter_type: string | null;
  jobs: { job_id: number; role_title: string; client_name: string; assignment_type: string; target: number | null; actual: number }[];
}

interface ActivityEntry {
  id: number | null;
  full_name: string | null;
  status: string | null;
  job_title: string | null;
  client_name: string | null;
  sourced_at?: string | null;
  call_date?: string | null;
  outcome?: string | null;
}

const ROLES = [
  { value: 'admin',         label: 'Admin' },
  { value: 'kam',      label: 'KAM' },
  { value: 'delivery_lead', label: 'Delivery Lead' },
  { value: 'recruiter',     label: 'Recruiter' },
];

const roleColors: Record<string, string> = {
  admin:         'bg-red-100 text-red-700',
  kam:      'bg-purple-100 text-purple-700',
  delivery_lead: 'bg-orange-100 text-orange-700',
  recruiter:     'bg-blue-100 text-blue-700',
};

function getInitials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

type StatTone = 'blue' | 'green' | 'orange' | 'violet' | 'teal' | 'amber' | 'slate';
const STAT_TONE: Record<StatTone, string> = {
  blue:   'bg-blue-50 text-blue-700 border-blue-100',
  green:  'bg-emerald-50 text-emerald-700 border-emerald-100',
  orange: 'bg-orange-50 text-orange-700 border-orange-100',
  violet: 'bg-violet-50 text-violet-700 border-violet-100',
  teal:   'bg-teal-50 text-teal-700 border-teal-100',
  amber:  'bg-amber-50 text-amber-700 border-amber-100',
  slate:  'bg-slate-50 text-slate-700 border-slate-100',
};

function StatCard({
  icon: Icon, label, value, sub, tone = 'slate',
}: {
  icon: ComponentType<{ size?: number }>;
  label: string;
  value: number | string;
  sub?: string;
  tone?: StatTone;
}) {
  return (
    <div className={`px-3 py-2.5 rounded-xl border ${STAT_TONE[tone]}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={12} />
        <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{label}</span>
      </div>
      <p className="text-lg font-bold tabular-nums leading-none">{value}</p>
      {sub && <p className="text-[10px] opacity-70 mt-1">{sub}</p>}
    </div>
  );
}

function WorkloadBar({ total, max }: { total: number; max: number }) {
  const pct = Math.min(100, (total / Math.max(max, 1)) * 100);
  const color =
    total === 0 ? 'bg-slate-200'
    : total < 5  ? 'bg-emerald-400'
    : total < 9  ? 'bg-amber-400'
    : 'bg-red-400';
  const textColor =
    total === 0 ? 'text-slate-400'
    : total < 5  ? 'text-emerald-600'
    : total < 9  ? 'text-amber-600'
    : 'text-red-600';
  return (
    <div className="flex items-center gap-2 min-w-24">
      <div className="flex-1 h-1.5 rounded-full bg-slate-100">
        <div className={`h-1.5 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-bold tabular-nums ${textColor}`}>{total}</span>
    </div>
  );
}

export default function Users() {
  const { user: currentUser } = useAuth();
  const isDeliveryLead = currentUser?.role === 'delivery_lead' || currentUser?.secondary_role === 'delivery_lead';
  const isAdmin = currentUser?.role === 'admin';

  const [users, setUsers]           = useState<User[]>([]);
  const [userTotal, setUserTotal]   = useState(0);
  const [userPage, setUserPage]     = useState(1);
  const [userPerPage, setUserPerPage] = useState(20);
  const [userSearch, setUserSearch] = useState('');
  const [userSearchInput, setUserSearchInput] = useState('');
  const [recruiters, setRecruiters] = useState<TeamMemberLoad[]>([]);
  const [available, setAvailable]   = useState<User[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showPool, setShowPool]     = useState(false);
  const [poolSearch, setPoolSearch] = useState('');
  const [showModal, setShowModal]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [actioningId, setActioningId] = useState<number | null>(null);
  const [apiError, setApiError]     = useState('');
  const [message, setMessage]       = useState('');
  const [confirmDelete, setConfirmDelete] = useState<User | null>(null);

  // ── Account Managers (admin only) ───────────────────────────────────────────
  const [ams, setAms]           = useState<{id:number;name:string;email:string|null;phone:string|null}[]>([]);
  const [amForm, setAmForm]     = useState({ name:'', email:'', phone:'' });
  const [savingAm, setSavingAm] = useState(false);
  const [showAmForm, setShowAmForm] = useState(false);

  const fetchAms = () => {
    api.get('/business-heads').then((r: { data: {id:number;name:string;email:string|null;phone:string|null}[] }) => setAms(r.data)).catch(() => {});
  };
  const handleAddAm = async () => {
    if (!amForm.name.trim()) return;
    setSavingAm(true);
    try {
      await api.post('/business-heads', { name: amForm.name, email: amForm.email || null, phone: amForm.phone || null });
      setAmForm({ name:'', email:'', phone:'' }); setShowAmForm(false); fetchAms();
    } catch { /* ignore */ } finally { setSavingAm(false); }
  };
  const handleDeleteAm = async (id: number) => {
    await api.delete(`/business-heads/${id}`).catch(() => {});
    fetchAms();
  };

  // ── Admin user-details overlay (works for any role) ───────────────────────
  interface UserDetails {
    user: {
      id: number; name: string; email: string; role: string;
      recruiter_type: string | null; is_active: boolean;
      pod_lead_id: number | null; pod_lead_name: string | null;
      must_change_password: boolean;
    };
    stats: {
      jobs_created: number; jobs_created_open: number;
      jobs_as_delivery_lead: number;
      jobs_as_primary_sourcer: number; jobs_as_primary_caller: number;
      team_size: number;
      candidates_sourced: number; candidates_to_call: number; candidates_validated: number;
      calls_logged: number; submissions_as_dl: number;
      consultant_mails_sent: number;
      notifications_received: number; unread_notifications: number;
    };
    recent_jobs: { id: number; client_name: string; role_title: string; status: string | null; relation: string }[];
    recent_candidates: { id: number; full_name: string; status: string | null; job_title: string | null; client_name: string | null; relation: string }[];
    recent_calls: { id: number; candidate_id: number | null; candidate_name: string | null; job_title: string | null; client_name: string | null; outcome: string | null; call_date: string | null }[];
  }
  const [detailsFor,    setDetailsFor]    = useState<User | null>(null);
  const [detailsData,   setDetailsData]   = useState<UserDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsTab,    setDetailsTab]    = useState<'overview' | 'jobs' | 'candidates' | 'calls'>('overview');
  const [editingRoles,  setEditingRoles]  = useState(false);
  const [editRole,      setEditRole]      = useState('');
  const [editSecRole,   setEditSecRole]   = useState('');
  const [savingRoles,   setSavingRoles]   = useState(false);

  const openUserDetails = async (u: User) => {
    setDetailsFor(u);
    setDetailsData(null);
    setDetailsTab('overview');
    setEditingRoles(false);
    setDetailsLoading(true);
    try {
      const { data } = await api.get<UserDetails>(`/users/${u.id}/details`);
      setDetailsData(data);
    } catch { /* surfaced via empty state */ }
    finally { setDetailsLoading(false); }
  };

  const startEditRoles = (u: User) => {
    setEditRole(u.role);
    setEditSecRole(u.secondary_role ?? '');
    setEditingRoles(true);
  };

  const saveRoles = async () => {
    if (!detailsFor) return;
    setSavingRoles(true);
    try {
      await api.patch(`/users/${detailsFor.id}`, {
        role: editRole || undefined,
        secondary_role: editSecRole || null,
      });
      // Refresh local state
      setDetailsFor(prev => prev ? { ...prev, role: editRole, secondary_role: editSecRole || null } : prev);
      setEditingRoles(false);
      flash('Roles updated.');
      fetchAll();
    } catch { flash('Failed to update roles.'); }
    finally { setSavingRoles(false); }
  };

  // ── Edit user modal (admin) ───────────────────────────────────────────────
  const [editUserFor,    setEditUserFor]   = useState<User | null>(null);
  const [euName,         setEuName]        = useState('');
  const [euEmail,        setEuEmail]       = useState('');
  const [euRole,         setEuRole]        = useState('');
  const [euSecRole,      setEuSecRole]     = useState('');
  const [euActive,       setEuActive]      = useState(true);
  const [euSaving,       setEuSaving]      = useState(false);
  const [euError,        setEuError]       = useState('');

  const openEditUser = (u: User) => {
    setEditUserFor(u);
    setEuName(u.name);
    setEuEmail(u.email);
    setEuRole(u.role);
    setEuSecRole(u.secondary_role ?? '');
    setEuActive(u.is_active);
    setEuError('');
  };

  const handleSaveEditUser = async () => {
    if (!editUserFor) return;
    setEuSaving(true); setEuError('');
    try {
      await api.patch(`/users/${editUserFor.id}`, {
        name:           euName.trim() || undefined,
        email:          euEmail.trim() || undefined,
        role:           euRole || undefined,
        secondary_role: euSecRole || null,
        is_active:      euActive,
      });
      flash(`${euName} updated.`);
      setEditUserFor(null);
      fetchAll();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setEuError(msg || 'Failed to save changes.');
    } finally { setEuSaving(false); }
  };

  // ── Team JD Assignments (DL view) ────────────────────────────────────────
  const [teamAssignments, setTeamAssignments] = useState<TeamAssignment[]>([]);

  // ── Recruiter activity overlay ────────────────────────────────────────────
  const [activityMember, setActivityMember] = useState<TeamMemberLoad | null>(null);
  const [activityData,   setActivityData]   = useState<{ sourced: ActivityEntry[]; called: ActivityEntry[] } | null>(null);
  const [activityDate,   setActivityDate]   = useState('');
  const [activityTab,    setActivityTab]    = useState<'sourced' | 'called'>('sourced');
  const [activityLoading, setActivityLoading] = useState(false);

  const fetchActivity = useCallback(async (userId: number, date: string) => {
    setActivityLoading(true);
    setActivityDate(date);
    try {
      const params = date ? { date } : {};
      const { data } = await api.get(`/users/${userId}/activity`, { params });
      setActivityData(data as { sourced: ActivityEntry[]; called: ActivityEntry[] });
    } catch { /* ignore */ }
    finally { setActivityLoading(false); }
  }, []);

  const openActivity = (member: TeamMemberLoad) => {
    setActivityMember(member);
    setActivityTab('sourced');
    const today = new Date().toISOString().slice(0, 10);
    fetchActivity(member.id, today);
  };

  const { register, handleSubmit, reset, formState: { errors } } = useForm<UserForm>();

  const flash = (msg: string) => { setMessage(msg); setTimeout(() => setMessage(''), 3000); };

  const fetchAll = useCallback(() => {
    setLoading(true);
    const params: Record<string, string | number> = {
      skip:  (userPage - 1) * userPerPage,
      limit: userPerPage,
    };
    if (userSearch) params.search = userSearch;
    const p1 = api.get<{ items: User[]; total: number } | User[]>('/users', { params }).then((r) => {
      const resp = r.data;
      if (Array.isArray(resp)) {
        setUsers(resp);
        setUserTotal(resp.length);
      } else {
        setUsers(resp.items);
        setUserTotal(resp.total);
      }
    }).catch(() => {});
    const p2 = isDeliveryLead
      ? api.get<TeamLoads>('/users/team-loads').then((r) => {
          setRecruiters((r.data.callers ?? []) as TeamMemberLoad[]);
        }).catch(() => {})
      : Promise.resolve();
    const p3 = isDeliveryLead
      ? api.get<TeamAssignment[]>('/users/team-assignments').then((r) => setTeamAssignments(r.data)).catch(() => {})
      : Promise.resolve();
    Promise.all([p1, p2, p3]).finally(() => setLoading(false));
  }, [isDeliveryLead, userPage, userPerPage, userSearch]);

  const fetchAvailable = () => {
    api.get<User[]>('/users', { params: { available: true } })
      .then((r) => setAvailable(r.data)).catch(() => {});
  };

  useEffect(() => { fetchAll(); fetchAms(); }, [fetchAll]);
  useEffect(() => { setUserPage(1); }, [userSearch]);

  const handleAddToTeam = async (userId: number) => {
    setActioningId(userId);
    try {
      await api.post(`/users/${userId}/assign-pod`, { recruiter_type: 'both' });
      flash('Added to team.');
      fetchAll(); fetchAvailable();
    } catch { flash('Failed to add.'); }
    finally { setActioningId(null); }
  };

  const handleRemoveFromTeam = async (userId: number) => {
    setActioningId(userId);
    try {
      await api.delete(`/users/${userId}/pod`);
      flash('Recruiter removed from team.');
      fetchAll(); fetchAvailable();
    } catch { flash('Failed to remove.'); }
    finally { setActioningId(null); }
  };


  const onSubmit = async (data: UserForm) => {
    setApiError(''); setSubmitting(true);
    try {
      await api.post('/users', { ...data, secondary_role: data.secondary_role || null });
      reset(); setShowModal(false);
      flash('User created.');
      fetchAll();
    } catch { setApiError('Failed. Email may already be in use.'); }
    finally { setSubmitting(false); }
  };

  const handleDeactivate = async (user: User) => {
    setDeletingId(user.id);
    try {
      await api.delete(`/users/${user.id}`);
      flash(`${user.name} deactivated.`);
      setConfirmDelete(null); fetchAll();
    } catch { flash('Failed.'); }
    finally { setDeletingId(null); }
  };

  const handleResetPassword = async (userId: number, name: string) => {
    try {
      await api.post(`/users/${userId}/reset-password`);
      flash(`Password reset to joules@123 for ${name}.`);
    } catch { flash('Reset failed.'); }
  };

  const maxLoad = Math.max(...recruiters.map((r) => r.load), 1);
  const filteredPool = available.filter((u) =>
    u.name.toLowerCase().includes(poolSearch.toLowerCase()) ||
    u.email.toLowerCase().includes(poolSearch.toLowerCase())
  );

  // ── Delivery Lead view ────────────────────────────────────────────────────
  if (isDeliveryLead) {
    return (
      <Layout title="My Team">
        {message && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-700 font-medium">
            {message}
          </div>
        )}

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <p className="text-sm font-semibold text-slate-700">{recruiters.length} Recruiter{recruiters.length !== 1 ? 's' : ''} in your team</p>
            <p className="text-xs text-slate-400 mt-0.5">JDs = open demands assigned · Candidates = active to screen</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => { setShowPool(!showPool); if (!showPool) { setPoolSearch(''); fetchAvailable(); } }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 shadow-sm"
              style={{ backgroundColor: '#2563EB' }}
            >
              <UserPlus size={15} /> Add Recruiter
            </button>
            <button
              onClick={fetchAll}
              className="p-2.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
              title="Refresh"
            >
              <RefreshCw size={15} />
            </button>
          </div>
        </div>

        {/* Available pool panel */}
        {showPool && (
          <div className="mb-5 bg-white border border-blue-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-blue-50">
              <p className="text-sm font-bold text-blue-800">Available Recruiters</p>
              <button onClick={() => setShowPool(false)} className="p-1 rounded-lg text-blue-400 hover:text-blue-600 hover:bg-blue-100">
                <X size={16} />
              </button>
            </div>
            <div className="px-5 py-3 border-b border-slate-100">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by name or email…"
                  value={poolSearch}
                  onChange={(e) => setPoolSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                />
              </div>
            </div>
            {filteredPool.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">
                {available.length === 0 ? 'No unassigned recruiters available.' : 'No matches.'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="text-left py-3 px-5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Name</th>
                      <th className="text-left py-3 px-5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Email</th>
                      <th className="text-left py-3 px-5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Role</th>
                      <th className="py-3 px-5 w-20" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPool.map((u) => (
                      <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50/40">
                        <td className="py-3 px-5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                              style={{ backgroundColor: '#3b82f6' }}>
                              {getInitials(u.name)}
                            </div>
                            <span className="font-semibold text-slate-800">{u.name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-5 text-slate-500">{u.email}</td>
                        <td className="py-3 px-5">
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${roleColors[u.role] ?? 'bg-slate-100 text-slate-600'}`}>
                              {ROLES.find((r) => r.value === u.role)?.label ?? u.role}
                            </span>
                            {u.secondary_role && (
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full opacity-75 ${roleColors[u.secondary_role] ?? 'bg-slate-100 text-slate-600'}`}>
                                +{ROLES.find((r) => r.value === u.secondary_role)?.label ?? u.secondary_role}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-5">
                          <div className="flex justify-end">
                              <button
                                onClick={() => handleAddToTeam(u.id)}
                                disabled={actioningId === u.id}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold hover:bg-blue-100 disabled:opacity-60 transition-colors"
                              >
                                <UserPlus size={12} /> Add to Team
                              </button>
                            </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Team cards ──────────────────────────────────────────────────── */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 animate-pulse">
            {[...Array(4)].map((_, i) => <div key={i} className="h-40 bg-white rounded-2xl border border-slate-100" />)}
          </div>
        ) : recruiters.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 text-center py-20 text-slate-400">
            <UserPlus className="mx-auto mb-3 opacity-20" size={40} />
            <p className="text-sm font-semibold">No recruiters in your team yet</p>
            <p className="text-xs mt-1 text-slate-400">Click "Add Recruiter" to bring someone in</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {recruiters.map(m => {
              const MAX_LOAD = 8;
              const pct = Math.min(100, Math.round((m.load / MAX_LOAD) * 100));
              const loadColor = m.load === 0 ? '#10B981' : m.load < 4 ? '#10B981' : m.load < 7 ? '#F59E0B' : '#EF4444';
              const loadLabel = m.load === 0 ? 'Available' : m.load < 4 ? 'Light' : m.load < 7 ? 'Moderate' : 'Heavy';
              const avatarColors = ['#3B82F6','#8B5CF6','#10B981','#F59E0B','#EF4444','#06B6D4'];
              const avatarBg = avatarColors[m.id % avatarColors.length];
              return (
                <div
                  key={m.id}
                  className="bg-white rounded-2xl p-5 transition-all"
                  style={{ border: '1px solid #E8EDF3', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)'}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-11 h-11 rounded-2xl flex items-center justify-center text-sm font-black text-white flex-shrink-0"
                        style={{ background: avatarBg }}
                      >
                        {getInitials(m.name)}
                      </div>
                      <div>
                        <button
                          onClick={() => openActivity(m)}
                          className="text-sm font-bold text-slate-800 hover:text-blue-600 transition-colors text-left leading-tight"
                        >
                          {m.name}
                        </button>
                        <p className="text-[10px] text-slate-400 mt-0.5 leading-tight truncate max-w-[140px]">{m.email}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveFromTeam(m.id)}
                      disabled={actioningId === m.id}
                      title="Remove from team"
                      className="p-1.5 rounded-lg transition-colors disabled:opacity-50"
                      style={{ color: '#CBD5E1' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#EF4444'; (e.currentTarget as HTMLElement).style.background = '#FEF2F2'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#CBD5E1'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      <UserMinus size={14} />
                    </button>
                  </div>

                  {/* Load stats */}
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <div className="px-3 py-2 rounded-xl" style={{ background: '#F0FDF4', border: '1px solid #D1FAE5' }}>
                      <div className="flex items-center gap-1 mb-0.5">
                        <Briefcase size={10} className="text-emerald-500" />
                        <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">JDs Assigned</span>
                      </div>
                      <p className="text-xl font-black text-emerald-700 leading-none">{m.sourcing_load}</p>
                      <p className="text-[9px] text-emerald-500 mt-0.5">open job demands</p>
                    </div>
                    <div className="px-3 py-2 rounded-xl" style={{ background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
                      <div className="flex items-center gap-1 mb-0.5">
                        <Phone size={10} className="text-blue-500" />
                        <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wide">Candidates</span>
                      </div>
                      <p className="text-xl font-black text-blue-700 leading-none">{m.calling_load}</p>
                      <p className="text-[9px] text-blue-500 mt-0.5">active to screen</p>
                    </div>
                  </div>

                  {/* Workload bar */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Workload</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ background: `${loadColor}18`, color: loadColor }}>
                        {loadLabel}
                      </span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: '#F1F5F9' }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: loadColor }}
                      />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[9px] text-slate-400">{m.load} tasks</span>
                      <span className="text-[9px] text-slate-400">{MAX_LOAD} max capacity</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── JD Assignment Progress ──────────────────────────────────────── */}
        {isDeliveryLead && teamAssignments.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
              <Briefcase size={15} className="text-slate-400" />
              <h3 className="text-sm font-bold text-slate-700">JD Assignment Progress</h3>
            </div>
            <div className="divide-y divide-slate-50">
              {teamAssignments.filter(m => m.jobs.length > 0).map(member => (
                <div key={member.id} className="px-6 py-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                      {getInitials(member.name)}
                    </div>
                    <span className="text-sm font-semibold text-slate-800">{member.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-50 text-blue-700">
                      Recruiter
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    {member.jobs.map((j, idx) => {
                      const pct = j.target ? Math.min(100, Math.round((j.actual / j.target) * 100)) : null;
                      return (
                        <div key={idx} className="bg-slate-50 rounded-xl px-4 py-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mb-1.5">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span className="text-xs font-semibold text-slate-700 truncate">{j.role_title}</span>
                              <span className="text-xs text-slate-400 flex-shrink-0 hidden sm:inline">· {j.client_name}</span>
                            </div>
                            <span className="text-xs font-bold text-slate-700 flex-shrink-0 tabular-nums">
                              {j.actual}{j.target ? ` / ${j.target}` : ''}{pct != null ? ` (${pct}%)` : ''}
                            </span>
                          </div>
                          {j.target != null && (
                            <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${pct! >= 100 ? 'bg-emerald-500' : pct! >= 60 ? 'bg-blue-500' : 'bg-amber-400'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Recruiter Activity Overlay ─────────────────────────────────── */}
        {activityMember && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setActivityMember(null)} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">

              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                    style={{ backgroundColor: '#3b82f6' }}>
                    {getInitials(activityMember.name)}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-base">{activityMember.name}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {'Recruiter'}
                      {' · '}
                      {activityMember.sourcing_load} JDs sourced · {activityMember.calling_load} candidates calling
                    </p>
                  </div>
                </div>
                <button onClick={() => setActivityMember(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                  <X size={16} />
                </button>
              </div>

              {/* Date filter row */}
              <div className="px-6 py-3 border-b border-slate-100 flex items-center gap-2 flex-wrap flex-shrink-0 bg-slate-50/60">
                <Calendar size={13} className="text-slate-400" />
                <span className="text-xs text-slate-500 font-medium">Filter by day:</span>
                {[
                  { label: 'Today',     value: new Date().toISOString().slice(0, 10) },
                  { label: 'Yesterday', value: new Date(Date.now() - 86400000).toISOString().slice(0, 10) },
                  { label: 'All Time',  value: '' },
                ].map(opt => (
                  <button
                    key={opt.label}
                    onClick={() => fetchActivity(activityMember.id, opt.value)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                      activityDate === opt.value ? 'text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'
                    }`}
                    style={activityDate === opt.value ? { backgroundColor: '#1a2744' } : {}}
                  >
                    {opt.label}
                  </button>
                ))}
                <input
                  type="date"
                  value={activityDate}
                  onChange={e => fetchActivity(activityMember.id, e.target.value)}
                  className="ml-auto border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-600 focus:outline-none focus:border-blue-400"
                />
              </div>

              {/* Tabs */}
              <div className="flex border-b border-slate-100 px-6 flex-shrink-0">
                {(['sourced', 'called'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActivityTab(tab)}
                    className={`py-3 mr-6 text-sm font-semibold border-b-2 transition-colors capitalize ${
                      activityTab === tab
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {tab === 'sourced' ? 'Sourced' : 'Called'}
                    <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                      {activityData?.[tab]?.length ?? 0}
                    </span>
                  </button>
                ))}
              </div>

              {/* List */}
              <div className="flex-1 overflow-y-auto p-4">
                {activityLoading ? (
                  <div className="space-y-2 animate-pulse">
                    {[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-slate-100 rounded-xl" />)}
                  </div>
                ) : !activityData || activityData[activityTab].length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                    <p className="text-sm font-medium">No {activityTab} candidates {activityDate ? 'on this day' : 'yet'}.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activityData[activityTab].map((entry, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-slate-100 hover:border-slate-200 transition-colors">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                          style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}>
                          {(entry.full_name ?? '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-800 text-sm">{entry.full_name ?? '—'}</p>
                          <p className="text-xs text-slate-500 truncate">
                            {entry.job_title ?? '—'}
                            {entry.client_name && <><span className="mx-1 text-slate-300">@</span>{entry.client_name}</>}
                          </p>
                        </div>
                        <div className="flex-shrink-0 flex flex-col items-end gap-1">
                          {entry.status && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium capitalize">
                              {entry.status.replace(/_/g, ' ')}
                            </span>
                          )}
                          {activityTab === 'sourced' && entry.sourced_at && (
                            <span className="text-slate-400" style={{ fontSize: '10px' }}>
                              {new Date(entry.sourced_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })}
                            </span>
                          )}
                          {activityTab === 'called' && entry.call_date && (
                            <span className="text-slate-400" style={{ fontSize: '10px' }}>
                              {new Date(entry.call_date).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })}
                              {entry.outcome && <span className="ml-1 font-medium text-slate-500">· {entry.outcome.replace(/_/g, ' ')}</span>}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

      </Layout>
    );
  }

  // ── Admin view ─────────────────────────────────────────────────────────────
  return (
    <Layout title="User Management">
      {message && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-700 font-medium">{message}</div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search users…"
              value={userSearchInput}
              onChange={e => setUserSearchInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') setUserSearch(userSearchInput); }}
              onBlur={() => setUserSearch(userSearchInput)}
              className="pl-8 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 bg-white w-48"
            />
          </div>
          <p className="text-sm text-slate-500"><span className="font-semibold text-slate-700">{userTotal}</span> users</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 shadow-sm"
          style={{ backgroundColor: '#3b82f6' }}
        >
          <Plus size={16} /> Add User
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3 animate-pulse">
            {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-slate-100 rounded-xl" />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="text-left py-3.5 px-5 text-xs font-semibold text-slate-400 uppercase tracking-wider">User</th>
                  <th className="text-left py-3.5 px-5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Email</th>
                  <th className="text-left py-3.5 px-5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Role</th>
                  <th className="text-left py-3.5 px-5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Team (DL)</th>
                  <th className="text-center py-3.5 px-5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="py-3.5 px-5" />
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <tr key={u.id} className={`border-b border-slate-50 hover:bg-slate-50/60 transition-colors ${i % 2 === 1 ? 'bg-slate-50/40' : ''}`}>
                    <td className="py-3.5 px-5">
                      <button
                        onClick={() => openUserDetails(u)}
                        className="flex items-center gap-3 group text-left"
                        title="View full activity"
                      >
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                          style={{ backgroundColor: u.is_active ? '#3b82f6' : '#94a3b8' }}>
                          {getInitials(u.name)}
                        </div>
                        <span className="font-semibold text-slate-800 group-hover:text-blue-600 group-hover:underline">{u.name}</span>
                      </button>
                    </td>
                    <td className="py-3.5 px-5 text-slate-500">{u.email}</td>
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${roleColors[u.role] ?? 'bg-slate-100 text-slate-600'}`}>
                          {ROLES.find((r) => r.value === u.role)?.label ?? u.role}
                        </span>
                        {u.secondary_role && (
                          <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full opacity-75 ${roleColors[u.secondary_role] ?? 'bg-slate-100 text-slate-600'}`}>
                            +{ROLES.find((r) => r.value === u.secondary_role)?.label ?? u.secondary_role}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-5">
                      {u.pod_lead_name ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-orange-50 text-orange-700 border border-orange-100">
                          <UsersIcon size={10} /> {u.pod_lead_name}
                        </span>
                      ) : u.role === 'recruiter' ? (
                        <span className="text-xs text-slate-400 italic">Unassigned</span>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-5 text-center">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-green-500' : 'bg-slate-400'}`} />
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      {isAdmin && (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEditUser(u)}
                            title="Edit user"
                            className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={() => handleResetPassword(u.id, u.name)}
                            title="Reset password to joules@123"
                            className="p-2 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                          >
                            <KeyRound size={15} />
                          </button>
                          <button
                            onClick={() => setConfirmDelete(u)}
                            disabled={deletingId === u.id}
                            title={u.is_active ? 'Deactivate user' : 'Activate user'}
                            className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-60"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      )}
                      {u.is_active && !isAdmin && (
                        <button
                          onClick={() => setConfirmDelete(u)}
                          disabled={deletingId === u.id}
                          className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-60"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {userTotal > userPerPage && (
        <PaginationBar
          page={userPage}
          total={userTotal}
          perPage={userPerPage}
          onPageChange={setUserPage}
          onPerPageChange={p => { setUserPerPage(p); setUserPage(1); }}
          loading={loading}
        />
      )}

      {/* ── Account Managers section ── */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <UserCheck size={16} className="text-emerald-500" /> Business Heads
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Manage business heads visible when creating job openings.</p>
          </div>
          <button
            onClick={() => setShowAmForm(v => !v)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-white text-xs font-semibold hover:opacity-90"
            style={{ backgroundColor: '#059669' }}
          >
            <Plus size={13} /> Add
          </button>
        </div>

        {showAmForm && (
          <div className="mb-4 bg-white rounded-2xl border border-emerald-100 p-4 flex flex-wrap gap-3 items-end shadow-sm">
            <div className="flex-1 min-w-32">
              <label className="block text-xs font-semibold text-slate-500 mb-1">Name *</label>
              <input type="text" placeholder="e.g. Priya Nair" value={amForm.name}
                onChange={e => setAmForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-emerald-400" />
            </div>
            <div className="flex-1 min-w-32">
              <label className="block text-xs font-semibold text-slate-500 mb-1">Email</label>
              <input type="email" placeholder="priya@j2w.com" value={amForm.email}
                onChange={e => setAmForm(f => ({ ...f, email: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-emerald-400" />
            </div>
            <div className="flex-1 min-w-32">
              <label className="block text-xs font-semibold text-slate-500 mb-1">Phone</label>
              <input type="text" placeholder="9876543210" value={amForm.phone}
                onChange={e => setAmForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-emerald-400" />
            </div>
            <button onClick={handleAddAm} disabled={savingAm || !amForm.name.trim()}
              className="px-4 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-60"
              style={{ backgroundColor: '#059669' }}>
              {savingAm ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setShowAmForm(false)} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100">
              <X size={14} />
            </button>
          </div>
        )}

        {ams.length === 0 ? (
          <p className="text-sm text-slate-400 py-4">No business heads added yet.</p>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="text-left py-3 px-5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Name</th>
                  <th className="text-left py-3 px-5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Email</th>
                  <th className="text-left py-3 px-5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Phone</th>
                  <th className="py-3 px-5 w-12" />
                </tr>
              </thead>
              <tbody>
                {ams.map(am => (
                  <tr key={am.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="py-3 px-5 font-semibold text-slate-800">{am.name}</td>
                    <td className="py-3 px-5 text-slate-500">{am.email ?? '—'}</td>
                    <td className="py-3 px-5 text-slate-500">{am.phone ?? '—'}</td>
                    <td className="py-3 px-5 text-right">
                      <button onClick={() => handleDeleteAm(am.id)}
                        className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-800">Add New User</h3>
              <button onClick={() => { setShowModal(false); reset(); setApiError(''); }}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Full Name *</label>
                <input type="text" placeholder="Priya Sharma"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400"
                  {...register('name', { required: true })} />
                {errors.name && <p className="text-red-500 text-xs mt-1">Required</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email *</label>
                <input type="email" placeholder="priya@j2w.com"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400"
                  {...register('email', { required: true })} />
                {errors.email && <p className="text-red-500 text-xs mt-1">Required</p>}
              </div>
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-100 text-xs text-amber-700">
                <KeyRound size={13} className="flex-shrink-0" />
                Default password: <span className="font-bold font-mono">joules@123</span> — user must change on first login.
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Role *</label>
                <select className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400"
                  {...register('role', { required: true })}>
                  <option value="">Select role…</option>
                  {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                {errors.role && <p className="text-red-500 text-xs mt-1">Required</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Secondary Role <span className="font-normal text-slate-400">(optional)</span></label>
                <select className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400"
                  {...register('secondary_role')}>
                  <option value="">None</option>
                  {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <p className="text-xs text-slate-400 mt-1">e.g. a KAM who also acts as Delivery Lead</p>
              </div>
              {apiError && <p className="text-red-500 text-xs bg-red-50 border border-red-100 rounded-lg px-3 py-2">{apiError}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowModal(false); reset(); setApiError(''); }}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={submitting}
                  className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-60"
                  style={{ backgroundColor: '#3b82f6' }}>
                  {submitting ? 'Creating…' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── User Details Overlay (admin) ────────────────────────────────── */}
      {detailsFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDetailsFor(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden">

            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                  style={{ backgroundColor: detailsFor.is_active ? '#3b82f6' : '#94a3b8' }}>
                  {getInitials(detailsFor.name)}
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-base">{detailsFor.name}</h3>
                  <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                    <span>{detailsFor.email}</span>
                    <span className="text-slate-300">·</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${roleColors[detailsFor.role] ?? 'bg-slate-100 text-slate-600'}`}>
                      {ROLES.find(r => r.value === detailsFor.role)?.label ?? detailsFor.role}
                    </span>
                    {detailsData?.user.pod_lead_name && (
                      <>
                        <span className="text-slate-300">·</span>
                        <span>Reports to <b className="text-slate-600">{detailsData.user.pod_lead_name}</b></span>
                      </>
                    )}
                  </p>
                </div>
              </div>
              <button onClick={() => setDetailsFor(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                <X size={16} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-100 px-6 flex-shrink-0">
              {([
                { key: 'overview'   as const, label: 'Overview',           icon: Activity,  count: undefined },
                { key: 'jobs'       as const, label: 'Recent Jobs',        icon: Briefcase, count: detailsData?.recent_jobs.length },
                { key: 'candidates' as const, label: 'Recent Candidates',  icon: UsersIcon, count: detailsData?.recent_candidates.length },
                { key: 'calls'      as const, label: 'Recent Calls',       icon: Phone,     count: detailsData?.recent_calls.length },
              ]).map(t => (
                <button
                  key={t.key}
                  onClick={() => setDetailsTab(t.key)}
                  className={`py-3 mr-5 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                    detailsTab === t.key ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <t.icon size={13} /> {t.label}
                  {typeof t.count === 'number' && (
                    <span className="ml-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">{t.count}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5">
              {detailsLoading ? (
                <div className="space-y-2 animate-pulse">
                  {[...Array(6)].map((_, i) => <div key={i} className="h-14 bg-slate-100 rounded-xl" />)}
                </div>
              ) : !detailsData ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <p className="text-sm font-medium">Could not load details.</p>
                </div>
              ) : detailsTab === 'overview' ? (
                <div className="space-y-5">
                  {/* ── Role Editor (admin only) ─────────────────── */}
                  {isAdmin && (
                    <div className="border border-slate-200 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Roles</p>
                        {!editingRoles ? (
                          <button
                            onClick={() => startEditRoles(detailsFor!)}
                            className="text-xs font-semibold text-blue-600 hover:text-blue-800 px-2.5 py-1 rounded-lg hover:bg-blue-50 transition-colors"
                          >
                            Edit
                          </button>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              onClick={() => setEditingRoles(false)}
                              className="text-xs font-semibold text-slate-500 hover:text-slate-700 px-2.5 py-1 rounded-lg hover:bg-slate-100 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={saveRoles}
                              disabled={savingRoles}
                              className="text-xs font-semibold text-white px-3 py-1 rounded-lg disabled:opacity-60 transition-colors"
                              style={{ backgroundColor: '#3b82f6' }}
                            >
                              {savingRoles ? 'Saving…' : 'Save'}
                            </button>
                          </div>
                        )}
                      </div>
                      {editingRoles ? (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Primary Role *</label>
                            <select
                              value={editRole}
                              onChange={e => setEditRole(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400"
                            >
                              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Secondary Role <span className="font-normal text-slate-400">(optional)</span></label>
                            <select
                              value={editSecRole}
                              onChange={e => setEditSecRole(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400"
                            >
                              <option value="">None</option>
                              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                            </select>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${roleColors[detailsFor?.role ?? ''] ?? 'bg-slate-100 text-slate-600'}`}>
                            {ROLES.find(r => r.value === detailsFor?.role)?.label ?? detailsFor?.role}
                          </span>
                          {detailsFor?.secondary_role && (
                            <>
                              <span className="text-slate-300 text-xs">+</span>
                              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${roleColors[detailsFor.secondary_role] ?? 'bg-slate-100 text-slate-600'}`}>
                                {ROLES.find(r => r.value === detailsFor.secondary_role)?.label ?? detailsFor.secondary_role}
                                <span className="ml-1 text-[10px] opacity-60">(secondary)</span>
                              </span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Identity card */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <StatCard icon={UserCheck} label="Status" value={detailsData.user.is_active ? 'Active' : 'Inactive'} tone={detailsData.user.is_active ? 'green' : 'slate'} />
                    {detailsData.stats.team_size > 0 && (
                      <StatCard icon={UsersIcon} label="Team Size" value={detailsData.stats.team_size} tone="orange" />
                    )}
                    {detailsData.user.must_change_password && (
                      <StatCard icon={KeyRound} label="Password" value="Must reset" tone="amber" />
                    )}
                  </div>

                  {/* Activity numbers — non-zero only */}
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Activity</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {detailsData.stats.jobs_created > 0 && (
                        <StatCard icon={Briefcase} label="Jobs Created" value={detailsData.stats.jobs_created} sub={`${detailsData.stats.jobs_created_open} open`} tone="blue" />
                      )}
                      {detailsData.stats.jobs_as_delivery_lead > 0 && (
                        <StatCard icon={Briefcase} label="Jobs as DL" value={detailsData.stats.jobs_as_delivery_lead} tone="orange" />
                      )}
                      {(detailsData.stats.jobs_as_primary_sourcer > 0 || detailsData.stats.jobs_as_primary_caller > 0) && (
                        <StatCard icon={Briefcase} label="Jobs Assigned" value={Math.max(detailsData.stats.jobs_as_primary_sourcer, detailsData.stats.jobs_as_primary_caller)} tone="blue" />
                      )}
                      {detailsData.stats.candidates_sourced > 0 && (
                        <StatCard icon={UsersIcon} label="Candidates Sourced" value={detailsData.stats.candidates_sourced} tone="teal" />
                      )}
                      {detailsData.stats.candidates_to_call > 0 && (
                        <StatCard icon={Phone} label="Candidates to Call" value={detailsData.stats.candidates_to_call} tone="blue" />
                      )}
                      {detailsData.stats.candidates_validated > 0 && (
                        <StatCard icon={UserCheck} label="Candidates Validated" value={detailsData.stats.candidates_validated} tone="green" />
                      )}
                      {detailsData.stats.calls_logged > 0 && (
                        <StatCard icon={Phone} label="Calls Logged" value={detailsData.stats.calls_logged} tone="blue" />
                      )}
                      {detailsData.stats.submissions_as_dl > 0 && (
                        <StatCard icon={FileText} label="Submissions (as DL)" value={detailsData.stats.submissions_as_dl} tone="violet" />
                      )}
                      {detailsData.stats.consultant_mails_sent > 0 && (
                        <StatCard icon={Mail} label="Consultant Mails Sent" value={detailsData.stats.consultant_mails_sent} tone="amber" />
                      )}
                      <StatCard
                        icon={Bell}
                        label="Notifications"
                        value={detailsData.stats.notifications_received}
                        sub={detailsData.stats.unread_notifications > 0 ? `${detailsData.stats.unread_notifications} unread` : undefined}
                        tone="slate"
                      />
                    </div>
                    {Object.values(detailsData.stats).every(v => v === 0) && (
                      <p className="text-sm text-slate-400 text-center py-8">No activity recorded yet.</p>
                    )}
                  </div>
                </div>
              ) : detailsTab === 'jobs' ? (
                detailsData.recent_jobs.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">No jobs.</p>
                ) : (
                  <div className="space-y-2">
                    {detailsData.recent_jobs.map(j => (
                      <div key={j.id} className="flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-slate-100 hover:border-slate-200 transition-colors">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-800 text-sm">{j.role_title}</p>
                          <p className="text-xs text-slate-500 truncate">{j.client_name}</p>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium capitalize">
                          {(j.status ?? '').replace(/_/g, ' ')}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold">
                          {j.relation}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              ) : detailsTab === 'candidates' ? (
                detailsData.recent_candidates.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">No candidates.</p>
                ) : (
                  <div className="space-y-2">
                    {detailsData.recent_candidates.map(c => (
                      <div key={c.id} className="flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-slate-100">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                          style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}>
                          {(c.full_name ?? '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-800 text-sm">{c.full_name}</p>
                          <p className="text-xs text-slate-500 truncate">
                            {c.job_title ?? '—'}
                            {c.client_name && <><span className="mx-1 text-slate-300">@</span>{c.client_name}</>}
                          </p>
                        </div>
                        {c.status && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium capitalize">
                            {c.status.replace(/_/g, ' ')}
                          </span>
                        )}
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold">
                          {c.relation}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              ) : ( /* calls */
                detailsData.recent_calls.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">No calls logged.</p>
                ) : (
                  <div className="space-y-2">
                    {detailsData.recent_calls.map(call => (
                      <div key={call.id} className="flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-slate-100">
                        <Phone size={14} className="text-slate-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-800 text-sm">{call.candidate_name ?? '—'}</p>
                          <p className="text-xs text-slate-500 truncate">
                            {call.job_title ?? '—'}
                            {call.client_name && <><span className="mx-1 text-slate-300">@</span>{call.client_name}</>}
                          </p>
                        </div>
                        {call.outcome && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium capitalize">
                            {call.outcome.replace(/_/g, ' ')}
                          </span>
                        )}
                        {call.call_date && (
                          <span className="text-[10px] text-slate-400">
                            {new Date(call.call_date).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirm Deactivate */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
              <Trash2 size={20} className="text-red-500" />
            </div>
            <h3 className="text-base font-bold text-slate-800 text-center mb-2">Deactivate User?</h3>
            <p className="text-sm text-slate-500 text-center mb-6">
              <strong>{confirmDelete.name}</strong> will lose platform access.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={() => handleDeactivate(confirmDelete)} disabled={deletingId === confirmDelete.id}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 disabled:opacity-60">
                {deletingId === confirmDelete.id ? 'Deactivating…' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit User Modal ─────────────────────────────────────────────── */}
      {editUserFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0" style={{ backgroundColor: '#3b82f6' }}>
                  {editUserFor.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Edit User</h3>
                  <p className="text-xs text-slate-400">{editUserFor.email}</p>
                </div>
              </div>
              <button onClick={() => setEditUserFor(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                <X size={16} />
              </button>
            </div>

            {/* Form */}
            <div className="px-6 py-5 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Full Name *</label>
                <input
                  type="text"
                  value={euName}
                  onChange={e => setEuName(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email *</label>
                <input
                  type="email"
                  value={euEmail}
                  onChange={e => setEuEmail(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                />
              </div>

              {/* Roles */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Primary Role *</label>
                  <select
                    value={euRole}
                    onChange={e => setEuRole(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400"
                  >
                    {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Secondary Role</label>
                  <select
                    value={euSecRole}
                    onChange={e => setEuSecRole(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400"
                  >
                    <option value="">None</option>
                    {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Active toggle */}
              <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-50 border border-slate-100">
                <div>
                  <p className="text-sm font-semibold text-slate-700">Account Active</p>
                  <p className="text-xs text-slate-400">Inactive users cannot log in</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEuActive(a => !a)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${euActive ? 'bg-blue-500' : 'bg-slate-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${euActive ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {euError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{euError}</p>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
              <button
                onClick={() => setEditUserFor(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEditUser}
                disabled={euSaving || !euName.trim() || !euEmail.trim()}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-60 hover:opacity-90"
                style={{ backgroundColor: '#3b82f6' }}
              >
                {euSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
