import React, { useEffect, useState, useCallback, useMemo } from 'react';
import LottieLib from 'lottie-react';
import reviewedAnim from '../assets/lottie-reviewed.json';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Lottie: React.ComponentType<any> = (LottieLib as any).default ?? LottieLib;
import { useSignal } from '../context/RealtimeContext';
import { X, CheckCircle, AlertCircle, PauseCircle, XCircle, FileText, ExternalLink, UserCheck, Search } from 'lucide-react';
import Layout from '../components/Layout';
import StatusBadge from '../components/StatusBadge';
import ScoreBar from '../components/ScoreBar';
import PaginationBar from '../components/PaginationBar';
import FilterBar, { emptyFilters, toQueryParams, type FilterValues } from '../components/FilterBar';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import type { Candidate, Assessment } from '../types';

// ── Day-grouping helpers ───────────────────────────────────────────────────────

function dayLabel(iso: string | null | undefined): string {
  if (!iso) return 'Unknown Date';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Unknown Date';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const item = new Date(d); item.setHours(0, 0, 0, 0);
  const diff = Math.round((item.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function groupByDay<T>(items: T[], getDate: (item: T) => string | null | undefined): Array<{ label: string; items: T[] }> {
  const groups: { label: string; items: T[] }[] = [];
  const seen = new Map<string, number>();
  for (const item of items) {
    const label = dayLabel(getDate(item));
    if (!seen.has(label)) { seen.set(label, groups.length); groups.push({ label, items: [] }); }
    groups[seen.get(label)!].items.push(item);
  }
  return groups;
}

interface QueueItem {
  candidate: Candidate;
  assessment: Assessment | null;
}

export default function ValidationQueue() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page,    setPage]    = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [total,   setTotal]   = useState(0);
  const [filters, setFilters] = useState<FilterValues>(emptyFilters);
  const [search, setSearch]   = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [selectedItem, setSelectedItem] = useState<QueueItem | null>(null);
  const [fullCandidate, setFullCandidate] = useState<Candidate | null>(null);
  const [comment, setComment] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [rejectOverlay, setRejectOverlay] = useState(false);
  const [rejectReason, setRejectReason]   = useState('');
  const [resumeOpen, setResumeOpen] = useState(false);

  const fetchQueue = useCallback(() => {
    setLoading(true);
    const params: Record<string, string | number> = { skip: (page - 1) * perPage, limit: perPage, ...toQueryParams(filters) };
    if (search) params.search = search;
    api
      .get<{ items: QueueItem[]; total: number } | QueueItem[]>('/validation/queue', { params })
      .then((res) => {
        if (Array.isArray(res.data)) { setQueue(res.data); setTotal(res.data.length); }
        else { setQueue(res.data.items ?? []); setTotal(res.data.total ?? 0); }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, perPage, filters, search]);

  // Reset to page 1 whenever filters or search change
  useEffect(() => { setPage(1); }, [filters, search]);

  const validationSignal = useSignal('validation');
  useEffect(() => { fetchQueue(); }, [fetchQueue, validationSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  // map frontend action labels → backend ValidationStatus values
  const ACTION_STATUS: Record<string, string> = {
    validate:    'validated',
    needs_rework:'needs_review',
    on_hold:     'on_hold',
    reject:      'rejected',
  };

  const handleAction = async (action: string) => {
    if (!selectedItem) return;
    setActionLoading(true);
    try {
      await api.post('/validation/action', {
        candidate_id: selectedItem.candidate.id,
        status:   ACTION_STATUS[action] ?? action,
        comments: comment || null,
      });
      setMessage(action === 'validate' ? '✅ Candidate validated!' : `Action completed.`);
      setSelectedItem(null);
      setComment('');
      setRejectOverlay(false);
      setRejectReason('');
      fetchQueue();
      setTimeout(() => setMessage(''), 3000);
    } catch {
      setMessage('Action failed. Please try again.');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectWithReason = async () => {
    if (!selectedItem || !rejectReason.trim()) return;
    setActionLoading(true);
    try {
      await api.post(`/candidates/${selectedItem.candidate.id}/reject`, { reason: rejectReason.trim() });
      setMessage('Candidate rejected.');
      setSelectedItem(null);
      setRejectOverlay(false);
      setRejectReason('');
      setComment('');
      fetchQueue();
      setTimeout(() => setMessage(''), 3000);
    } catch {
      setMessage('Reject failed. Please try again.');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setActionLoading(false);
    }
  };

  const grouped = useMemo(
    () => groupByDay(queue, item => item.candidate.updated_at),
    [queue]
  );

  return (
    <Layout title="Validation Queue">
      {message && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-700 font-medium">
          {message}
        </div>
      )}

      {/* Filters + search */}
      <div className="mb-4 space-y-2">
        <FilterBar value={filters} onChange={setFilters} />
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search candidate, company, role…"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') setSearch(searchInput); }}
              onBlur={() => setSearch(searchInput)}
              className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 bg-white"
            />
          </div>
          {(search || searchInput) && (
            <button
              onClick={() => { setSearch(''); setSearchInput(''); }}
              className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200"
            >
              <X size={11} /> Clear
            </button>
          )}
          {!loading && (
            <p className="text-xs text-slate-400 ml-auto">
              <span className="font-semibold text-slate-600">{total}</span> candidate{total !== 1 ? 's' : ''} pending
            </p>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3 animate-pulse">
            {[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-slate-100 rounded-xl" />)}
          </div>
        ) : queue.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-slate-400">
            <Lottie animationData={reviewedAnim} loop style={{ width: 220, height: 220 }} />
            <p className="text-sm font-medium text-green-600 mt-2">All caught up!</p>
            <p className="text-xs mt-1">Validation queue is empty.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="text-left py-3.5 px-5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Name</th>
                  <th className="text-left py-3.5 px-5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Job / Client</th>
                  <th className="text-center py-3.5 px-5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Score</th>
                  <th className="text-left py-3.5 px-5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Recommend</th>
                  <th className="text-left py-3.5 px-5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Caller</th>
                  {isAdmin && (
                    <th className="text-left py-3.5 px-5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Validator</th>
                  )}
                  <th className="text-left py-3.5 px-5 text-xs font-semibold text-emerald-500 uppercase tracking-wider">Validated By</th>
                  <th className="py-3.5 px-5" />
                </tr>
              </thead>
              <tbody>
                {grouped.map(group => (
                  <>
                    <tr key={`day-${group.label}`}>
                      <td colSpan={isAdmin ? 7 : 6} className="px-5 pt-4 pb-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                            group.label === 'Today' ? 'bg-blue-100 text-blue-700' :
                            group.label === 'Yesterday' ? 'bg-slate-100 text-slate-600' :
                            'bg-slate-50 text-slate-500'
                          }`}>{group.label}</span>
                          <span className="flex-1 border-t border-slate-100" />
                          <span className="text-[10px] text-slate-400">{group.items.length} candidate{group.items.length !== 1 ? 's' : ''}</span>
                        </div>
                      </td>
                    </tr>
                    {group.items.map((item, i) => (
                  <tr
                    key={item.candidate.id}
                    className={`border-b border-slate-50 hover:bg-blue-50/20 transition-colors ${i % 2 === 1 ? 'bg-slate-50/40' : ''}`}
                  >
                    <td className="py-3.5 px-5 font-semibold text-slate-800">{item.candidate.full_name}</td>
                    <td className="py-3.5 px-5">
                      <p className="text-slate-700 truncate max-w-xs">{item.candidate.job_title ?? '—'}</p>
                      <p className="text-xs text-slate-400">{item.candidate.client_name ?? '—'}</p>
                    </td>
                    <td className="py-3.5 px-5 text-center">
                      {Number.isFinite(Number(item.candidate.overall_score)) ? (
                        <span className={`inline-block px-2 py-0.5 rounded-lg text-xs font-bold ${Number(item.candidate.overall_score) >= 3.5 ? 'bg-green-100 text-green-700' : Number(item.candidate.overall_score) >= 3 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600'}`}>
                          {Number(item.candidate.overall_score).toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-5">
                      {item.candidate.auto_recommendation ? (
                        <StatusBadge status={item.candidate.auto_recommendation} type="recommendation" />
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-5 text-slate-500 text-xs">{item.candidate.assigned_to_name ?? '—'}</td>
                    {isAdmin && (
                      <td className="py-3.5 px-5 text-xs">
                        {item.candidate.assigned_validator_name ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-semibold">
                            <UserCheck size={11} /> {item.candidate.assigned_validator_name}
                          </span>
                        ) : (
                          <span className="text-amber-600 font-semibold">⚠ Unassigned</span>
                        )}
                      </td>
                    )}
                    <td className="py-3.5 px-5 text-xs">
                      {(item.candidate as any).validated_by_name ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-semibold">
                          <UserCheck size={11} /> {(item.candidate as any).validated_by_name}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      <button
                        onClick={() => {
                          setSelectedItem(item);
                          setFullCandidate(null);
                          setComment('');
                          setResumeOpen(false);
                          api.get<Candidate>(`/candidates/${item.candidate.id}`)
                            .then((r) => setFullCandidate(r.data))
                            .catch(() => {});
                        }}
                        className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white hover:opacity-90 transition-all"
                        style={{ backgroundColor: '#3b82f6' }}
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > perPage && (
          <div className="bg-white rounded-2xl border border-slate-100 mt-3 px-4 shadow-sm">
            <PaginationBar page={page} total={total} perPage={perPage}
              onPageChange={setPage} onPerPageChange={setPerPage} loading={loading} />
          </div>
        )}
      </div>

      {/* Review overlay — centered modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl flex flex-col w-full" style={{ maxWidth: 'min(960px, 96vw)', maxHeight: '92vh' }}>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black text-white flex-shrink-0" style={{ backgroundColor: '#1a2744' }}>
                  {(selectedItem.candidate.full_name ?? 'C').charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">{selectedItem.candidate.full_name}</h3>
                  <p className="text-xs text-slate-500">{selectedItem.candidate.job_title} · {selectedItem.candidate.client_name}</p>
                </div>
                {Number.isFinite(Number(selectedItem.candidate.overall_score)) && (
                  <div className={`ml-2 px-3 py-1 rounded-xl text-sm font-black text-white ${Number(selectedItem.candidate.overall_score) >= 3.5 ? 'bg-green-500' : Number(selectedItem.candidate.overall_score) >= 3 ? 'bg-yellow-400' : 'bg-red-500'}`}>
                    {Number(selectedItem.candidate.overall_score).toFixed(1)} / 5
                  </div>
                )}
                {selectedItem.candidate.auto_recommendation && (
                  <StatusBadge status={selectedItem.candidate.auto_recommendation} type="recommendation" />
                )}
              </div>
              <button onClick={() => setSelectedItem(null)} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            {/* Scrollable body — two columns */}
            <div className="overflow-y-auto flex-1 p-6">
              {!fullCandidate ? (
                <div className="space-y-3">
                  {[1,2,3].map(i => <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />)}
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                  {/* ── LEFT COLUMN ── */}
                  <div className="space-y-5">

                    {/* Sourcer details */}
                    <section>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Sourcer Details</p>
                      <div className="bg-slate-50 rounded-xl p-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                        {([
                          ['Mobile', fullCandidate.mobile],
                          ['Email', fullCandidate.email],
                          ['City', fullCandidate.city],
                          ['Education', fullCandidate.education],
                          ['Experience', fullCandidate.exp_range],
                          ['Current Company', fullCandidate.current_company],
                          ['Naukri Active', fullCandidate.naukri_active],
                          ['Immediate Joiner', fullCandidate.immediate_joiner],
                          ['Lead Source', fullCandidate.lead_source],
                          ['Sourcing Date', fullCandidate.sourcing_date],
                        ] as [string, string | null][]).map(([label, value]) => (
                          <div key={label}>
                            <span className="text-slate-400">{label}</span>
                            <p className="font-semibold text-slate-700">{value ?? '—'}</p>
                          </div>
                        ))}
                        <div className="col-span-2">
                          <span className="text-slate-400">Skills</span>
                          <p className="font-semibold text-slate-700">{fullCandidate.skills ?? '—'}</p>
                        </div>
                        {fullCandidate.linkedin_url && (
                          <div className="col-span-2">
                            <span className="text-slate-400">LinkedIn</span>
                            <a href={fullCandidate.linkedin_url} target="_blank" rel="noreferrer"
                              className="flex items-center gap-1 text-blue-600 hover:underline font-semibold truncate">
                              <ExternalLink size={11} />{fullCandidate.linkedin_url}
                            </a>
                          </div>
                        )}
                      </div>
                    </section>

                    {/* Call logs */}
                    {fullCandidate.call_logs && fullCandidate.call_logs.length > 0 && (
                      <section>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Call Logs</p>
                        <div className="space-y-2">
                          {fullCandidate.call_logs.map((log) => (
                            <div key={log.id} className="bg-slate-50 rounded-xl p-3 text-xs">
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-semibold text-slate-700">{log.call_date}</span>
                                {log.outcome && <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">{log.outcome}</span>}
                              </div>
                              {log.notes && <p className="text-slate-500">{log.notes}</p>}
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    {/* Assessment caller details — every filled field */}
                    {selectedItem.assessment && (
                      <section>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Caller Assessment — All Fields</p>

                        {/* Stage A: Verification */}
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Verification</p>
                        <div className="bg-slate-50 rounded-xl p-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs mb-3">
                          {([
                            ['Full Name Confirmed', selectedItem.assessment.full_name_confirmed],
                            ['Email Verified', selectedItem.assessment.email_verified],
                            ['Alt Phone', selectedItem.assessment.alt_phone],
                            ['LinkedIn Verified', selectedItem.assessment.linkedin_verified],
                            ['Total Exp', selectedItem.assessment.total_exp != null ? `${selectedItem.assessment.total_exp} yrs` : null],
                            ['Relevant Exp', selectedItem.assessment.relevant_exp != null ? `${selectedItem.assessment.relevant_exp} yrs` : null],
                            ['Qualification', selectedItem.assessment.qualification],
                            ['Last Company', selectedItem.assessment.last_company],
                            ['Last Tenure', selectedItem.assessment.last_tenure],
                            ['Tenure From → To', selectedItem.assessment.tenure_from && selectedItem.assessment.tenure_to ? `${selectedItem.assessment.tenure_from} → ${selectedItem.assessment.tenure_to}` : null],
                            ['Notice Period', selectedItem.assessment.notice_period_weeks != null ? `${selectedItem.assessment.notice_period_weeks} weeks` : null],
                            ['LWD Confirmed', selectedItem.assessment.lwd_confirmed],
                            ['Last Working Day', selectedItem.assessment.last_working_day],
                          ] as [string, string | null][]).map(([label, value]) => (
                            <div key={label}><span className="text-slate-400">{label}</span><p className="font-semibold text-slate-700">{value ?? '—'}</p></div>
                          ))}
                        </div>

                        {/* Stage B: CTC & Role */}
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">CTC &amp; Role</p>
                        <div className="bg-slate-50 rounded-xl p-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs mb-3">
                          {([
                            ['Deploying Client', selectedItem.assessment.deploying_client],
                            ['Role / Position', selectedItem.assessment.role_position],
                            ['Primary Skill Stack', selectedItem.assessment.primary_skill_stack],
                            ['Current CTC', selectedItem.assessment.current_ctc != null ? `₹${selectedItem.assessment.current_ctc}L` : null],
                            ['Expected CTC', selectedItem.assessment.expected_ctc != null ? `₹${selectedItem.assessment.expected_ctc}L` : null],
                            ['Hike %', selectedItem.assessment.hike_pct != null ? `${selectedItem.assessment.hike_pct.toFixed(1)}%` : null],
                            ['Skill Match Last Role', selectedItem.assessment.skill_match_last_role],
                            ['Tech Q Used', selectedItem.assessment.tech_q_used],
                          ] as [string, string | null][]).map(([label, value]) => (
                            <div key={label}><span className="text-slate-400">{label}</span><p className="font-semibold text-slate-700">{value ?? '—'}</p></div>
                          ))}
                        </div>

                        {/* Stage D: Intent & Risk */}
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Intent &amp; Risk</p>
                        <div className="bg-slate-50 rounded-xl p-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs mb-3">
                          {([
                            ['Project Status', selectedItem.assessment.project_status],
                            ['Open to Relocation', selectedItem.assessment.open_to_relocation],
                            ['Work Mode Pref', selectedItem.assessment.work_mode_pref],
                            ['Work Auth Status', selectedItem.assessment.work_auth_status],
                            ['Current City', selectedItem.assessment.current_city],
                            ['Reason for Change', selectedItem.assessment.reason_for_change],
                            ['Interviewing Elsewhere', selectedItem.assessment.interviewing_elsewhere],
                            ['Offers in Hand', selectedItem.assessment.offers_in_hand],
                            ['Counter Offer Risk', selectedItem.assessment.counter_offer_risk],
                            ['Last Appraisal Context', selectedItem.assessment.last_appraisal_context],
                            ['Email Acknowledged', selectedItem.assessment.email_acknowledged],
                            ['Validation Slot Locked', selectedItem.assessment.validation_slot_locked],
                            ['Pass to Validation', selectedItem.assessment.pass_to_validation],
                          ] as [string, string | null][]).map(([label, value]) => (
                            <div key={label}><span className="text-slate-400">{label}</span><p className="font-semibold text-slate-700">{value ?? '—'}</p></div>
                          ))}
                        </div>

                        {selectedItem.assessment.caller_notes && (
                          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-800">
                            <span className="font-bold">Caller Notes: </span>{selectedItem.assessment.caller_notes}
                          </div>
                        )}
                        {selectedItem.assessment.red_flags && (() => {
                          try {
                            const flags = JSON.parse(selectedItem.assessment.red_flags) as string[];
                            return flags.length > 0 ? (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {flags.map((f) => <span key={f} className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600 font-medium">{f}</span>)}
                              </div>
                            ) : null;
                          } catch { return null; }
                        })()}
                      </section>
                    )}
                  </div>

                  {/* ── RIGHT COLUMN ── */}
                  <div className="space-y-5">

                    {/* Consultant Profile */}
                    {fullCandidate.consultant_profile && (
                      <section>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Consultant Profile</p>
                        <div className="bg-slate-50 rounded-xl p-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                          {([
                            ['Resignation Accepted', fullCandidate.consultant_profile.resignation_acceptance],
                            ['KT Status', fullCandidate.consultant_profile.replacement_kt_status],
                            ['Personal Laptop', fullCandidate.consultant_profile.personal_laptop],
                            ['Payroll', fullCandidate.consultant_profile.payroll],
                            ['Current Work Location', fullCandidate.consultant_profile.current_work_location],
                            ['Client Work Location', fullCandidate.consultant_profile.client_work_location],
                            ['Work Timings', fullCandidate.consultant_profile.current_work_timings],
                            ['Notice Negotiable Upto', fullCandidate.consultant_profile.notice_negotiable_upto],
                            ['Offers Pipeline', fullCandidate.consultant_profile.offers_pipeline],
                            ['Interview Pipeline', fullCandidate.consultant_profile.interview_pipeline],
                            ['Date of Birth', fullCandidate.consultant_profile.dob],
                            ['Telephonic Availability', fullCandidate.consultant_profile.telephonic_availability],
                            ['IDE Installed', fullCandidate.consultant_profile.ide_installed],
                            ['WiFi / Data', fullCandidate.consultant_profile.wifi_connectivity],
                            ['Marital Status', fullCandidate.consultant_profile.marital_status],
                            ['Health Issues', fullCandidate.consultant_profile.health_issues],
                            ['Planned Leaves', fullCandidate.consultant_profile.planned_leaves],
                            ['Interview Avail (2 days)', fullCandidate.consultant_profile.interview_availability_2d],
                            ['Upcoming Travel', fullCandidate.consultant_profile.upcoming_travel],
                          ] as [string, string | null | undefined][]).filter(([, v]) => v != null && v !== '').map(([label, value]) => (
                            <div key={label}>
                              <span className="text-slate-400">{label}</span>
                              <p className="font-semibold text-slate-700">{String(value)}</p>
                            </div>
                          ))}
                          {fullCandidate.consultant_profile.role_responsibilities && (
                            <div className="col-span-2">
                              <span className="text-slate-400">Role Responsibilities</span>
                              <p className="font-semibold text-slate-700 whitespace-pre-line">{String(fullCandidate.consultant_profile.role_responsibilities)}</p>
                            </div>
                          )}
                        </div>
                      </section>
                    )}

                    {/* Score bars */}
                    {selectedItem.assessment ? (
                      <section>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Assessment Scores</p>
                        <div className="space-y-2 bg-slate-50 rounded-xl p-4">
                          <ScoreBar score={selectedItem.assessment.comm_score} label="Communication" />
                          <ScoreBar score={selectedItem.assessment.self_art_score} label="Self Articulation" />
                          <ScoreBar score={selectedItem.assessment.role_art_score} label="Role Articulation" />
                          <ScoreBar score={selectedItem.assessment.resume_skill_score} label="Resume Skills" />
                          <ScoreBar score={selectedItem.assessment.tech_qa_score} label="Technical Q&A" />
                          <ScoreBar score={selectedItem.assessment.paraphrase_score} label="Paraphrasing" />
                          <ScoreBar score={selectedItem.assessment.confidence_score} label="Confidence" />
                          <ScoreBar score={selectedItem.assessment.gut_score} label="Gut Score" />
                          <div className="border-t border-slate-200 pt-2 mt-1">
                            <ScoreBar score={selectedItem.assessment.tech_score} label="Tech (avg)" />
                            <ScoreBar score={selectedItem.assessment.soft_skill_score} label="Soft (avg)" />
                            <ScoreBar score={selectedItem.assessment.overall_score} label="Overall" />
                          </div>
                        </div>
                      </section>
                    ) : (
                      <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-400 text-center">No assessment on record.</div>
                    )}

                    {/* Resume */}
                    <section>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Resume</p>
                        {fullCandidate.resume_data && (
                          <button onClick={() => setResumeOpen(!resumeOpen)}
                            className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                            <FileText size={12} />{resumeOpen ? 'Collapse' : 'Expand'}
                          </button>
                        )}
                      </div>
                      {fullCandidate.resume_data ? (
                        <iframe
                          src={fullCandidate.resume_data}
                          title="Resume"
                          className="w-full rounded-xl border border-slate-200"
                          style={{ height: resumeOpen ? '600px' : '320px' }}
                        />
                      ) : (
                        <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-400 text-center flex items-center justify-center gap-2">
                          <FileText size={16} className="opacity-40" />No resume uploaded.
                        </div>
                      )}
                    </section>
                  </div>
                </div>
              )}
            </div>

            {/* Footer — validator comment + actions */}
            <div className="border-t border-slate-100 px-6 py-4 flex-shrink-0 space-y-3">
              <textarea
                rows={2}
                placeholder="Validator comment (optional)…"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 resize-none"
              />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <button onClick={() => handleAction('validate')} disabled={actionLoading}
                  className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-green-500 text-white text-sm font-semibold hover:bg-green-600 disabled:opacity-60 transition-colors">
                  <CheckCircle size={15} />Validate
                </button>
                <button onClick={() => handleAction('needs_rework')} disabled={actionLoading}
                  className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-60 transition-colors">
                  <AlertCircle size={15} />Needs Rework
                </button>
                <button onClick={() => handleAction('on_hold')} disabled={actionLoading}
                  className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-amber-400 text-white text-sm font-semibold hover:bg-amber-500 disabled:opacity-60 transition-colors">
                  <PauseCircle size={15} />On Hold
                </button>
                <button onClick={() => { setRejectOverlay(true); setRejectReason(''); }} disabled={actionLoading}
                  className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 disabled:opacity-60 transition-colors">
                  <XCircle size={15} />Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── DL Reject Reason Overlay ── */}
      {rejectOverlay && selectedItem && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <XCircle size={18} className="text-red-500" /> Reject Candidate
                </h3>
                <p className="text-sm text-slate-500 mt-0.5">{selectedItem.candidate.full_name}</p>
              </div>
              <button onClick={() => setRejectOverlay(false)} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Reason for rejection <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={4}
                  placeholder="e.g. Profile doesn't meet technical requirements, communication below threshold…"
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-50 resize-none"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setRejectOverlay(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRejectWithReason}
                  disabled={actionLoading || !rejectReason.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 disabled:opacity-50 transition-colors"
                >
                  {actionLoading ? 'Rejecting…' : 'Confirm Reject'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
