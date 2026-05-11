import React, { useEffect, useState, useMemo } from 'react';
import { useSignal } from '../context/RealtimeContext';
import {
  GitBranch, ChevronDown, ChevronRight, Search, RefreshCw,
  Users, Clock, AlertTriangle, User, CheckCircle, XCircle,
  Calendar, UserCheck, Phone, Mail, Send, Briefcase, Download,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import Layout from '../components/Layout';
import api from '../api/client';

// ── Types ──────────────────────────────────────────────────────────────────────

interface CandidateStory {
  id: number;
  full_name: string;
  mobile: string | null;
  email: string | null;
  status: string | null;
  rejected_by: string | null;
  rejection_reason: string | null;
  sourced_by_name: string | null;
  assigned_to_name: string | null;
  sourced_at: string | null;
  first_call_at: string | null;
  first_call_by: string | null;
  first_call_note: string | null;
  assessment_at: string | null;
  assessment_score: number | null;
  email_sent_at: string | null;
  email_sent_by: string | null;
  acknowledged_at: string | null;
  dl_verified_at: string | null;
  validation_at: string | null;
  validation_status: string | null;
  validated_by: string | null;
  validation_note: string | null;
  submitted_at: string | null;
  submitted_by: string | null;
  interview_stage: string | null;
  kam_updates: { stage: string; note: string; updated_by: string | null; at: string | null }[];
}

interface JobStory {
  job_id: number;
  role_title: string;
  client_name: string;
  status: string | null;
  created_at: string | null;
  created_by: string | null;
  confirmed_at: string | null;
  delivery_lead: string | null;
  business_head: string | null;
  sourcer_names: string[];
  caller_names: string[];
  deadline: string | null;
  headcount: number;
  skill_stack: string | null;
  candidate_count: number;
  candidates: CandidateStory[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtTs(d: string | null): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function timeBetween(from: string | null, to: string | null): string | null {
  if (!from || !to) return null;
  const ms = new Date(to).getTime() - new Date(from).getTime();
  if (ms <= 0) return null;
  const m = Math.floor(ms / 60000);
  if (m < 60)  return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  sourced:              { bg: '#f1f5f9', text: '#475569' },
  pool_verified:        { bg: '#e0f2fe', text: '#0369a1' },
  call_in_progress:     { bg: '#ede9fe', text: '#6d28d9' },
  ready_for_validation: { bg: '#fef3c7', text: '#92400e' },
  validated:            { bg: '#ccfbf1', text: '#0f766e' },
  needs_rework:         { bg: '#ffedd5', text: '#c2410c' },
  on_hold:              { bg: '#fef9c3', text: '#854d0e' },
  rejected:             { bg: '#fee2e2', text: '#b91c1c' },
  submitted_to_client:  { bg: '#ede9fe', text: '#7c3aed' },
  interview_stage:      { bg: '#f3e8ff', text: '#7e22ce' },
  offer_rolled_out:     { bg: '#d1fae5', text: '#065f46' },
  joined:               { bg: '#bbf7d0', text: '#14532d' },
  backed_out:           { bg: '#f1f5f9', text: '#94a3b8' },
};

const INTERVIEW_LABELS: Record<string, string> = {
  submitted: 'Submitted',
  ta_review: 'TA Screening', ta_rejected: 'TA Rejected',
  hm_review: 'HM Screening', hm_rejected: 'HM Rejected',
  shortlisted: 'Shortlisted',
  l1_scheduled: 'L1 Scheduled', l1_feedback_pending: 'L1 Pending',
  l1_cleared: 'L1 Cleared',    l1_rejected: 'L1 Rejected',
  l2_scheduled: 'L2 Scheduled', l2_feedback_pending: 'L2 Pending',
  l2_cleared: 'L2 Cleared',    l2_rejected: 'L2 Rejected',
  final_scheduled: 'Final Scheduled', final_feedback_pending: 'Final Pending',
  final_cleared: 'Final Cleared', final_rejected: 'Final Rejected',
  offer_rolled_out: 'Offer Rolled Out', offer_accepted: 'Offer Accepted',
  offer_declined: 'Offer Declined', joined: 'Joined', no_show: 'No Show',
};

// ── Step row in expanded timeline ──────────────────────────────────────────────

function StepRow({
  num, label, icon, ts, by, note, dotClass, prevTs, isLast, isCurrent, currentLabel,
}: {
  num: number; label: string; icon: React.ReactNode;
  ts: string | null; by?: string | null; note?: string | null;
  dotClass: string; prevTs: string | null;
  isLast?: boolean; isCurrent?: boolean; currentLabel?: string;
}) {
  const done = !!ts || (isCurrent && !!currentLabel);
  const gap  = timeBetween(prevTs, ts);

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center flex-shrink-0 w-7">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold border-2 flex-shrink-0 ${
          done ? `${dotClass} border-transparent text-white` : 'bg-white border-slate-200 text-slate-400'
        }`}>
          {num}
        </div>
        {!isLast && (
          <div className={`w-px flex-1 my-1 ${done ? 'bg-slate-300' : 'bg-slate-100'}`} style={{ minHeight: 16 }} />
        )}
      </div>

      <div className={`flex-1 min-w-0 ${isLast ? 'pb-0' : 'pb-3.5'}`}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-bold ${done ? 'text-slate-700' : 'text-slate-300'}`}>{label}</span>
          {gap && <span className="text-[10px] text-slate-400 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded-full">{gap} later</span>}
        </div>
        {done ? (
          <div className="mt-0.5 space-y-0.5">
            {ts ? (
              <p className="text-[11px] font-bold text-blue-600">{fmtTs(ts)}</p>
            ) : (
              <p className="text-[11px] font-bold text-purple-600">{currentLabel}</p>
            )}
            {by   && <p className="text-[11px] text-slate-400 flex items-center gap-1"><User size={9} />{by}</p>}
            {note && <p className="text-[11px] text-slate-400 italic">{note}</p>}
          </div>
        ) : (
          <p className="text-[11px] text-slate-300 italic mt-0.5">Pending</p>
        )}
      </div>
    </div>
  );
}

// ── Candidate row ──────────────────────────────────────────────────────────────

function CandidateRow({ c, idx }: { c: CandidateStory; idx: number }) {
  const [open, setOpen] = useState(false);
  const isRejected = c.status === 'rejected';
  const sc = STATUS_COLORS[c.status ?? ''] ?? { bg: '#f1f5f9', text: '#475569' };
  const statusLabel = (c.status ?? '').replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());

  const stageLabel = c.interview_stage ? (INTERVIEW_LABELS[c.interview_stage] ?? c.interview_stage) : null;

  // progress: count done steps out of 7
  const doneCount = [
    c.sourced_at,
    c.assessment_at ?? c.first_call_at,
    c.email_sent_at,
    c.acknowledged_at,
    c.validation_at,
    c.submitted_at,
    c.interview_stage,
  ].filter(Boolean).length;

  const steps = [
    { num: 3, label: 'Candidate Sourced',       icon: <Users size={10} />,    ts: c.sourced_at,                              by: c.sourced_by_name,                dotClass: 'bg-slate-500', prevTs: null },
    { num: 4, label: 'Caller Filled Details',    icon: <Phone size={10} />,    ts: c.assessment_at ?? c.first_call_at,        by: c.assigned_to_name,               dotClass: 'bg-blue-500',  prevTs: c.sourced_at,
      note: c.assessment_score != null ? `Score: ${c.assessment_score.toFixed(2)} / 5` : null },
    { num: 5, label: 'Consultant Mail Sent',     icon: <Mail size={10} />,     ts: c.email_sent_at,                           by: c.email_sent_by,                  dotClass: 'bg-purple-500',prevTs: c.assessment_at ?? c.first_call_at },
    { num: 6, label: 'Mail Acknowledged',        icon: <CheckCircle size={10}/>,ts: c.acknowledged_at,                        by: null,                             dotClass: 'bg-violet-500',prevTs: c.email_sent_at },
    { num: 7, label: isRejected ? 'Rejected' : 'DL Approved',
                                                 icon: isRejected ? <XCircle size={10}/> : <UserCheck size={10}/>,
                                                                               ts: c.validation_at,                           by: c.rejected_by ?? c.validated_by,  dotClass: isRejected ? 'bg-red-500' : 'bg-teal-500',
      prevTs: c.acknowledged_at ?? c.email_sent_at,
      note: c.rejection_reason ?? c.validation_note ?? null },
    { num: 8, label: 'KAM Sent to Client',       icon: <Send size={10} />,     ts: c.submitted_at,                            by: c.submitted_by,                   dotClass: 'bg-emerald-600',prevTs: c.validation_at },
    { num: 9, label: 'Client Stage',             icon: <Briefcase size={10}/>, ts: null, isCurrent: true, currentLabel: stageLabel ?? undefined,
                                                                                                                                by: null,                             dotClass: 'bg-blue-400',  prevTs: c.submitted_at, isLast: true },
  ];

  return (
    <div className={`rounded-lg border overflow-hidden ${isRejected ? 'border-red-200' : 'border-slate-100'}`}>
      {/* Collapsed row */}
      <button
        onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors ${open ? 'border-b border-slate-100' : ''} ${isRejected ? 'bg-red-50/40' : 'bg-white'}`}
      >
        {/* Sequence number */}
        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 ${isRejected ? 'bg-red-400' : 'bg-gradient-to-br from-blue-500 to-indigo-600'}`}>
          {idx + 1}
        </span>

        {/* Name */}
        <span className="font-semibold text-sm text-slate-800 flex-1 min-w-0 truncate">{c.full_name}</span>

        {/* Status pill */}
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
              style={{ background: sc.bg, color: sc.text }}>
          {statusLabel}
        </span>

        {/* Progress dots */}
        <div className="flex gap-0.5 flex-shrink-0">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className={`w-2 h-2 rounded-full ${i < doneCount ? 'bg-blue-400' : 'bg-slate-200'}`} />
          ))}
        </div>

        {open ? <ChevronDown size={13} className="text-slate-400 flex-shrink-0" /> : <ChevronRight size={13} className="text-slate-400 flex-shrink-0" />}
      </button>

      {/* Expanded timeline */}
      {open && (
        <div className="px-4 pt-4 pb-3 bg-white">
          {isRejected && c.rejection_reason && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 border border-red-100 text-xs text-red-600">
              <span className="font-bold">Rejection reason:</span> {c.rejection_reason}
            </div>
          )}
          {steps.map((s) => (
            <StepRow key={s.num} {...s} />
          ))}
          {/* KAM stage updates with feedback */}
          {c.kam_updates && c.kam_updates.length > 0 && (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">KAM Stage Updates</p>
              <div className="space-y-2">
                {c.kam_updates.map((u, i) => (
                  <div key={i} className="flex gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0 mt-1.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-700">{u.stage}</span>
                        {u.at && <span className="text-[10px] text-blue-500 font-semibold">{fmtTs(u.at)}</span>}
                        {u.updated_by && <span className="text-[10px] text-slate-400 flex items-center gap-1"><User size={9} />{u.updated_by}</span>}
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5 italic">"{u.note}"</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── JD row ────────────────────────────────────────────────────────────────────

function JdRow({ story }: { story: JobStory }) {
  const [open, setOpen] = useState(false);

  const deadline   = story.deadline ? new Date(story.deadline) : null;
  const isOvertime = deadline != null && story.status !== 'closed' && deadline < new Date();

  const jdProgressCount = [story.created_at, story.confirmed_at].filter(Boolean).length;

  return (
    <div className={`rounded-xl border overflow-hidden ${isOvertime ? 'border-red-300' : 'border-slate-200'} bg-white`}>

      {/* ── Collapsed JD header ── */}
      <button
        onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
          open ? 'border-b border-slate-100' : ''
        } ${isOvertime ? 'bg-red-50/40 hover:bg-red-50/60' : 'hover:bg-slate-50/60'}`}
      >
        {/* Chevron */}
        <span className="flex-shrink-0 text-slate-400">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>

        {/* Role + client */}
        <span className="font-bold text-slate-800 text-sm truncate flex-1">{story.role_title}</span>
        <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full flex-shrink-0">{story.client_name}</span>

        {/* Status */}
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
          story.status === 'open' ? 'bg-green-100 text-green-700'
          : story.status === 'on_hold' ? 'bg-amber-100 text-amber-700'
          : 'bg-slate-100 text-slate-600'
        }`}>
          {story.status?.toUpperCase()}
        </span>

        {/* Overtime */}
        {isOvertime && (
          <span className="flex items-center gap-1 text-[11px] font-bold text-red-600 flex-shrink-0">
            <AlertTriangle size={11} /> OT
          </span>
        )}

        {/* Candidate count */}
        <span className="text-xs text-slate-400 flex items-center gap-1 flex-shrink-0">
          <Users size={11} /> {story.candidate_count}/{story.headcount}
        </span>

        {/* JD steps progress */}
        <div className="flex gap-0.5 flex-shrink-0">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className={`w-2 h-2 rounded-full ${i < jdProgressCount ? 'bg-indigo-400' : 'bg-slate-200'}`} />
          ))}
        </div>
      </button>

      {/* ── Expanded content ── */}
      {open && (
        <div>
          {/* Steps 1–2: JD journey */}
          <div className="px-5 py-4 bg-slate-900">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">JD Journey</p>
            <div className="flex gap-3 mb-3">
              <JdStep num={1} label="JD Uploaded"          ts={story.created_at} by={story.created_by}   dotDone="bg-white" dotPending="border-slate-600" last={false} />
            </div>
            <div className="flex gap-3">
              <JdStep num={2} label="DL Verified & Assigned" ts={story.confirmed_at} by={story.delivery_lead}
                note={[story.sourcer_names.length ? `Sourcer: ${story.sourcer_names.join(', ')}` : '',
                       story.caller_names.length  ? `Caller: ${story.caller_names.join(', ')}`  : ''].filter(Boolean).join('  ·  ') || null}
                dotDone="bg-white" dotPending="border-slate-600" last />
            </div>
          </div>

          {/* Candidates */}
          <div className="px-4 py-3 space-y-2 border-t border-slate-100">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
              Candidates ({story.candidate_count})
            </p>
            {story.candidates.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">No candidates sourced yet.</p>
            ) : (
              story.candidates.map((c, i) => (
                <CandidateRow key={c.id} c={c} idx={i} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function JdStep({ num, label, ts, by, note, last }: {
  num: number; label: string; ts: string | null;
  by?: string | null; note?: string | null; dotDone: string; dotPending: string; last: boolean;
}) {
  const done = !!ts;
  return (
    <div className="flex gap-3 w-full">
      <div className="flex flex-col items-center flex-shrink-0 w-7">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 flex-shrink-0 ${
          done ? 'bg-white text-slate-900 border-transparent' : 'bg-transparent border-slate-600 text-slate-600'
        }`}>
          {num}
        </div>
        {!last && <div className={`w-px flex-1 my-1 ${done ? 'bg-slate-600' : 'bg-slate-700'}`} style={{ minHeight: 14 }} />}
      </div>
      <div className="flex-1 min-w-0 pb-1">
        <span className={`text-xs font-bold ${done ? 'text-white' : 'text-slate-600'}`}>{label}</span>
        {done ? (
          <div className="mt-0.5 space-y-0.5">
            <p className="text-[11px] font-bold text-blue-300">{fmtTs(ts)}</p>
            {by   && <p className="text-[11px] text-slate-400 flex items-center gap-1"><User size={9} />{by}</p>}
            {note && <p className="text-[11px] text-slate-500">{note}</p>}
          </div>
        ) : (
          <p className="text-[11px] text-slate-600 italic mt-0.5">Pending</p>
        )}
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function FollowUp() {
  const [stories, setStories] = useState<JobStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterStatus,  setFilterStatus]  = useState('');

  const exportExcel = () => {
    const rows: Record<string, string>[] = [];
    filtered.forEach(story => {
      story.candidates.forEach(c => {
        const kamNotes = c.kam_updates?.map(u => `[${u.stage}] ${u.note}`).join(' | ') || '—';
        rows.push({
          'JD Role':           story.role_title,
          'Client':            story.client_name,
          'Business Head':     story.business_head || '—',
          'DL':                story.delivery_lead || '—',
          'Sourcers':          story.sourcer_names.join(', ') || '—',
          'Callers':           story.caller_names.join(', ')  || '—',
          'JD Created':        fmtTs(story.created_at),
          'DL Confirmed':      fmtTs(story.confirmed_at),
          'Deadline':          story.deadline ? fmtTs(story.deadline) : '—',
          'Candidate':         c.full_name,
          'Mobile':            c.mobile || '—',
          'Email':             c.email  || '—',
          'Status':            (c.status || '').replace(/_/g, ' '),
          '1. Sourced At':     fmtTs(c.sourced_at),
          '   Sourced By':     c.sourced_by_name || '—',
          '2. First Call At':  fmtTs(c.first_call_at),
          '   Called By':      c.first_call_by || c.assigned_to_name || '—',
          '   Call Outcome':   c.first_call_note || '—',
          '3. Assessed At':    fmtTs(c.assessment_at),
          '   Score':          c.assessment_score != null ? c.assessment_score.toFixed(2) : '—',
          '4. Mail Sent At':   fmtTs(c.email_sent_at),
          '   Mail Sent By':   c.email_sent_by || '—',
          '5. Acknowledged At':fmtTs(c.acknowledged_at),
          '6. DL Verified At': fmtTs(c.dl_verified_at),
          '7. Validated At':   fmtTs(c.validation_at),
          '   Validated By':   c.validated_by || '—',
          '   Val Notes':      c.validation_note || '—',
          '8. Submitted At':   fmtTs(c.submitted_at),
          '   Submitted By':   c.submitted_by || '—',
          '9. Client Stage':   c.interview_stage ? (c.interview_stage.replace(/_/g, ' ')) : '—',
          'Rejected By':       c.rejected_by || '—',
          'Rejection Reason':  c.rejection_reason || '—',
          'KAM Updates':       kamNotes,
        });
      });
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    // Column widths
    ws['!cols'] = Object.keys(rows[0] || {}).map(k => ({
      wch: k.startsWith('KAM') ? 60 : k.includes('At') ? 22 : k.includes('By') || k.includes('Notes') || k.includes('Reason') ? 30 : 18,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Recruiter Story');
    XLSX.writeFile(wb, `recruiter_story_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await api.get<JobStory[]>('/followup/jobs');
      setStories(data);
    } catch {
      setStories([]);
    } finally {
      setLoading(false);
    }
  };

  const followupSignal = useSignal('candidates');
  useEffect(() => { fetchData(); }, [followupSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  const companies = useMemo(() =>
    [...new Set(stories.map(s => s.client_name).filter(Boolean))].sort(), [stories]);

  const filtered = useMemo(() =>
    stories.filter(s => {
      if (filterCompany && s.client_name !== filterCompany) return false;
      if (filterStatus  && !s.candidates.some(c => c.status === filterStatus)) return false;
      if (search) {
        const q = search.toLowerCase();
        return s.role_title.toLowerCase().includes(q)
          || s.client_name.toLowerCase().includes(q)
          || s.candidates.some(c => c.full_name?.toLowerCase().includes(q));
      }
      return true;
    }), [stories, filterCompany, filterStatus, search]);

  const totalCands  = filtered.reduce((n, j) => n + j.candidate_count, 0);
  const overtimeJDs = filtered.filter(s => {
    const d = s.deadline ? new Date(s.deadline) : null;
    return d && d < new Date() && s.status !== 'closed';
  }).length;

  return (
    <Layout title="Recruiter Story">

      {/* Stats strip */}
      <div className="flex items-center gap-4 mb-5 flex-wrap">
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-2.5 flex items-center gap-3">
          <GitBranch size={14} className="text-slate-400" />
          <span className="text-sm font-bold text-slate-700">{filtered.length} JDs</span>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-2.5 flex items-center gap-3">
          <Users size={14} className="text-slate-400" />
          <span className="text-sm font-bold text-slate-700">{totalCands} Candidates</span>
        </div>
        {overtimeJDs > 0 && (
          <div className="bg-red-50 rounded-xl border border-red-200 px-4 py-2.5 flex items-center gap-2">
            <AlertTriangle size={13} className="text-red-500" />
            <span className="text-sm font-bold text-red-600">{overtimeJDs} Overtime</span>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-44">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search role, company, candidate…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-400 bg-white"
          />
        </div>
        <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none min-w-32">
          <option value="">All companies</option>
          {companies.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none min-w-40">
          <option value="">All statuses</option>
          {['sourced','call_in_progress','ready_for_validation','validated','needs_rework',
            'rejected','submitted_to_client','offer_rolled_out','joined'].map(s => (
            <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
          ))}
        </select>
        {(search || filterCompany || filterStatus) && (
          <button onClick={() => { setSearch(''); setFilterCompany(''); setFilterStatus(''); }}
            className="text-xs text-blue-500 hover:text-blue-700 font-semibold flex items-center gap-1">
            ✕ Clear
          </button>
        )}
        <button onClick={fetchData}
          className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50">
          <RefreshCw size={13} />
        </button>
        <button
          onClick={exportExcel}
          disabled={filtered.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 disabled:opacity-40 transition-colors ml-auto"
        >
          <Download size={13} /> Export Excel
        </button>
      </div>

      {/* Hint */}
      <p className="text-xs text-slate-400 mb-3 flex items-center gap-1">
        <ChevronRight size={11} /> Click any JD to expand · Click a candidate to see their full timeline
      </p>

      {/* JD list */}
      {loading ? (
        <div className="space-y-2 animate-pulse">
          {[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-white rounded-xl border border-slate-100" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <GitBranch size={40} className="mx-auto mb-3 opacity-20" />
          <p className="font-medium">No JD stories found.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(story => <JdRow key={story.job_id} story={story} />)}
        </div>
      )}
    </Layout>
  );
}
