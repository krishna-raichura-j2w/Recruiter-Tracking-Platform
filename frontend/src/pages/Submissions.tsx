import { useEffect, useState } from 'react';
import {
  Send, Phone, Mail, MapPin, Briefcase,
  TrendingUp, Clock, User, ArrowRight, XCircle, X,
} from 'lucide-react';
import Layout from '../components/Layout';
import StatusBadge from '../components/StatusBadge';
import api from '../api/client';

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
  if (score === null) return <span className="text-slate-300 text-xs">—</span>;
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
      <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-sm text-slate-700 font-medium">{children}</div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function Submissions() {
  const [ready, setReady]         = useState<ReadyCandidate[]>([]);
  const [loading, setLoading]     = useState(true);
  const [submitting, setSubmitting] = useState<number | null>(null);
  const [submitNotes, setSubmitNotes] = useState<Record<number, string>>({});
  const [toast, setToast]         = useState('');
  const [rejectOverlay, setRejectOverlay] = useState<{ id: number; name: string } | null>(null);
  const [rejectReason, setRejectReason]   = useState('');
  const [rejecting, setRejecting]         = useState(false);

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

  useEffect(() => { fetchData(); }, []);

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
