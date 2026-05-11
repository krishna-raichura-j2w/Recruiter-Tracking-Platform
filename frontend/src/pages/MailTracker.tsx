import { useEffect, useState } from 'react';
import { Mail, CheckCircle2, ShieldCheck, X, Calendar } from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

interface MailRecord {
  id: number;
  candidate_id: number;
  candidate_name: string | null;
  candidate_mobile: string | null;
  candidate_email: string | null;
  client_name: string | null;
  job_title: string | null;
  status: string | null;
  sent_at: string | null;
  sent_by_name: string | null;
  exit_date: string | null;
  acknowledgement_received: boolean;
  acknowledgement_at: string | null;
  dl_verified: boolean;
  dl_verified_at: string | null;
  assessment: Record<string, unknown> | null;
  consultant_profile: Record<string, unknown> | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

function StatusBadgeSmall({ label, active, color }: { label: string; active: boolean; color: string }) {
  const colors: Record<string, string> = {
    blue: active ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-400 border-slate-200',
    amber: active ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-400 border-slate-200',
    green: active ? 'bg-green-100 text-green-700 border-green-200' : 'bg-slate-100 text-slate-400 border-slate-200',
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${colors[color]}`}>
      {label}
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex gap-2 text-xs py-1 border-b border-slate-50">
      <span className="text-slate-500 font-medium w-36 flex-shrink-0">{label}</span>
      <span className="text-slate-700 break-words">{value ?? '—'}</span>
    </div>
  );
}

export default function MailTracker() {
  const { user } = useAuth();
  const [mails, setMails] = useState<MailRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<MailRecord | null>(null);
  const [exitDate, setExitDate] = useState('');
  const [updating, setUpdating] = useState(false);
  const [toast, setToast] = useState('');

  const isDeliveryLead = user?.role === 'delivery_lead' || user?.role === 'admin';

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  const fetchMails = () => {
    setLoading(true);
    api
      .get<MailRecord[]>('/mails')
      .then((res) => setMails(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchMails();
  }, []);

  const openDetail = (m: MailRecord) => {
    setSelected(m);
    setExitDate(m.exit_date ?? '');
  };

  const handleUpdate = async (patch: Record<string, unknown>) => {
    if (!selected) return;
    setUpdating(true);
    try {
      const res = await api.patch<MailRecord>(`/mails/${selected.id}`, patch);
      const updated = res.data;
      setMails((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      setSelected(updated);
      showToast('Updated successfully!');
    } catch {
      showToast('Update failed. Please try again.');
    } finally {
      setUpdating(false);
    }
  };

  const handleSaveExitDate = () => {
    if (!exitDate) return;
    handleUpdate({ exit_date: exitDate });
  };

  const handleAcknowledge = () => {
    handleUpdate({ acknowledgement_received: true });
  };

  const handleDlVerify = () => {
    handleUpdate({ dl_verified: true });
  };

  return (
    <Layout title="Mail Tracker">
      {toast && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-700 font-medium">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-black text-slate-800">Mail Tracker</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {mails.length} consultant email{mails.length !== 1 ? 's' : ''} tracked
          </p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-white rounded-2xl animate-pulse border border-slate-100" />
          ))}
        </div>
      ) : mails.length === 0 ? (
        <div className="text-center py-24 text-slate-400">
          <Mail size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-semibold">No mails recorded yet.</p>
          <p className="text-sm mt-1">Use "Generate Email" from a candidate profile to log a sent mail.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {mails.map((m) => (
            <div
              key={m.id}
              onClick={() => openDetail(m)}
              className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4 flex items-center gap-4 cursor-pointer hover:border-blue-200 hover:shadow-md transition-all"
            >
              {/* Avatar */}
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black text-white flex-shrink-0"
                style={{ backgroundColor: '#1a2744' }}
              >
                {(m.candidate_name ?? 'C').charAt(0).toUpperCase()}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-800 text-sm truncate">{m.candidate_name ?? '—'}</p>
                <p className="text-xs text-slate-500 truncate">
                  {m.job_title ?? '—'} · {m.client_name ?? '—'}
                </p>
              </div>

              {/* Sent info */}
              <div className="text-right flex-shrink-0 hidden sm:block">
                <p className="text-xs text-slate-500">Sent by {m.sent_by_name ?? '—'}</p>
                <p className="text-xs text-slate-400">{formatDate(m.sent_at)}</p>
              </div>

              {/* Status badges */}
              <div className="flex gap-1.5 flex-shrink-0">
                <StatusBadgeSmall label="Mail Sent" active={true} color="blue" />
                <StatusBadgeSmall label="Acknowledged" active={m.acknowledgement_received} color="amber" />
                <StatusBadgeSmall label="DL Verified" active={m.dl_verified} color="green" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail overlay */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <div
            className="relative bg-white rounded-2xl shadow-2xl flex flex-col"
            style={{ width: '780px', maxWidth: '96vw', maxHeight: '90vh' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black text-white"
                  style={{ backgroundColor: '#1a2744' }}
                >
                  {(selected.candidate_name ?? 'C').charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="font-bold text-slate-800">{selected.candidate_name ?? '—'}</h2>
                  <p className="text-xs text-slate-500">{selected.job_title ?? '—'} · {selected.client_name ?? '—'}</p>
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-slate-400 hover:text-slate-700 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                {/* Left: Candidate details */}
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Mail Info</p>
                    <DetailRow label="Sent by" value={selected.sent_by_name} />
                    <DetailRow label="Sent at" value={formatDate(selected.sent_at)} />
                    <DetailRow label="Exit Date" value={selected.exit_date} />
                    <DetailRow label="Acknowledged at" value={formatDate(selected.acknowledgement_at)} />
                    <DetailRow label="DL Verified at" value={formatDate(selected.dl_verified_at)} />
                  </div>

                  {selected.assessment && (
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Assessment Summary</p>
                      <DetailRow label="Total Exp" value={selected.assessment.total_exp != null ? `${selected.assessment.total_exp} yrs` : null} />
                      <DetailRow label="Relevant Exp" value={selected.assessment.relevant_exp != null ? `${selected.assessment.relevant_exp} yrs` : null} />
                      <DetailRow label="Current CTC" value={selected.assessment.current_ctc != null ? `${selected.assessment.current_ctc} LPA` : null} />
                      <DetailRow label="Expected CTC" value={selected.assessment.expected_ctc != null ? `${selected.assessment.expected_ctc} LPA` : null} />
                      <DetailRow label="Notice Period" value={selected.assessment.notice_period_weeks != null ? `${selected.assessment.notice_period_weeks} weeks` : null} />
                      <DetailRow label="Current City" value={selected.assessment.current_city as string | null} />
                      <DetailRow label="Last Company" value={selected.assessment.last_company as string | null} />
                      <DetailRow label="Primary Skills" value={selected.assessment.primary_skill_stack as string | null} />
                      <DetailRow label="Offers in Hand" value={selected.assessment.offers_in_hand as string | null} />
                      <DetailRow label="Reason for Change" value={selected.assessment.reason_for_change as string | null} />
                    </div>
                  )}

                  {selected.consultant_profile && (
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Consultant Profile</p>
                      <DetailRow label="Resignation Accept." value={selected.consultant_profile.resignation_acceptance as string | null} />
                      <DetailRow label="Personal Laptop" value={selected.consultant_profile.personal_laptop as string | null} />
                      <DetailRow label="Payroll" value={selected.consultant_profile.payroll as string | null} />
                      <DetailRow label="Client Work Location" value={selected.consultant_profile.client_work_location as string | null} />
                      <DetailRow label="Work Timings" value={selected.consultant_profile.current_work_timings as string | null} />
                      <DetailRow label="Notice Negotiable" value={selected.consultant_profile.notice_negotiable_upto as string | null} />
                      <DetailRow label="Offers Pipeline" value={selected.consultant_profile.offers_pipeline as string | null} />
                      <DetailRow label="Interview Pipeline" value={selected.consultant_profile.interview_pipeline as string | null} />
                      <DetailRow label="Telephonic Avail." value={selected.consultant_profile.telephonic_availability as string | null} />
                      <DetailRow label="IDE Installed" value={selected.consultant_profile.ide_installed as string | null} />
                      <DetailRow label="Wifi / Data" value={selected.consultant_profile.wifi_connectivity as string | null} />
                      <DetailRow label="Interview Avail (2d)" value={selected.consultant_profile.interview_availability_2d as string | null} />
                    </div>
                  )}
                </div>

                {/* Right: Actions */}
                <div className="space-y-5">
                  {/* Status badges */}
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Status</p>
                    <div className="flex flex-wrap gap-2">
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-100 border border-blue-200">
                        <Mail size={13} className="text-blue-600" />
                        <span className="text-xs font-semibold text-blue-700">Mail Sent</span>
                      </div>
                      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${selected.acknowledgement_received ? 'bg-amber-100 border-amber-200' : 'bg-slate-100 border-slate-200'}`}>
                        <CheckCircle2 size={13} className={selected.acknowledgement_received ? 'text-amber-600' : 'text-slate-400'} />
                        <span className={`text-xs font-semibold ${selected.acknowledgement_received ? 'text-amber-700' : 'text-slate-400'}`}>
                          {selected.acknowledgement_received ? 'Acknowledged' : 'Not Acknowledged'}
                        </span>
                      </div>
                      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${selected.dl_verified ? 'bg-green-100 border-green-200' : 'bg-slate-100 border-slate-200'}`}>
                        <ShieldCheck size={13} className={selected.dl_verified ? 'text-green-600' : 'text-slate-400'} />
                        <span className={`text-xs font-semibold ${selected.dl_verified ? 'text-green-700' : 'text-slate-400'}`}>
                          {selected.dl_verified ? 'DL Verified' : 'Pending DL Verify'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Exit date */}
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Exit Date</p>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <input
                          type="date"
                          value={exitDate}
                          onChange={(e) => setExitDate(e.target.value)}
                          className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                        />
                      </div>
                      <button
                        onClick={handleSaveExitDate}
                        disabled={updating || !exitDate}
                        className="px-4 py-2 rounded-xl bg-slate-800 text-white text-sm font-semibold disabled:opacity-50 hover:bg-slate-700 transition-colors"
                      >
                        Save
                      </button>
                    </div>
                  </div>

                  {/* Acknowledgement */}
                  {!selected.acknowledgement_received && (
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Acknowledgement</p>
                      <button
                        onClick={handleAcknowledge}
                        disabled={updating}
                        className="w-full py-2.5 rounded-xl bg-amber-500 text-white text-sm font-bold disabled:opacity-60 hover:bg-amber-600 transition-colors flex items-center justify-center gap-2"
                      >
                        <CheckCircle2 size={15} />
                        Acknowledgement Received
                      </button>
                    </div>
                  )}

                  {/* DL Verify */}
                  {isDeliveryLead && !selected.dl_verified && (
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Delivery Lead Verification</p>
                      <button
                        onClick={handleDlVerify}
                        disabled={updating}
                        className="w-full py-2.5 rounded-xl bg-green-600 text-white text-sm font-bold disabled:opacity-60 hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                      >
                        <ShieldCheck size={15} />
                        Verify &amp; Approve
                      </button>
                    </div>
                  )}

                  {/* Timestamps summary */}
                  {(selected.acknowledgement_received || selected.dl_verified) && (
                    <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 space-y-2">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Timeline</p>
                      {selected.acknowledgement_received && (
                        <div className="flex items-center gap-2 text-xs text-amber-700">
                          <CheckCircle2 size={13} />
                          <span>Acknowledged on {formatDate(selected.acknowledgement_at)}</span>
                        </div>
                      )}
                      {selected.dl_verified && (
                        <div className="flex items-center gap-2 text-xs text-green-700">
                          <ShieldCheck size={13} />
                          <span>DL Verified on {formatDate(selected.dl_verified_at)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
