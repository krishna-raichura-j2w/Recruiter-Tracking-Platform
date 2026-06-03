import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSignal } from '../context/RealtimeContext';
import { useForm } from 'react-hook-form';
import {
  Plus, X, Sparkles, AlignLeft, Image, FileText,
  Loader2, MapPin, Users, Briefcase, ChevronRight,
  BookOpen, Clock, DollarSign, GraduationCap,
  Phone, Lock, Unlock, Pencil, Search, Calendar,
  UserCheck, Trash2, RefreshCw, CheckCircle2,
} from 'lucide-react';
import LottieLib from 'lottie-react';
import jobVacancyAnim from '../assets/lottie-job-vacancy.json';
import Layout from '../components/Layout';
import PaginationBar from '../components/PaginationBar';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import type { Job, ParsedJD, SkillEntry } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Lottie: React.ComponentType<any> = (LottieLib as any).default ?? LottieLib;

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
  // Basic
  client_name:          string;
  role_title:           string;
  designation:          string;
  work_mode:            string;
  work_auth:            string;
  requirement_type:     string;
  // OL link
  ol_job_type:          'new' | 'existing';
  ol_job_id:            string;
  client_job_id:        string;
  // Walkin / Drive
  walkin:               boolean;
  drive:                boolean;
  start_time:           string;
  end_time:             string;
  date_from:            string;
  date_upto:            string;
  // Grouping
  // Skills & Experience & Location
  skill_stack:          string;
  min_experience:       string;
  max_experience:       string;
  location:             string;
  // Salary
  salary_from:          string;
  salary_to:            string;
  salary_range:         string;
  // Demand (MRR)
  demand_source:        string;
  demand_type:          string;
  demand_exclusivity:   string;
  // Positions & Submission
  headcount:            number;
  expected_submission:  string;
  maximum_submission:   string;
  requested_date:       string;
  requested_by:         string;
  deadline:             string;
  // Grouping
  group_name:           string;
  sub_group:            string;
  // Flags
  billable_leaves:      string;
  is_vip:               string;
  po_opportunity_mrr:   string;
  potential_gm:         string;
  key_string:           string;
  referral_amount:      string;
  // JD Content
  jd_summary:           string;
  job_responsibilities: string;
}

interface ProbingForm {
  reporting_manager_location: string;
  onsite_opportunities:       string;
  project_size:               string;
  project_count:              string;
  work_mode:                  string;
  candidate_role:             string;
  feedback_eta:               string;
  work_location:              string;
  interview_type:             string;
  role_clarity:               string;
  notice_period:              string;
  interview_rounds_count:     string;
  urgency_eta:                string;
  skill_type:                 string;
}

// Visible probing questions — `work_mode` and `work_location` are intentionally
// omitted because they duplicate JD fields (work_mode, location); on submit
// we mirror those JD values into the probing record so both DB columns stay populated.
const PROBING_QUESTIONS: { key: keyof ProbingForm; label: string; placeholder: string }[] = [
  { key: 'reporting_manager_location', label: 'Is the reporting manager located in India or overseas? (Who are the stakeholders)', placeholder: 'e.g. India' },
  { key: 'onsite_opportunities',       label: 'Are they onsite opportunities? (travel)',                                            placeholder: 'Yes / No' },
  { key: 'project_size',               label: 'What is the project size or team size?',                                            placeholder: 'e.g. 8' },
  { key: 'project_count',              label: 'Will the candidate be handling 1 project or multiple projects?',                    placeholder: 'e.g. 1' },
  { key: 'candidate_role',             label: 'Candidate Role in the project (Individual contributor/Lead)',                       placeholder: 'Individual' },
  { key: 'feedback_eta',               label: 'How soon can we expect feedback (Panel Availability)',                              placeholder: '48 hours' },
  { key: 'interview_type',             label: 'Will the interview be F1F or Onsite?',                                              placeholder: 'Virtual and F2F' },
  { key: 'role_clarity',               label: 'Role clarity (technical expertise expected by the candidate)',                      placeholder: 'e.g. Invoice Validation' },
  { key: 'notice_period',              label: 'Notice Period (Immediate/15days max.)',                                              placeholder: 'Immediate' },
  { key: 'interview_rounds_count',     label: 'How many rounds for the interview?',                                                 placeholder: '2' },
  { key: 'urgency_eta',                label: 'How urgent is the requirement – ETA?',                                               placeholder: '24 hours' },
  { key: 'skill_type',                 label: 'Skill type (generic/Niche)',                                                         placeholder: 'Generic' },
];

const emptyProbing = (): ProbingForm => ({
  reporting_manager_location: '', onsite_opportunities: '', project_size: '', project_count: '',
  work_mode: '', candidate_role: '', feedback_eta: '', work_location: '', interview_type: '',
  role_clarity: '', notice_period: '', interview_rounds_count: '', urgency_eta: '', skill_type: '',
});

const MODE_COLORS: Record<string, string> = {
  Remote:           'bg-green-100 text-green-700',
  Onsite:           'bg-orange-100 text-orange-700',
  'Hybrid (2 days)':'bg-blue-100 text-blue-700',
  'Hybrid (3 days)':'bg-blue-100 text-blue-700',
  Flexible:         'bg-violet-100 text-violet-700',
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
  const [bhFilter, setBhFilter]       = useState<number | ''>('');
  // Lightweight per-client rollup for the client bar — loaded once, independent
  // of job-list pagination so every client stays visible/switchable.
  const [clientSummary, setClientSummary] = useState<
    { client_name: string; open: number; pending: number; on_hold: number; closed: number; total: number; candidate_count: number }[]
  >([]);
  const [showModal, setShowModal]     = useState(false);
  const [editJob, setEditJob]         = useState<Job | null>(null);
  const [submitting, setSubmitting]   = useState(false);
  const [apiError, setApiError]       = useState('');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  // Probing-sheet fields — rendered inline at the top of the JD form for new jobs.
  const [probingForm, setProbingForm] = useState<ProbingForm>(emptyProbing);
  const [probingId, setProbingId]     = useState<number | null>(null);

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

  // Repost state
  const [repostJob, setRepostJob] = useState<Job | null>(null);
  const [repostDeadline, setRepostDeadline] = useState('');
  const [repostHeadcount, setRepostHeadcount] = useState(1);
  const [repostResult, setRepostResult] = useState<{ oldId: number; newId: number; roleTitle: string } | null>(null);
  const [reposting, setReposting] = useState(false);

  // Questionnaire overlay + settings modal state
  const [generatingQIds, setGeneratingQIds]         = useState<Set<number>>(new Set());
  const [questionnairePdf, setQuestionnairePdf]     = useState<{ url: string; filename: string } | null>(null);
  const [qModal, setQModal]                         = useState<{ job: Job; notes: string; saving: boolean } | null>(null);

  // Delivery lead allocation (KAM only) + KAM selection (DL only)
  const [deliveryLeads, setDeliveryLeads]           = useState<{ id: number; name: string; clients: string[] }[]>([]);
  const [selectedDeliveryLeadIds, setSelectedDeliveryLeadIds] = useState<number[]>([]);
  const [kams, setKams]                             = useState<{ id: number; name: string }[]>([]);
  const [selectedKamId, setSelectedKamId]           = useState<number | ''>('');
  const [selectedAssignDlId, setSelectedAssignDlId] = useState<number | ''>(''); // DL assigning JD to another DL
  const [clientOptions, setClientOptions]           = useState<ClientOption[]>([]);
  const [businessHeads, setBusinessHeads]           = useState<{ id: number; name: string }[]>([]);
  const [selectedBhId, setSelectedBhId]             = useState<number | ''>('');

  // DL confirm-JD modal state
  const [confirmJob, setConfirmJob]             = useState<Job | null>(null);
  const [reassignJob, setReassignJob]           = useState<Job | null>(null);
  const [dlTeam, setDlTeam]                     = useState<{ id: number; name: string; sourcing_load: number; calling_load: number }[]>([]);
  const [loadingTeam, setLoadingTeam]           = useState(false);
  const [selectedRecruiters, setSelectedRecruiters] = useState<number[]>([]);
  const [confirming, setConfirming]             = useState(false);
  const [confirmError, setConfirmError]         = useState('');
  const [sourcingDeadline, setSourcingDeadline] = useState('');
  const [callingDeadline,  setCallingDeadline]  = useState('');
  const [sourcingTarget,   setSourcingTarget]   = useState('');

  const isAdmin        = user?.role === 'admin';
  const isKam          = user?.role === 'kam'          || user?.secondary_role === 'kam';
  const isDeliveryLead = user?.role === 'delivery_lead' || user?.secondary_role === 'delivery_lead';
  const isRecruiter    = user?.role === 'recruiter'     || user?.secondary_role === 'recruiter';
  const canCreate      = user?.role === 'kam';   // Only primary-role KAMs can create JDs (not secondary/dual).

  // Pagination state
  const [jobPage,    setJobPage]    = useState(1);
  const [jobPerPage, setJobPerPage] = useState(50);
  const [jobTotal,   setJobTotal]   = useState(0);

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } =
    useForm<JobForm>({
      defaultValues: {
        headcount: 1, ol_job_type: 'new', ol_job_id: '',
        walkin: false, drive: false,
        billable_leaves: '', is_vip: 'no',
        salary_from: '0', salary_to: '0',
      },
    });

  const olJobType  = watch('ol_job_type');
  const isWalkin   = watch('walkin');

  const fetchJobs = useCallback(() => {
    setLoading(true);
    const params: Record<string, string | number> = {
      skip: (jobPage - 1) * jobPerPage,
      limit: jobPerPage,
    };
    if (activeTab !== 'all') params.status = activeTab;
    if (searchText)           params.search = searchText;
    if (clientFilter)         params.client = clientFilter;          // server-side exact match
    if (bhFilter !== '')      params.business_head_id = bhFilter;     // server-side BH filter
    api.get<{ items: Job[]; total: number }>('/jobs', { params })
      .then((r) => {
        setJobs(r.data.items ?? (r.data as unknown as Job[]));
        setJobTotal(r.data.total ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [jobPage, jobPerPage, activeTab, searchText, clientFilter, bhFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const jobsSignal = useSignal('jobs');
  useEffect(() => { fetchJobs(); }, [fetchJobs, jobsSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Client bar data — full rollup, independent of pagination. Refreshes on realtime signal.
  const fetchClientSummary = useCallback(() => {
    api.get<{ clients: typeof clientSummary }>('/jobs/client-summary')
      .then((r) => setClientSummary(r.data.clients ?? []))
      .catch(() => {});
  }, []);
  useEffect(() => { fetchClientSummary(); }, [fetchClientSummary, jobsSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset to page 1 when filters change
  useEffect(() => { setJobPage(1); }, [activeTab, searchText, clientFilter, bhFilter]);

  const fetchDlTeam = async (dlId?: number | null) => {
    // KAM/admin: pass dl_id when known, otherwise backend returns all recruiters
    const params = (isAdmin || isKam) && dlId ? { dl_id: dlId } : undefined;
    const res = await api.get<{ sourcers: { id: number; name: string; sourcing_load: number; calling_load: number }[] }>('/users/team-loads', { params });
    return res.data.sourcers ?? [];
  };

  const openConfirmModal = async (job: Job) => {
    setConfirmJob(job);
    setConfirmError('');
    setDlTeam([]);
    setSelectedRecruiters([]);
    // KAM: pre-select current DLs so they can change them if needed
    if (isKam) {
      const curDls = job.delivery_lead_ids?.length ? job.delivery_lead_ids
        : job.delivery_lead_id ? [job.delivery_lead_id] : [];
      setSelectedDeliveryLeadIds(curDls);
    }
    setLoadingTeam(true);
    try {
      // KAM has no pod — fetch all recruiters (no dl_id filter)
      const team = await fetchDlTeam(isKam ? null : job.delivery_lead_id);
      setDlTeam(team);
      if (team.length) {
        const rec = team.reduce((a, b) => (a.sourcing_load + a.calling_load) <= (b.sourcing_load + b.calling_load) ? a : b);
        setSelectedRecruiters([rec.id]);
      }
    } catch { setDlTeam([]); setSelectedRecruiters([]); }
    finally { setLoadingTeam(false); }
  };

  const openReassignModal = async (job: Job) => {
    setReassignJob(job);
    setConfirmError('');
    setDlTeam([]);
    setSelectedRecruiters([]);
    // KAM: pre-select current DLs and ensure DL list is loaded
    if (isKam) {
      const curDls = job.delivery_lead_ids?.length ? job.delivery_lead_ids
        : job.delivery_lead_id ? [job.delivery_lead_id] : [];
      setSelectedDeliveryLeadIds(curDls);
      if (!deliveryLeads.length) {
        api.get<{ id: number; name: string; clients: string[] }[]>('/users/delivery-leads')
          .then(r => setDeliveryLeads(r.data))
          .catch(() => {});
      }
    }
    setLoadingTeam(true);
    try {
      const team = await fetchDlTeam(isKam ? null : job.delivery_lead_id);
      setDlTeam(team);
      const teamIds = new Set(team.map((m) => m.id));
      const rawIds: number[] = Array.isArray(job.recruiter_ids) && job.recruiter_ids.length
        ? job.recruiter_ids
        : [...new Set([...(Array.isArray(job.sourcer_ids) ? job.sourcer_ids : []), ...(Array.isArray(job.caller_ids) ? job.caller_ids : [])])];
      setSelectedRecruiters(rawIds.filter((id) => isKam ? true : teamIds.has(id)));
    } catch { setDlTeam([]); setSelectedRecruiters([]); }
    finally { setLoadingTeam(false); }
  };

  const toggleRecruiter = (id: number) => {
    // Functional update — reads the latest state each call so rapid toggles
    // (select multiple, unselect some) don't trample each other.
    setSelectedRecruiters(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleConfirmJD = async () => {
    if (!confirmJob) return;
    if (!selectedRecruiters.length) { setConfirmError('Select at least one recruiter.'); return; }
    setConfirming(true); setConfirmError('');
    try {
      await api.post(`/jobs/${confirmJob.id}/confirm`, {
        recruiter_ids:     selectedRecruiters,
        sourcing_target:   sourcingTarget ? Number(sourcingTarget) : null,
        sourcing_deadline: sourcingDeadline ? new Date(sourcingDeadline).toISOString() : null,
        calling_deadline:  callingDeadline  ? new Date(callingDeadline).toISOString()  : null,
      });
      setConfirmJob(null);
      setSourcingDeadline(''); setCallingDeadline(''); setSourcingTarget('');
      fetchJobs();
    } catch {
      setConfirmError('Failed to confirm JD. Please try again.');
    } finally {
      setConfirming(false);
    }
  };

  const handleReassign = async () => {
    if (!reassignJob) return;
    if (!selectedRecruiters.length) { setConfirmError('Select at least one recruiter.'); return; }
    setConfirming(true); setConfirmError('');
    try {
      await api.patch(`/jobs/${reassignJob.id}/reassign`, {
        recruiter_ids: selectedRecruiters,
        ...(isKam && selectedDeliveryLeadIds.length ? { delivery_lead_ids: selectedDeliveryLeadIds } : {}),
      });
      setReassignJob(null);
      fetchJobs();
    } catch {
      setConfirmError('Failed to reassign. Please try again.');
    } finally {
      setConfirming(false);
    }
  };

  // Status, search AND client are all filtered server-side now — render as-is.
  const filteredJobs = jobs;

  // Clients come from the dedicated summary endpoint (full list, pagination-independent).
  const clientList = clientSummary.map((c) => c.client_name);

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

  const handleRepost = async () => {
    if (!repostJob) return;
    if (!repostDeadline) { alert('Please set a deadline for the new job.'); return; }
    setReposting(true);
    try {
      const res = await api.post<{ old_job_id: number; new_job_id: number; new_job: Job }>(`/jobs/${repostJob.id}/repost`, {
        deadline: new Date(repostDeadline).toISOString(),
        headcount: repostHeadcount,
      });
      setRepostJob(null);
      setRepostDeadline('');
      setRepostHeadcount(1);
      setRepostResult({ oldId: res.data.old_job_id, newId: res.data.new_job_id, roleTitle: repostJob.role_title });
      fetchJobs();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      alert(msg || 'Failed to repost job.');
    } finally {
      setReposting(false);
    }
  };

  const openEditModal = (job: Job) => {
    setEditJob(job);
    setProbingId(job.probing_id ?? null);
    setProbingForm(emptyProbing());
    reset({
      client_name:          job.client_name,
      role_title:           job.role_title,
      designation:          (job as any).designation          ?? '',
      client_job_id:        job.client_job_id                 ?? '',
      demand_source:        job.demand_source                 ?? '',
      demand_type:          job.demand_type                   ?? '',
      demand_exclusivity:   job.demand_exclusivity            ?? '',
      skill_stack:          job.skill_stack                   ?? '',
      work_mode:            job.work_mode                     ?? '',
      work_auth:            job.work_auth                     ?? '',
      headcount:            job.headcount,
      location:             job.location                      ?? '',
      jd_summary:           job.jd_summary                   ?? '',
      job_responsibilities: (job as any).job_responsibilities ?? '',
      min_experience:       job.min_experience != null ? String(job.min_experience) : '',
      max_experience:       job.max_experience != null ? String(job.max_experience) : '',
      salary_range:         job.salary_range                  ?? '',
      salary_from:          (job as any).salary_from != null ? String((job as any).salary_from) : '0',
      salary_to:            (job as any).salary_to   != null ? String((job as any).salary_to)   : '0',
      ol_job_type:          job.job_id != null ? 'existing' : 'new',
      ol_job_id:            job.job_id != null ? String(job.job_id) : '',
      walkin:               (job as any).walkin  ?? false,
      drive:                (job as any).drive   ?? false,
      start_time:           (job as any).start_time ?? '',
      end_time:             (job as any).end_time   ?? '',
      date_from:            (job as any).date_from  ?? '',
      date_upto:            (job as any).date_upto  ?? '',
      maximum_submission:   (job as any).maximum_submission != null ? String((job as any).maximum_submission) : '',
      requested_date:       (job as any).requested_date  ?? '',
      requested_by:         (job as any).requested_by    ?? '',
      expected_submission:  (job as any).expected_submission ?? '',
      requirement_type:     (job as any).requirement_type    ?? '',
      billable_leaves:      (job as any).billable_leaves === true ? 'yes' : (job as any).billable_leaves === false ? 'no' : '',
      is_vip:               (job as any).is_vip ? 'yes' : 'no',
      po_opportunity_mrr:   (job as any).po_opportunity_mrr ?? '',
      potential_gm:         (job as any).potential_gm       ?? '',
      key_string:           (job as any).key_string         ?? '',
      referral_amount:      (job as any).referral_amount != null ? String((job as any).referral_amount) : '',
      group_name:           (job as any).group_name         ?? '',
      sub_group:            (job as any).sub_group          ?? '',
      deadline:             job.deadline                     ?? '',
    });
    // Pre-select current delivery leads so admin can change them
    setSelectedDeliveryLeadIds(
      job.delivery_lead_ids?.length ? job.delivery_lead_ids
        : job.delivery_lead_id ? [job.delivery_lead_id] : []
    );
    if (isAdmin || isKam) {
      setDeliveryLeads([]);
      api.get<{ id: number; name: string; clients: string[] }[]>('/users/delivery-leads')
        .then(r => setDeliveryLeads(r.data))
        .catch(() => setDeliveryLeads([]));
    }
    api.get<ClientOption[]>('/clients')
      .then(r => setClientOptions(r.data))
      .catch(() => setClientOptions([]));
    if (job.jd_parsed) {
      try { setParsedResult(JSON.parse(job.jd_parsed)); } catch { /* ignore */ }
    }
    setRawJdText(job.jd_raw_text ?? null);
    setShowModal(true);
  };

  const openCreateModal = () => {
    setEditJob(null);
    reset({ headcount: 1 });
    setApiError('');
    setExtractTab('text'); setExtractText(''); setExtractFile(null);
    setExtractError(''); setExtracted(false);
    setParsedResult(null); setRawJdText(null);
    setShowModal(true);
    setProbingForm(emptyProbing());
    setProbingId(null);
    setSelectedDeliveryLeadIds([]);
    setSelectedKamId('');
    setSelectedAssignDlId('');
    if (isKam || isAdmin || isDeliveryLead) {
      setDeliveryLeads([]);
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
    setSelectedDeliveryLeadIds([]); setSelectedKamId(''); setSelectedBhId(''); setSelectedAssignDlId('');
    setProbingForm(emptyProbing());
    setProbingId(null);
  };

  const probingComplete = PROBING_QUESTIONS.every(q => probingForm[q.key].trim().length > 0);

  const buildPayload = (data: JobForm) => ({
    ...data,
    probing_id:           probingId,
    job_id:               data.ol_job_type === 'existing' && data.ol_job_id ? Number(data.ol_job_id) : null,
    ol_job_type:          undefined,
    ol_job_id:            undefined,
    client_job_id:        data.client_job_id        || null,
    demand_source:        data.demand_source         || null,
    demand_type:          data.demand_type           || null,
    demand_exclusivity:   data.demand_exclusivity    || null,
    work_mode:            data.work_mode             || null,
    work_auth:            data.work_auth             || null,
    skill_stack:          data.skill_stack           || null,
    location:             data.location              || null,
    jd_summary:           data.jd_summary            || null,
    salary_range:         data.salary_range          || null,
    headcount:            Number(data.headcount),
    min_experience:       data.min_experience  ? Number(data.min_experience)  : null,
    max_experience:       data.max_experience  ? Number(data.max_experience)  : null,
    salary_from:          data.salary_from     ? Number(data.salary_from)     : null,
    salary_to:            data.salary_to       ? Number(data.salary_to)       : null,
    maximum_submission:   data.maximum_submission ? Number(data.maximum_submission) : null,
    designation:          data.designation          || null,
    expected_submission:  data.expected_submission  || null,
    requirement_type:     data.requirement_type     || null,
    job_responsibilities: data.job_responsibilities || null,
    requested_date:       data.requested_date       || null,
    requested_by:         data.requested_by         || null,
    po_opportunity_mrr:   data.po_opportunity_mrr   || null,
    potential_gm:         data.potential_gm         || null,
    key_string:           data.key_string           || null,
    referral_amount:      data.referral_amount ? Number(data.referral_amount) : null,
    group_name:           data.group_name           || null,
    sub_group:            data.sub_group            || null,
    start_time:           data.start_time || null,
    end_time:             data.end_time   || null,
    date_from:            data.date_from  || null,
    date_upto:            data.date_upto  || null,
    billable_leaves:      data.billable_leaves === 'yes' ? true : data.billable_leaves === 'no' ? false : null,
    is_vip:               data.is_vip === 'yes',
    jd_parsed:            parsedResult ? JSON.stringify(parsedResult) : (editJob?.jd_parsed ?? null),
    jd_raw_text:          rawJdText ?? (editJob?.jd_raw_text ?? null),
    delivery_lead_ids: editJob
      ? ((isAdmin || isKam) ? selectedDeliveryLeadIds : undefined)
      : ((isKam || isAdmin) && !(isKam && isDeliveryLead)
          ? selectedDeliveryLeadIds
          : (isDeliveryLead && selectedAssignDlId ? [Number(selectedAssignDlId)] : undefined)),
    kam_id:           !editJob && isDeliveryLead && selectedKamId ? Number(selectedKamId) : undefined,
    business_head_id: !editJob && selectedBhId ? Number(selectedBhId) : undefined,
    deadline:          data.deadline ? new Date(data.deadline).toISOString() : null,
  });

  const onSubmit = async (data: JobForm) => {
    setApiError('');
    // At least one DL is mandatory for KAM-only users
    if (!editJob && isKam && !isDeliveryLead && !selectedDeliveryLeadIds.length) {
      setApiError('Please select at least one Delivery Lead before creating a JD.');
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
    // For new jobs: probing fields are required (single combined form).
    if (!editJob && !probingComplete) {
      setApiError('Please complete all probing questions before creating the job.');
      // scroll to first empty probing field
      const firstMissing = PROBING_QUESTIONS.find(q => !probingForm[q.key].trim());
      if (firstMissing) {
        const el = document.getElementById(`probing-${firstMissing.key}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el?.focus();
      }
      return;
    }
    setSubmitting(true);
    try {
      // For new jobs: create probing row first, then create the job linked to it.
      let probingIdForPayload = probingId;
      if (!editJob) {
        try {
          const res = await api.post<{ id: number }>('/probing', {
            ...probingForm,
            // Mirror JD-form values into the probing columns that duplicate them,
            // so both tables stay populated from a single user input.
            work_mode:     data.work_mode || null,
            work_location: data.location  || null,
            // job_id intentionally not sent — backend ignores it anyway (probing_data.job_id stays NULL).
          });
          probingIdForPayload = res.data.id;
          setProbingId(res.data.id);
        } catch (err: unknown) {
          const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
          setApiError(msg || 'Failed to save probing details.');
          setSubmitting(false);
          return;
        }
      }
      const payload = { ...buildPayload(data), probing_id: probingIdForPayload };
      if (editJob) {
        await api.patch(`/jobs/${editJob.id}`, payload);
      } else {
        await api.post('/jobs', payload);
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
            {clientSummary.map((cs, idx) => {
              const client        = cs.client_name;
              const jdCount       = cs.total;
              const openCount     = cs.open;
              const pendingCount  = cs.pending;
              const totalCands    = cs.candidate_count;
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
                  style={{ minWidth: 'clamp(150px, 18vw, 200px)' }}
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
                      {jdCount} JD{jdCount !== 1 ? 's' : ''}
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

      {/* ── Toolbar: tabs + search + new job ────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center justify-between gap-3 mb-5">
        {/* Status tabs — scrollable on mobile */}
        <div className="flex gap-1 p-1 rounded-xl overflow-x-auto flex-shrink-0" style={{ background: '#E8EDF3' }}>
          {tabs.map(t => {
            // Counts come from the full client summary (not the current page) so they stay accurate.
            const count =
              t.key === 'all'            ? clientSummary.reduce((s, c) => s + c.total, 0)
              : t.key === 'open'         ? clientSummary.reduce((s, c) => s + c.open, 0)
              : t.key === 'pending_review' ? clientSummary.reduce((s, c) => s + c.pending, 0)
              : t.key === 'on_hold'      ? clientSummary.reduce((s, c) => s + c.on_hold, 0)
              : t.key === 'closed'       ? clientSummary.reduce((s, c) => s + c.closed, 0)
              : 0;
            const active = activeTab === t.key;
            const dotColor: Record<string, string> = { pending_review: '#F59E0B', open: '#10B981', on_hold: '#94A3B8', closed: '#CBD5E1' };
            return (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all"
                style={active
                  ? { background: '#FFFFFF', color: '#0F172A', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }
                  : { background: 'transparent', color: '#64748B' }
                }>
                {t.key !== 'all' && (
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: active ? dotColor[t.key] : '#94A3B8' }} />
                )}
                {t.label}
                <span
                  className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                  style={active
                    ? { background: '#EFF6FF', color: '#2563EB' }
                    : { background: 'rgba(0,0,0,0.08)', color: '#94A3B8' }
                  }>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Search */}
          <div className="relative flex-1 sm:flex-none">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search role or company…"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              className="pl-8 pr-4 py-2 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 w-full sm:w-52"
              style={{ border: '1px solid #E2E8F0' }}
            />
          </div>
          {/* Business Head filter (server-side) */}
          <select
            value={bhFilter}
            onChange={e => setBhFilter(e.target.value ? Number(e.target.value) : '')}
            className="px-3 py-2 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
            style={{ border: '1px solid #E2E8F0' }}
          >
            <option value="">All Business Heads</option>
            {businessHeads.map(bh => (
              <option key={bh.id} value={bh.id}>{bh.name}</option>
            ))}
          </select>
          {(searchText || clientFilter || bhFilter !== '') && (
            <button onClick={() => { setSearchText(''); setClientFilter(''); setBhFilter(''); }}
              className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold text-slate-500 transition-all"
              style={{ background: '#F1F5F9', border: '1px solid #E2E8F0' }}>
              <X size={11} /> Clear
            </button>
          )}
          <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">
            {jobTotal} job{jobTotal !== 1 ? 's' : ''}
          </span>
          {canCreate && (
            <button onClick={openCreateModal}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-xs font-bold hover:opacity-90 transition-all"
              style={{ background: '#2563EB', boxShadow: '0 2px 8px rgba(37,99,235,0.3)' }}>
              <Plus size={14} /> New JD
            </button>
          )}
        </div>
      </div>

      {/* Cards */}
      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[...Array(4)].map((_, i) => <div key={i} className="h-40 bg-white rounded-2xl border border-slate-100" />)}
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="text-center py-10 text-slate-400 flex flex-col items-center">
          <Lottie animationData={jobVacancyAnim} loop style={{ width: 220, height: 220 }} />
          <p className="text-sm mt-2 font-medium text-slate-500">No jobs match your filters.</p>
          <p className="text-xs text-slate-400 mt-1">Try adjusting the search or filter criteria.</p>
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
              onGenerateBoolean={() => navigate(`/skills?job_id=${job.id}`)}
              isGeneratingQuestionnaire={generatingQIds.has(job.id)}
              onDownloadQuestionnaire={async () => {
                if (isRecruiter) {
                  // Recruiters: load PDF directly, no settings modal
                  if (generatingQIds.has(job.id)) return;
                  setGeneratingQIds(prev => new Set(prev).add(job.id));
                  try {
                    const res = await api.get(`/jobs/${job.id}/questionnaire`, { responseType: 'blob' });
                    const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
                    setQuestionnairePdf({ url, filename: `questionnaire_${job.id}_${job.role_title.replace(/\s+/g, '_')}.pdf` });
                  } catch {
                    alert('Failed to load questionnaire. Please ensure the job has skills defined.');
                  } finally {
                    setGeneratingQIds(prev => { const s = new Set(prev); s.delete(job.id); return s; });
                  }
                } else {
                  // Admin / KAM / DL: open settings modal first
                  setQModal({ job, notes: job.questionnaire_notes || '', saving: false });
                }
              }}
              onToggleStatus={handleToggleStatus}
              onEdit={() => openEditModal(job)}
              onConfirm={() => openConfirmModal(job)}
              onReassign={() => openReassignModal(job)}
              onRepost={() => { setRepostJob(job); setRepostHeadcount(job.headcount ?? 1); }}
              onDelete={async () => {
                if (!confirm(`Delete JD "${job.role_title}" (${job.client_job_id ?? ''})? This cannot be undone.`)) return;
                const previousJobs = jobs;
                const previousTotal = jobTotal;
                setJobs((prev) => prev.filter((j) => j.id !== job.id));
                setJobTotal((t) => Math.max(0, t - 1));
                try {
                  await api.delete(`/jobs/${job.id}`);
                  fetchJobs();
                } catch (e: unknown) {
                  setJobs(previousJobs);
                  setJobTotal(previousTotal);
                  const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
                  alert(msg || 'Delete failed.');
                }
              }}
              toggling={togglingJobId === job.id}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {jobTotal > jobPerPage && (
        <div className="bg-white rounded-2xl border border-slate-100 px-4 shadow-sm">
          <PaginationBar
            page={jobPage}
            total={jobTotal}
            perPage={jobPerPage}
            onPageChange={setJobPage}
            onPerPageChange={setJobPerPage}
            loading={loading}
          />
        </div>
      )}

      {/* JD Detail Drawer */}
      {selectedJob && (
        <JDDrawer job={selectedJob} onClose={() => setSelectedJob(null)} />
      )}

      {/* DL: Confirm JD modal */}
      {confirmJob && (
        <RecruiterAssignModal
          title="Review & Assign JD"
          subtitle={`${confirmJob.role_title} · ${confirmJob.client_name}`}
          team={dlTeam}
          loadingTeam={loadingTeam}
          selected={selectedRecruiters}
          onToggle={toggleRecruiter}
          error={confirmError}
          confirming={confirming}
          onCancel={() => { setConfirmJob(null); setConfirmError(''); setSelectedRecruiters([]); setDlTeam([]); }}
          onConfirm={handleConfirmJD}
          confirmLabel="Confirm & Open JD"
          showDeadlines
          sourcingTarget={sourcingTarget}
          sourcingDeadline={sourcingDeadline}
          callingDeadline={callingDeadline}
          onTargetChange={setSourcingTarget}
          onSourcingDeadlineChange={setSourcingDeadline}
          onCallingDeadlineChange={setCallingDeadline}
        />
      )}

      {/* DL / KAM: Reassign recruiters modal */}
      {reassignJob && (
        <RecruiterAssignModal
          title="Reassign Recruiters"
          subtitle={`${reassignJob.role_title} · ${reassignJob.client_name}`}
          team={dlTeam}
          loadingTeam={loadingTeam}
          selected={selectedRecruiters}
          onToggle={toggleRecruiter}
          error={confirmError}
          confirming={confirming}
          onCancel={() => { setReassignJob(null); setConfirmError(''); setSelectedRecruiters([]); setDlTeam([]); setSelectedDeliveryLeadIds([]); }}
          onConfirm={handleReassign}
          confirmLabel="Save Reassignment"
          extraSlot={isKam ? (
            <div className="mt-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Delivery Leads</p>
              <div className="flex flex-wrap gap-2">
                {deliveryLeads.map(dl => {
                  const sel = selectedDeliveryLeadIds.includes(dl.id);
                  return (
                    <button key={dl.id} type="button"
                      onClick={() => setSelectedDeliveryLeadIds(prev => sel ? prev.filter(x => x !== dl.id) : [...prev, dl.id])}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${sel ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}`}>
                      {dl.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : undefined}
        />
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
                {editJob ? (
                  <p className="text-xs text-slate-400 mt-0.5">
                    Posted {fmtDate(editJob.created_at)} · Last updated {timeAgo(editJob.updated_at)}
                  </p>
                ) : (
                  <p className="text-xs text-slate-400 mt-0.5">
                    Probing sheet · Job details — all in one form
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

            <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">

              {/* ── Probing Sheet (new jobs only) ───────────────────────── */}
              {!editJob && (
                <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50/40 overflow-hidden">
                  <div className="px-5 py-4 border-b border-amber-200/70 bg-white/50 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 rounded-lg bg-amber-100"><BookOpen size={14} className="text-amber-700" /></div>
                      <div>
                        <h4 className="text-sm font-bold text-amber-900">Probing Sheet</h4>
                        <p className="text-[11px] text-amber-700/80">Capture context from the stakeholder — all fields required.</p>
                      </div>
                    </div>
                    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                      probingComplete ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {PROBING_QUESTIONS.filter(q => probingForm[q.key].trim()).length} / {PROBING_QUESTIONS.length} answered
                    </span>
                  </div>

                  <div className="p-5 space-y-5">
                    {([
                      { title: 'Stakeholders & Setup',    keys: ['reporting_manager_location','onsite_opportunities'] },
                      { title: 'Role & Project',          keys: ['candidate_role','project_size','project_count','role_clarity','skill_type'] },
                      { title: 'Interview & Timeline',    keys: ['interview_type','interview_rounds_count','feedback_eta','urgency_eta','notice_period'] },
                    ] as { title: string; keys: (keyof ProbingForm)[] }[]).map(group => (
                      <div key={group.title}>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800/70 mb-2">{group.title}</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                          {group.keys.map(k => {
                            const q = PROBING_QUESTIONS.find(qq => qq.key === k)!;
                            const filled = probingForm[k].trim().length > 0;
                            return (
                              <div key={k}>
                                <label htmlFor={`probing-${k}`} className="block text-[11px] font-semibold text-slate-700 mb-1 leading-snug">
                                  {q.label} <span className="text-red-500">*</span>
                                </label>
                                <input
                                  id={`probing-${k}`}
                                  type="text"
                                  placeholder={q.placeholder}
                                  value={probingForm[k]}
                                  onChange={e => setProbingForm(p => ({ ...p, [k]: e.target.value }))}
                                  className={`w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 transition-colors ${
                                    filled
                                      ? 'border-emerald-200 focus:border-emerald-400 focus:ring-emerald-50'
                                      : 'border-slate-200 focus:border-amber-400 focus:ring-amber-50'
                                  }`}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Delivery Lead(s) — KAM or admin editing an existing JD ── */}
              {editJob && (isAdmin || isKam) && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                      <UserCheck size={13} className="text-slate-400" />
                      Delivery Lead(s)
                      {selectedDeliveryLeadIds.length > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700">
                          {selectedDeliveryLeadIds.length} selected
                        </span>
                      )}
                    </label>
                    <span className="text-[10px] text-slate-400">Click to select — multiple allowed</span>
                  </div>
                  {deliveryLeads.length === 0 ? (
                    <p className="text-xs text-slate-400 italic flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-full border-2 border-slate-300 border-t-indigo-500 animate-spin inline-block" />
                      Loading…
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {deliveryLeads.map(dl => {
                        const selected = selectedDeliveryLeadIds.includes(dl.id);
                        return (
                          <button
                            key={dl.id}
                            type="button"
                            onClick={() => setSelectedDeliveryLeadIds(
                              selected
                                ? selectedDeliveryLeadIds.filter(id => id !== dl.id)
                                : [...selectedDeliveryLeadIds, dl.id]
                            )}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 text-left transition-all ${
                              selected
                                ? 'border-indigo-400 bg-indigo-50'
                                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${
                              selected ? 'bg-indigo-500' : 'bg-slate-400'
                            }`}>
                              {dl.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-semibold leading-tight ${selected ? 'text-indigo-700' : 'text-slate-700'}`}>
                                {dl.name}
                              </p>
                              <p className="text-xs text-slate-400 mt-0.5 truncate">
                                {dl.clients.length > 0 ? dl.clients.join(' · ') : 'No active clients'}
                              </p>
                            </div>
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
                </div>
              )}

              {/* ── Delivery Lead(s) — KAM-only or Admin users on create ── */}
              {!editJob && (isKam || isAdmin) && !(isKam && isDeliveryLead) && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                      <UserCheck size={13} className="text-slate-400" />
                      Assign Delivery Lead(s) *
                      {selectedDeliveryLeadIds.length > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700">
                          {selectedDeliveryLeadIds.length} selected
                        </span>
                      )}
                    </label>
                    <span className="text-[10px] text-slate-400">Click to select — multiple allowed</span>
                  </div>
                  {deliveryLeads.length === 0 ? (
                    <p className="text-xs text-slate-400 italic flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-full border-2 border-slate-300 border-t-indigo-500 animate-spin inline-block" />
                      Loading delivery leads…
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {deliveryLeads.map(dl => {
                        const selected = selectedDeliveryLeadIds.includes(dl.id);
                        return (
                          <button
                            key={dl.id}
                            type="button"
                            onClick={() => setSelectedDeliveryLeadIds(
                              selected
                                ? selectedDeliveryLeadIds.filter(id => id !== dl.id)
                                : [...selectedDeliveryLeadIds, dl.id]
                            )}
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
                  {!selectedDeliveryLeadIds.length && (
                    <p className="text-xs text-red-500 mt-1.5 font-medium">
                      ⚠ At least one Delivery Lead is required — please select above.
                    </p>
                  )}
                </div>
              )}

              {/* ── Assign to another DL — DL delegating this JD ── */}
              {!editJob && isDeliveryLead && deliveryLeads.length > 1 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1.5">
                    <UserCheck size={13} className="text-slate-400" />
                    Assign JD to Delivery Lead
                    <span className="text-slate-400 font-normal">(defaults to you)</span>
                  </label>
                  <select
                    value={selectedAssignDlId}
                    onChange={e => setSelectedAssignDlId(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-indigo-400 bg-white"
                  >
                    <option value="">— Assign to myself —</option>
                    {deliveryLeads.map(dl => (
                      <option key={dl.id} value={dl.id}>{dl.name}{dl.clients.length ? ` (${dl.clients.slice(0,2).join(', ')})` : ''}</option>
                    ))}
                  </select>
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
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">

                {/* ── SECTION: Basic Info ─────────────────────────────────── */}
                <div className="col-span-2 flex items-center gap-2 pt-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Basic Info</span>
                  <div className="flex-1 h-px bg-slate-100" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Client *</label>
                  {clientOptions.length > 0 ? (
                    <select className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" {...register('client_name', { required: true })}>
                      <option value="">Select client…</option>
                      {clientOptions.map(c => <option key={c.id} value={c.name}>{c.name}{c.short_name ? ` — ${c.short_name}` : ''}</option>)}
                    </select>
                  ) : (
                    <input type="text" placeholder="e.g. Sony" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" {...register('client_name', { required: true })} />
                  )}
                  {errors.client_name && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Work Mode</label>
                  <select className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" {...register('work_mode')}>
                    <option value="">Select…</option>
                    {WORK_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Job Heading / Role Title *</label>
                  <input type="text" placeholder="e.g. Senior Software Engineer"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                    {...register('role_title', { required: true })} />
                  {errors.role_title && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Designation *</label>
                  <input type="text" placeholder="e.g. SSE, TL, Architect"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                    {...register('designation', { required: !editJob })} />
                  {errors.designation && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Requirement Type</label>
                  <select className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" {...register('requirement_type')}>
                    <option value="">Select…</option>
                    {['Contract', 'Permanent', 'Contract-to-Hire', 'Freelance', 'Internship'].map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Job in Offer Letter</label>
                  <select className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" {...register('ol_job_type')}>
                    <option value="new">New Job</option>
                    <option value="existing">Existing Job</option>
                  </select>
                </div>

                {olJobType === 'existing' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">OL Job ID *</label>
                    <input type="number" placeholder="Enter OL Job ID"
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 font-mono"
                      {...register('ol_job_id', { required: olJobType === 'existing' })} />
                    {errors.ol_job_id && <p className="text-red-500 text-xs mt-1">Required for existing job</p>}
                  </div>
                )}

                {/* ── SECTION: Walkin / Drive ─────────────────────────────── */}
                <div className="col-span-2 flex items-center gap-2 pt-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Walkin / Drive</span>
                  <div className="flex-1 h-px bg-slate-100" />
                </div>

                <div className="col-span-2 flex items-center gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 rounded accent-blue-500" {...register('walkin')} />
                    <span className="text-sm font-medium text-slate-700">Walkin</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 rounded accent-blue-500" {...register('drive')} />
                    <span className="text-sm font-medium text-slate-700">Drive</span>
                  </label>
                </div>

                {isWalkin && (<>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Interview Time From</label>
                    <input type="time" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" {...register('start_time')} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Interview Time To</label>
                    <input type="time" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" {...register('end_time')} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Interview Date From</label>
                    <input type="date" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" {...register('date_from')} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Interview Date Upto</label>
                    <input type="date" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" {...register('date_upto')} />
                  </div>
                </>)}

                {/* ── SECTION: Identification ─────────────────────────────── */}
                <div className="col-span-2 flex items-center gap-2 pt-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Identification</span>
                  <div className="flex-1 h-px bg-slate-100" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Client Job ID</label>
                  <input type="text" placeholder="e.g. JD-2026-001"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 font-mono"
                    {...register('client_job_id')} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Group</label>
                  <input type="text" placeholder="Enter group"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                    {...register('group_name')} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Sub Group</label>
                  <input type="text" placeholder="Enter sub group"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                    {...register('sub_group')} />
                </div>

                {/* ── SECTION: Demand (MRR) ───────────────────────────────── */}
                <div className="col-span-2 flex items-center gap-2 pt-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Demand</span>
                  <div className="flex-1 h-px bg-slate-100" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Demand Source *</label>
                  <select className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" {...register('demand_source', { required: true })}>
                    <option value="">Select source…</option>
                    {['Customer Tool','Email','WhatsApp','Phone Call','Portal','Referral','Other'].map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  {errors.demand_source && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Demand Type *</label>
                  <select className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" {...register('demand_type', { required: true })}>
                    <option value="">Select type…</option>
                    {['New','Backfill','Replacement'].map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  {errors.demand_type && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Exclusivity *</label>
                  <select className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" {...register('demand_exclusivity', { required: true })}>
                    <option value="">Select…</option>
                    {['Exclusive','Open'].map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  {errors.demand_exclusivity && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>

                {/* ── SECTION: Skills & Experience ────────────────────────── */}
                <div className="col-span-2 flex items-center gap-2 pt-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Skills & Experience</span>
                  <div className="flex-1 h-px bg-slate-100" />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Key Skills *</label>
                  <input type="text" placeholder="e.g. React, TypeScript, Node.js"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                    {...register('skill_stack', { required: true })} />
                  {errors.skill_stack && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Experience From (yrs) *</label>
                  <input type="number" min={0} placeholder="e.g. 2"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                    {...register('min_experience', { required: true })} />
                  {errors.min_experience && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Experience To (yrs) *</label>
                  <input type="number" min={0} placeholder="e.g. 5"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                    {...register('max_experience', { required: true })} />
                  {errors.max_experience && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Location *</label>
                  <input type="text" placeholder="e.g. Chennai, Bangalore"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                    {...register('location', { required: true })} />
                  {errors.location && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>

                {/* ── SECTION: Salary ─────────────────────────────────────── */}
                <div className="col-span-2 flex items-center gap-2 pt-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Salary</span>
                  <div className="flex-1 h-px bg-slate-100" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Salary From</label>
                  <input type="number" min={0} step="0.01" placeholder="e.g. 250000"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                    {...register('salary_from')} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Salary To</label>
                  <input type="number" min={0} step="0.01" placeholder="e.g. 500000"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                    {...register('salary_to')} />
                </div>

                {/* ── SECTION: Positions & Scheduling ────────────────────── */}
                <div className="col-span-2 flex items-center gap-2 pt-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Positions & Scheduling</span>
                  <div className="flex-1 h-px bg-slate-100" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">No. of Positions *</label>
                  <input type="number" min={1}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                    {...register('headcount', { required: true, min: 1 })} />
                  {errors.headcount && <p className="text-red-500 text-xs mt-1">Required (min 1)</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Expected Submission *</label>
                  <input type="text" placeholder="e.g. 3 days / 2026-06-01"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                    {...register('expected_submission', { required: !editJob })} />
                  {errors.expected_submission && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Maximum Submission *</label>
                  <input type="number" min={0} placeholder="Max profiles to submit"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                    {...register('maximum_submission', { required: !editJob })} />
                  {errors.maximum_submission && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Referral Amount</label>
                  <input type="number" min={0} placeholder="e.g. 500 (optional)"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                    {...register('referral_amount')} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Key String</label>
                  <input type="text" placeholder="Boolean / key string"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                    {...register('key_string')} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Requested Date *</label>
                  <input type="date" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" {...register('requested_date', { required: !editJob })} />
                  {errors.requested_date && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Requested Name *</label>
                  <input type="text" placeholder="Requested by"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                    {...register('requested_by', { required: !editJob })} />
                  {errors.requested_by && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1">
                    <Clock size={12} className="text-red-400" /> Expected Client Closure Date *
                  </label>
                  <input type="datetime-local"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-50"
                    {...register('deadline', { required: !editJob })} />
                  {errors.deadline && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>

                {/* ── SECTION: Flags & Commercial ─────────────────────────── */}
                <div className="col-span-2 flex items-center gap-2 pt-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Flags & Commercial</span>
                  <div className="flex-1 h-px bg-slate-100" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2">Billable Leaves *</label>
                  <div className="flex items-center gap-5">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" value="yes" className="accent-blue-500" {...register('billable_leaves', { required: !editJob })} />
                      <span className="text-sm text-slate-700">Yes</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" value="no" className="accent-blue-500" {...register('billable_leaves', { required: !editJob })} />
                      <span className="text-sm text-slate-700">No</span>
                    </label>
                  </div>
                  {errors.billable_leaves && <p className="text-red-500 text-xs mt-1">Please select Yes or No</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2">High Priority (VIP) *</label>
                  <div className="flex items-center gap-5">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" value="yes" className="accent-blue-500" {...register('is_vip', { required: !editJob })} />
                      <span className="text-sm text-slate-700">Yes</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" value="no" className="accent-blue-500" {...register('is_vip', { required: !editJob })} />
                      <span className="text-sm text-slate-700">No</span>
                    </label>
                  </div>
                  {errors.is_vip && <p className="text-red-500 text-xs mt-1">Please select Yes or No</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">PO Opportunity (MRR) *</label>
                  <input type="text" placeholder="Enter MRR"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                    {...register('po_opportunity_mrr', { required: !editJob })} />
                  {errors.po_opportunity_mrr && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Potential GM% *</label>
                  <input type="text" placeholder="e.g. 25%"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                    {...register('potential_gm', { required: !editJob })} />
                  {errors.potential_gm && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>

                {/* ── SECTION: Job Description ─────────────────────────────── */}
                <div className="col-span-2 flex items-center gap-2 pt-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Job Description</span>
                  <div className="flex-1 h-px bg-slate-100" />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Job Description *</label>
                  <textarea rows={4}
                    placeholder="Role summary, key highlights…"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 resize-none"
                    {...register('jd_summary', { required: !editJob })} />
                  {errors.jd_summary && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Job Responsibilities</label>
                  <textarea rows={4}
                    placeholder="Key responsibilities and duties…"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 resize-none"
                    {...register('job_responsibilities')} />
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

      {/* ── Questionnaire PDF overlay ───────────────────────────────────── */}
      {/* ── Questionnaire Settings Modal (Admin / KAM / DL) ───────────────── */}
      {qModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 16, width: 540, maxWidth: '94vw', boxShadow: '0 25px 60px rgba(0,0,0,0.35)', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ background: '#1E3A8A', padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>Questionnaire Settings</div>
                <div style={{ color: '#BAC8FF', fontSize: 12, marginTop: 2 }}>{qModal.job.role_title} — {qModal.job.client_name}</div>
              </div>
              <button onClick={() => setQModal(null)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center' }}>
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '24px' }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: 13, color: '#1E293B', marginBottom: 6 }}>
                Additional Focus Points <span style={{ fontWeight: 400, color: '#94A3B8' }}>(optional)</span>
              </label>
              <textarea
                value={qModal.notes}
                onChange={e => setQModal(prev => prev ? { ...prev, notes: e.target.value } : null)}
                placeholder="e.g. Focus on async patterns, avoid basic syntax questions, emphasize system design for distributed systems, probe on error handling..."
                rows={5}
                style={{
                  width: '100%', boxSizing: 'border-box', border: '1.5px solid #CBD5E1',
                  borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#1E293B',
                  resize: 'vertical', outline: 'none', fontFamily: 'inherit', lineHeight: 1.6,
                }}
                onFocus={e => { e.target.style.borderColor = '#3B82F6'; }}
                onBlur={e => { e.target.style.borderColor = '#CBD5E1'; }}
              />
              <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 6 }}>
                These points guide the AI when generating questions. Saving will clear any existing cached PDF and generate a fresh one.
              </p>

              {qModal.job.questionnaire_generated_at && (
                <div style={{ marginTop: 10, padding: '8px 12px', background: '#F0FDF4', borderRadius: 8, border: '1px solid #BBF7D0', fontSize: 12, color: '#15803D' }}>
                  Last generated: {new Date(qModal.job.questionnaire_generated_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '0 24px 20px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Clear notes */}
              {(qModal.job.questionnaire_notes || qModal.notes) && (
                <button
                  disabled={qModal.saving}
                  onClick={async () => {
                    try {
                      await api.patch(`/jobs/${qModal.job.id}/questionnaire-notes`, { notes: null });
                      setJobs(prev => prev.map(j => j.id === qModal.job.id ? { ...j, questionnaire_notes: null, questionnaire_generated_at: null } : j));
                      setQModal(prev => prev ? { ...prev, notes: '', job: { ...prev.job, questionnaire_notes: null, questionnaire_generated_at: null } } : null);
                    } catch { alert('Failed to clear points.'); }
                  }}
                  style={{ marginRight: 'auto', background: 'none', border: 'none', color: '#EF4444', fontSize: 12, cursor: 'pointer', padding: '6px 0', fontWeight: 600 }}
                >
                  Clear Points
                </button>
              )}

              {/* View existing — only if cached PDF exists */}
              {qModal.job.questionnaire_generated_at && (
                <button
                  disabled={qModal.saving}
                  onClick={async () => {
                    setQModal(null);
                    setGeneratingQIds(prev => new Set(prev).add(qModal.job.id));
                    try {
                      const res = await api.get(`/jobs/${qModal.job.id}/questionnaire`, { responseType: 'blob' });
                      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
                      setQuestionnairePdf({ url, filename: `questionnaire_${qModal.job.id}_${qModal.job.role_title.replace(/\s+/g, '_')}.pdf` });
                    } catch { alert('Failed to load questionnaire.'); }
                    finally { setGeneratingQIds(prev => { const s = new Set(prev); s.delete(qModal.job.id); return s; }); }
                  }}
                  style={{ padding: '8px 16px', borderRadius: 8, border: '1.5px solid #CBD5E1', background: '#F8FAFC', color: '#334155', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                  View Existing PDF
                </button>
              )}

              {/* Cancel */}
              <button onClick={() => setQModal(null)} style={{ padding: '8px 16px', borderRadius: 8, border: '1.5px solid #CBD5E1', background: '#F8FAFC', color: '#334155', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>

              {/* Save & Generate */}
              <button
                disabled={qModal.saving}
                onClick={async () => {
                  const jobId = qModal.job.id;
                  const notes = qModal.notes.trim() || null;
                  setQModal(prev => prev ? { ...prev, saving: true } : null);
                  try {
                    await api.patch(`/jobs/${jobId}/questionnaire-notes`, { notes });
                    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, questionnaire_notes: notes, questionnaire_generated_at: null } : j));
                    setQModal(null);
                    setGeneratingQIds(prev => new Set(prev).add(jobId));
                    const res = await api.get(`/jobs/${jobId}/questionnaire`, { responseType: 'blob' });
                    const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
                    setQuestionnairePdf({ url, filename: `questionnaire_${jobId}_${qModal.job.role_title.replace(/\s+/g, '_')}.pdf` });
                    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, questionnaire_generated_at: new Date().toISOString() } : j));
                  } catch {
                    alert('Failed to generate questionnaire. Ensure the job has skills defined.');
                  } finally {
                    setGeneratingQIds(prev => { const s = new Set(prev); s.delete(jobId); return s; });
                    setQModal(prev => prev ? { ...prev, saving: false } : null);
                  }
                }}
                style={{
                  padding: '8px 20px', borderRadius: 8, border: 'none',
                  background: qModal.saving ? '#93C5FD' : '#1D4ED8', color: '#fff',
                  fontSize: 13, fontWeight: 700, cursor: qModal.saving ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {qModal.saving
                  ? <><Loader2 size={13} className="animate-spin" /> Generating...</>
                  : (qModal.job.questionnaire_generated_at ? 'Save & Regenerate' : 'Save & Generate')}
              </button>
            </div>
          </div>
        </div>
      )}

      {questionnairePdf && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(15,23,42,0.85)',
            display: 'flex', flexDirection: 'column',
          }}
        >
          {/* Top bar */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 20px',
            background: '#1E3A8A',
            flexShrink: 0,
          }}>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>
              Interview Questionnaire
            </span>
            <div style={{ display: 'flex', gap: 10 }}>
              <a
                href={questionnairePdf.url}
                download={questionnairePdf.filename}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 16px', borderRadius: 8,
                  background: '#16A34A', color: '#fff',
                  fontWeight: 700, fontSize: 13, textDecoration: 'none',
                }}
              >
                <FileText size={14} /> Download PDF
              </a>
              <button
                onClick={() => {
                  URL.revokeObjectURL(questionnairePdf.url);
                  setQuestionnairePdf(null);
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '7px 14px', borderRadius: 8,
                  background: 'rgba(255,255,255,0.12)', color: '#fff',
                  fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer',
                }}
              >
                <X size={14} /> Close
              </button>
            </div>
          </div>

          {/* PDF iframe */}
          <iframe
            src={questionnairePdf.url}
            style={{ flex: 1, border: 'none', background: '#f8fafc' }}
            title="Interview Questionnaire"
          />
        </div>
      )}

      {/* Repost confirm modal */}
      {repostJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
              <div className="p-2 rounded-xl" style={{ background: '#FFF7ED' }}>
                <RefreshCw size={18} style={{ color: '#C2410C' }} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">Repost Job</h3>
                <p className="text-xs text-slate-400 mt-0.5">{repostJob.role_title} · {repostJob.client_name}</p>
              </div>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 space-y-1.5">
                <p className="font-semibold">This will do the following:</p>
                <ul className="text-xs space-y-1 mt-1.5 ml-1">
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-amber-500">•</span>
                    <span>Mark <strong>JD #{repostJob.id}</strong> ({repostJob.role_title}) as <strong>Closed</strong></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-amber-500">•</span>
                    <span>Create a new job with the same details but <strong>no job_id</strong> (OL link cleared)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-amber-500">•</span>
                    <span>The new job will be in <strong>Pending Review</strong> — assign recruiters to open it</span>
                  </li>
                </ul>
              </div>

              {/* New deadline — required */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  New Expected Client Closure Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={repostDeadline}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => setRepostDeadline(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-200"
                  style={{ borderColor: repostDeadline ? '#d1d5db' : '#fca5a5', background: repostDeadline ? '#fff' : '#fff7ed' }}
                />
                {!repostDeadline && (
                  <p className="text-[11px] text-orange-600 mt-1">Required — set the deadline for the new job posting.</p>
                )}
              </div>

              {/* Headcount */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Headcount
                  <span className="ml-2 text-[11px] font-normal text-slate-400">
                    (old job had <strong className="text-slate-600">{repostJob?.headcount ?? 1}</strong> — change if needed)
                  </span>
                </label>
                <div className="flex items-center gap-3">
                  <button type="button"
                    onClick={() => setRepostHeadcount(v => Math.max(1, v - 1))}
                    className="w-8 h-8 rounded-lg border border-slate-200 text-slate-600 font-bold text-base flex items-center justify-center hover:bg-slate-50">−</button>
                  <span className="text-base font-bold text-slate-800 w-6 text-center">{repostHeadcount}</span>
                  <button type="button"
                    onClick={() => setRepostHeadcount(v => v + 1)}
                    className="w-8 h-8 rounded-lg border border-slate-200 text-slate-600 font-bold text-base flex items-center justify-center hover:bg-slate-50">+</button>
                  {repostHeadcount !== (repostJob?.headcount ?? 1) && (
                    <span className="text-[11px] text-blue-600 font-semibold">
                      Changed from {repostJob?.headcount ?? 1} → {repostHeadcount}
                    </span>
                  )}
                </div>
              </div>

              {repostJob.job_id != null && (
                <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                  Current OL job_id <code className="font-bold text-slate-700">JD-{repostJob.job_id}</code> will be cleared on the new job.
                </p>
              )}
            </div>

            <div className="px-6 pb-5 flex justify-end gap-3">
              <button
                onClick={() => { setRepostJob(null); setRepostDeadline(''); setRepostHeadcount(1); }}
                disabled={reposting}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRepost}
                disabled={reposting}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-60"
                style={{ background: '#C2410C' }}
              >
                {reposting
                  ? <><Loader2 size={14} className="animate-spin" /> Reposting…</>
                  : <><RefreshCw size={14} /> Repost Job</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Repost success result */}
      {repostResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-5 text-center">
              <div className="flex justify-center mb-4">
                <div className="p-3 rounded-full" style={{ background: '#F0FDF4' }}>
                  <CheckCircle2 size={28} style={{ color: '#16A34A' }} />
                </div>
              </div>
              <h3 className="text-base font-bold text-slate-800 mb-1">Job Reposted Successfully</h3>
              <p className="text-xs text-slate-400 mb-5">{repostResult.roleTitle}</p>

              <div className="space-y-2 text-sm mb-6">
                <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-500 text-xs font-medium">Old Job</span>
                  <span className="flex items-center gap-2 font-semibold">
                    <code className="text-slate-700">#{repostResult.oldId}</code>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">Closed</span>
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-green-50 border border-green-100">
                  <span className="text-slate-500 text-xs font-medium">New Job</span>
                  <span className="flex items-center gap-2 font-semibold">
                    <code className="text-green-700">#{repostResult.newId}</code>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-100 text-yellow-700">Pending Review</span>
                  </span>
                </div>
              </div>

              <button
                onClick={() => setRepostResult(null)}
                className="w-full py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
                style={{ background: '#2563EB' }}
              >
                Done
              </button>
            </div>
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
  onGenerateBoolean: () => void;
  isGeneratingQuestionnaire: boolean;
  onDownloadQuestionnaire: () => void;
  onToggleStatus: (job: Job) => void;
  onEdit: () => void;
  onConfirm: () => void;
  onReassign: () => void;
  onRepost: () => void;
  onDelete: () => void;
  toggling: boolean;
}

const STATUS_CONFIG: Record<string, { label: string; border: string; bg: string; badge: string; badgeText: string; dot: string }> = {
  pending_review: { label: 'Pending Review', border: '#F59E0B', bg: '#FFFBEB', badge: '#FEF3C7', badgeText: '#92400E', dot: '#F59E0B' },
  open:           { label: 'Open',           border: '#10B981', bg: '#FFFFFF', badge: '#D1FAE5', badgeText: '#065F46', dot: '#10B981' },
  on_hold:        { label: 'On Hold',        border: '#94A3B8', bg: '#FFFFFF', badge: '#F1F5F9', badgeText: '#475569', dot: '#94A3B8' },
  closed:         { label: 'Closed',         border: '#CBD5E1', bg: '#F8FAFC', badge: '#F1F5F9', badgeText: '#9CA3AF', dot: '#CBD5E1' },
};

function Avatar({ name, size = 28, color }: { name: string; size?: number; color?: string }) {
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const colors = ['#3B82F6','#8B5CF6','#10B981','#F59E0B','#EF4444','#06B6D4','#EC4899','#6366F1'];
  const bg = color ?? colors[name.charCodeAt(0) % colors.length];
  return (
    <div
      title={name}
      className="flex items-center justify-center rounded-full text-white font-bold flex-shrink-0"
      style={{ width: size, height: size, background: bg, fontSize: size * 0.38, border: '2px solid white' }}
    >
      {initials}
    </div>
  );
}

function JobCard({ job, isRecruiter, isAdmin, isKam, isDeliveryLead, canToggle, onViewCandidates, onViewJD, onGenerateBoolean, isGeneratingQuestionnaire, onDownloadQuestionnaire, onToggleStatus, onEdit, onConfirm, onReassign, onRepost, onDelete, toggling }: JobCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const cfg = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.open;

  const skills = job.skill_stack ? job.skill_stack.split(',').map(s => s.trim()).filter(Boolean) : [];
  const visibleSkills = expanded ? skills : skills.slice(0, 5);
  const extraSkillCount = skills.length - 5;

  const expLabel = (job.min_experience != null || job.max_experience != null)
    ? [job.min_experience, job.max_experience].filter(v => v != null).join('–') + ' yrs'
    : null;

  const deadline = job.deadline ? new Date(job.deadline) : null;
  const isOverdue = deadline != null && job.status !== 'closed' && deadline < new Date();

  const recNames: string[] = job.recruiter_names?.length
    ? job.recruiter_names
    : [...new Set([...(job.sourcer_names ?? []), ...(job.caller_names ?? [])])];

  const isPending = job.status === 'pending_review';
  const isOpen    = job.status === 'open';

  return (
    <div
      className="bg-white rounded-2xl overflow-hidden transition-all duration-200"
      style={{
        border: '1px solid #E8EDF3',
        borderLeft: `4px solid ${isOverdue ? '#EF4444' : cfg.border}`,
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)'}
    >
      {/* ── DL / KAM: Prominent pending banner ─────────────────── */}
      {(isDeliveryLead || isKam) && isPending && (
        <div
          className="px-5 py-2.5 flex items-center justify-between"
          style={{ background: 'linear-gradient(90deg, #FFFBEB, #FEF9EC)', borderBottom: '1px solid #FDE68A' }}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm">⏳</span>
            <span className="text-xs font-bold text-amber-800">Awaiting your review — assign recruiters to open this JD</span>
          </div>
          <button
            onClick={onConfirm}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90"
            style={{ background: '#D97706' }}
          >
            <UserCheck size={13} /> Review & Assign →
          </button>
        </div>
      )}

      <div className="px-5 py-4">
        {/* ── Row 1: title + status + actions ───────────────────── */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            {/* Title row */}
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="text-sm font-bold text-slate-800 leading-snug">{job.role_title}</h3>
              {job.job_id != null && (
                <code className="px-1.5 py-0.5 rounded-md text-[10px] font-bold tracking-wide"
                  style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #CBD5E1' }}
                  title="Internal job ID">
                  JD-{job.job_id}
                </code>
              )}
              {job.client_job_id && (
                <code className="px-1.5 py-0.5 rounded-md text-[10px] font-bold tracking-wide"
                  style={{ background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }}
                  title="Client job ID">
                  #{job.client_job_id}
                </code>
              )}
              {job.repost_of_job_id != null && (
                <span
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold"
                  style={{ background: '#FFF7ED', color: '#C2410C', border: '1px solid #FED7AA' }}
                  title={`Reposted from${job.repost_of_ol_job_id ? ` JD-${job.repost_of_ol_job_id}` : ` job #${job.repost_of_job_id}`}`}>
                  <RefreshCw size={9} />
                  {job.repost_of_ol_job_id != null
                    ? <>Repost of JD-{job.repost_of_ol_job_id}</>
                    : <>Repost</>}
                </span>
              )}
              {/* Status badge */}
              <span
                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                style={{ background: cfg.badge, color: cfg.badgeText }}
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: cfg.dot }} />
                {cfg.label}
              </span>
              {isOverdue && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 animate-pulse">
                  ⚠ Overdue
                </span>
              )}
            </div>

            {/* Client + location */}
            <p className="text-xs text-slate-500 flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-slate-600">{job.client_name}</span>
              {job.location && (
                <>
                  <span className="text-slate-300">·</span>
                  <MapPin size={10} className="text-slate-400 flex-shrink-0" />
                  <span>{job.location}</span>
                </>
              )}
              {job.work_mode && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className={`font-medium ${MODE_COLORS[job.work_mode] ?? 'text-slate-500'}`}>{job.work_mode}</span>
                </>
              )}
              {expLabel && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="font-semibold text-amber-600">{expLabel}</span>
                </>
              )}
              {job.salary_range && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="font-semibold text-violet-600">{job.salary_range}</span>
                </>
              )}
            </p>
          </div>

          {/* ── Actions ──────────────────────────────────────────── */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Primary CTA for recruiter */}
            {isRecruiter && isOpen && (
              <button onClick={onViewCandidates}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90"
                style={{ background: '#2563EB' }}>
                + Source Candidates
              </button>
            )}

            {/* Reassign button for DL/Admin/KAM on open jobs */}
            {(isDeliveryLead || isAdmin || isKam) && isOpen && (
              <button onClick={onReassign}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                style={{ background: '#EDE9FE', color: '#5B21B6', border: '1px solid #DDD6FE' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#DDD6FE'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#EDE9FE'; }}>
                <Users size={12} /> Reassign
              </button>
            )}

            {/* Generate Boolean Search — for anyone who sources */}
            {(isRecruiter || isDeliveryLead || isAdmin) && isOpen && (
              <button onClick={onGenerateBoolean}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                style={{ background: '#F5F3FF', color: '#6D28D9', border: '1px solid #DDD6FE' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#EDE9FE'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#F5F3FF'; }}
                title="Generate Naukri boolean search string from this JD">
                <Sparkles size={12} /> Boolean
              </button>
            )}

            {/* Questionnaire — visible to recruiter, DL, KAM */}
            {(isRecruiter || isDeliveryLead || isKam || isAdmin) && (
              <button
                onClick={onDownloadQuestionnaire}
                disabled={isGeneratingQuestionnaire}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                style={{
                  background: isGeneratingQuestionnaire ? '#FEF3C7' : '#FFF7ED',
                  color: isGeneratingQuestionnaire ? '#92400E' : '#C2410C',
                  border: `1px solid ${isGeneratingQuestionnaire ? '#FDE68A' : '#FED7AA'}`,
                  opacity: isGeneratingQuestionnaire ? 0.8 : 1,
                  cursor: isGeneratingQuestionnaire ? 'not-allowed' : 'pointer',
                }}
                title={isGeneratingQuestionnaire ? 'Generating questionnaire...' : 'View interview questionnaire (AI-generated from skills)'}>
                {isGeneratingQuestionnaire
                  ? <><Loader2 size={12} className="animate-spin" /> Generating...</>
                  : <><FileText size={12} /> Questionnaire</>}
              </button>
            )}

            {/* View JD */}
            <button onClick={onViewJD}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
              style={{ background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#DCFCE7'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#F0FDF4'; }}>
              <BookOpen size={12} /> View JD
            </button>

            {/* View candidates (non-recruiter) */}
            {!isRecruiter && (
              <button onClick={onViewCandidates}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                style={{ background: '#F8FAFC', color: '#475569', border: '1px solid #E2E8F0' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F1F5F9'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#F8FAFC'; }}>
                Candidates <ChevronRight size={12} />
              </button>
            )}

            {/* ⋮ More menu */}
            {(isAdmin || isKam || isDeliveryLead || canToggle) && (
              <div className="relative">
                <button
                  onClick={() => setMenuOpen(v => !v)}
                  className="flex items-center justify-center w-8 h-8 rounded-xl transition-all"
                  style={{ background: menuOpen ? '#F1F5F9' : 'transparent', color: '#64748B', border: '1px solid transparent' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F1F5F9'; (e.currentTarget as HTMLElement).style.borderColor = '#E2E8F0'; }}
                  onMouseLeave={e => { if (!menuOpen) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.borderColor = 'transparent'; } }}
                >
                  <span className="text-slate-500 font-bold text-base leading-none" style={{ letterSpacing: '1px' }}>···</span>
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                    <div
                      className="absolute right-0 mt-1 bg-white rounded-xl border z-40 py-1 overflow-hidden"
                      style={{ minWidth: 160, boxShadow: '0 8px 32px rgba(0,0,0,0.12)', borderColor: '#E8EDF3' }}
                    >
                      {(isAdmin || isKam || isDeliveryLead) && (
                        <button onClick={() => { setMenuOpen(false); onEdit(); }}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors text-left">
                          <Pencil size={13} className="text-slate-400" /> Edit JD
                        </button>
                      )}
                      {(isAdmin || isKam || isDeliveryLead) && (
                        <button onClick={() => { setMenuOpen(false); onRepost(); }}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-semibold transition-colors text-left"
                          style={{ color: '#C2410C' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#FFF7ED'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                          <RefreshCw size={13} style={{ color: '#C2410C' }} /> Repost JD
                        </button>
                      )}
                      {canToggle && job.status !== 'pending_review' && (
                        <button onClick={() => { setMenuOpen(false); onToggleStatus(job); }} disabled={toggling}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-semibold transition-colors text-left disabled:opacity-60"
                          style={{ color: job.status === 'closed' ? '#059669' : '#DC2626' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = job.status === 'closed' ? '#F0FDF4' : '#FEF2F2'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                        >
                          {job.status === 'closed'
                            ? <><Unlock size={13} /> Reopen JD</>
                            : <><Lock size={13} /> Put On Hold / Close</>}
                        </button>
                      )}
                      {(isAdmin || ((isKam || isDeliveryLead) && isPending)) && (
                        <>
                          <div className="mx-3 my-1 border-t border-slate-100" />
                          <button onClick={() => { setMenuOpen(false); onDelete(); }}
                            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors text-left">
                            <Trash2 size={13} /> Delete JD
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Row 2: Tags + Skills ────────────────────────────────── */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {job.demand_type && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
              {job.demand_type}
            </span>
          )}
          {job.demand_exclusivity && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${job.demand_exclusivity === 'Exclusive' ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>
              {job.demand_exclusivity}
            </span>
          )}
          {job.demand_source && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-100">
              via {job.demand_source}
            </span>
          )}
          {visibleSkills.map(s => (
            <span key={s} className="text-[10px] px-2 py-0.5 rounded-full font-medium"
              style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>
              {s}
            </span>
          ))}
          {!expanded && extraSkillCount > 0 && (
            <button onClick={() => setExpanded(true)}
              className="text-[10px] px-2 py-0.5 rounded-full font-bold"
              style={{ background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE' }}>
              +{extraSkillCount} more
            </button>
          )}
          {expanded && extraSkillCount > 0 && (
            <button onClick={() => setExpanded(false)}
              className="text-[10px] px-2 py-0.5 rounded-full font-bold"
              style={{ background: '#F1F5F9', color: '#64748B', border: '1px solid #E2E8F0' }}>
              Show less
            </button>
          )}
        </div>

        {/* ── JD summary ──────────────────────────────────────────── */}
        {job.jd_summary && (
          <p className={`text-xs text-slate-500 leading-relaxed mb-3 ${expanded ? '' : 'line-clamp-2'}`}>
            {job.jd_summary}
          </p>
        )}

        {/* ── Row 3: People + Stats + Deadline ───────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3" style={{ borderTop: '1px solid #F1F5F9' }}>
          {/* Left: Recruiter avatars + DL + BH */}
          <div className="flex items-center gap-3">
            {recNames.length > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="flex" style={{ gap: -6 }}>
                  {recNames.slice(0, 4).map((name, i) => (
                    <div key={name} style={{ marginLeft: i > 0 ? -8 : 0, zIndex: recNames.length - i }}>
                      <Avatar name={name} size={26} />
                    </div>
                  ))}
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 leading-none">
                    {recNames.length === 1 ? recNames[0] : `${recNames.length} recruiters`}
                  </p>
                  {recNames.length > 1 && (
                    <p className="text-[9px] text-slate-400 leading-none mt-0.5">{recNames.slice(0, 2).join(', ')}{recNames.length > 2 ? ` +${recNames.length - 2}` : ''}</p>
                  )}
                </div>
              </div>
            )}
            {isPending && !recNames.length && (
              <span className="text-[10px] font-semibold text-amber-600 flex items-center gap-1">
                <Users size={10} /> No recruiters assigned yet
              </span>
            )}
            {(job.delivery_lead_names?.length
              ? job.delivery_lead_names
              : job.delivery_lead_name ? [job.delivery_lead_name] : []
            ).map((name, i) => (
              <span key={i} className="text-[10px] font-semibold text-indigo-600 flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50">
                <UserCheck size={9} /> DL: {name}
              </span>
            ))}
          </div>

          {/* Right: Stats */}
          <div className="flex items-center gap-3">
            {/* Candidate count */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
              <Users size={11} className="text-slate-400" />
              <span className="text-xs font-bold text-slate-600">{job.candidate_count ?? 0}</span>
              <span className="text-[10px] text-slate-400">candidates</span>
            </div>
            {/* HC */}
            <span className="text-[10px] text-slate-400 font-medium">HC: <strong className="text-slate-600">{job.headcount}</strong></span>
            {/* Posted */}
            <span className="text-[10px] text-slate-400 flex items-center gap-1">
              <Calendar size={9} /> {timeAgo(job.created_at)}
            </span>
          </div>
        </div>

        {/* ── Deadlines row ───────────────────────────────────────── */}
        {(job.deadline || job.sourcing_deadline || job.calling_deadline) && (
          <div className="flex flex-wrap gap-2 mt-3 pt-3" style={{ borderTop: '1px solid #F1F5F9' }}>
            {job.deadline && (
              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-[10px] font-bold ${isOverdue ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-slate-50 text-slate-500 border border-slate-100'}`}>
                <Clock size={10} />
                Deadline: {new Date(job.deadline).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}
                {isOverdue && ' — Overdue!'}
              </div>
            )}
            {job.sourcing_deadline && <DeadlinePill label="Sourcing by" deadline={job.sourcing_deadline} color="teal" />}
            {job.calling_deadline  && <DeadlinePill label="Calling by"  deadline={job.calling_deadline}  color="blue" />}
          </div>
        )}
      </div>
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


// ── Recruiter Assign Modal (confirm + reassign) ───────────────────────────────

interface RecruiterAssignModalProps {
  title: string; subtitle: string;
  team: { id: number; name: string; sourcing_load: number; calling_load: number }[];
  loadingTeam?: boolean;
  selected: number[];
  onToggle: (id: number) => void;
  error: string; confirming: boolean;
  onCancel: () => void; onConfirm: () => void; confirmLabel: string;
  showDeadlines?: boolean;
  sourcingTarget?: string; sourcingDeadline?: string; callingDeadline?: string;
  onTargetChange?: (v: string) => void;
  onSourcingDeadlineChange?: (v: string) => void;
  onCallingDeadlineChange?: (v: string) => void;
  extraSlot?: React.ReactNode;
}

function RecruiterAssignModal({
  title, subtitle, team, loadingTeam, selected, onToggle, error, confirming,
  onCancel, onConfirm, confirmLabel, showDeadlines,
  sourcingTarget, sourcingDeadline, callingDeadline,
  onTargetChange, onSourcingDeadlineChange, onCallingDeadlineChange, extraSlot,
}: RecruiterAssignModalProps) {
  const initials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const sorted = [...team].sort((a, b) => (a.sourcing_load + a.calling_load) - (b.sourcing_load + b.calling_load));
  const minLoad = (sorted[0]?.sourcing_load ?? 0) + (sorted[0]?.calling_load ?? 0);
  const allSelected = sorted.length > 0 && sorted.every(m => selected.includes(m.id));
  const handleSelectAll = () => sorted.forEach(m => { if (!selected.includes(m.id)) onToggle(m.id); });
  const handleDeselectAll = () => sorted.forEach(m => { if (selected.includes(m.id)) onToggle(m.id); });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 flex-shrink-0">
          <div>
            <h3 className="text-base font-bold text-slate-800">{title}</h3>
            <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
          </div>
          <button onClick={onCancel} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {/* Unified recruiter picker */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-sm font-bold text-blue-700">Assign Recruiters</h4>
              {!loadingTeam && sorted.length > 0 && (
                <button type="button"
                  onClick={allSelected ? handleDeselectAll : handleSelectAll}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors">
                  {allSelected ? 'Deselect All' : 'Select All'}
                </button>
              )}
            </div>
            <p className="text-xs text-slate-400 mb-3">Each recruiter will handle sourcing and screening for this JD.</p>
            {loadingTeam
              ? <div className="flex items-center gap-2 py-4 text-sm text-slate-400"><Loader2 size={16} className="animate-spin" /> Loading team…</div>
              : sorted.length === 0
              ? <p className="text-sm text-slate-400">No team members in your pod yet.</p>
              : <div className="grid grid-cols-3 gap-2.5">
                  {sorted.map(m => {
                    const isSelected = selected.includes(m.id);
                    const load = m.sourcing_load + m.calling_load;
                    const isRec = load === minLoad;
                    return (
                      <button key={m.id} type="button" onClick={() => onToggle(m.id)}
                        className={`relative text-left rounded-xl border-2 p-3 transition-all ${
                          isSelected ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                        }`}>
                        {isSelected && (
                          <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                              <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                        )}
                        <div className="flex items-center gap-2 mb-2 pr-5">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${isSelected ? 'bg-blue-500' : 'bg-slate-400'}`}>
                            {initials(m.name)}
                          </div>
                          <span className="text-xs font-semibold text-slate-800 leading-tight">{m.name}</span>
                        </div>
                        <p className="text-xs text-slate-500">
                          <span className={`font-bold ${load === 0 ? 'text-slate-400' : load < 5 ? 'text-emerald-600' : load < 10 ? 'text-amber-600' : 'text-red-600'}`}>{load}</span> active JDs
                        </p>
                        {isRec && (
                          <span className="mt-1.5 inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700">★ Recommended</span>
                        )}
                      </button>
                    );
                  })}
                </div>
            }
          </div>

          {/* Sourcing target + deadlines (confirm only) */}
          {showDeadlines && (
            <>
              <div className="border border-blue-100 bg-blue-50 rounded-xl p-4">
                <p className="text-xs font-bold text-blue-700 uppercase tracking-widest mb-2">Sourcing Target</p>
                <input type="number" min="1" placeholder="e.g. 20" value={sourcingTarget}
                  onChange={e => onTargetChange?.(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 bg-white" />
                <p className="text-xs text-blue-600 mt-1.5 opacity-80">Shared target across all assigned recruiters.</p>
              </div>
              <div className="border border-amber-100 bg-amber-50 rounded-xl p-4 space-y-3">
                <p className="text-xs font-bold text-amber-700 uppercase tracking-widest">Deadlines (optional)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Sourcing Deadline</label>
                    <input type="datetime-local" value={sourcingDeadline} onChange={e => onSourcingDeadlineChange?.(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-amber-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Calling Deadline</label>
                    <input type="datetime-local" value={callingDeadline} onChange={e => onCallingDeadlineChange?.(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-amber-400" />
                  </div>
                </div>
              </div>
            </>
          )}

          {extraSlot}

          {error && <p className="text-red-500 text-xs bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-slate-100 flex-shrink-0 bg-slate-50">
          <div className="flex-1 text-xs text-slate-500 flex items-center">
            {loadingTeam
              ? <span className="text-slate-400 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Loading team…</span>
              : <><span className="font-semibold text-blue-700">{selected.length} recruiter{selected.length !== 1 ? 's' : ''}</span><span className="ml-1 text-slate-400">selected</span></>
            }
          </div>
          <button type="button" onClick={onCancel}
            className="px-5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
          <button type="button" onClick={onConfirm} disabled={confirming || loadingTeam}
            className="px-6 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-60 hover:opacity-90"
            style={{ backgroundColor: '#3b82f6' }}>
            {confirming ? 'Saving…' : confirmLabel}
          </button>
        </div>
      </div>
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
