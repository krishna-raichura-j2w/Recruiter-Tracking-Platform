import React, { useCallback, useEffect, useRef, useState } from 'react';
import LottieLib from 'lottie-react';
import aiRobotAnim from '../assets/lottie-ai-robot.json';
import meetingAnim from '../assets/lottie-business-meeting.json';
import Layout from '../components/Layout';
import api from '../api/client';
import {
  Briefcase,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  Loader2,
  Mail,
  RefreshCw,
  Square,
  Users,
  Wand2,
} from 'lucide-react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Lottie: React.ComponentType<any> = (LottieLib as any).default ?? LottieLib;

// ── types ────────────────────────────────────────────────────────────────────

interface JobSummary {
  id: number;
  role_title: string;
  client_name: string;
  status: string;
  submitted_count: number;
}

interface CandidateRow {
  id: number;
  name: string;
  current_role: string;
  experience: string;
  location: string;
  ctc_info: string;
  submitted_at: string;
}

interface JobDetail {
  id: number;
  role_title: string;
  client_name: string;
  location: string;
  skill_stack: string;
  min_experience: number | null;
  max_experience: number | null;
  salary_range: string;
}

interface GeneratedEmail {
  id: number;
  subject: string;
  email_html: string;
  email_data: {
    greeting: string;
    intro: string;
    skills: string[];
    candidates: {
      name: string;
      current_role: string;
      experience: string;
      location: string;
      ctc_info: string;
      summary: string;
      skill_analysis: Record<string, { has: boolean; note: string }>;
    }[];
    closing: string;
  };
  created_at: string;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function toast(msg: string, type: 'success' | 'error' = 'success') {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = `
    position:fixed;bottom:24px;right:24px;z-index:9999;
    padding:12px 20px;border-radius:10px;font-size:13px;font-weight:600;
    color:#fff;box-shadow:0 4px 20px rgba(0,0,0,0.18);
    background:${type === 'success' ? '#10b981' : '#ef4444'};
    animation:slideUp 0.3s ease;
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ── sub-components ────────────────────────────────────────────────────────────

function JobCard({ job, selected, onClick }: { job: JobSummary; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-3 rounded-xl border transition-all duration-150"
      style={{
        borderColor: selected ? '#3b82f6' : '#e2e8f0',
        background: selected ? '#eff6ff' : '#fff',
        boxShadow: selected ? '0 0 0 2px #bfdbfe' : 'none',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-sm text-slate-800 truncate">{job.role_title}</p>
          <p className="text-xs text-slate-500 mt-0.5 truncate">{job.client_name}</p>
        </div>
        {job.submitted_count > 0 && (
          <span className="flex-shrink-0 bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
            {job.submitted_count} submitted
          </span>
        )}
      </div>
    </button>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function ClientEmailGenerator() {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobSearch, setJobSearch] = useState('');

  const [selectedJob, setSelectedJob] = useState<JobSummary | null>(null);
  const [jobDetail, setJobDetail] = useState<JobDetail | null>(null);
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GeneratedEmail | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<{ id: number; subject: string; created_at: string; email_html: string }[]>([]);
  const [historyOpen, setHistoryOpen] = useState<number | null>(null);

  const previewRef = useRef<HTMLIFrameElement>(null);

  // Load jobs on mount
  useEffect(() => {
    api.get('/client-emails/jobs')
      .then(r => setJobs(r.data))
      .catch(() => toast('Failed to load jobs', 'error'))
      .finally(() => setJobsLoading(false));
  }, []);

  // Load candidates when job selected
  const selectJob = useCallback((job: JobSummary) => {
    setSelectedJob(job);
    setResult(null);
    setSelected(new Set());
    setShowHistory(false);
    setCandidatesLoading(true);
    api.get(`/client-emails/job-candidates/${job.id}`)
      .then(r => {
        setJobDetail(r.data.job);
        setCandidates(r.data.candidates);
      })
      .catch(() => toast('Failed to load candidates', 'error'))
      .finally(() => setCandidatesLoading(false));
  }, []);

  const toggleCandidate = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === candidates.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(candidates.map(c => c.id)));
    }
  };

  const generate = async () => {
    if (!selectedJob || selected.size === 0) return;
    setGenerating(true);
    setResult(null);
    try {
      const r = await api.post('/client-emails/generate', {
        job_id: selectedJob.id,
        candidate_ids: Array.from(selected),
      });
      setResult(r.data);
      setEditSubject(r.data.subject);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Generation failed';
      toast(msg, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const loadHistory = async () => {
    if (!selectedJob) return;
    try {
      const r = await api.get(`/client-emails/history/${selectedJob.id}`);
      setHistory(r.data);
      setShowHistory(true);
    } catch {
      toast('Failed to load history', 'error');
    }
  };

  const copyHTML = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.email_html);
    toast('HTML copied to clipboard');
  };

  const copyPlain = () => {
    if (!result) return;
    const div = document.createElement('div');
    div.innerHTML = result.email_html;
    navigator.clipboard.writeText(div.innerText);
    toast('Plain text copied to clipboard');
  };

  // Inject preview into iframe
  useEffect(() => {
    if (result && previewRef.current) {
      const doc = previewRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(result.email_html);
        doc.close();
      }
    }
  }, [result]);

  const filtered = jobs.filter(j =>
    j.role_title.toLowerCase().includes(jobSearch.toLowerCase()) ||
    j.client_name.toLowerCase().includes(jobSearch.toLowerCase())
  );

  return (
    <Layout>
      <div className="flex h-[calc(100vh-0px)] overflow-hidden bg-slate-50">

        {/* ── LEFT PANEL: Job list ─────────────────────────────────────── */}
        <div
          className="flex flex-col flex-shrink-0 border-r border-slate-200 bg-white"
          style={{ width: 280 }}
        >
          {/* Header */}
          <div className="px-4 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2 mb-3">
              <Mail size={16} className="text-blue-600" />
              <h2 className="font-bold text-sm text-slate-800">Client Email Generator</h2>
            </div>
            <input
              type="text"
              placeholder="Search jobs..."
              value={jobSearch}
              onChange={e => setJobSearch(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-400 bg-slate-50"
            />
          </div>

          {/* Job list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {jobsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 size={20} className="animate-spin text-blue-500" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center py-8 gap-2">
                <Briefcase size={28} className="text-slate-300" />
                <p className="text-xs text-slate-400">No jobs found</p>
              </div>
            ) : (
              filtered.map(job => (
                <JobCard
                  key={job.id}
                  job={job}
                  selected={selectedJob?.id === job.id}
                  onClick={() => selectJob(job)}
                />
              ))
            )}
          </div>
        </div>

        {/* ── MIDDLE PANEL: Candidates ──────────────────────────────────── */}
        <div
          className="flex flex-col flex-shrink-0 border-r border-slate-200 bg-white"
          style={{ width: 320 }}
        >
          {!selectedJob ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
              <Lottie animationData={meetingAnim} loop style={{ width: 200, height: 200 }} />
              <p className="text-sm text-slate-500 text-center font-medium">
                Select a job to see submitted candidates
              </p>
            </div>
          ) : (
            <>
              {/* Job info strip */}
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                <p className="font-bold text-sm text-slate-800 truncate">{jobDetail?.role_title || selectedJob.role_title}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {jobDetail?.client_name || selectedJob.client_name}
                  {jobDetail?.location && <span className="text-slate-400"> · {jobDetail.location}</span>}
                </p>
                {jobDetail && (
                  <div className="flex gap-2 mt-1.5 flex-wrap">
                    {(jobDetail.min_experience || jobDetail.max_experience) && (
                      <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-semibold">
                        {jobDetail.min_experience}–{jobDetail.max_experience} yrs
                      </span>
                    )}
                    {jobDetail.salary_range && (
                      <span className="text-[10px] bg-green-50 text-green-600 px-2 py-0.5 rounded-full font-semibold">
                        {jobDetail.salary_range}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Candidate list */}
              <div className="flex-1 overflow-y-auto">
                {candidatesLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 size={20} className="animate-spin text-blue-500" />
                  </div>
                ) : candidates.length === 0 ? (
                  <div className="flex flex-col items-center py-8 gap-2 px-4">
                    <Users size={28} className="text-slate-300" />
                    <p className="text-xs text-slate-400 text-center">
                      No submitted candidates for this job
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Select all */}
                    <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                      <button
                        onClick={toggleAll}
                        className="flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-blue-600 transition-colors"
                      >
                        {selected.size === candidates.length
                          ? <CheckSquare size={14} className="text-blue-500" />
                          : <Square size={14} />
                        }
                        {selected.size === candidates.length ? 'Deselect All' : 'Select All'}
                      </button>
                      <span className="text-[10px] text-slate-400">{selected.size}/{candidates.length} selected</span>
                    </div>

                    <div className="p-2 space-y-1.5">
                      {candidates.map(c => (
                        <button
                          key={c.id}
                          onClick={() => toggleCandidate(c.id)}
                          className="w-full text-left px-3 py-2.5 rounded-lg border transition-all duration-150"
                          style={{
                            borderColor: selected.has(c.id) ? '#3b82f6' : '#e2e8f0',
                            background: selected.has(c.id) ? '#eff6ff' : '#fff',
                          }}
                        >
                          <div className="flex items-start gap-2">
                            <div className="mt-0.5 flex-shrink-0">
                              {selected.has(c.id)
                                ? <CheckSquare size={13} className="text-blue-500" />
                                : <Square size={13} className="text-slate-400" />
                              }
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-xs text-slate-800 truncate">{c.name}</p>
                              <p className="text-[10px] text-slate-500 truncate">{c.current_role}</p>
                              <div className="flex gap-2 mt-1 flex-wrap">
                                {c.experience && (
                                  <span className="text-[10px] text-slate-400">{c.experience} yrs</span>
                                )}
                                {c.location && (
                                  <span className="text-[10px] text-slate-400">· {c.location}</span>
                                )}
                              </div>
                              {c.ctc_info && c.ctc_info !== 'Not disclosed' && (
                                <p className="text-[10px] text-green-600 mt-0.5 truncate">{c.ctc_info}</p>
                              )}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Action buttons */}
              {candidates.length > 0 && (
                <div className="p-3 border-t border-slate-100 space-y-2">
                  <button
                    onClick={generate}
                    disabled={selected.size === 0 || generating}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      background: selected.size === 0 ? '#e2e8f0' : 'linear-gradient(135deg,#1e3a8a,#3b82f6)',
                      color: selected.size === 0 ? '#94a3b8' : '#fff',
                    }}
                  >
                    {generating
                      ? <><Loader2 size={13} className="animate-spin" /> Generating…</>
                      : <><Wand2 size={13} /> Generate Email ({selected.size})</>
                    }
                  </button>
                  <button
                    onClick={loadHistory}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    <RefreshCw size={11} /> View History
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── RIGHT PANEL: Preview / Result ───────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selectedJob ? (
            /* No job selected */
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <Lottie animationData={aiRobotAnim} loop style={{ width: 220, height: 220 }} />
              <div className="text-center">
                <p className="text-base font-bold text-slate-700">AI-Powered Client Emails</p>
                <p className="text-xs text-slate-400 mt-1 max-w-xs">
                  Select a job → pick submitted candidates → generate a professional shortlist email with skills analysis
                </p>
              </div>
            </div>
          ) : showHistory ? (
            /* History view */
            <div className="flex flex-col h-full">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-white">
                <h3 className="font-bold text-sm text-slate-800">Email History — {selectedJob.role_title}</h3>
                <button
                  onClick={() => setShowHistory(false)}
                  className="text-xs text-blue-600 hover:underline font-semibold"
                >
                  Back to Generator
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-3">
                {history.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-12">No emails generated yet for this job.</p>
                ) : (
                  history.map(h => (
                    <div key={h.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      <button
                        onClick={() => setHistoryOpen(historyOpen === h.id ? null : h.id)}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
                      >
                        <div className="text-left">
                          <p className="font-semibold text-sm text-slate-800">{h.subject}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {new Date(h.created_at).toLocaleString()}
                          </p>
                        </div>
                        {historyOpen === h.id
                          ? <ChevronDown size={14} className="text-slate-400" />
                          : <ChevronRight size={14} className="text-slate-400" />
                        }
                      </button>
                      {historyOpen === h.id && (
                        <div className="border-t border-slate-100">
                          <div className="p-3 flex gap-2 bg-slate-50">
                            <button
                              onClick={() => { navigator.clipboard.writeText(h.email_html); toast('HTML copied'); }}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:text-blue-600 hover:border-blue-300 transition-colors"
                            >
                              <ClipboardCopy size={11} /> Copy HTML
                            </button>
                          </div>
                          <iframe
                            srcDoc={h.email_html}
                            style={{ width: '100%', height: 400, border: 'none' }}
                            title="Email preview"
                          />
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : generating ? (
            /* Generating state */
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <Lottie animationData={aiRobotAnim} loop style={{ width: 180, height: 180 }} />
              <p className="text-sm font-bold text-slate-700">Analyzing candidates & generating email…</p>
              <p className="text-xs text-slate-400">This may take 15–30 seconds</p>
            </div>
          ) : result ? (
            /* Result view */
            <div className="flex flex-col h-full">
              {/* Toolbar */}
              <div className="px-6 py-3 border-b border-slate-200 bg-white flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Subject</label>
                  <input
                    type="text"
                    value={editSubject}
                    onChange={e => setEditSubject(e.target.value)}
                    className="w-full text-sm font-semibold text-slate-800 border-none outline-none bg-transparent"
                  />
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={copyHTML}
                    className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors"
                  >
                    <ClipboardCopy size={12} /> Copy HTML
                  </button>
                  <button
                    onClick={copyPlain}
                    className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors"
                  >
                    <ClipboardCopy size={12} /> Copy Plain
                  </button>
                  <button
                    onClick={generate}
                    disabled={generating}
                    className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-200 transition-colors"
                  >
                    <RefreshCw size={11} /> Regenerate
                  </button>
                </div>
              </div>

              {/* Email preview in iframe */}
              <div className="flex-1 overflow-hidden bg-slate-100 p-4">
                <iframe
                  ref={previewRef}
                  style={{ width: '100%', height: '100%', border: 'none', borderRadius: 12 }}
                  title="Email preview"
                />
              </div>
            </div>
          ) : (
            /* Job selected but not generated yet */
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <Lottie animationData={aiRobotAnim} loop style={{ width: 200, height: 200 }} />
              <div className="text-center">
                <p className="text-sm font-bold text-slate-700">Ready to Generate</p>
                <p className="text-xs text-slate-400 mt-1 max-w-xs">
                  Select one or more candidates from the list, then click Generate Email
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
