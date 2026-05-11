import { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import {
  Plus, X, Trash2, UserPlus, UserMinus,
  RefreshCw, Search, Briefcase, Phone, Calendar, UserCheck,
} from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import type { User, TeamLoads, TeamMemberLoad } from '../types';

interface UserForm { name: string; email: string; password: string; role: string; }

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
  const isDeliveryLead = currentUser?.role === 'delivery_lead';

  const [users, setUsers]           = useState<User[]>([]);
  const [recruiters, setRecruiters] = useState<TeamMemberLoad[]>([]);
  const [available, setAvailable]   = useState<User[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showPool, setShowPool]     = useState(false);
  const [poolSearch, setPoolSearch] = useState('');
  // Which recruiter in the pool is being assigned (shows Sourcer/Caller picker)
  const [pickingTypeFor, setPickingTypeFor] = useState<number | null>(null);
  const [showModal, setShowModal]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [actioningId, setActioningId] = useState<number | null>(null);
  const [changingRoleFor, setChangingRoleFor] = useState<number | null>(null);
  const [apiError, setApiError]     = useState('');
  const [message, setMessage]       = useState('');
  const [confirmDelete, setConfirmDelete] = useState<User | null>(null);

  // ── Account Managers (admin only) ───────────────────────────────────────────
  const [ams, setAms]           = useState<{id:number;name:string;email:string|null;phone:string|null}[]>([]);
  const [amForm, setAmForm]     = useState({ name:'', email:'', phone:'' });
  const [savingAm, setSavingAm] = useState(false);
  const [showAmForm, setShowAmForm] = useState(false);

  const fetchAms = () => {
    api.get('/account-managers').then((r: { data: {id:number;name:string;email:string|null;phone:string|null}[] }) => setAms(r.data)).catch(() => {});
  };
  const handleAddAm = async () => {
    if (!amForm.name.trim()) return;
    setSavingAm(true);
    try {
      await api.post('/account-managers', { name: amForm.name, email: amForm.email || null, phone: amForm.phone || null });
      setAmForm({ name:'', email:'', phone:'' }); setShowAmForm(false); fetchAms();
    } catch { /* ignore */ } finally { setSavingAm(false); }
  };
  const handleDeleteAm = async (id: number) => {
    await api.delete(`/account-managers/${id}`).catch(() => {});
    fetchAms();
  };

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
    const p1 = api.get<User[]>('/users').then((r) => setUsers(r.data)).catch(() => {});
    const p2 = isDeliveryLead
      ? api.get<TeamLoads>('/users/team-loads').then((r) => {
          setRecruiters((r.data.callers ?? []) as TeamMemberLoad[]);
        }).catch(() => {})
      : Promise.resolve();
    Promise.all([p1, p2]).finally(() => setLoading(false));
  }, [isDeliveryLead]);

  const fetchAvailable = () => {
    api.get<User[]>('/users', { params: { available: true } })
      .then((r) => setAvailable(r.data)).catch(() => {});
  };

  useEffect(() => { fetchAll(); fetchAms(); }, [fetchAll]);

  const handleAddToTeam = async (userId: number, recruiterType: 'sourcer' | 'caller' | 'both') => {
    setActioningId(userId);
    try {
      await api.post(`/users/${userId}/assign-pod`, { recruiter_type: recruiterType });
      setPickingTypeFor(null);
      flash(`Added as ${recruiterType}.`);
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

  const handleChangeRole = async (userId: number, type: 'sourcer' | 'caller' | 'both') => {
    setActioningId(userId);
    try {
      await api.post(`/users/${userId}/assign-pod`, { recruiter_type: type });
      setChangingRoleFor(null);
      flash(`Role updated to ${type}.`);
      fetchAll();
    } catch { flash('Failed to update role.'); }
    finally { setActioningId(null); }
  };

  const onSubmit = async (data: UserForm) => {
    setApiError(''); setSubmitting(true);
    try {
      await api.post('/users', data);
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
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-sm font-semibold text-slate-700">{recruiters.length} Recruiters</p>
            <p className="text-xs text-slate-400 mt-0.5">JD Sourcing = assigned open JDs · Calling = active candidates</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setShowPool(!showPool); if (!showPool) { setPoolSearch(''); fetchAvailable(); } }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 shadow-sm"
              style={{ backgroundColor: '#3b82f6' }}
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
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${roleColors[u.role] ?? 'bg-slate-100 text-slate-600'}`}>
                            {ROLES.find((r) => r.value === u.role)?.label ?? u.role}
                          </span>
                        </td>
                        <td className="py-3 px-5">
                          {pickingTypeFor === u.id ? (
                            <div className="flex flex-col gap-1.5 items-end">
                              <p className="text-xs text-slate-400 font-medium">Add as:</p>
                              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                <button
                                  onClick={() => handleAddToTeam(u.id, 'sourcer')}
                                  disabled={actioningId === u.id}
                                  className="px-3 py-1.5 rounded-lg bg-teal-50 text-teal-700 border border-teal-200 text-xs font-semibold hover:bg-teal-100 disabled:opacity-60 transition-colors whitespace-nowrap"
                                >
                                  <span className="flex items-center gap-1"><Briefcase size={11} /> Sourcer</span>
                                </button>
                                <button
                                  onClick={() => handleAddToTeam(u.id, 'caller')}
                                  disabled={actioningId === u.id}
                                  className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold hover:bg-blue-100 disabled:opacity-60 transition-colors whitespace-nowrap"
                                >
                                  <span className="flex items-center gap-1"><Phone size={11} /> Caller</span>
                                </button>
                                <button
                                  onClick={() => handleAddToTeam(u.id, 'both')}
                                  disabled={actioningId === u.id}
                                  className="px-3 py-1.5 rounded-lg bg-violet-50 text-violet-700 border border-violet-200 text-xs font-semibold hover:bg-violet-100 disabled:opacity-60 transition-colors whitespace-nowrap"
                                >
                                  <span className="flex items-center gap-1"><Briefcase size={11} /><Phone size={11} /> Both</span>
                                </button>
                                <button
                                  onClick={() => setPickingTypeFor(null)}
                                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 flex-shrink-0"
                                >
                                  <X size={13} />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex justify-end">
                              <button
                                onClick={() => setPickingTypeFor(u.id)}
                                disabled={actioningId === u.id}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold hover:bg-blue-100 disabled:opacity-60 transition-colors"
                              >
                                <UserPlus size={12} /> Add
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Team table */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          {loading ? (
            <div className="p-8 space-y-3 animate-pulse">
              {[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-slate-100 rounded-xl" />)}
            </div>
          ) : recruiters.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <UserPlus className="mx-auto mb-3 opacity-30" size={36} />
              <p className="text-sm font-medium">No recruiters in your team yet.</p>
              <p className="text-xs mt-1">Click "Add Recruiter" to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="text-left py-3.5 px-5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Recruiter</th>
                    <th className="text-left py-3.5 px-5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Email</th>
                    <th className="text-center py-3.5 px-5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Role</th>
                    <th className="text-center py-3.5 px-5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      <span className="flex items-center justify-center gap-1"><Briefcase size={11} /> JD Sourcing</span>
                    </th>
                    <th className="text-center py-3.5 px-5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      <span className="flex items-center justify-center gap-1"><Phone size={11} /> Calling</span>
                    </th>
                    <th className="text-left py-3.5 px-5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Workload</th>
                    <th className="py-3.5 px-5 w-16" />
                  </tr>
                </thead>
                <tbody>
                  {recruiters.map((m, i) => (
                    <tr
                      key={m.id}
                      className={`border-b border-slate-50 hover:bg-blue-50/20 transition-colors ${i % 2 === 1 ? 'bg-slate-50/30' : ''}`}
                    >
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                            style={{ backgroundColor: '#3b82f6' }}
                          >
                            {getInitials(m.name)}
                          </div>
                          <button
                            onClick={() => openActivity(m)}
                            className="font-semibold text-slate-800 hover:text-blue-600 hover:underline text-left"
                          >
                            {m.name}
                          </button>
                        </div>
                      </td>
                      <td className="py-3.5 px-5 text-slate-500">{m.email}</td>
                      <td className="py-3.5 px-5 text-center">
                        {changingRoleFor === m.id ? (
                          <div className="flex items-center justify-center gap-1 flex-wrap">
                            <button
                              onClick={() => handleChangeRole(m.id, 'sourcer')}
                              disabled={actioningId === m.id}
                              className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all disabled:opacity-60 flex items-center gap-1 ${
                                m.recruiter_type === 'sourcer' || m.recruiter_type === 'both'
                                  ? 'bg-teal-500 text-white border-teal-500'
                                  : 'bg-white text-teal-700 border-teal-200 hover:bg-teal-50'
                              }`}
                            >
                              <Briefcase size={10} /> Sourcer
                            </button>
                            <button
                              onClick={() => handleChangeRole(m.id, 'caller')}
                              disabled={actioningId === m.id}
                              className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all disabled:opacity-60 flex items-center gap-1 ${
                                m.recruiter_type === 'caller' || m.recruiter_type === 'both'
                                  ? 'bg-blue-500 text-white border-blue-500'
                                  : 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50'
                              }`}
                            >
                              <Phone size={10} /> Caller
                            </button>
                            <button
                              onClick={() => handleChangeRole(m.id, 'both')}
                              disabled={actioningId === m.id}
                              className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all disabled:opacity-60 flex items-center gap-1 ${
                                m.recruiter_type === 'both'
                                  ? 'bg-violet-500 text-white border-violet-500'
                                  : 'bg-white text-violet-700 border-violet-200 hover:bg-violet-50'
                              }`}
                            >
                              Both
                            </button>
                            <button
                              onClick={() => setChangingRoleFor(null)}
                              className="p-0.5 rounded text-slate-400 hover:text-slate-600"
                            >
                              <X size={11} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setChangingRoleFor(m.id)}
                            title="Click to change role"
                            className="group inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border transition-all hover:opacity-80 hover:shadow-sm"
                            style={m.recruiter_type === 'sourcer'
                              ? { background: '#f0fdf9', color: '#0f766e', borderColor: '#99f6e4' }
                              : m.recruiter_type === 'caller'
                              ? { background: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe' }
                              : m.recruiter_type === 'both'
                              ? { background: '#f5f3ff', color: '#6d28d9', borderColor: '#ddd6fe' }
                              : { background: '#f8fafc', color: '#94a3b8', borderColor: '#e2e8f0' }}
                          >
                            {m.recruiter_type === 'sourcer' && <Briefcase size={10} />}
                            {m.recruiter_type === 'caller' && <Phone size={10} />}
                            {m.recruiter_type === 'both' && <><Briefcase size={10} /><Phone size={10} /></>}
                            {m.recruiter_type === 'sourcer' ? 'Sourcer'
                              : m.recruiter_type === 'caller' ? 'Caller'
                              : m.recruiter_type === 'both' ? 'Both'
                              : '—'}
                          </button>
                        )}
                      </td>
                      <td className="py-3.5 px-5 text-center">
                        {m.sourcing_load > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 border border-teal-100">
                            <Briefcase size={10} /> {m.sourcing_load} {m.sourcing_load === 1 ? 'JD' : 'JDs'}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-5 text-center">
                        {m.calling_load > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                            <Phone size={10} /> {m.calling_load} {m.calling_load === 1 ? 'candidate' : 'candidates'}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-5">
                        <WorkloadBar total={m.load} max={maxLoad + 2} />
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <button
                          onClick={() => handleRemoveFromTeam(m.id)}
                          disabled={actioningId === m.id}
                          className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-60"
                          title="Remove from team"
                        >
                          <UserMinus size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

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
                      {activityMember.recruiter_type === 'sourcer' ? 'Sourcer' : activityMember.recruiter_type === 'caller' ? 'Caller' : activityMember.recruiter_type === 'both' ? 'Sourcer & Caller' : 'Recruiter'}
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

      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-slate-500">{users.length} users</p>
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
                  <th className="text-center py-3.5 px-5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="py-3.5 px-5" />
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <tr key={u.id} className={`border-b border-slate-50 hover:bg-slate-50/60 transition-colors ${i % 2 === 1 ? 'bg-slate-50/40' : ''}`}>
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                          style={{ backgroundColor: u.is_active ? '#3b82f6' : '#94a3b8' }}>
                          {getInitials(u.name)}
                        </div>
                        <span className="font-semibold text-slate-800">{u.name}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-5 text-slate-500">{u.email}</td>
                    <td className="py-3.5 px-5">
                      <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${roleColors[u.role] ?? 'bg-slate-100 text-slate-600'}`}>
                        {ROLES.find((r) => r.value === u.role)?.label ?? u.role}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-center">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-green-500' : 'bg-slate-400'}`} />
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      {u.is_active && (
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

      {/* ── Account Managers section ── */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <UserCheck size={16} className="text-emerald-500" /> Account Managers
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Manage account managers visible when creating job openings.</p>
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
          <p className="text-sm text-slate-400 py-4">No account managers added yet.</p>
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
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Password *</label>
                <input type="password" placeholder="••••••••"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400"
                  {...register('password', { required: true, minLength: 6 })} />
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
    </Layout>
  );
}
