import { useEffect, useState } from 'react';
import { X, CheckCircle, AlertCircle, PauseCircle, XCircle } from 'lucide-react';
import Layout from '../components/Layout';
import StatusBadge from '../components/StatusBadge';
import ScoreBar from '../components/ScoreBar';
import api from '../api/client';
import type { Candidate, Assessment } from '../types';

interface QueueItem {
  candidate: Candidate;
  assessment: Assessment;
}

export default function ValidationQueue() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<QueueItem | null>(null);
  const [comment, setComment] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [rejectOverlay, setRejectOverlay] = useState(false);
  const [rejectReason, setRejectReason]   = useState('');

  const fetchQueue = () => {
    setLoading(true);
    api
      .get<QueueItem[]>('/validation/queue')
      .then((res) => setQueue(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchQueue();
  }, []);

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

  return (
    <Layout title="Validation Queue">
      {message && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-700 font-medium">
          {message}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3 animate-pulse">
            {[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-slate-100 rounded-xl" />)}
          </div>
        ) : queue.length === 0 ? (
          <div className="text-center py-16">
            <CheckCircle size={40} className="mx-auto text-green-300 mb-3" />
            <p className="text-slate-400 text-sm">Validation queue is empty. All caught up!</p>
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
                  <th className="text-left py-3.5 px-5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Assigned To</th>
                  <th className="py-3.5 px-5" />
                </tr>
              </thead>
              <tbody>
                {queue.map((item, i) => (
                  <tr
                    key={item.candidate.id}
                    className={`border-b border-slate-50 hover:bg-blue-50/20 transition-colors ${i % 2 === 1 ? 'bg-slate-50/40' : ''}`}
                  >
                    <td className="py-3.5 px-5 font-semibold text-slate-800">{item.candidate.full_name}</td>
                    <td className="py-3.5 px-5">
                      <p className="text-slate-700 truncate max-w-36">{item.candidate.job_title ?? '—'}</p>
                      <p className="text-xs text-slate-400">{item.candidate.client_name ?? '—'}</p>
                    </td>
                    <td className="py-3.5 px-5 text-center">
                      {item.candidate.overall_score !== null ? (
                        <span className={`inline-block px-2 py-0.5 rounded-lg text-xs font-bold ${item.candidate.overall_score >= 3.5 ? 'bg-green-100 text-green-700' : item.candidate.overall_score >= 3 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600'}`}>
                          {item.candidate.overall_score.toFixed(1)}
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
                    <td className="py-3.5 px-5 text-right">
                      <button
                        onClick={() => { setSelectedItem(item); setComment(''); }}
                        className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white hover:opacity-90 transition-all"
                        style={{ backgroundColor: '#3b82f6' }}
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Side panel / Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/40 backdrop-blur-sm">
          <div className="bg-white h-full w-full max-w-xl shadow-2xl overflow-y-auto scrollbar-thin flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 sticky top-0 bg-white z-10">
              <div>
                <h3 className="text-base font-bold text-slate-800">{selectedItem.candidate.full_name}</h3>
                <p className="text-sm text-slate-500">{selectedItem.candidate.job_title} · {selectedItem.candidate.client_name}</p>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 p-6 space-y-6">
              {/* Score overview */}
              <div className="flex items-center gap-4">
                {selectedItem.candidate.overall_score !== null && (
                  <div className={`w-16 h-16 rounded-2xl flex flex-col items-center justify-center font-black text-white ${selectedItem.candidate.overall_score >= 3.5 ? 'bg-green-500' : selectedItem.candidate.overall_score >= 3 ? 'bg-yellow-400' : 'bg-red-500'}`}>
                    <span className="text-xl">{selectedItem.candidate.overall_score.toFixed(1)}</span>
                    <span className="text-xs opacity-80">/ 5.0</span>
                  </div>
                )}
                <div>
                  {selectedItem.candidate.auto_recommendation && (
                    <StatusBadge status={selectedItem.candidate.auto_recommendation} type="recommendation" />
                  )}
                  <p className="text-xs text-slate-400 mt-1">Auto recommendation</p>
                </div>
              </div>

              {/* Assessment details */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Assessment Breakdown</p>
                <div className="space-y-2 bg-slate-50 rounded-xl p-4">
                  <ScoreBar score={selectedItem.assessment.comm_score} label="Communication" />
                  <ScoreBar score={selectedItem.assessment.self_art_score} label="Self Articulation" />
                  <ScoreBar score={selectedItem.assessment.role_art_score} label="Role Articulation" />
                  <ScoreBar score={selectedItem.assessment.resume_skill_score} label="Resume Skills" />
                  <ScoreBar score={selectedItem.assessment.tech_qa_score} label="Technical Q&A" />
                  <ScoreBar score={selectedItem.assessment.paraphrase_score} label="Paraphrasing" />
                  <ScoreBar score={selectedItem.assessment.confidence_score} label="Confidence" />
                  <ScoreBar score={selectedItem.assessment.gut_score} label="Gut Score" />
                  <div className="border-t border-slate-200 pt-2 mt-2">
                    <ScoreBar score={selectedItem.assessment.tech_score} label="Tech Score (avg)" />
                    <ScoreBar score={selectedItem.assessment.soft_skill_score} label="Soft Score (avg)" />
                    <ScoreBar score={selectedItem.assessment.overall_score} label="Overall Score" />
                  </div>
                </div>
              </div>

              {/* Candidate details */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Candidate Details</p>
                <div className="bg-slate-50 rounded-xl p-4 grid grid-cols-2 gap-3 text-sm">
                  {[
                    ['Total Exp', selectedItem.assessment.total_exp ? `${selectedItem.assessment.total_exp} yrs` : null],
                    ['Relevant Exp', selectedItem.assessment.relevant_exp ? `${selectedItem.assessment.relevant_exp} yrs` : null],
                    ['Last Company', selectedItem.assessment.last_company],
                    ['Notice Period', selectedItem.assessment.notice_period_weeks ? `${selectedItem.assessment.notice_period_weeks} wks` : null],
                    ['Current CTC', selectedItem.assessment.current_ctc ? `₹${selectedItem.assessment.current_ctc}L` : null],
                    ['Expected CTC', selectedItem.assessment.expected_ctc ? `₹${selectedItem.assessment.expected_ctc}L` : null],
                    ['Hike %', selectedItem.assessment.hike_pct ? `${selectedItem.assessment.hike_pct.toFixed(1)}%` : null],
                    ['LWD', selectedItem.assessment.lwd_confirmed],
                  ].map(([label, value]) => (
                    <div key={String(label)}>
                      <span className="text-xs text-slate-400">{label}</span>
                      <p className="font-medium text-slate-700">{value ?? '—'}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Red flags */}
              {selectedItem.assessment.red_flags && (() => {
                const flags = JSON.parse(selectedItem.assessment.red_flags) as string[];
                return flags.length > 0 ? (
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Red Flags</p>
                    <div className="flex flex-wrap gap-2">
                      {flags.map((f) => <span key={f} className="text-xs px-2.5 py-1 rounded-full bg-red-50 text-red-600 font-medium">{f}</span>)}
                    </div>
                  </div>
                ) : null;
              })()}

              {/* Caller notes */}
              {selectedItem.assessment.caller_notes && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Caller Notes</p>
                  <p className="text-sm text-slate-600 bg-slate-50 rounded-xl p-4">{selectedItem.assessment.caller_notes}</p>
                </div>
              )}

              {/* Comment box */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Validator Comment</p>
                <textarea
                  rows={3}
                  placeholder="Add a comment (optional)…"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 resize-none"
                />
              </div>

              {/* Action buttons */}
              <div className="grid grid-cols-2 gap-3 pb-6">
                <button
                  onClick={() => handleAction('validate')}
                  disabled={actionLoading}
                  className="flex items-center justify-center gap-2 py-3 rounded-xl bg-green-500 text-white text-sm font-semibold hover:bg-green-600 disabled:opacity-60 transition-colors"
                >
                  <CheckCircle size={16} />
                  Validate
                </button>
                <button
                  onClick={() => handleAction('needs_rework')}
                  disabled={actionLoading}
                  className="flex items-center justify-center gap-2 py-3 rounded-xl bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-60 transition-colors"
                >
                  <AlertCircle size={16} />
                  Needs Rework
                </button>
                <button
                  onClick={() => handleAction('on_hold')}
                  disabled={actionLoading}
                  className="flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-400 text-white text-sm font-semibold hover:bg-amber-500 disabled:opacity-60 transition-colors"
                >
                  <PauseCircle size={16} />
                  On Hold
                </button>
                <button
                  onClick={() => { setRejectOverlay(true); setRejectReason(''); }}
                  disabled={actionLoading}
                  className="flex items-center justify-center gap-2 py-3 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 disabled:opacity-60 transition-colors"
                >
                  <XCircle size={16} />
                  Reject
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
