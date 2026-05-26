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
  email_text: string;
  created_at: string;
}

function showToast(msg: string, ok = true) {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;padding:12px 20px;
    border-radius:10px;font-size:13px;font-weight:600;color:#fff;
    box-shadow:0 4px 20px rgba(0,0,0,0.18);
    background:${ok ? '#10b981' : '#ef4444'}`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

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
            {job.submitted_count}
          </span>
        )}
      </div>
    </button>
  );
}

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
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<{ id: number; subject: string; created_at: string; email_text: string }[]>([]);
  const [historyOpen, setHistoryOpen] = useState<number | null>(null);

  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api.get('/client-emails/jobs')
      .then(r => setJobs(r.data))
      .catch(() => showToast('Failed to load jobs', false))
      .finally(() => setJobsLoading(false));
  }, []);

  const selectJob = useCallback((job: JobSummary) => {
    setSelectedJob(job);
    setResult(null);
    setBody('');
    setSubject('');
    setSelected(new Set());
    setShowHistory(false);
    setCandidatesLoading(true);
    api.get(`/client-emails/job-candidates/${job.id}`)
      .then(r => { setJobDetail(r.data.job); setCandidates(r.data.candidates); })
      .catch(() => showToast('Failed to load candidates', false))
      .finally(() => setCandidatesLoading(false));
  }, []);

  const toggleAll = () => {
    setSelected(selected.size === candidates.length ? new Set() : new Set(candidates.map(c => c.id)));
  };

  const generate = async () => {
    if (!selectedJob || selected.size === 0) return;
    setGenerating(true);
    setResult(null);
    setBody('');
    try {
      const r = await api.post('/client-emails/generate', {
        job_id: selectedJob.id,
        candidate_ids: Array.from(selected),
      });
      setResult(r.data);
      setSubject(r.data.subject);
      setBody(r.data.email_text);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Generation failed';
      showToast(msg, false);
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
      showToast('Failed to load history', false);
    }
  };

  const copySubject = () => {
    navigator.clipboard.writeText(subject);
    showToast('Subject copied');
  };

  const copyBody = () => {
    navigator.clipboard.writeText(body);
    showToast('Email body copied — paste into your mail client');
  };

  const selectAllBody = () => {
    bodyRef.current?.select();
  };

  const filtered = jobs.filter(j =>
    j.role_title.toLowerCase().includes(jobSearch.toLowerCase()) ||
    j.client_name.toLowerCase().includes(jobSearch.toLowerCase())
  );

  return (
    <Layout>
      <div className="flex h-screen overflow-hidden bg-slate-50">

        {/* LEFT: jobs */}
        <div className="flex flex-col flex-shrink-0 border-r border-slate-200 bg-white" style={{ width: 260 }}>
          <div className="px-4 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2 mb-3">
              <Mail size={15} className="text-blue-600" />
              <h2 className="font-bold text-sm text-slate-800">Client Emails</h2>
            </div>
            <input
              type="text"
              placeholder="Search jobs..."
              value={jobSearch}
              onChange={e => setJobSearch(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-400 bg-slate-50"
            />
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {jobsLoading ? (
              <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-blue-400" /></div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center py-8 gap-2">
                <Briefcase size={24} className="text-slate-300" />
                <p className="text-xs text-slate-400">No jobs found</p>
              </div>
            ) : filtered.map(job => (
              <JobCard key={job.id} job={job} selected={selectedJob?.id === job.id} onClick={() => selectJob(job)} />
            ))}
          </div>
        </div>

        {/* MIDDLE: candidates */}
        <div className="flex flex-col flex-shrink-0 border-r border-slate-200 bg-white" style={{ width: 280 }}>
          {!selectedJob ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
              <Lottie animationData={meetingAnim} loop style={{ width: 180, height: 180 }} />
              <p className="text-xs text-slate-500 text-center font-medium">Select a job from the left</p>
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                <p className="font-bold text-sm text-slate-800 truncate">{jobDetail?.role_title || selectedJob.role_title}</p>
                <p className="text-xs text-slate-500 truncate">{jobDetail?.client_name || selectedJob.client_name}</p>
              </div>

              <div className="flex-1 overflow-y-auto">
                {candidatesLoading ? (
                  <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-blue-400" /></div>
                ) : candidates.length === 0 ? (
                  <div className="flex flex-col items-center py-10 gap-2 px-4">
                    <Users size={24} className="text-slate-300" />
                    <p className="text-xs text-slate-400 text-center">No submitted candidates for this job</p>
                  </div>
                ) : (
                  <>
                    <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                      <button onClick={toggleAll} className="flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-blue-600 transition-colors">
                        {selected.size === candidates.length
                          ? <CheckSquare size={13} className="text-blue-500" />
                          : <Square size={13} />
                        }
                        {selected.size === candidates.length ? 'Deselect All' : 'Select All'}
                      </button>
                      <span className="text-[10px] text-slate-400">{selected.size}/{candidates.length}</span>
                    </div>
                    <div className="p-2 space-y-1.5">
                      {candidates.map(c => (
                        <button
                          key={c.id}
                          onClick={() => setSelected(prev => { const n = new Set(prev); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })}
                          className="w-full text-left px-3 py-2.5 rounded-lg border transition-all"
                          style={{ borderColor: selected.has(c.id) ? '#3b82f6' : '#e2e8f0', background: selected.has(c.id) ? '#eff6ff' : '#fff' }}
                        >
                          <div className="flex items-start gap-2">
                            <div className="mt-0.5 flex-shrink-0">
                              {selected.has(c.id) ? <CheckSquare size={12} className="text-blue-500" /> : <Square size={12} className="text-slate-400" />}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-xs text-slate-800 truncate">{c.name}</p>
                              <p className="text-[10px] text-slate-500 truncate">{c.current_role}</p>
                              {c.experience && <p className="text-[10px] text-slate-400 mt-0.5">{c.experience} yrs{c.location ? ` · ${c.location}` : ''}</p>}
                              {c.ctc_info && c.ctc_info !== 'Not disclosed' && <p className="text-[10px] text-green-600 truncate">{c.ctc_info}</p>}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {candidates.length > 0 && (
                <div className="p-3 border-t border-slate-100 space-y-2">
                  <button
                    onClick={generate}
                    disabled={selected.size === 0 || generating}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: selected.size === 0 ? '#e2e8f0' : 'linear-gradient(135deg,#1e3a8a,#3b82f6)', color: selected.size === 0 ? '#94a3b8' : '#fff' }}
                  >
                    {generating ? <><Loader2 size={13} className="animate-spin" />Generating…</> : <><Wand2 size={13} />Generate Email ({selected.size})</>}
                  </button>
                  <button onClick={loadHistory} className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                    <RefreshCw size={11} />History
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* RIGHT: email output */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* ── no job selected ── */}
          {!selectedJob && (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <Lottie animationData={aiRobotAnim} loop style={{ width: 210, height: 210 }} />
              <div className="text-center">
                <p className="text-sm font-bold text-slate-700">AI-Powered Client Emails</p>
                <p className="text-xs text-slate-400 mt-1">Select a job → pick candidates → generate email</p>
              </div>
            </div>
          )}

          {/* ── history ── */}
          {selectedJob && showHistory && (
            <div className="flex flex-col h-full">
              <div className="px-6 py-3 border-b border-slate-200 bg-white flex items-center justify-between">
                <p className="font-bold text-sm text-slate-800">History — {selectedJob.role_title}</p>
                <button onClick={() => setShowHistory(false)} className="text-xs text-blue-600 font-semibold hover:underline">Back</button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {history.length === 0
                  ? <p className="text-sm text-slate-400 text-center py-12">No emails generated yet.</p>
                  : history.map(h => (
                    <div key={h.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      <button
                        onClick={() => setHistoryOpen(historyOpen === h.id ? null : h.id)}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
                      >
                        <div className="text-left min-w-0">
                          <p className="font-semibold text-sm text-slate-800 truncate">{h.subject}</p>
                          <p className="text-[10px] text-slate-400">{new Date(h.created_at).toLocaleString()}</p>
                        </div>
                        {historyOpen === h.id ? <ChevronDown size={13} className="text-slate-400 flex-shrink-0" /> : <ChevronRight size={13} className="text-slate-400 flex-shrink-0" />}
                      </button>
                      {historyOpen === h.id && (
                        <div className="border-t border-slate-100">
                          <div className="px-4 py-2 bg-slate-50 flex gap-2 justify-end">
                            <button
                              onClick={() => { navigator.clipboard.writeText(h.subject); showToast('Subject copied'); }}
                              className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors"
                            >
                              <ClipboardCopy size={10} /> Subject
                            </button>
                            <button
                              onClick={() => { navigator.clipboard.writeText(h.email_text); showToast('Body copied'); }}
                              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors"
                            >
                              <ClipboardCopy size={10} /> Copy Body
                            </button>
                          </div>
                          <pre className="px-5 py-4 text-xs text-slate-700 whitespace-pre-wrap leading-relaxed" style={{ maxHeight: 360, overflowY: 'auto', fontFamily: 'inherit' }}>
                            {h.email_text}
                          </pre>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* ── generating ── */}
          {selectedJob && !showHistory && generating && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <Lottie animationData={aiRobotAnim} loop style={{ width: 170, height: 170 }} />
              <p className="text-sm font-bold text-slate-700">Generating email…</p>
              <p className="text-xs text-slate-400">AI is analyzing candidates, may take ~20 sec</p>
            </div>
          )}

          {/* ── result ── */}
          {selectedJob && !showHistory && !generating && result && (
            <div className="flex flex-col h-full">

              {/* Subject row */}
              <div className="px-5 py-3 bg-white border-b border-slate-200 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Subject</p>
                  <input
                    type="text"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    className="w-full text-sm font-semibold text-slate-800 outline-none bg-transparent"
                  />
                </div>
                <button
                  onClick={copySubject}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:border-blue-300 hover:text-blue-600 bg-white transition-colors"
                >
                  <ClipboardCopy size={11} /> Copy Subject
                </button>
              </div>

              {/* Body toolbar */}
              <div className="px-5 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <p className="text-xs text-slate-500 font-medium">Email Body — edit freely before copying</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={selectAllBody}
                    className="text-xs text-slate-500 hover:text-blue-600 font-semibold transition-colors"
                  >
                    Select All
                  </button>
                  <button
                    onClick={generate}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-500 hover:text-blue-600 hover:border-blue-300 transition-colors"
                  >
                    <RefreshCw size={10} /> Regenerate
                  </button>
                  <button
                    onClick={copyBody}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors"
                  >
                    <ClipboardCopy size={11} /> Copy Body
                  </button>
                </div>
              </div>

              {/* Editable textarea */}
              <div className="flex-1 overflow-hidden p-4">
                <textarea
                  ref={bodyRef}
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  className="w-full h-full resize-none text-sm text-slate-800 bg-white border border-slate-200 rounded-xl px-5 py-4 outline-none leading-loose"
                  style={{ fontFamily: 'inherit', fontSize: 13.5, lineHeight: '1.9' }}
                  spellCheck={false}
                />
              </div>
            </div>
          )}

          {/* ── job selected, not yet generated ── */}
          {selectedJob && !showHistory && !generating && !result && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <Lottie animationData={aiRobotAnim} loop style={{ width: 190, height: 190 }} />
              <p className="text-sm font-bold text-slate-700">Select candidates & click Generate</p>
            </div>
          )}

        </div>
      </div>
    </Layout>
  );
}
