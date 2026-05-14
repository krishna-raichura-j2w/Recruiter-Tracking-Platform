import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSignal } from '../context/RealtimeContext';
import { useForm } from 'react-hook-form';
import {
  Plus, X, Sparkles, AlignLeft, Image, FileText,
  Loader2, MapPin, Users, Briefcase, ChevronRight,
  BookOpen, Clock, DollarSign, GraduationCap,
  Phone, Lock, Unlock, Pencil, Search, Calendar,
  UserCheck, Trash2,
} from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import type { Job, ParsedJD, SkillEntry } from '../types';

// ── Date helpers ─────────────────────────────────────────────────────────────
function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7)  return `${diff}d ago`;
  if (diff < 30) return `${Math.floor(diff / 7)}w ago`;
  return fmtDate(iso);
}

interface ClientOption { id: number; name: string; short_name: string | null; website_url: string | null; logo_data: string | null; }
const WORK_MODES = [
  { value: 'Remote',          label: 'Remote' },
  { value: 'Onsite',          label: 'Onsite' },
  { value: 'Hybrid (2 days)', label: 'Hybrid (2 days)' },
  { value: 'Hybrid (3 days)', label: 'Hybrid (3 days)' },
  { value: 'Flexible',        label: 'Flexible' },
];

type JobStatus  = 'all' | 'pending_review' | 'open' | 'on_hold' | 'closed';
type ExtractTab = 'text' | 'image' | 'pdf';

interface JobForm {
  client_name:        string;
  client_job_id:      string;
  demand_source:      string;
  demand_type:        string;
  demand_exclusivity: string;
  role_title:         string;
  skill_stack:   string;
  work_mode:     string;
  work_auth:     string;
  headcount:     number;
  location:      string;
  jd_summary:    string;
  min_experience:string;
  max_experience:string;
  salary_range:  string;
  deadline:      string;
}

const MODE_COLORS: Record<string, string> = {
  Remote:           'bg-green-100 text-green-700',
  Onsite:           'bg-orange-100 text-orange-700',
  'Hybrid (2 days)':'bg-blue-100 text-blue-700',
  'Hybrid (3 days)':'bg-blue-100 text-blue-700',
  Flexible:         'bg-violet-100 text-violet-700',
};
const STATUS_COLORS: Record<string, string> = {
  pending_review: 'bg-yellow-100 text-yellow-700',
  open:           'bg-emerald-100 text-emerald-700',
  on_hold:        'bg-amber-100 text-amber-700',
  closed:         'bg-slate-100 text-slate-500',
};

function normalizeWorkMode(raw: string | null | undefined): string {
  if (!raw) return '';
  const r = raw.toLowerCase();
  if (r.includes('remote'))  return 'Remote';
  if (r.includes('onsite') || r.includes('on-site') || r.includes('office')) return 'Onsite';
  if (r.includes('hybrid'))  return 'Hybrid (2 days)';
  if (r.includes('flexible') || r.includes('wfh')) return 'Flexible';
  return '';
}

function parsedOrNull(raw: string | null): ParsedJD | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as ParsedJD; } catch { return null; }
}

export default function Jobs() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs]       = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab]     = useState<JobStatus>('all');
  const [searchText, setSearchText]   = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [showModal, setShowModal]     = useState(false);
  const [editJob, setEditJob]         = useState<Job | null>(null);
  const [submitting, setSubmitting]   = useState(false);
  const [apiError, setApiError]       = useState('');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  // JD extract state
  const [extractTab,  setExtractTab]  = useState<ExtractTab>('text');
  const [extractText, setExtractText] = useState('');
  const [extractFile, setExtractFile] = useState<File | null>(null);
  const [extracting,  setExtracting]  = useState(false);
  const [extractError,setExtractError]= useState('');
  const [extracted,   setExtracted]   = useState(false);
  const [parsedResult,setParsedResult]= useState<ParsedJD | null>(null);
  const [rawJdText,   setRawJdText]   = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [togglingJobId, setTogglingJobId] = useState<number | null>(null);

  // Delivery lead allocation (KAM only) + KAM selection (DL only)
  const [deliveryLeads, setDeliveryLeads]           = useState<{ id: number; name: string; clients: string[] }[]>([]);
  const [selectedDeliveryLeadId, setSelectedDeliveryLeadId] = useState<number | ''>('');
  const [kams, setKams]                             = useState<{ id: number; name: string }[]>([]);
  const [selectedKamId, setSelectedKamId]           = useState<number | ''>('');
  const [clientOptions, setClientOptions]           = useState<ClientOption[]>([]);
  const [businessHeads, setBusinessHeads]           = useState<{ id: number; name: string }[]>([]);
  const [selectedBhId, setSelectedBhId]             = useState<number | ''>('');

  // DL confirm-JD modal state
  const [confirmJob, setConfirmJob]         = useState<Job | null>(null);
  const [dlTeam, setDlTeam]                 = useState<{
    id: number; name: string;
    recruiter_type: string | null;
    sourcing_load: number; calling_load: number;
  }[]>([]);
  const [selectedSourcers, setSelectedSourcers] = useState<number[]>([]);
  const [selectedCallers,  setSelectedCallers]  = useState<number[]>([]);
  const [confirming, setConfirming]         = useState(false);
  const [confirmError, setConfirmError]     = useState('');
  const [sourcingDeadline, setSourcingDeadline] = useState('');
  const [callingDeadline,  setCallingDeadline]  = useState('');
  const [sourcingTarget,   setSourcingTarget]   = useState('');

  const isAdmin        = user?.role === 'admin';
  const isKam          = user?.role === 'kam'          || user?.secondary_role === 'kam';
  const isDeliveryLead = user?.role === 'delivery_lead' || user?.secondary_role === 'delivery_lead';
  const isRecruiter    = user?.role === 'recruiter'     || user?.secondary_role === 'recruiter';
  const canCreate      = isAdmin || isKam || isDeliveryLead;

  const { register, handleSubmit, reset, setValue, formState: { errors } } =
    useForm<JobForm>({ defaultValues: { headcount: 1 } });

  const fetchJobs = () => {
    setLoading(true);
    api.get<Job[]>('/jobs')
      .then((r) => setJobs(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  const jobsSignal = useSignal('jobs');
  useEffect(() => { fetchJobs(); }, [jobsSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  const openConfirmModal = async (job: Job) => {
    setConfirmJob(job);
    setConfirmError('');
    try {
      const res = await api.get<{
        sourcers: { id: number; name: string; recruiter_type: string | null; sourcing_load: number; calling_load: number }[]
      }>('/users/team-loads');
      const team = res.data.sourcers ?? [];
      setDlTeam(team);
      // Auto-select recommended: lowest load for each type ('both' can do either)
      const sourcers = team.filter(m => m.recruiter_type === 'sourcer' || m.recruiter_type === 'both');
      const callers  = team.filter(m => m.recruiter_type === 'caller'  || m.recruiter_type === 'both');
      if (sourcers.length) {
        const rec = sourcers.reduce((a, b) => a.sourcing_load <= b.sourcing_load ? a : b);
        setSelectedSourcers([rec.id]);
      } else { setSelectedSourcers([]); }
      if (callers.length) {
        const rec = callers.reduce((a, b) => a.calling_load <= b.calling_load ? a : b);
        setSelectedCallers([rec.id]);
      } else { setSelectedCallers([]); }
    } catch {
      setDlTeam([]); setSelectedSourcers([]); setSelectedCallers([]);
    }
  };

  const toggleSelect = (id: number, list: number[], setList: (v: number[]) => void) => {
    setList(list.includes(id) ? list.filter(x => x !== id) : [...list, id]);
  };

  const handleConfirmJD = async () => {
    if (!confirmJob) return;
    if (!selectedSourcers.length) { setConfirmError('Select at least one sourcing recruiter.'); return; }
    if (!selectedCallers.length)  { setConfirmError('Select at least one calling recruiter.'); return; }
    setConfirming(true); setConfirmError('');
    try {
      await api.post(`/jobs/${confirmJob.id}/confirm`, {
        sourcer_ids:       selectedSourcers,
        caller_ids:        selectedCallers,
        sourcing_target:   sourcingTarget ? Number(sourcingTarget) : null,
        sourcing_deadline: sourcingDeadline ? new Date(sourcingDeadline).toISOString() : null,
        calling_deadline:  callingDeadline  ? new Date(callingDeadline).toISOString()  : null,
      });
      setConfirmJob(null);
      setSourcingDeadline('');
      setCallingDeadline('');
      setSourcingTarget('');
      fetchJobs();
    } catch {
      setConfirmError('Failed to confirm JD. Please try again.');
    } finally {
      setConfirming(false);
    }
  };

  // All active filters applied
  const filteredJobs = jobs
    .filter((j) => activeTab === 'all' || j.status === activeTab)
    .filter((j) => !clientFilter || j.client_name === clientFilter)
    .filter((j) => !searchText || `${j.role_title} ${j.client_name}`.toLowerCase().includes(searchText.toLowerCase()));

  // Unique clients from loaded jobs
  const clientList = [...new Set(jobs.map((j) => j.client_name))].sort();

  const handleToggleStatus = async (job: Job) => {
    const next = job.status === 'closed' ? 'open' : 'closed';
    setTogglingJobId(job.id);
    try {
      await api.patch(`/jobs/${job.id}`, { status: next });
      fetchJobs();
    } catch { /* silent */ }
    finally { setTogglingJobId(null); }
  };

  const canToggle = isAdmin || isKam || isDeliveryLead;

  const openEditModal = (job: Job) => {
    setEditJob(job);
    reset({
      client_name:        job.client_name,
      client_job_id:      job.client_job_id      ?? '',
      demand_source:      job.demand_source      ?? '',
      demand_type:        job.demand_type        ?? '',
      demand_exclusivity: job.demand_exclusivity ?? '',
      role_title:         job.role_title,
      skill_stack:   job.skill_stack   ?? '',
      work_mode:     job.work_mode     ?? '',
      work_auth:     job.work_auth     ?? '',
      headcount:     job.headcount,
      location:      job.location      ?? '',
      jd_summary:    job.jd_summary    ?? '',
      min_experience:job.min_experience != null ? String(job.min_experience) : '',
      max_experience:job.max_experience != null ? String(job.max_experience) : '',
      salary_range:  job.salary_range  ?? '',
    });
    if (job.jd_parsed) {
      try { setParsedResult(JSON.parse(job.jd_parsed)); } catch { /* ignore */ }
    }
    setRawJdText(job.jd_raw_text ?? null);
    setShowModal(true);
  };

  const openCreateModal = () => {
    setEditJob(null);
    setShowModal(true);
    setSelectedDeliveryLeadId('');
    setSelectedKamId('');
    if (isKam || isAdmin) {
      api.get<{ id: number; name: string; clients: string[] }[]>('/users/delivery-leads')
        .then(r => setDeliveryLeads(r.data))
        .catch(() => setDeliveryLeads([]));
    }
    if (isDeliveryLead || isAdmin) {
      api.get<{ id: number; name: string }[]>('/users/kams')
        .then(r => setKams(r.data))
        .catch(() => setKams([]));
    }
    api.get<ClientOption[]>('/clients')
      .then(r => setClientOptions(r.data))
      .catch(() => setClientOptions([]));
    api.get<{ id: number; name: string }[]>('/business-heads')
      .then(r => setBusinessHeads(r.data))
      .catch(() => setBusinessHeads([]));
    setSelectedBhId('');
  };

  const closeModal = () => {
    setShowModal(false); setEditJob(null); reset({ headcount: 1 }); setApiError('');
    setExtractTab('text'); setExtractText(''); setExtractFile(null);
    setExtractError(''); setExtracted(false); setParsedResult(null); setRawJdText(null);
    setSelectedDeliveryLeadId(''); setSelectedKamId(''); setSelectedBhId('');
  };

  const buildPayload = (data: JobForm) => ({
    ...data,
    client_job_id:      data.client_job_id      || null,
    demand_source:      data.demand_source      || null,
    demand_type:        data.demand_type        || null,
    demand_exclusivity: data.demand_exclusivity || null,
    work_mode:          data.work_mode          || null,
    work_auth:        data.work_auth      || null,
    skill_stack:      data.skill_stack    || null,
    location:         data.location       || null,
    jd_summary:       data.jd_summary     || null,
    salary_range:     data.salary_range   || null,
    headcount:        Number(data.headcount),
    min_experience:   data.min_experience ? Number(data.min_experience) : null,
    max_experience:   data.max_experience ? Number(data.max_experience) : null,
    jd_parsed:        parsedResult ? JSON.stringify(parsedResult) : (editJob?.jd_parsed ?? null),
    jd_raw_text:      rawJdText ?? (editJob?.jd_raw_text ?? null),
    // KAM creates: assign DL. DL creates: assign KAM (backend auto-sets DL to themselves)
    delivery_lead_id: !editJob && (isKam || isAdmin) && selectedDeliveryLeadId ? Number(selectedDeliveryLeadId) : undefined,
    kam_id:           !editJob && isDeliveryLead && selectedKamId ? Number(selectedKamId) : undefined,
    business_head_id: !editJob && selectedBhId ? Number(selectedBhId) : undefined,
    deadline:         data.deadline ? new Date(data.deadline).toISOString() : null,
  });

  const onSubmit = async (data: JobForm) => {
    setApiError('');
    // DL is mandatory for KAM-only users
    if (!editJob && isKam && !isDeliveryLead && !selectedDeliveryLeadId) {
      setApiError('Please select a Delivery Lead before creating a JD.');
      return;
    }
    // KAM is mandatory for DL-only users
    if (!editJob && isDeliveryLead && !isKam && !selectedKamId) {
      setApiError('Please select a KAM before creating a JD.');
      return;
    }
    // dual-role (KAM+DL) needs neither selector — backend auto-assigns both
    // Business Head is mandatory for all new JDs
    if (!editJob && !selectedBhId && businessHeads.length > 0) {
      setApiError('Please select a Business Head before creating a JD.');
      return;
    }
    setSubmitting(true);
    try {
      if (editJob) {
        await api.patch(`/jobs/${editJob.id}`, buildPayload(data));
      } else {
        await api.post('/jobs', buildPayload(data));
      }
      closeModal(); fetchJobs();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setApiError(msg || (editJob ? 'Failed to update job.' : 'Failed to create job.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleExtractJD = async () => {
    setExtractError('');
    if (extractTab === 'text' && !extractText.trim()) { setExtractError('Paste JD text before extracting.'); return; }
    if ((extractTab === 'image' || extractTab === 'pdf') && !extractFile) { setExtractError('Select a file before extracting.'); return; }
    setExtracting(true);
    try {
      const fd = new FormData();
      extractTab === 'text' ? fd.append('text', extractText.trim()) : fd.append('file', extractFile!);
      const res = await api.post('/jd-extract', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const p: ParsedJD = res.data.parsed;
      setParsedResult(p);
      setRawJdText((res.data.raw_text as string | null) ?? null);
      if (p.job_title)      setValue('role_title',    p.job_title);
      if (p.company)        setValue('client_name',   p.company);
      if (p.location)       setValue('location',      p.location);
      if (p.summary)        setValue('jd_summary',    p.summary);
      if (p.salary_range)   setValue('salary_range',  p.salary_range);
      if (p.min_experience != null) setValue('min_experience', String(p.min_experience));
      if (p.max_experience != null) setValue('max_experience', String(p.max_experience));
      const mode = normalizeWorkMode(p.work_mode);
      if (mode) setValue('work_mode', mode);
      if (p.required_skills?.length)
        setValue('skill_stack', p.required_skills.map((s) => s.name).join(', '));
      setExtracted(true);
    } catch {
      setExtractError('Extraction failed. Check your input and try again.');
    } finally {
      setExtracting(false);
    }
  };

  const tabs: { key: JobStatus; label: string }[] = [
    { key: 'all',            label: 'All' },
    ...(isDeliveryLead || isAdmin ? [{ key: 'pending_review' as JobStatus, label: 'Pending Review' }] : []),
    { key: 'open',           label: 'Open' },
    { key: 'on_hold',        label: 'On Hold' },
    { key: 'closed',         label: 'Closed' },
  ];
  const EXTRACT_TABS: { id: ExtractTab; label: string; icon: React.ReactNode }[] = [
    { id: 'text',  label: 'Paste Text',   icon: <AlignLeft size={13} /> },
    { id: 'image', label: 'Upload Image', icon: <Image size={13} /> },
    { id: 'pdf',   label: 'Upload PDF / Word',   icon: <FileText size={13} /> },
  ];

  return (
    <Layout title={isRecruiter ? 'My JDs' : isDeliveryLead ? 'JD Review Queue' : 'Jobs'}>

      {/* ── Client summary bar (top) ────────────────────────────────────── */}
      {clientList.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2.5">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Clients</span>
            {clientFilter && (
              <button
                onClick={() => setClientFilter('')}
                className="text-xs text-blue-500 hover:text-blue-700 font-medium flex items-center gap-1"
              >
                <X size={10} /> Clear filter
              </button>
            )}
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-thin">
            {clientList.map((client, idx) => {
              const clientJobs    = jobs.filter(j => j.client_name === client);
              const openCount     = clientJobs.filter(j => j.status === 'open').length;
              const pendingCount  = clientJobs.filter(j => j.status === 'pending_review').length;
              const totalCands    = clientJobs.reduce((s, j) => s + (j.candidate_count ?? 0), 0);
              const isActive      = clientFilter === client;
              const AVATAR_COLORS = [
                '#3b82f6','#8b5cf6','#10b981','#f59e0b',
                '#ef4444','#06b6d4','#ec4899','#6366f1',
              ];
              const color = AVATAR_COLORS[idx % AVATAR_COLORS.length];

              return (
                <button
                  key={client}
                  onClick={() => setClientFilter(isActive ? '' : client)}
                  className={`flex-shrink-0 flex items-center gap-3 px-4 py-3 rounded-2xl border-2 transition-all text-left ${
                    isActive
                      ? 'border-blue-400 bg-blue-50 shadow-sm'
                      : 'border-slate-100 bg-white hover:border-slate-300 hover:shadow-sm'
                  }`}
                  style={{ minWidth: 180 }}
                >
                  {/* Avatar */}
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black text-white flex-shrink-0"
                    style={{ backgroundColor: color }}
                  >
                    {client.slice(0, 2).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="min-w-0">
                    <p className={`text-sm font-bold truncate leading-tight ${isActive ? 'text-blue-700' : 'text-slate-800'}`}>
                      {client}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {clientJobs.length} JD{clientJobs.length !== 1 ? 's' : ''}
                      {totalCands > 0 && <span className="text-slate-400"> · {totalCands} candidates</span>}
                    </p>
                    <div className="flex gap-1 mt-1">
                      {openCount > 0 && (
                        <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                          {openCount} open
                        </span>
                      )}
                      {pendingCount > 0 && (
                        <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                          {pendingCount} pending
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Status tabs + New Job ───────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
              <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === t.key ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-500'
              }`}>
                {t.key === 'all' ? jobs.length : jobs.filter((j) => j.status === t.key).length}
              </span>
            </button>
          ))}
        </div>
        {canCreate && (
          <button onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 shadow-sm"
            style={{ backgroundColor: '#3b82f6' }}
          >
            <Plus size={16} /> New Job
          </button>
        )}
      </div>

      {/* ── Search bar ─────────────────────────────────────────────────── */}
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by role or company…"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
            />
          </div>
          {(searchText || clientFilter) && (
            <button onClick={() => { setSearchText(''); setClientFilter(''); }}
              className="text-xs px-3 py-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center gap-1">
              <X size={12} /> Clear
            </button>
          )}
          <span className="text-xs text-slate-400 ml-1">
            {filteredJobs.length} of {jobs.length} jobs
          </span>
        </div>
      </div>

      {/* Cards */}
      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[...Array(4)].map((_, i) => <div key={i} className="h-40 bg-white rounded-2xl border border-slate-100" />)}
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <Briefcase className="mx-auto mb-3 opacity-30" size={40} />
          <p className="text-sm">No jobs match your filters.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredJobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              isRecruiter={isRecruiter}
              isAdmin={isAdmin}
              isKam={isKam}
              isDeliveryLead={isDeliveryLead}
              canToggle={canToggle}
              onViewCandidates={() => navigate(`/candidates?job_id=${job.id}`)}
              onViewJD={() => setSelectedJob(job)}
              onToggleStatus={handleToggleStatus}
              onEdit={() => openEditModal(job)}
              onConfirm={() => openConfirmModal(job)}
              onDelete={async () => {
                if (!confirm(`Delete JD "${job.role_title}" (${job.client_job_id ?? ''})? This cannot be undone.`)) return;
                try {
                  await api.delete(`/jobs/${job.id}`);
                  fetchJobs();
                } catch (e: unknown) {
                  const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
                  alert(msg || 'Delete failed.');
                }
              }}
              toggling={togglingJobId === job.id}
            />
          ))}
        </div>
      )}

      {/* JD Detail Drawer */}
      {selectedJob && (
        <JDDrawer job={selectedJob} onClose={() => setSelectedJob(null)} />
      )}

      {/* DL: Confirm JD — card picker with multi-select */}
      {confirmJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 flex-shrink-0">
              <div>
                <h3 className="text-base font-bold text-slate-800">Review & Assign JD</h3>
                <p className="text-xs text-slate-400 mt-0.5">{confirmJob.role_title} · {confirmJob.client_name}</p>
              </div>
              <button onClick={() => setConfirmJob(null)} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
              <RecruiterPickerSection
                title="Sourcing Recruiters"
                subtitle="Will find and add candidates for this JD"
                accentColor="teal"
                members={dlTeam.filter(m => m.recruiter_type === 'sourcer' || m.recruiter_type === 'both')}
                allMembers={dlTeam}
                selectedIds={selectedSourcers}
                loadKey="sourcing_load"
                loadLabel="JDs"
                onToggle={(id) => toggleSelect(id, selectedSourcers, setSelectedSourcers)}
              />
              <RecruiterPickerSection
                title="Calling Recruiters"
                subtitle="Will screen and call sourced candidates"
                accentColor="blue"
                members={dlTeam.filter(m => m.recruiter_type === 'caller' || m.recruiter_type === 'both')}
                allMembers={dlTeam}
                selectedIds={selectedCallers}
                loadKey="calling_load"
                loadLabel="candidates"
                onToggle={(id) => toggleSelect(id, selectedCallers, setSelectedCallers)}
              />

              {/* Sourcing target */}
              <div className="border border-blue-100 bg-blue-50 rounded-xl p-4">
                <p className="text-xs font-bold text-blue-700 uppercase tracking-widest mb-3">Sourcing Target *</p>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Total Candidates to Source</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 20"
                    value={sourcingTarget}
                    onChange={(e) => setSourcingTarget(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 bg-white"
                  />
                  <p className="text-xs text-blue-600 mt-1.5 opacity-80">Shared target across all assigned sourcers and callers.</p>
                </div>
              </div>

              {/* Task deadlines */}
              <div className="border border-amber-100 bg-amber-50 rounded-xl p-4 space-y-3">
                <p className="text-xs font-bold text-amber-700 uppercase tracking-widest">Task Deadlines (optional)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Sourcing Deadline</label>
                    <input
                      type="datetime-local"
                      value={sourcingDeadline}
                      onChange={(e) => setSourcingDeadline(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Calling Deadline</label>
                    <input
                      type="datetime-local"
                      value={callingDeadline}
                      onChange={(e) => setCallingDeadline(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>
                <p className="text-xs text-amber-600 opacity-80">Recruiters get a 15-min warning + overdue alert if not completed in time.</p>
              </div>

              {confirmError && (
                <p className="text-red-500 text-xs bg-red-50 border border-red-100 rounded-xl px-3 py-2">{confirmError}</p>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-6 py-4 border-t border-slate-100 flex-shrink-0 bg-slate-50">
              <div className="flex-1 text-xs text-slate-500 flex items-center gap-3">
                <span className="text-teal-700 font-semibold">{selectedSourcers.length} sourcer{selectedSourcers.length !== 1 ? 's' : ''}</span>
                <span>·</span>
                <span className="text-blue-700 font-semibold">{selectedCallers.length} caller{selectedCallers.length !== 1 ? 's' : ''}</span>
                <span className="text-slate-400">selected</span>
              </div>
              <button type="button" onClick={() => setConfirmJob(null)}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-100">
                Cancel
              </button>
              <button type="button" onClick={handleConfirmJD} disabled={confirming}
                className="px-6 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-60 hover:opacity-90"
                style={{ backgroundColor: '#3b82f6' }}>
                {confirming ? 'Confirming…' : 'Confirm & Open JD'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New / Edit Job Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[93vh] overflow-y-auto scrollbar-thin">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 sticky top-0 bg-white z-10">
              <div>
                <h3 className="text-base font-bold text-slate-800">
                  {editJob ? 'Edit Job' : 'Create New Job'}
                </h3>
                {editJob && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    Posted {fmtDate(editJob.created_at)} · Last updated {timeAgo(editJob.updated_at)}
                  </p>
                )}
              </div>
              <button onClick={closeModal} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"><X size={18} /></button>
            </div>

            {/* AI JD Parse panel */}
            <div className="px-6 pt-5 pb-4 border-b border-slate-100 bg-gradient-to-br from-blue-50 to-indigo-50">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg bg-blue-100"><Sparkles size={14} className="text-blue-600" /></div>
                <span className="text-sm font-bold text-blue-700">AI JD Parser</span>
                <span className="text-xs text-slate-400 ml-1">— upload or paste a JD to auto-fill the form</span>
              </div>
              <div className="flex gap-1 mb-3 bg-white rounded-xl p-1 border border-slate-200 w-fit">
                {EXTRACT_TABS.map((t) => (
                  <button
                    key={t.id} type="button"
                    onClick={() => { setExtractTab(t.id); setExtractFile(null); setExtractError(''); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      extractTab === t.id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {t.icon}{t.label}
                  </button>
                ))}
              </div>
              {extractTab === 'text' ? (
                <textarea
                  rows={5} placeholder="Paste the full Job Description text here…"
                  value={extractText} onChange={(e) => setExtractText(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 resize-none font-mono text-slate-700 placeholder-slate-300"
                />
              ) : (
                <div
                  className="flex flex-col items-center justify-center gap-2 py-5 rounded-xl border-2 border-dashed border-slate-200 bg-white cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {extractFile ? (
                    <>
                      <div className="p-2 rounded-lg bg-blue-100">
                        {extractTab === 'pdf' ? <FileText size={18} className="text-blue-600" /> : <Image size={18} className="text-blue-600" />}
                      </div>
                      <p className="text-sm font-semibold text-blue-700">{extractFile.name}</p>
                      <p className="text-xs text-slate-400">Click to change</p>
                    </>
                  ) : (
                    <>
                      <div className="p-2 rounded-lg bg-slate-100">
                        {extractTab === 'pdf' ? <FileText size={18} className="text-slate-400" /> : <Image size={18} className="text-slate-400" />}
                      </div>
                      <p className="text-sm text-slate-500 font-medium">
                        Click to select {extractTab === 'pdf' ? 'a PDF or Word file' : 'an image'}
                      </p>
                      <p className="text-xs text-slate-400">{extractTab === 'pdf' ? '.pdf, .docx, .doc' : 'JPG, PNG, WebP, GIF'}</p>
                    </>
                  )}
                  <input ref={fileInputRef} type="file" className="hidden"
                    accept={extractTab === 'pdf' ? '.pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword' : 'image/jpeg,image/png,image/webp,image/gif'}
                    onChange={(e) => { setExtractFile(e.target.files?.[0] ?? null); setExtractError(''); }}
                  />
                </div>
              )}
              {extractError && <p className="mt-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{extractError}</p>}
              <div className="mt-3 flex items-center gap-3">
                <button type="button" onClick={handleExtractJD} disabled={extracting}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60 hover:opacity-90"
                  style={{ backgroundColor: '#2563eb' }}
                >
                  {extracting ? <><Loader2 size={14} className="animate-spin" /> Parsing…</> : <><Sparkles size={14} /> Parse JD</>}
                </button>
                {extracted && (
                  <span className="text-xs text-green-600 font-semibold bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg">
                    Form filled — review and confirm below
                  </span>
                )}
              </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">

              {/* ── Delivery Lead — KAM-only users on create ── */}
              {!editJob && (isKam || isAdmin) && !(isKam && isDeliveryLead) && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
                    <UserCheck size={13} className="text-slate-400" />
                    Assign Delivery Lead
                  </label>
                  {deliveryLeads.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No delivery leads available.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {deliveryLeads.map(dl => {
                        const selected = selectedDeliveryLeadId === dl.id;
                        return (
                          <button
                            key={dl.id}
                            type="button"
                            onClick={() => setSelectedDeliveryLeadId(selected ? '' : dl.id)}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 text-left transition-all ${
                              selected
                                ? 'border-indigo-400 bg-indigo-50'
                                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            {/* Avatar */}
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${
                              selected ? 'bg-indigo-500' : 'bg-slate-400'
                            }`}>
                              {dl.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                            </div>

                            {/* Name + clients */}
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-semibold leading-tight ${selected ? 'text-indigo-700' : 'text-slate-700'}`}>
                                {dl.name}
                              </p>
                              <p className="text-xs text-slate-400 mt-0.5 truncate">
                                {dl.clients.length > 0
                                  ? dl.clients.join(' · ')
                                  : 'No active clients'}
                              </p>
                            </div>

                            {/* Checkmark */}
                            {selected && (
                              <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center flex-shrink-0">
                                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                  <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {!selectedDeliveryLeadId && (
                    <p className="text-xs text-red-500 mt-1.5 font-medium">
                      ⚠ Delivery Lead is required — please select one above.
                    </p>
                  )}
                </div>
              )}

              {/* ── KAM selector — DL-only users creating a job ── */}
              {!editJob && isDeliveryLead && !isKam && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
                    <UserCheck size={13} className="text-slate-400" />
                    Assign KAM (Key Account Manager)
                  </label>
                  {kams.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No KAMs available.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {kams.map(kam => {
                        const selected = selectedKamId === kam.id;
                        return (
                          <button
                            key={kam.id}
                            type="button"
                            onClick={() => setSelectedKamId(selected ? '' : kam.id)}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 text-left transition-all ${
                              selected
                                ? 'border-blue-400 bg-blue-50'
                                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${
                              selected ? 'bg-blue-500' : 'bg-slate-400'
                            }`}>
                              {kam.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-semibold leading-tight ${selected ? 'text-blue-700' : 'text-slate-700'}`}>
                                {kam.name}
                              </p>
                            </div>
                            {selected && (
                              <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                  <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {!selectedKamId && (
                    <p className="text-xs text-red-500 mt-1.5 font-medium">
                      ⚠ KAM is required — please select one above.
                    </p>
                  )}
                </div>
              )}

              {/* ── Business Head ── */}
              {!editJob && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
                    <UserCheck size={13} className="text-slate-400" />
                    Business Head *
                  </label>
                  {businessHeads.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No business heads available.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {businessHeads.map(bh => {
                        const selected = selectedBhId === bh.id;
                        return (
                          <button
                            key={bh.id}
                            type="button"
                            onClick={() => setSelectedBhId(selected ? '' : bh.id)}
                            className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border-2 text-left transition-all ${
                              selected ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${selected ? 'bg-emerald-500' : 'bg-slate-400'}`}>
                              {bh.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                            </div>
                            <span className={`text-sm font-semibold ${selected ? 'text-emerald-700' : 'text-slate-700'}`}>{bh.name}</span>
                            {selected && (
                              <div className="ml-auto w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                                <svg width="8" height="7" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {!selectedBhId && businessHeads.length > 0 && (
                    <p className="text-xs text-red-500 mt-1.5 font-medium">
                      ⚠ Business Head is required — please select one above.
                    </p>
                  )}
                </div>
              )}

              {/* ── Job fields ── */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Client *</label>
                  {clientOptions.length > 0 ? (
                    <select
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                      {...register('client_name', { required: true })}
                    >
                      <option value="">Select client…</option>
                      {clientOptions.map(c => (
                        <option key={c.id} value={c.name}>{c.name}{c.short_name ? ` — ${c.short_name}` : ''}</option>
                      ))}
                    </select>
                  ) : (
                    <input type="text" placeholder="e.g. Sony"
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                      {...register('client_name', { required: true })} />
                  )}
                  {errors.client_name && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Work Mode</label>
                  <select className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" {...register('work_mode', { required: true })}>
                    <option value="">Select</option>
                    {WORK_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Role Title *</label>
                  <input type="text" placeholder="e.g. Senior Software Engineer"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                    {...register('role_title', { required: true })} />
                  {errors.role_title && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Job ID *</label>
                  <input type="text" placeholder="e.g. JD-2026-001"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 font-mono"
                    {...register('client_job_id', { required: true })} />
                  {errors.client_job_id && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Demand Source *</label>
                  <select
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                    {...register('demand_source', { required: true })}>
                    <option value="">Select source…</option>
                    {['Customer Tool', 'Email', 'WhatsApp', 'Phone Call', 'Portal', 'Referral', 'Other'].map(o => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                  {errors.demand_source && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Demand Type *</label>
                  <select
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                    {...register('demand_type', { required: true })}>
                    <option value="">Select type…</option>
                    {['New', 'Backfill', 'Replacement'].map(o => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                  {errors.demand_type && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Exclusivity *</label>
                  <select
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                    {...register('demand_exclusivity', { required: true })}>
                    <option value="">Select…</option>
                    {['Exclusive', 'Open'].map(o => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                  {errors.demand_exclusivity && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Location *</label>
                  <input type="text" placeholder="e.g. Chennai, Bangalore"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                    {...register('location', { required: true })} />
                  {errors.location && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Skill Stack *</label>
                  <input type="text" placeholder="e.g. React, TypeScript, Node.js"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                    {...register('skill_stack', { required: true })} />
                  {errors.skill_stack && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Min Exp (yrs) *</label>
                  <input type="number" min={0} placeholder="e.g. 2"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                    {...register('min_experience', { required: true })} />
                  {errors.min_experience && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Max Exp (yrs) *</label>
                  <input type="number" min={0} placeholder="e.g. 5"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                    {...register('max_experience', { required: true })} />
                  {errors.max_experience && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Headcount *</label>
                  <input type="number" min={1}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                    {...register('headcount', { required: true, min: 1 })} />
                  {errors.headcount && <p className="text-red-500 text-xs mt-1">Required (min 1)</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Salary / CTC Range</label>
                  <input type="text" placeholder="e.g. 8-12 LPA"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                    {...register('salary_range')} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1">
                    <Clock size={12} className="text-red-400" /> Deadline
                  </label>
                  <input type="datetime-local"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-50"
                    {...register('deadline')} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">JD Summary / Notes</label>
                  <textarea rows={5}
                    placeholder="Role summary, key responsibilities, what to look for in candidates…"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 resize-none"
                    {...register('jd_summary')} />
                </div>
              </div>
              {apiError && <p className="text-red-500 text-xs bg-red-50 border border-red-100 rounded-lg px-3 py-2">{apiError}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={submitting}
                  className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-60 hover:opacity-90"
                  style={{ backgroundColor: '#3b82f6' }}
                >
                  {submitting ? (editJob ? 'Saving…' : 'Creating…') : (editJob ? 'Save Changes' : 'Create Job')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}


// ── Job Card ────────────────────────────────────────────────────────────────

interface JobCardProps {
  job: Job;
  isRecruiter: boolean;
  isAdmin: boolean;
  isKam: boolean;
  isDeliveryLead: boolean;
  canToggle: boolean;
  onViewCandidates: () => void;
  onViewJD: () => void;
  onToggleStatus: (job: Job) => void;
  onEdit: () => void;
  onConfirm: () => void;
  onDelete: () => void;
  toggling: boolean;
}

function JobCard({ job, isRecruiter, isAdmin, isKam, isDeliveryLead, canToggle, onViewCandidates, onViewJD, onToggleStatus, onEdit, onConfirm, onDelete, toggling }: JobCardProps) {
  const [expanded, setExpanded] = useState(false);

  const skills = job.skill_stack
    ? job.skill_stack.split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  const visibleSkills = expanded ? skills : skills.slice(0, 4);
  const extraCount = skills.length - 4;

  const expLabel = job.min_experience != null || job.max_experience != null
    ? [job.min_experience, job.max_experience].filter((v) => v != null).join('–') + ' yrs'
    : null;

  const deadline = job.deadline ? new Date(job.deadline) : null;
  const isOvertime = deadline != null && job.status !== 'closed' && deadline < new Date();
  const deadlineLabel = deadline
    ? deadline.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className={`rounded-2xl border shadow-sm hover:shadow-md transition-shadow p-5 ${
      isOvertime ? 'bg-red-50/60 border-red-200' : 'bg-white border-slate-100'
    }`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-slate-800 leading-snug">{job.role_title}</h3>
            {job.client_job_id && (
              <span className="px-2 py-0.5 rounded-md bg-blue-50 border border-blue-100 text-blue-700 text-xs font-mono font-semibold tracking-wide flex-shrink-0">
                {job.client_job_id}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
            <span className="font-medium text-slate-500">{job.client_name}</span>
            {job.location && (
              <>
                <span className="text-slate-300">•</span>
                <MapPin size={12} className="text-slate-400 flex-shrink-0" />
                <span>{job.location}</span>
              </>
            )}
          </p>
          {(job.business_head_name || job.delivery_lead_name || (job.sourcer_names?.length > 0) || (job.caller_names?.length > 0)) && (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
              {job.business_head_name && (
                <p className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                  <UserCheck size={11} /> BH: {job.business_head_name}
                </p>
              )}
              {job.delivery_lead_name && (
                <p className="text-xs text-indigo-600 font-semibold flex items-center gap-1">
                  <UserCheck size={11} /> DL: {job.delivery_lead_name}
                </p>
              )}
              {job.sourcer_names?.length > 0 && (
                <p className="text-xs text-teal-600 font-semibold flex items-center gap-1">
                  <Users size={11} /> Sourcing: {job.sourcer_names.join(', ')}
                </p>
              )}
              {job.caller_names?.length > 0 && (
                <p className="text-xs text-blue-600 font-semibold flex items-center gap-1">
                  <Phone size={11} /> Calling: {job.caller_names.join(', ')}
                </p>
              )}
            </div>
          )}
          {deadlineLabel && (
            <div className="flex items-center gap-1.5 mt-1">
              <Clock size={11} className={isOvertime ? 'text-red-500' : 'text-slate-400'} />
              <span className={`text-xs font-semibold ${isOvertime ? 'text-red-600' : 'text-slate-500'}`}>
                Deadline: {deadlineLabel}
              </span>
              {isOvertime && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold tracking-wide animate-pulse">
                  OVERTIME
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Delivery Lead: review & assign sourcer for pending JDs */}
          {isDeliveryLead && job.status === 'pending_review' && (
            <button
              onClick={onConfirm}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-200 bg-blue-50 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-all"
            >
              <UserCheck size={13} /> Review & Assign
            </button>
          )}
          {/* Admin: delete any JD. KAM/DL: delete own pending JDs only */}
          {(isAdmin || ((isKam || isDeliveryLead) && job.status === 'pending_review')) && (
            <button
              onClick={onDelete}
              title="Delete this JD"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-200 bg-red-50 text-xs font-semibold text-red-600 hover:bg-red-100 transition-all"
            >
              <Trash2 size={13} /> Delete
            </button>
          )}
          {/* Admin, KAM, DL: edit */}
          {(isAdmin || isKam || isDeliveryLead) && (
            <button
              onClick={onEdit}
              title="Edit this job"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-all"
            >
              <Pencil size={13} /> Edit
            </button>
          )}
          {/* Toggle open/close */}
          {canToggle && job.status !== 'pending_review' && (
            <button
              onClick={() => onToggleStatus(job)}
              disabled={toggling}
              title={job.status === 'closed' ? 'Reopen this opening' : 'Close this opening'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all disabled:opacity-60 ${
                job.status === 'closed'
                  ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
                  : 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100'
              }`}
            >
              {job.status === 'closed'
                ? <><Unlock size={13} /> Reopen</>
                : <><Lock size={13} /> Close</>}
            </button>
          )}
          <button
            onClick={onViewJD}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-teal-200 bg-teal-50 text-xs font-semibold text-teal-700 hover:bg-teal-100 transition-all"
          >
            <BookOpen size={13} /> View JD
          </button>
          <button
            onClick={onViewCandidates}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all"
          >
            {isRecruiter ? 'Source Candidates' : 'View Candidates'} <ChevronRight size={13} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {job.work_mode && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${MODE_COLORS[job.work_mode] ?? 'bg-slate-100 text-slate-600'}`}>
            {job.work_mode}
          </span>
        )}
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[job.status] ?? 'bg-slate-100 text-slate-500'}`}>
          {job.status === 'pending_review' ? 'Pending Review' : job.status === 'on_hold' ? 'On Hold' : job.status.charAt(0).toUpperCase() + job.status.slice(1)}
        </span>
        {job.demand_type && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">{job.demand_type}</span>
        )}
        {job.demand_exclusivity && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${job.demand_exclusivity === 'Exclusive' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
            {job.demand_exclusivity}
          </span>
        )}
        {job.demand_source && (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-100">
            via {job.demand_source}
          </span>
        )}
        {job.salary_range && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">{job.salary_range}</span>
        )}
      </div>

      {job.jd_summary && (
        <p className={`text-sm text-slate-600 leading-relaxed mb-3 ${!expanded ? 'line-clamp-3' : ''}`}>
          {job.jd_summary}
        </p>
      )}

      {skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {visibleSkills.map((s) => (
            <span key={s} className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 font-medium">{s}</span>
          ))}
          {!expanded && extraCount > 0 && (
            <button onClick={() => setExpanded(true)}
              className="text-xs px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600 font-semibold hover:bg-blue-100 transition-colors">
              View all {skills.length} skills
            </button>
          )}
          {expanded && extraCount > 0 && (
            <button onClick={() => setExpanded(false)}
              className="text-xs px-2.5 py-1 rounded-lg bg-slate-50 text-slate-500 font-semibold hover:bg-slate-100 transition-colors">
              Show less
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 pt-2 border-t border-slate-50">
        {expLabel && <span className="font-semibold text-amber-600">Exp: {expLabel}</span>}
        <span className="flex items-center gap-1"><Users size={12} /> HC: {job.headcount}</span>
        <span className="flex items-center gap-1">
          <Briefcase size={12} />
          {job.candidate_count} sourced
          {isRecruiter && (
            <span className="text-teal-500 font-semibold ml-1">· add more anytime</span>
          )}
        </span>
        <span className="flex items-center gap-1 ml-auto">
          <Calendar size={11} />
          Posted {timeAgo(job.created_at)}
          {job.updated_at && job.updated_at !== job.created_at && (
            <span className="text-slate-300 ml-1">· updated {timeAgo(job.updated_at)}</span>
          )}
        </span>
      </div>

      {/* Task deadlines */}
      {(job.sourcing_deadline || job.calling_deadline) && (
        <div className="mt-2 pt-2 border-t border-slate-50 flex flex-wrap gap-3">
          {job.sourcing_deadline && (
            <DeadlinePill label="Sourcing" deadline={job.sourcing_deadline} color="teal" />
          )}
          {job.calling_deadline && (
            <DeadlinePill label="Calling" deadline={job.calling_deadline} color="blue" />
          )}
        </div>
      )}
    </div>
  );
}

function DeadlinePill({ label, deadline, color }: { label: string; deadline: string; color: 'teal' | 'blue' }) {
  const dt = new Date(deadline);
  const now = new Date();
  const diffMs = dt.getTime() - now.getTime();
  const isOverdue = diffMs < 0;
  const minutesLeft = Math.floor(diffMs / 60000);
  const hoursLeft = Math.floor(minutesLeft / 60);
  const daysLeft = Math.floor(hoursLeft / 24);

  let timeLabel = '';
  if (isOverdue) {
    timeLabel = 'Overdue';
  } else if (minutesLeft < 60) {
    timeLabel = `${minutesLeft}m left`;
  } else if (hoursLeft < 24) {
    timeLabel = `${hoursLeft}h left`;
  } else {
    timeLabel = `${daysLeft}d left`;
  }

  const baseColors = {
    teal: isOverdue ? 'bg-red-100 text-red-700 border-red-200' : minutesLeft < 60 ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-teal-100 text-teal-700 border-teal-200',
    blue: isOverdue ? 'bg-red-100 text-red-700 border-red-200' : minutesLeft < 60 ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-blue-100 text-blue-700 border-blue-200',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${baseColors[color]}`}>
      <Clock size={11} />
      {label}: {isOverdue ? '⚠ ' : ''}{timeLabel}
      <span className="opacity-60">·</span>
      {dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
    </span>
  );
}


// ── Recruiter Picker Section (inside confirm modal) ───────────────────────────

interface RecruiterMember {
  id: number; name: string;
  recruiter_type: string | null;
  sourcing_load: number; calling_load: number;
}

interface RecruiterPickerSectionProps {
  title: string;
  subtitle: string;
  accentColor: 'teal' | 'blue';
  members: RecruiterMember[];        // typed members for this role
  allMembers: RecruiterMember[];     // full team (fallback if no typed members)
  selectedIds: number[];
  loadKey: 'sourcing_load' | 'calling_load';
  loadLabel: string;
  onToggle: (id: number) => void;
}

function RecruiterPickerSection({
  title, subtitle, accentColor, members, allMembers,
  selectedIds, loadKey, loadLabel, onToggle,
}: RecruiterPickerSectionProps) {
  const pool = members.length > 0 ? members : allMembers;
  const sorted = [...pool].sort((a, b) => a[loadKey] - b[loadKey]);
  const minLoad = sorted[0]?.[loadKey] ?? 0;

  const initials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const accent = {
    teal: {
      border:  'border-teal-400',
      bg:      'bg-teal-50',
      check:   'bg-teal-500',
      badge:   'bg-teal-100 text-teal-700',
      label:   'text-teal-700',
      rec:     'bg-amber-50 border border-amber-200 text-amber-700',
      header:  'text-teal-700',
    },
    blue: {
      border:  'border-blue-400',
      bg:      'bg-blue-50',
      check:   'bg-blue-500',
      badge:   'bg-blue-100 text-blue-700',
      label:   'text-blue-700',
      rec:     'bg-amber-50 border border-amber-200 text-amber-700',
      header:  'text-blue-700',
    },
  }[accentColor];

  return (
    <div>
      <div className="mb-3">
        <h4 className={`text-sm font-bold ${accent.header}`}>{title}</h4>
        <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
        {members.length === 0 && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5 mt-2 inline-block">
            No members typed as this role yet — showing full team
          </p>
        )}
      </div>
      {pool.length === 0 ? (
        <p className="text-sm text-slate-400">No team members available.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2.5">
          {sorted.map((m) => {
            const selected   = selectedIds.includes(m.id);
            const isRecommended = m[loadKey] === minLoad;
            const load = m[loadKey];
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onToggle(m.id)}
                className={`relative text-left rounded-xl border-2 p-3 transition-all ${
                  selected
                    ? `${accent.border} ${accent.bg}`
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                {/* Checkmark */}
                {selected && (
                  <div className={`absolute top-2 right-2 w-5 h-5 rounded-full ${accent.check} flex items-center justify-center`}>
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )}

                {/* Avatar + name */}
                <div className="flex items-center gap-2 mb-2 pr-5">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${selected ? accent.check : 'bg-slate-400'}`}>
                    {initials(m.name)}
                  </div>
                  <span className="text-xs font-semibold text-slate-800 leading-tight">{m.name}</span>
                </div>

                {/* Type badge */}
                {m.recruiter_type && (
                  <span className={`inline-block text-xs font-semibold px-1.5 py-0.5 rounded-full mb-1.5 ${accent.badge}`}>
                    {m.recruiter_type}
                  </span>
                )}

                {/* Load */}
                <p className="text-xs text-slate-500">
                  <span className={`font-bold ${load === 0 ? 'text-slate-400' : load < 4 ? 'text-emerald-600' : load < 7 ? 'text-amber-600' : 'text-red-600'}`}>
                    {load}
                  </span>{' '}{loadLabel}
                </p>

                {/* Recommended badge */}
                {isRecommended && (
                  <span className={`mt-1.5 inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full ${accent.rec}`}>
                    ★ Recommended
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}


// ── JD Detail Card (centered overlay modal) ──────────────────────────────────

interface JDDrawerProps { job: Job; onClose: () => void; }

function JDDrawer({ job, onClose }: JDDrawerProps) {
  const [viewMode, setViewMode] = useState<'formatted' | 'original'>('formatted');

  const parsed = parsedOrNull(job.jd_parsed);

  const location  = parsed?.location  ?? job.location;
  const salaryVal = parsed?.salary_range ?? job.salary_range;
  const workMode  = parsed?.work_mode ?? job.work_mode;
  const summary   = parsed?.summary   ?? job.jd_summary;
  const company   = parsed?.company   ?? job.client_name;

  const expStr = (() => {
    const mn = parsed?.min_experience ?? job.min_experience;
    const mx = parsed?.max_experience ?? job.max_experience;
    if (mn == null && mx == null) return null;
    return [mn, mx].filter((v) => v != null).join('–') + ' yrs';
  })();

  const requiredSkills: SkillEntry[] = parsed?.required_skills?.length
    ? parsed.required_skills
    : job.skill_stack
      ? job.skill_stack.split(',').map((s) => ({ name: s.trim(), years_of_experience: null, proficiency: null }))
      : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full flex flex-col overflow-hidden"
        style={{ maxWidth: 720, maxHeight: '88vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="relative px-6 pt-6 pb-5 flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 60%, #0e4d6e 100%)' }}
        >
          {/* Close + toggle row */}
          <div className="absolute top-4 right-4 flex items-center gap-2">
            {/* Formatted / Original toggle */}
            <div className="flex items-center gap-1.5 bg-white/10 rounded-lg p-1 border border-white/15">
              <button
                onClick={() => setViewMode('formatted')}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                  viewMode === 'formatted'
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                Formatted
              </button>
              <button
                onClick={() => setViewMode('original')}
                disabled={!job.jd_raw_text}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                  viewMode === 'original'
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                Original
              </button>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-all"
            >
              <X size={18} />
            </button>
          </div>

          {/* Title */}
          <h2 className="text-xl font-bold text-white leading-tight pr-44">{job.role_title}</h2>
          <p className="text-sm text-blue-200 mt-1 font-medium">{company}</p>
          {job.created_at && (
            <p className="text-xs text-white/50 mt-0.5 flex items-center gap-1">
              <Calendar size={11} /> Posted {fmtDate(job.created_at)}
              {job.updated_at && job.updated_at !== job.created_at && (
                <span className="ml-2">· Updated {timeAgo(job.updated_at)}</span>
              )}
            </p>
          )}

          {/* Location + key meta pills */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {location && (
              <span className="flex items-center gap-1.5 text-xs font-semibold bg-white/15 text-white px-3 py-1.5 rounded-full border border-white/20">
                <MapPin size={12} /> {location}
              </span>
            )}
            {expStr && (
              <span className="flex items-center gap-1.5 text-xs font-semibold bg-white/15 text-white px-3 py-1.5 rounded-full border border-white/20">
                <Clock size={12} /> {expStr} exp
              </span>
            )}
            {workMode && (
              <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${MODE_COLORS[workMode] ?? 'bg-white/15 text-white'}`}>
                {workMode}
              </span>
            )}
            {salaryVal && (
              <span className="flex items-center gap-1.5 text-xs font-semibold bg-violet-500/30 text-violet-200 px-3 py-1.5 rounded-full border border-violet-400/30">
                <DollarSign size={12} /> {salaryVal}
              </span>
            )}
            <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${
              job.status === 'open'    ? 'bg-emerald-500/30 text-emerald-200 border border-emerald-400/30' :
              job.status === 'on_hold' ? 'bg-amber-500/30 text-amber-200 border border-amber-400/30' :
              'bg-white/10 text-white/60 border border-white/20'
            }`}>
              {job.status === 'pending_review' ? 'Pending Review' : job.status === 'on_hold' ? 'On Hold' : job.status.charAt(0).toUpperCase() + job.status.slice(1)}
            </span>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* ── Original JD view ── */}
          {viewMode === 'original' && (
            job.jd_raw_text ? (
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Original JD</p>
                <pre className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed font-sans bg-slate-50 rounded-xl p-4 border border-slate-100">
                  {job.jd_raw_text}
                </pre>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <BookOpen size={32} className="opacity-30 mb-2" />
                <p className="text-sm font-medium">No original JD text stored.</p>
                <p className="text-xs mt-1">Original text is captured when using the AI JD Parser.</p>
              </div>
            )
          )}

          {/* ── Formatted JD view ── */}
          {viewMode === 'formatted' && <>

          {/* Summary */}
          {summary && (
            <div>
              <SectionTitle>Summary</SectionTitle>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{summary}</p>
            </div>
          )}

          {/* Quick facts strip */}
          {(parsed?.employment_type || parsed?.experience_level || parsed?.department || job.headcount) && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {parsed?.experience_level && <FactChip icon={<Briefcase size={13}/>} label="Level" value={parsed.experience_level} />}
              {parsed?.employment_type  && <FactChip icon={<Clock size={13}/>}     label="Type"  value={parsed.employment_type}  />}
              {parsed?.department       && <FactChip icon={<Users size={13}/>}     label="Dept"  value={parsed.department}       />}
              {job.headcount > 0        && <FactChip icon={<Users size={13}/>}     label="Headcount" value={String(job.headcount)} />}
            </div>
          )}

          {/* Responsibilities */}
          {parsed?.responsibilities?.length ? (
            <div>
              <SectionTitle>Responsibilities</SectionTitle>
              <BulletList items={parsed.responsibilities} />
            </div>
          ) : null}

          {/* Requirements */}
          {parsed?.requirements?.length ? (
            <div>
              <SectionTitle>Requirements</SectionTitle>
              <BulletList items={parsed.requirements} />
            </div>
          ) : null}

          {/* Required Skills */}
          {requiredSkills.length > 0 && (
            <div>
              <SectionTitle>Required Skills</SectionTitle>
              <div className="flex flex-wrap gap-2">
                {requiredSkills.map((s, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-teal-50 text-teal-800 border border-teal-100">
                      {s.name}
                    </span>
                    {s.years_of_experience && <span className="text-xs text-slate-400">{s.years_of_experience}y</span>}
                    {s.proficiency && <span className="text-xs text-slate-400 italic">{s.proficiency}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preferred Skills */}
          {parsed?.preferred_skills?.length ? (
            <div>
              <SectionTitle>Preferred Skills</SectionTitle>
              <div className="flex flex-wrap gap-2">
                {parsed.preferred_skills.map((s, i) => (
                  <span key={i} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-violet-50 text-violet-800 border border-violet-100">
                    {s.name}{s.years_of_experience ? ` · ${s.years_of_experience}y` : ''}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {/* Tech Stack */}
          {parsed?.tech_stack?.length ? (
            <div>
              <SectionTitle>Tech Stack</SectionTitle>
              <div className="flex flex-wrap gap-2">
                {parsed.tech_stack.map((t) => (
                  <span key={t} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-800 border border-blue-100">{t}</span>
                ))}
              </div>
            </div>
          ) : null}

          {/* Education */}
          {parsed?.education?.length ? (
            <div>
              <SectionTitle>Education</SectionTitle>
              <div className="flex flex-wrap gap-2">
                {parsed.education.map((e) => (
                  <span key={e} className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-100">
                    <GraduationCap size={12} />{e}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {/* Recruiter contact */}
          {parsed?.recruiter_contact && (
            <div>
              <SectionTitle>Recruiter Contact</SectionTitle>
              <p className="text-sm text-slate-700 flex items-center gap-2">
                <Phone size={13} className="text-slate-400" />
                {parsed.recruiter_contact}
              </p>
            </div>
          )}

          {/* Empty state */}
          {!summary && !requiredSkills.length && !parsed?.responsibilities?.length && (
            <div className="text-center py-10 text-slate-400">
              <BookOpen size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No JD details available.</p>
              <p className="text-xs mt-1">Use the AI JD Parser when creating a job to populate this view.</p>
            </div>
          )}

          </>}
        </div>
      </div>

      {/* Click outside to close */}
      <div className="absolute inset-0 -z-10" onClick={onClose} />
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2.5">{children}</h4>
  );
}

function FactChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
      <span className="text-slate-400 flex-shrink-0">{icon}</span>
      <div>
        <p className="text-xs text-slate-400 leading-none mb-0.5">{label}</p>
        <p className="text-xs font-bold text-slate-700">{value}</p>
      </div>
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700">
          <span className="w-1.5 h-1.5 rounded-full bg-teal-500 flex-shrink-0 mt-1.5" />
          {item}
        </li>
      ))}
    </ul>
  );
}
