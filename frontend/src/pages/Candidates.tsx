import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSignal } from '../context/RealtimeContext';
import { useForm } from 'react-hook-form';
import { Plus, X, Search, Eye, UserPlus, Sparkles, AlignLeft, Image, FileText, Loader2, ChevronRight, Users } from 'lucide-react';
import LottieLib from 'lottie-react';
import searchAnim from '../assets/lottie-search.json';
import Layout from '../components/Layout';
import PaginationBar from '../components/PaginationBar';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { uploadToS3 } from '../api/upload';
import type { Candidate, Job, User } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Lottie: React.ComponentType<any> = (LottieLib as any).default ?? LottieLib;

const EDUCATION_OPTIONS = [
  'B.Tech/BE', 'M.Tech/ME', 'BCA', 'MCA', 'B.Sc', 'M.Sc',
  'B.Com', 'MBA', 'Diploma', 'PhD', 'Other',
];
const EXP_RANGES = ['0-1 yr', '1-3 yrs', '3-5 yrs', '5-8 yrs', '8-12 yrs', '12-15 yrs', '15+ yrs'];
const CITIES = ['Bangalore', 'Hyderabad', 'Chennai', 'Mumbai', 'Delhi', 'Pune', 'Noida', 'Other'];
const LEAD_SOURCES = ['Naukri', 'LinkedIn', 'Referral', 'Direct', 'Other'];
const GENDER_OPTIONS = ['Male', 'Female', 'Other'];

interface CandidateForm {
  job_id: number;
  // Legacy
  full_name: string;
  mobile: string;
  email: string;
  linkedin_url: string;
  education: string;
  city: string;
  exp_range: string;
  current_company: string;
  skills: string;
  naukri_active: string;
  immediate_joiner: string;
  lead_source: string;
  sourcing_date: string;
  // New compulsory fields
  first_name: string;
  last_name: string;
  contact_phone: string;
  gender: string;
  location: string;
  designation: string;
  employer: string;
  min_experience: number | string;
  max_experience: number | string;
  current_ctc: number | string;
  expected_ctc: number | string;
}

type ExtractTab = 'text' | 'image' | 'pdf';

export default function Candidates() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const jobIdFilter = searchParams.get('job_id');

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [callers, setCallers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  // Pagination
  const [page,    setPage]    = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [total,   setTotal]   = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState('');
  const [emailCheckError, setEmailCheckError] = useState('');
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [assignModal, setAssignModal] = useState<{ candidateId: number } | null>(null);
  const [memberPanel, setMemberPanel] = useState<{
    id: number; name: string; role: string; filterType: 'sourced' | 'assigned';
  } | null>(null);

  // AI extraction state
  const [extractTab, setExtractTab] = useState<ExtractTab>('text');
  const [extractText, setExtractText] = useState('');
  const [extractFile, setExtractFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  const [extracted, setExtracted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Resume upload state
  const [resumeKey, setResumeKey]   = useState<string | null>(null);  // S3 key to save
  const [resumeUrl, setResumeUrl]   = useState<string | null>(null);  // presigned URL for preview
  const [resumeName, setResumeName] = useState('');
  const [resumeUploading, setResumeUploading] = useState(false);
  const resumeInputRef = useRef<HTMLInputElement>(null);

  const role = user?.role ?? '';
  const sr   = user?.secondary_role ?? '';
  const isRecruiter    = role === 'recruiter'     || sr === 'recruiter';
  const isDeliveryLead = role === 'delivery_lead' || sr === 'delivery_lead';
  const isKam          = role === 'kam'            || sr === 'kam';
  const canAdd    = role === 'admin' || isDeliveryLead || isRecruiter;
  const canAssign = role === 'admin' || isDeliveryLead;
  // DLs source/call too — give them the same enhanced add-candidate experience
  // (AI extract, pool-verify, live-refresh) that recruiters see.
  const canSourceLikeRecruiter = isRecruiter || isDeliveryLead;

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<CandidateForm>();

  const fetchCandidates = useCallback(() => {
    setLoading(true);
    const params: Record<string, string | number> = {
      skip: (page - 1) * perPage,
      limit: perPage,
    };
    if (jobIdFilter)  params.job_id = jobIdFilter;
    if (statusFilter) params.status = statusFilter;
    if (search)       params.search = search;
    api
      .get<{ items: Candidate[]; total: number }>('/candidates', { params })
      .then((res) => {
        setCandidates(res.data.items ?? (res.data as unknown as Candidate[]));
        setTotal(res.data.total ?? 0);
      })
      .catch(() => { })
      .finally(() => setLoading(false));
  }, [page, perPage, jobIdFilter, statusFilter, search]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchCandidates(); }, [fetchCandidates]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [jobIdFilter, statusFilter, search]);

  // Live refresh on realtime signal (only if on page 1 to avoid confusion)
  const candidatesSignal = useSignal('candidates');
  useEffect(() => { if (candidatesSignal > 0 && page === 1) fetchCandidates(); }, [candidatesSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    api.get<{ items: Job[] } | Job[]>('/jobs', { params: { limit: 0 } })
      .then((res) => {
        const items = Array.isArray(res.data) ? res.data : (res.data as { items: Job[] }).items ?? [];
        setJobs(items);
      }).catch(() => { });
    if (canAssign) {
      api.get<User[]>('/users', { params: { role: 'recruiter' } })
        .then((res) => setCallers(Array.isArray(res.data) ? res.data : []))
        .catch(() => { });
    }
  }, [canAssign]);

  const closeAddModal = () => {
    setShowAddModal(false);
    reset();
    setApiError('');
    setEmailCheckError('');
    setCheckingEmail(false);
    setExtractTab('text');
    setExtractText('');
    setExtractFile(null);
    setExtractError('');
    setExtracted(false);
    setResumeKey(null);
    setResumeUrl(null);
    setResumeName('');
  };

  const onSubmit = async (data: CandidateForm) => {
    setApiError('');
    if (emailCheckError) {
      setApiError('Cannot add this candidate — they are already onboarded in the Offer Letter system.');
      return;
    }
    if (!resumeKey) {
      setApiError('Resume is required. Please upload a PDF or Word document.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/candidates', {
        ...data,
        job_id:           Number(data.job_id),
        min_experience:   Number(data.min_experience),
        max_experience:   Number(data.max_experience),
        current_ctc:      Number(data.current_ctc),
        expected_ctc:     Number(data.expected_ctc),
        resume:           resumeKey,
        resume_data:      resumeKey, // legacy mirror
      });
      closeAddModal();
      fetchCandidates();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (err?.response?.status === 409 && detail) {
        setApiError(detail);
      } else {
        setApiError('Failed to add candidate. Please check all required fields.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleResumeUpload = async (file: File) => {
    setResumeUploading(true);
    try {
      const { key, url } = await uploadToS3(file, 'resumes');
      setResumeKey(key);
      setResumeUrl(url);
      setResumeName(file.name);
    } catch {
      setApiError('Resume upload failed. Please try again.');
    } finally {
      setResumeUploading(false);
    }
  };

  const handleExtract = async () => {
    setExtractError('');
    if (extractTab === 'text' && !extractText.trim()) {
      setExtractError('Paste resume text before extracting.');
      return;
    }
    if ((extractTab === 'image' || extractTab === 'pdf') && !extractFile) {
      setExtractError('Select a file before extracting.');
      return;
    }
    setExtracting(true);
    try {
      const fd = new FormData();
      if (extractTab === 'text') {
        fd.append('text', extractText.trim());
      } else {
        fd.append('file', extractFile!);
      }
      const res = await api.post('/resume-extract', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const p = res.data.profile;
      if (p.name) {
        setValue('full_name', p.name);
        const parts = String(p.name).trim().split(/\s+/);
        if (parts.length) setValue('first_name', parts[0]);
        if (parts.length > 1) setValue('last_name', parts.slice(1).join(' '));
      }
      if (p.mobile_number) {
        setValue('mobile', p.mobile_number);
        setValue('contact_phone', p.mobile_number);
      }
      if (p.email) setValue('email', p.email);
      if (p.linkedin_url && p.linkedin_url !== 'N/A') setValue('linkedin_url', p.linkedin_url);
      if (p.education) setValue('education', p.education);
      if (p.current_location) setValue('city', p.current_location);
      if (p.experience_range) {
        setValue('exp_range', p.experience_range);
        // Try to parse "3-5 yrs" → min/max
        const m = String(p.experience_range).match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
        if (m) {
          setValue('min_experience', parseFloat(m[1]));
          setValue('max_experience', parseFloat(m[2]));
        }
      }
      if (p.current_company) {
        setValue('current_company', p.current_company);
        setValue('employer', p.current_company);
      }
      if (p.designation) setValue('designation', p.designation);
      if (p.relevant_skills) setValue('skills', p.relevant_skills);
      if (p.immediate_joinee) setValue('immediate_joiner', p.immediate_joinee);
      if (p.sourcing_date) setValue('sourcing_date', p.sourcing_date);
      if (p.profile_active_naukri) setValue('naukri_active', p.profile_active_naukri);
      setExtracted(true);
    } catch {
      setExtractError('Extraction failed. Please check your input and try again.');
    } finally {
      setExtracting(false);
    }
  };

  const handleAssign = async (userId: number) => {
    if (!assignModal) return;
    try {
      await api.post(`/candidates/${assignModal.candidateId}/assign?user_id=${userId}`);
      setAssignModal(null);
      fetchCandidates();
    } catch { }
  };

  // Date helper
  const fmtDate = (s: string | null) => {
    if (!s) return '—';
    return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  // Quick date filter
  const [dateFilter, setDateFilter] = useState<'all' | '7d' | '30d'>('all');
  const [recruiterFilter, setRecruiterFilter] = useState('');

  const uniqueRecruiters = [...new Map(
    candidates.filter(c => c.sourced_by_id).map(c => [c.sourced_by_id, c.sourced_by_name])
  ).entries()].map(([id, name]) => ({ id: id as number, name: name as string }));

  // Name search goes server-side; recruiter/date filters are client-side (small post-filter)
  const filtered = candidates.filter((c) => {
    if (recruiterFilter && String(c.sourced_by_id) !== recruiterFilter) return false;
    if (dateFilter !== 'all' && c.sourcing_date) {
      const days = dateFilter === '7d' ? 7 : 30;
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
      if (new Date(c.sourcing_date) < cutoff) return false;
    }
    return true;
  });

  const STATUS_OPTIONS = [
    'sourced', 'handed_to_recruiter', 'call_in_progress',
    'ready_for_validation', 'validated', 'needs_rework', 'on_hold',
    'rejected', 'submitted_to_client', 'interview_stage', 'offer_rolled_out',
    'joined', 'backed_out',
  ];

  const TAB_CONFIG: { id: ExtractTab; label: string; icon: React.ReactNode }[] = [
    { id: 'text', label: 'Paste Text', icon: <AlignLeft size={14} /> },
    { id: 'image', label: 'Upload Image', icon: <Image size={14} /> },
    { id: 'pdf', label: 'Upload PDF / Word', icon: <FileText size={14} /> },
  ];

  const pageTitle = isRecruiter
    ? 'My Candidates'
    : isKam
    ? 'Candidate Profiles'
    : jobIdFilter
    ? 'Candidates for Job'
    : 'Candidates';

  return (
    <Layout title={pageTitle}>
      {/* Live-refresh indicator */}
      {canSourceLikeRecruiter && (
        <div className="flex items-center gap-2 mb-4 text-xs text-slate-400">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block" />
          Auto-refreshes every 30 s
          <button
            onClick={fetchCandidates}
            className="ml-2 px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-500 font-semibold transition-colors"
          >
            Refresh now
          </button>
        </div>
      )}
      {/* Filters + actions */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white text-slate-700 focus:outline-none focus:border-blue-400"
        >
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
            </option>
          ))}
        </select>

        {canAdd && (
          <button
            onClick={() => {
              setShowAddModal(true);
              if (jobIdFilter) setValue('job_id', Number(jobIdFilter));
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 shadow-sm"
            style={{ backgroundColor: '#3b82f6' }}
          >
            <Plus size={16} />
            Add Candidate
          </button>
        )}
      </div>

      {/* Secondary filter row: date + sourcer + caller */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {/* Date filter */}
        <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5 text-xs">
          {(['all', '7d', '30d'] as const).map((d) => (
            <button key={d} onClick={() => setDateFilter(d)}
              className={`px-3 py-1.5 rounded-md font-semibold transition-all ${dateFilter === d ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>
              {d === 'all' ? 'All Time' : d === '7d' ? 'Last 7 days' : 'Last 30 days'}
            </button>
          ))}
        </div>

        {/* Recruiter quick filter (DL / admin) */}
        {isDeliveryLead && uniqueRecruiters.length > 0 && (
          <select value={recruiterFilter} onChange={(e) => setRecruiterFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-white text-slate-700 focus:outline-none focus:border-blue-400">
            <option value="">All Recruiters</option>
            {uniqueRecruiters.map((r) => <option key={r.id} value={String(r.id)}>{r.name}</option>)}
          </select>
        )}

        {(recruiterFilter || dateFilter !== 'all') && (
          <button onClick={() => { setRecruiterFilter(''); setDateFilter('all'); }}
            className="text-xs px-2 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center gap-1">
            <X size={11} /> Clear filters
          </button>
        )}
        <span className="text-xs text-slate-400">{filtered.length} of {candidates.length}</span>
      </div>

      {/* KAM legend */}
      {isKam && (
        <div className="flex flex-wrap items-center gap-3 mb-3 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-green-100 border border-green-300 inline-block" />
            DL Verified — ready for submission
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-red-50 border border-red-200 inline-block" />
            Rejected (DL or KAM)
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-white border border-slate-200 inline-block" />
            Pending / In progress
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3 animate-pulse">
            {[...Array(6)].map((_, i) => <div key={i} className="h-12 bg-slate-100 rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-slate-400">
            <Lottie animationData={searchAnim} loop style={{ width: 200, height: 200 }} />
            <p className="text-sm font-medium text-slate-500 mt-2">No candidates found.</p>
            <p className="text-xs mt-1">Try adjusting your search or filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="text-left py-3.5 px-5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Name</th>
                  <th className="text-left py-3.5 px-5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Job / Client</th>
                  <th className="text-left py-3.5 px-5 text-xs font-semibold text-slate-400 uppercase tracking-wider">City / Exp</th>
                  {(isDeliveryLead || isKam) && (
                    <th className="text-left py-3.5 px-5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Recruiter</th>
                  )}
                  {(isDeliveryLead || isKam) && (
                    <th className="text-left py-3.5 px-5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Validated By</th>
                  )}
                  <th className="text-left py-3.5 px-5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="text-center py-3.5 px-5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Score</th>
                  <th className="text-left py-3.5 px-5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Recommend</th>
                  <th className="py-3.5 px-5" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => (
                  <tr
                    key={c.id}
                    className={`border-b border-slate-50 hover:bg-blue-50/20 transition-colors ${
                      isKam && (c.status === 'validated' || c.status === 'submitted_to_client')
                        ? 'bg-green-50/40 border-l-2 border-l-green-400'
                        : isKam && c.status === 'rejected'
                        ? 'bg-red-50/20'
                        : i % 2 === 1 ? 'bg-slate-50/40' : ''
                    }`}
                  >
                    <td className="py-3.5 px-5">
                      <p className="font-semibold text-slate-800">{c.full_name}</p>
                      {c.sourcing_date && (
                        <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                          <span>📅</span> {fmtDate(c.sourcing_date)}
                        </p>
                      )}
                      {c.status === 'rejected' && c.rejected_by && (
                        <p className="text-xs text-red-600 font-semibold mt-0.5 flex items-center gap-1">
                          ✕ Rejected by {c.rejected_by}
                        </p>
                      )}
                      {c.status === 'rejected' && c.rejection_reason && (
                        <p className="text-xs text-red-400 mt-0.5 line-clamp-1" title={c.rejection_reason}>
                          {c.rejection_reason}
                        </p>
                      )}
                    </td>
                    <td className="py-3.5 px-5">
                      <p className="text-slate-700 truncate max-w-36">{c.job_title ?? '—'}</p>
                      <p className="text-xs text-slate-400">{c.client_name ?? '—'}</p>
                    </td>
                    <td className="py-3.5 px-5">
                      <p className="text-slate-500">{c.city ?? '—'}</p>
                      <p className="text-xs text-slate-400">{c.exp_range ?? '—'}</p>
                    </td>

                    {/* Recruiter column */}
                    {(isDeliveryLead || isKam) && (
                      <td className="py-3.5 px-5">
                        {c.sourced_by_name ? (
                          <button
                            onClick={() => c.sourced_by_id && setMemberPanel({
                              id: c.sourced_by_id,
                              name: c.sourced_by_name!,
                              role: 'recruiter',
                              filterType: 'sourced',
                            })}
                            className="text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-100 px-2 py-1 rounded-lg inline-flex items-center gap-1 hover:bg-teal-100 cursor-pointer"
                          >
                            {c.sourced_by_name} <ChevronRight size={11} />
                          </button>
                        ) : <span className="text-xs text-slate-400">—</span>}
                        {c.assigned_to_name && c.assigned_to_id !== c.sourced_by_id && (
                          <p className="text-[10px] text-slate-400 mt-0.5">{c.assigned_to_name}</p>
                        )}
                      </td>
                    )}

                    {/* Validated By column */}
                    {(isDeliveryLead || isKam) && (
                      <td className="py-3.5 px-5">
                        {c.validated_by_name ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700">
                            ✓ {c.validated_by_name}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    )}

                    <td className="py-3.5 px-5"><StatusBadge status={c.status} /></td>

                    <td className="py-3.5 px-5 text-center">
                      {c.overall_score != null ? (
                        <span className={`inline-block px-2 py-0.5 rounded-lg text-xs font-bold ${
                          c.overall_score >= 4 ? 'bg-green-100 text-green-700'
                          : c.overall_score >= 3.25 ? 'bg-amber-100 text-amber-700'
                          : 'bg-red-100 text-red-600'
                        }`}>
                          {c.overall_score.toFixed(1)}
                        </span>
                      ) : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="py-3.5 px-5">
                      {c.auto_recommendation
                        ? <StatusBadge status={c.auto_recommendation} type="recommendation" />
                        : <span className="text-slate-300 text-xs">—</span>}
                    </td>

                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-2 justify-end">
                        {canAssign && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setAssignModal({ candidateId: c.id }); }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                            title="Reassign to caller"
                          >
                            <UserPlus size={15} />
                          </button>
                        )}
                        <button
                          onClick={() => navigate(`/candidates/${c.id}`)}
                          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-slate-50 text-slate-600 font-semibold hover:bg-slate-100 transition-colors"
                        >
                          <Eye size={13} /> View
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > perPage && (
          <div className="bg-white rounded-2xl border border-slate-100 mt-3 px-4 shadow-sm">
            <PaginationBar
              page={page}
              total={total}
              perPage={perPage}
              onPageChange={setPage}
              onPerPageChange={setPerPage}
              loading={loading}
            />
          </div>
        )}
      </div>

      {/* Add Candidate Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto scrollbar-thin">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 sticky top-0 bg-white z-10">
              <h3 className="text-base font-bold text-slate-800">Add Candidate</h3>
              <button
                onClick={closeAddModal}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            {/* AI Extraction Panel — anyone who sources (recruiter or DL) */}
            {canSourceLikeRecruiter && (
              <div className="px-6 pt-5 pb-4 border-b border-slate-100 bg-gradient-to-br from-violet-50 to-blue-50">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-1.5 rounded-lg bg-violet-100">
                    <Sparkles size={14} className="text-violet-600" />
                  </div>
                  <span className="text-sm font-bold text-violet-700">AI Profile Extract</span>
                  <span className="text-xs text-slate-400 ml-1">— paste or upload to auto-fill below</span>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 mb-3 bg-white rounded-xl p-1 border border-slate-200 w-fit">
                  {TAB_CONFIG.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => { setExtractTab(t.id); setExtractFile(null); setExtractError(''); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${extractTab === t.id
                          ? 'bg-violet-600 text-white shadow-sm'
                          : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                        }`}
                    >
                      {t.icon}
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* Input area */}
                {extractTab === 'text' ? (
                  <textarea
                    rows={5}
                    placeholder="Paste the candidate's resume or profile text here…"
                    value={extractText}
                    onChange={(e) => setExtractText(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-50 resize-none font-mono text-slate-700 placeholder-slate-300"
                  />
                ) : (
                  <div
                    className="flex flex-col items-center justify-center gap-2 py-5 rounded-xl border-2 border-dashed border-slate-200 bg-white cursor-pointer hover:border-violet-300 hover:bg-violet-50/30 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {extractFile ? (
                      <>
                        <div className="p-2 rounded-lg bg-violet-100">
                          {extractTab === 'pdf' ? <FileText size={18} className="text-violet-600" /> : <Image size={18} className="text-violet-600" />}
                        </div>
                        <p className="text-sm font-semibold text-violet-700">{extractFile.name}</p>
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
                        <p className="text-xs text-slate-400">
                          {extractTab === 'pdf' ? '.pdf, .docx, .doc' : 'JPG, PNG, WebP, GIF'}
                        </p>
                      </>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept={extractTab === 'pdf' ? '.pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword' : 'image/jpeg,image/png,image/webp,image/gif'}
                      onChange={(e) => {
                        setExtractFile(e.target.files?.[0] ?? null);
                        setExtractError('');
                      }}
                    />
                  </div>
                )}

                {extractError && (
                  <p className="mt-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{extractError}</p>
                )}

                <div className="mt-3 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleExtract}
                    disabled={extracting}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60 transition-all hover:opacity-90"
                    style={{ backgroundColor: '#7c3aed' }}
                  >
                    {extracting ? (
                      <><Loader2 size={14} className="animate-spin" /> Extracting…</>
                    ) : (
                      <><Sparkles size={14} /> Extract with AI</>
                    )}
                  </button>
                  {extracted && (
                    <span className="text-xs text-green-600 font-semibold bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg">
                      Fields filled — review and confirm below
                    </span>
                  )}
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
              {canSourceLikeRecruiter && extracted && (
                <p className="text-xs text-violet-600 font-medium bg-violet-50 border border-violet-100 rounded-lg px-3 py-2">
                  Review all extracted fields below. Edit anything before confirming.
                </p>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Job *</label>
                  <select
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                    {...register('job_id', { required: true })}
                  >
                    <option value="">Select job…</option>
                    {(jobIdFilter
                      ? jobs.filter(j => j.id === Number(jobIdFilter))
                      : jobs
                    ).map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.client_name} — {j.role_title}
                      </option>
                    ))}
                  </select>
                  {errors.job_id && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Full Name *</label>
                  <input type="text" placeholder="Priya Sharma" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" {...register('full_name', { required: true })} />
                  {errors.full_name && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">First Name *</label>
                  <input type="text" placeholder="Priya" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" {...register('first_name', { required: true })} />
                  {errors.first_name && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Last Name *</label>
                  <input type="text" placeholder="Sharma" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" {...register('last_name', { required: true })} />
                  {errors.last_name && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email *</label>
                  <div className="relative">
                    <input
                      type="email"
                      placeholder="priya@example.com"
                      className={`w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 ${
                        emailCheckError
                          ? 'border-red-400 focus:border-red-400 focus:ring-red-50'
                          : 'border-slate-200 focus:border-blue-400 focus:ring-blue-50'
                      }`}
                      {...register('email', { required: true })}
                      onBlur={async (e) => {
                        const email = e.target.value.trim();
                        setEmailCheckError('');
                        if (!email || !email.includes('@')) return;
                        setCheckingEmail(true);
                        try {
                          const res = await api.get<{ onboarded: boolean; checked: boolean }>(
                            `/candidates/check-email?email=${encodeURIComponent(email)}`
                          );
                          if (res.data.checked && res.data.onboarded) {
                            setEmailCheckError('This candidate is already onboarded in the Offer Letter system and cannot be added to this job.');
                          }
                        } catch {
                          // silently ignore check failures
                        } finally {
                          setCheckingEmail(false);
                        }
                      }}
                    />
                    {checkingEmail && (
                      <span className="absolute right-3 top-2.5 text-xs text-slate-400 animate-pulse">Checking…</span>
                    )}
                  </div>
                  {errors.email && <p className="text-red-500 text-xs mt-1">Required</p>}
                  {emailCheckError && (
                    <p className="text-red-600 text-xs mt-1 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5 flex items-center gap-1">
                      🚫 {emailCheckError}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Contact Phone *</label>
                  <input type="tel" placeholder="+91 9XXXXXXXXX" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" {...register('contact_phone', { required: true })} />
                  {errors.contact_phone && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Gender *</label>
                  <select className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" {...register('gender', { required: true })}>
                    <option value="">Select</option>
                    {GENDER_OPTIONS.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                  {errors.gender && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Location *</label>
                  <input type="text" placeholder="Bangalore" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" {...register('location', { required: true })} />
                  {errors.location && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Designation *</label>
                  <input type="text" placeholder="Software Engineer" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" {...register('designation', { required: true })} />
                  {errors.designation && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Employer *</label>
                  <input type="text" placeholder="TCS, Infosys…" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" {...register('employer', { required: true })} />
                  {errors.employer && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Min Experience (yrs) *</label>
                  <input type="number" step="0.1" placeholder="3" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" {...register('min_experience', { required: true, valueAsNumber: true })} />
                  {errors.min_experience && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Max Experience (yrs) *</label>
                  <input type="number" step="0.1" placeholder="5" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" {...register('max_experience', { required: true, valueAsNumber: true })} />
                  {errors.max_experience && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Current CTC (LPA) *</label>
                  <input type="number" step="0.1" placeholder="12.5" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" {...register('current_ctc', { required: true, valueAsNumber: true })} />
                  {errors.current_ctc && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Expected CTC (LPA) *</label>
                  <input type="number" step="0.1" placeholder="18" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" {...register('expected_ctc', { required: true, valueAsNumber: true })} />
                  {errors.expected_ctc && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Mobile</label>
                  <input type="tel" placeholder="+91 9XXXXXXXXX" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" {...register('mobile')} />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">LinkedIn URL</label>
                  <input type="url" placeholder="https://linkedin.com/in/…" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" {...register('linkedin_url')} />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Education</label>
                  <select className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" {...register('education')}>
                    <option value="">Select</option>
                    {EDUCATION_OPTIONS.map((e) => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">City</label>
                  <select className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" {...register('city')}>
                    <option value="">Select</option>
                    {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Exp Range</label>
                  <select className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" {...register('exp_range')}>
                    <option value="">Select</option>
                    {EXP_RANGES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Current Company</label>
                  <input type="text" placeholder="TCS, Infosys…" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" {...register('current_company')} />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Skills</label>
                  <input type="text" placeholder="React, Python, AWS…" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" {...register('skills')} />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Naukri Active</label>
                  <select className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" {...register('naukri_active')}>
                    <option value="">Select</option>
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Immediate Joiner</label>
                  <select className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" {...register('immediate_joiner')}>
                    <option value="">Select</option>
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Lead Source</label>
                  <select className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" {...register('lead_source')}>
                    <option value="">Select</option>
                    {LEAD_SOURCES.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Sourcing Date</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                    {...register('sourcing_date')}
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Resume (PDF / Word) *</label>
                  <input
                    type="file"
                    ref={resumeInputRef}
                    accept=".pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
                    className="hidden"
                    onChange={(e) => { if (e.target.files?.[0]) handleResumeUpload(e.target.files[0]); }}
                  />
                  {resumeKey ? (
                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-green-200 bg-green-50">
                      <FileText size={15} className="text-green-600 flex-shrink-0" />
                      <a href={resumeUrl ?? '#'} target="_blank" rel="noreferrer" className="text-xs text-green-700 font-medium truncate flex-1 hover:underline">{resumeName}</a>
                      <button type="button" onClick={() => { setResumeKey(null); setResumeUrl(null); setResumeName(''); }} className="text-xs text-red-500 hover:text-red-700 font-medium flex-shrink-0">Remove</button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => resumeInputRef.current?.click()}
                      disabled={resumeUploading}
                      className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl border-2 border-dashed border-slate-200 text-slate-500 text-sm hover:border-blue-400 hover:text-blue-600 transition-colors justify-center disabled:opacity-60"
                    >
                      {resumeUploading ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                      {resumeUploading ? 'Uploading…' : 'Upload Resume (PDF)'}
                    </button>
                  )}
                </div>
              </div>

              {apiError && (
                <p className="text-red-500 text-xs bg-red-50 border border-red-100 rounded-lg px-3 py-2">{apiError}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeAddModal}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-60 hover:opacity-90"
                  style={{ backgroundColor: canSourceLikeRecruiter ? '#7c3aed' : '#3b82f6' }}
                >
                  {submitting
                    ? 'Adding…'
                    : canSourceLikeRecruiter
                      ? 'Confirm & Add'
                      : 'Add Candidate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {assignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-800">Assign to Caller</h3>
              <button onClick={() => setAssignModal(null)} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-1.5 max-h-72 overflow-y-auto scrollbar-thin">
              {callers.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">No callers available.</p>
              ) : (
                callers.map((caller) => (
                  <button
                    key={caller.id}
                    onClick={() => handleAssign(caller.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-blue-50 transition-colors text-left group"
                  >
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: '#3b82f6' }}>
                      {caller.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{caller.name}</p>
                      <p className="text-xs text-slate-400">{caller.email}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      {/* Member Detail Panel */}
      {memberPanel && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]" onClick={() => setMemberPanel(null)} />
          <div className="fixed right-0 top-0 bottom-0 z-50 bg-white shadow-2xl flex flex-col" style={{ width: 420 }}>
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                style={{ backgroundColor: memberPanel.role === 'recruiter' && memberPanel.filterType === 'sourced' ? '#0d9488' : '#3b82f6' }}>
                {memberPanel.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-slate-800">{memberPanel.name}</h3>
                <p className="text-xs text-slate-400 capitalize">{memberPanel.role.replace('_', ' ')}</p>
              </div>
              <button onClick={() => setMemberPanel(null)} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            {/* Filtered candidates for this member */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
                {memberPanel.filterType === 'sourced' ? 'Candidates Sourced' : 'Candidates Assigned'}
              </p>
              {(() => {
                const memberCandidates = candidates.filter((c) =>
                  memberPanel.filterType === 'sourced'
                    ? c.sourced_by_id === memberPanel.id
                    : c.assigned_to_id === memberPanel.id
                );
                if (memberCandidates.length === 0) {
                  return (
                    <div className="text-center py-12 text-slate-400">
                      <Users size={28} className="mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No candidates yet.</p>
                    </div>
                  );
                }
                return (
                  <div className="space-y-2">
                    {memberCandidates.map((c) => (
                      <div key={c.id}
                        className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
                        onClick={() => { setMemberPanel(null); navigate(`/candidates/${c.id}`); }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{c.full_name}</p>
                          <p className="text-xs text-slate-400 truncate">{c.job_title} · {c.client_name}</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <StatusBadge status={c.status} />
                            {c.overall_score != null && (
                              <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                                c.overall_score >= 4 ? 'bg-green-100 text-green-700'
                                : c.overall_score >= 3.25 ? 'bg-amber-100 text-amber-700'
                                : 'bg-red-100 text-red-600'
                              }`}>
                                {c.overall_score.toFixed(1)}
                              </span>
                            )}
                          </div>
                          {/* Show the other side of the assignment */}
                          {memberPanel.filterType === 'sourced' && c.assigned_to_name && (
                            <p className="text-xs text-blue-600 mt-1">→ Caller: {c.assigned_to_name}</p>
                          )}
                          {memberPanel.filterType === 'assigned' && c.sourced_by_name && (
                            <p className="text-xs text-teal-600 mt-1">↑ Sourced by: {c.sourced_by_name}</p>
                          )}
                        </div>
                        <ChevronRight size={14} className="text-slate-300 flex-shrink-0 mt-1" />
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </>
      )}
    </Layout>
  );
}
