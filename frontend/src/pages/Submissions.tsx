import { useEffect, useState } from 'react';
import { useSignal } from '../context/RealtimeContext';
import {
  Send, Phone, Mail, MapPin, Briefcase,
  TrendingUp, Clock, User, ArrowRight, XCircle, X,
  Eye, FileText, ExternalLink, ChevronDown, ChevronUp,
} from 'lucide-react';
import Layout from '../components/Layout';
import StatusBadge from '../components/StatusBadge';
import ScoreBar from '../components/ScoreBar';
import api from '../api/client';
import type { Candidate } from '../types';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ReadyCandidate {
  id: number;
  full_name: string;
  mobile: string | null;
  email: string | null;
  city: string | null;
  skills: string | null;
  exp_range: string | null;
  job_title: string | null;
  client_name: string | null;
  assigned_to_name: string | null;
  overall_score: number | null;
  auto_recommendation: string | null;
  current_ctc: number | null;
  expected_ctc: number | null;
  hike_pct: number | null;
  notice_period_weeks: number | null;
  last_working_day: string | null;
  total_exp: number | null;
  relevant_exp: number | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
}

function ScorePill({ score }: { score: number | null }) {
  if (score == null) return <span className="text-slate-300 text-xs">—</span>;
  const color =
    score >= 4 ? 'bg-green-100 text-green-700'
    : score >= 3.25 ? 'bg-amber-100 text-amber-700'
    : 'bg-red-100 text-red-600';
  return (
    <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-bold ${color}`}>
      {score.toFixed(1)}
    </span>
  );
}

function InfoCell({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-3.5">
      <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">{icon}<span>{label}</span></div>
      <div className="text-sm text-slate-700 font-medium">{children}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <span className="text-slate-400 text-xs">{label}</span>
      <p className="font-semibold text-slate-700 text-xs mt-0.5">{value != null && value !== '' ? String(value) : '—'}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">{title}</p>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="bg-slate-50 rounded-xl p-3 grid grid-cols-2 gap-x-4 gap-y-2">{children}</div>;
}

// ── Full Details Modal ──────────────────────────────────────────────────────────

function FullDetailsModal({ candidate, onClose }: { candidate: Candidate; onClose: () => void }) {
  const a = candidate.assessment;
  const cp = candidate.consultant_profile;
  const [resumeOpen, setResumeOpen] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col" style={{ width: '980px', maxWidth: '96vw', maxHeight: '92vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black text-white flex-shrink-0" style={{ backgroundColor: '#1a2744' }}>
              {candidate.full_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">{candidate.full_name}</h3>
              <p className="text-xs text-slate-500">{candidate.job_title} · {candidate.client_name}</p>
            </div>
            {a?.overall_score != null && (
              <div className={`ml-2 px-3 py-1 rounded-xl text-sm font-black text-white ${Number(a.overall_score) >= 3.5 ? 'bg-green-500' : Number(a.overall_score) >= 3 ? 'bg-yellow-400' : 'bg-red-500'}`}>
                {Number(a.overall_score).toFixed(1)} / 5
              </div>
            )}
            {a?.auto_recommendation && (
              <StatusBadge status={a.auto_recommendation} type="recommendation" />
            )}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-6">
          <div className="grid grid-cols-2 gap-6">

            {/* ── LEFT COLUMN ── */}
            <div className="space-y-5">

              {/* Basic Info */}
              <Section title="Candidate Details">
                <Grid>
                  <DetailRow label="Mobile" value={candidate.mobile} />
                  <DetailRow label="Email" value={candidate.email} />
                  <DetailRow label="City" value={candidate.city} />
                  <DetailRow label="Education" value={candidate.education} />
                  <DetailRow label="Experience" value={candidate.exp_range} />
                  <DetailRow label="Current Company" value={candidate.current_company} />
                  <DetailRow label="Naukri Active" value={candidate.naukri_active} />
                  <DetailRow label="Immediate Joiner" value={candidate.immediate_joiner} />
                  <DetailRow label="Lead Source" value={candidate.lead_source} />
                  <DetailRow label="Sourcing Date" value={candidate.sourcing_date} />
                  <div className="col-span-2"><DetailRow label="Skills" value={candidate.skills} /></div>
                  {candidate.linkedin_url && (
                    <div className="col-span-2">
                      <span className="text-slate-400 text-xs">LinkedIn</span>
                      <a href={candidate.linkedin_url} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1 text-blue-600 hover:underline font-semibold text-xs mt-0.5 truncate">
                        <ExternalLink size={11} />{candidate.linkedin_url}
                      </a>
                    </div>
                  )}
                </Grid>
              </Section>

              {/* Assessment — Verification */}
              {a && (
                <>
                  <Section title="Verification">
                    <Grid>
                      <DetailRow label="Full Name Confirmed" value={a.full_name_confirmed} />
                      <DetailRow label="Email Verified" value={a.email_verified} />
                      <DetailRow label="Alt Phone" value={a.alt_phone} />
                      <DetailRow label="LinkedIn Verified" value={a.linkedin_verified} />
                      <DetailRow label="Total Exp" value={a.total_exp != null ? `${a.total_exp} yrs` : null} />
                      <DetailRow label="Relevant Exp" value={a.relevant_exp != null ? `${a.relevant_exp} yrs` : null} />
                      <DetailRow label="Qualification" value={a.qualification} />
                      <DetailRow label="Last Company" value={a.last_company} />
                      <DetailRow label="Last Tenure" value={a.last_tenure} />
                      <DetailRow label="Tenure" value={a.tenure_from && a.tenure_to ? `${a.tenure_from} → ${a.tenure_to}` : null} />
                      <DetailRow label="Notice Period" value={a.notice_period_weeks != null ? `${a.notice_period_weeks} weeks` : null} />
                      <DetailRow label="LWD Confirmed" value={a.lwd_confirmed} />
                      <DetailRow label="Last Working Day" value={a.last_working_day} />
                    </Grid>
                  </Section>

                  <Section title="CTC & Role">
                    <Grid>
                      <DetailRow label="Deploying Client" value={a.deploying_client} />
                      <DetailRow label="Role / Position" value={a.role_position} />
                      <DetailRow label="Primary Skill Stack" value={a.primary_skill_stack} />
                      <DetailRow label="Current CTC" value={a.current_ctc != null ? `₹${a.current_ctc}L` : null} />
                      <DetailRow label="Expected CTC" value={a.expected_ctc != null ? `₹${a.expected_ctc}L` : null} />
                      <DetailRow label="Hike %" value={a.hike_pct != null ? `${a.hike_pct.toFixed(1)}%` : null} />
                      <DetailRow label="Skill Match Last Role" value={a.skill_match_last_role} />
                      <DetailRow label="Tech Q Used" value={a.tech_q_used} />
                    </Grid>
                  </Section>

                  <Section title="Intent & Risk">
                    <Grid>
                      <DetailRow label="Project Status" value={a.project_status} />
                      <DetailRow label="Open to Relocation" value={a.open_to_relocation} />
                      <DetailRow label="Work Mode Pref" value={a.work_mode_pref} />
                      <DetailRow label="Work Auth Status" value={a.work_auth_status} />
                      <DetailRow label="Current City" value={a.current_city} />
                      <DetailRow label="Reason for Change" value={a.reason_for_change} />
                      <DetailRow label="Interviewing Elsewhere" value={a.interviewing_elsewhere} />
                      <DetailRow label="Offers in Hand" value={a.offers_in_hand} />
                      <DetailRow label="Counter Offer Risk" value={a.counter_offer_risk} />
                      <DetailRow label="Last Appraisal Context" value={a.last_appraisal_context} />
                      <DetailRow label="Email Acknowledged" value={a.email_acknowledged} />
                      <DetailRow label="Validation Slot Locked" value={a.validation_slot_locked} />
                      <DetailRow label="Pass to Validation" value={a.pass_to_validation} />
                    </Grid>
                  </Section>

                  {a.caller_notes && (
                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-800">
                      <span className="font-bold">Caller Notes: </span>{a.caller_notes}
                    </div>
                  )}
                  {a.red_flags && (() => {
                    try {
                      const flags = JSON.parse(a.red_flags) as string[];
                      return flags.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {flags.map((f) => <span key={f} className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600 font-medium">{f}</span>)}
                        </div>
                      ) : null;
                    } catch { return null; }
                  })()}
                </>
              )}
            </div>

            {/* ── RIGHT COLUMN ── */}
            <div className="space-y-5">

              {/* Consultant Profile */}
              {cp && (
                <Section title="Consultant Profile">
                  <Grid>
                    {([
                      ['Resignation Accepted', cp.resignation_acceptance],
                      ['KT Status', cp.replacement_kt_status],
                      ['Personal Laptop', cp.personal_laptop],
                      ['Payroll', cp.payroll],
                      ['Current Work Location', cp.current_work_location],
                      ['Client Work Location', cp.client_work_location],
                      ['Work Timings', cp.current_work_timings],
                      ['Notice Negotiable Upto', cp.notice_negotiable_upto],
                      ['Offers Pipeline', cp.offers_pipeline],
                      ['Interview Pipeline', cp.interview_pipeline],
                      ['Date of Birth', cp.dob],
                      ['Telephonic Availability', cp.telephonic_availability],
                      ['IDE Installed', cp.ide_installed],
                      ['WiFi / Data', cp.wifi_connectivity],
                      ['Marital Status', cp.marital_status],
                      ['Health Issues', cp.health_issues],
                      ['Planned Leaves', cp.planned_leaves],
                      ['Interview Avail (2d)', cp.interview_availability_2d],
                      ['Upcoming Travel', cp.upcoming_travel],
                    ] as [string, string | null | undefined][]).filter(([, v]) => v != null && v !== '').map(([label, value]) => (
                      <DetailRow key={label} label={label} value={String(value)} />
                    ))}
                    {cp.role_responsibilities && (
                      <div className="col-span-2">
                        <DetailRow label="Role Responsibilities" value={cp.role_responsibilities} />
                      </div>
                    )}
                  </Grid>
                </Section>
              )}

              {/* Scores */}
              {a && (
                <Section title="Assessment Scores">
                  <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                    <ScoreBar score={a.comm_score} label="Communication" />
                    <ScoreBar score={a.self_art_score} label="Self Articulation" />
                    <ScoreBar score={a.role_art_score} label="Role Articulation" />
                    <ScoreBar score={a.resume_skill_score} label="Resume Skills" />
                    <ScoreBar score={a.tech_qa_score} label="Technical Q&A" />
                    <ScoreBar score={a.paraphrase_score} label="Paraphrasing" />
                    <ScoreBar score={a.confidence_score} label="Confidence" />
                    <ScoreBar score={a.gut_score} label="Gut Score" />
                    <div className="border-t border-slate-200 pt-2 mt-1">
                      <ScoreBar score={a.tech_score} label="Tech (avg)" />
                      <ScoreBar score={a.soft_skill_score} label="Soft (avg)" />
                      <ScoreBar score={a.overall_score} label="Overall" />
                    </div>
                  </div>
                </Section>
              )}

              {/* Call Logs */}
              {candidate.call_logs && candidate.call_logs.length > 0 && (
                <Section title="Call Logs">
                  <div className="space-y-2">
                    {candidate.call_logs.map((log) => (
                      <div key={log.id} className="bg-slate-50 rounded-xl p-3 text-xs">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-slate-700">{log.call_date}</span>
                          {log.outcome && <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">{log.outcome}</span>}
                        </div>
                        {log.notes && <p className="text-slate-500">{log.notes}</p>}
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Resume */}
              <Section title="Resume">
                {candidate.resume_data ? (
                  <>
                    <div className="flex justify-end mb-1">
                      <button onClick={() => setResumeOpen(!resumeOpen)}
                        className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                        <FileText size={12} />{resumeOpen ? 'Collapse' : 'Expand'}
                      </button>
                    </div>
                    <iframe
                      src={candidate.resume_data}
                      title="Resume"
                      className="w-full rounded-xl border border-slate-200"
                      style={{ height: resumeOpen ? '600px' : '320px' }}
                    />
                  </>
                ) : (
                  <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-400 text-center flex items-center justify-center gap-2">
                    <FileText size={16} className="opacity-40" />No resume uploaded.
                  </div>
                )}
              </Section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function Submissions() {
  const [ready, setReady]           = useState<ReadyCandidate[]>([]);
  const [loading, setLoading]       = useState(true);
  const [submitting, setSubmitting] = useState<number | null>(null);
  const [submitNotes, setSubmitNotes] = useState<Record<number, string>>({});
  const [toast, setToast]           = useState('');
  const [rejectOverlay, setRejectOverlay] = useState<{ id: number; name: string } | null>(null);
  const [rejectReason, setRejectReason]   = useState('');
  const [rejecting, setRejecting]         = useState(false);

  // Full details modal
  const [detailCandidate, setDetailCandidate] = useState<Candidate | null>(null);
  const [detailLoading, setDetailLoading]     = useState<number | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/submissions/ready').catch(() => ({ data: [] }));
      setReady(data as ReadyCandidate[]);
    } finally {
      setLoading(false);
    }
  };

  const submissionsSignal = useSignal('submissions');
  useEffect(() => { fetchData(); }, [submissionsSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  const openDetails = async (id: number) => {
    setDetailLoading(id);
    try {
      const { data } = await api.get<Candidate>(`/candidates/${id}`);
      setDetailCandidate(data);
    } catch {
      showToast('Failed to load candidate details.');
    } finally {
      setDetailLoading(null);
    }
  };

  const openReject = (c: ReadyCandidate) => {
    setRejectOverlay({ id: c.id, name: c.full_name });
    setRejectReason('');
  };

  const handleReject = async () => {
    if (!rejectOverlay || !rejectReason.trim()) return;
    setRejecting(true);
    try {
      await api.post(`/candidates/${rejectOverlay.id}/reject`, { reason: rejectReason.trim() });
      showToast('Candidate rejected.');
      setRejectOverlay(null);
      fetchData();
    } catch {
      showToast('❌ Reject failed. Try again.');
    } finally {
      setRejecting(false);
    }
  };

  const handleSubmit2Client = async (candidateId: number) => {
    setSubmitting(candidateId);
    try {
      await api.post('/submissions', {
        candidate_id: candidateId,
        notes: submitNotes[candidateId] ?? null,
      });
      showToast('✅ Submitted to client successfully!');
      fetchData();
    } catch {
      showToast('❌ Submit failed. Try again.');
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <Layout title="Submit to Client">

      {/* Toast */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium bg-white border border-slate-200 text-slate-800">
          {toast}
        </div>
      )}

      {/* Candidate list */}
      <div className="space-y-4">
        {loading ? (
          <div className="space-y-3 animate-pulse">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-36 bg-white rounded-2xl border border-slate-100" />
            ))}
          </div>
        ) : ready.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400">
            <Send size={44} className="opacity-20 mb-3" />
            <p className="font-medium text-slate-500">No candidates awaiting submission.</p>
            <p className="text-sm mt-1">Candidates validated by the delivery lead will appear here.</p>
          </div>
        ) : (
          ready.map(c => (
            <div
              key={c.id}
              className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-slate-50">
                <div className="flex items-center gap-4">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center text-base font-bold text-white flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}
                  >
                    {c.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-base">{c.full_name}</h3>
                    <p className="text-sm text-slate-500 mt-0.5">
                      <span className="font-medium text-slate-600">{c.job_title ?? '—'}</span>
                      <span className="mx-1.5 text-slate-300">@</span>
                      <span className="font-semibold" style={{ color: '#1a2744' }}>{c.client_name ?? '—'}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <ScorePill score={c.overall_score} />
                  {c.auto_recommendation && (
                    <StatusBadge status={c.auto_recommendation} type="recommendation" />
                  )}
                  <button
                    onClick={() => openDetails(c.id)}
                    disabled={detailLoading === c.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
                  >
                    {detailLoading === c.id
                      ? <span className="animate-pulse">Loading…</span>
                      : <><Eye size={13} /> View Full Profile</>}
                  </button>
                </div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-slate-50">
                <InfoCell icon={<Briefcase size={13} />} label="Experience">
                  {c.total_exp != null ? `${c.total_exp} yrs total` : c.exp_range ?? '—'}
                  {c.relevant_exp != null && (
                    <span className="text-slate-400"> / {c.relevant_exp} relevant</span>
                  )}
                </InfoCell>
                <InfoCell icon={<TrendingUp size={13} />} label="CTC Range">
                  {c.current_ctc != null ? (
                    <>
                      <span>₹{c.current_ctc}L</span>
                      <ArrowRight size={10} className="inline mx-1 text-slate-400" />
                      <span className="font-semibold text-slate-700">₹{c.expected_ctc}L</span>
                      {c.hike_pct != null && (
                        <span className="ml-1 text-green-600 text-xs">+{c.hike_pct}%</span>
                      )}
                    </>
                  ) : '—'}
                </InfoCell>
                <InfoCell icon={<Clock size={13} />} label="Notice Period">
                  {c.notice_period_weeks != null ? `${c.notice_period_weeks} weeks` : '—'}
                  {c.last_working_day && (
                    <span className="text-slate-400 text-xs"> (LWD: {fmtDate(c.last_working_day)})</span>
                  )}
                </InfoCell>
                <InfoCell icon={<MapPin size={13} />} label="Location">
                  {c.city ?? '—'}
                </InfoCell>
              </div>

              {/* Skills */}
              {c.skills && (
                <div className="px-6 py-3 border-t border-slate-50 flex flex-wrap gap-1.5">
                  {c.skills.split(',').slice(0, 8).map((s, i) => (
                    <span key={i} className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                      {s.trim()}
                    </span>
                  ))}
                </div>
              )}

              {/* Submit action */}
              <div className="px-6 py-4 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100">
                <div className="flex items-center gap-4 text-sm text-slate-500">
                  {c.mobile && (
                    <span className="flex items-center gap-1.5"><Phone size={12} />{c.mobile}</span>
                  )}
                  {c.email && (
                    <span className="flex items-center gap-1.5"><Mail size={12} />{c.email}</span>
                  )}
                  {c.assigned_to_name && (
                    <span className="flex items-center gap-1.5 text-xs text-slate-400">
                      <User size={11} />Caller: {c.assigned_to_name}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Submission notes (optional)"
                    value={submitNotes[c.id] ?? ''}
                    onChange={e => setSubmitNotes(prev => ({ ...prev, [c.id]: e.target.value }))}
                    className="text-sm px-3 py-2 rounded-xl border border-slate-200 bg-white placeholder-slate-400 focus:outline-none focus:border-blue-400 w-56"
                  />
                  <button
                    onClick={() => openReject(c)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-red-600 text-sm font-semibold border border-red-200 bg-red-50 hover:bg-red-100 transition-all"
                  >
                    <XCircle size={14} /> Reject
                  </button>
                  <button
                    onClick={() => handleSubmit2Client(c.id)}
                    disabled={submitting === c.id}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-60 transition-all hover:opacity-90"
                    style={{ backgroundColor: '#1a2744' }}
                  >
                    <Send size={14} />
                    {submitting === c.id ? 'Submitting…' : 'Submit to Client'}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Full Details Modal */}
      {detailCandidate && (
        <FullDetailsModal
          candidate={detailCandidate}
          onClose={() => setDetailCandidate(null)}
        />
      )}

      {/* ── Reject Overlay ── */}
      {rejectOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <XCircle size={18} className="text-red-500" /> Reject Candidate
                </h3>
                <p className="text-sm text-slate-500 mt-0.5">{rejectOverlay.name}</p>
              </div>
              <button onClick={() => setRejectOverlay(null)} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
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
                  placeholder="e.g. CTC expectations too high, skills don't match client requirement…"
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-50 resize-none"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setRejectOverlay(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReject}
                  disabled={rejecting || !rejectReason.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 disabled:opacity-50 transition-colors"
                >
                  {rejecting ? 'Rejecting…' : 'Confirm Reject'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
