import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import {
  Phone, Mail, Link2, MapPin, BookOpen, Building2, Clock, ArrowLeft,
  CheckCircle2, AlertCircle, Clock3, XCircle, Copy, X,
} from 'lucide-react';
const LinkedinIcon = Link2;
import Layout from '../components/Layout';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import type { Candidate, Assessment, ConsultantProfile } from '../types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AssessmentForm {
  // Stage A
  full_name_confirmed: string;
  email_verified: string;
  alt_phone: string;
  linkedin_verified: string;
  total_exp: number | string;
  relevant_exp: number | string;
  qualification: string;
  last_company: string;
  last_tenure: string;
  notice_period_weeks: number | string;
  lwd_confirmed: string;
  last_working_day: string;
  // Deployment
  deploying_client: string;
  role_position: string;
  primary_skill_stack: string;
  // Stage B
  skill_match_last_role: string;
  self_art_score: number | string;
  role_art_score: number | string;
  resume_skill_score: number | string;
  tech_qa_score: number | string;
  tech_q_used: string;
  // Stage C
  paraphrase_score: number | string;
  // Stage D
  project_status: string;
  open_to_relocation: string;
  work_mode_pref: string;
  work_auth_status: string;
  current_city: string;
  current_ctc: number | string;
  expected_ctc: number | string;
  reason_for_change: string;
  interviewing_elsewhere: string;
  offers_in_hand: string;
  counter_offer_risk: string;
  last_appraisal_context: string;
  // Close
  email_acknowledged: string;
  validation_slot_locked: string;
  comm_score: number | string;
  confidence_score: number | string;
  // Notes
  red_flags: string[];
  caller_notes: string;
  // Verdict
  pass_to_validation: string;
  gut_score: number | string;
}

interface ConsultantProfileForm {
  resignation_acceptance: string;
  replacement_kt_status: string;
  personal_laptop: string;
  role_responsibilities: string;
  current_work_location: string;
  client_work_location: string;
  current_work_timings: string;
  notice_negotiable_upto: string;
  payroll: string;
  offers_pipeline: string;
  interview_pipeline: string;
  dob: string;
  telephonic_availability: string;
  ide_installed: string;
  wifi_connectivity: string;
  marital_status: string;
  health_issues: string;
  planned_leaves: string;
  interview_availability_2d: string;
  upcoming_travel: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RED_FLAG_OPTIONS = [
  'Frequent job hopping',
  'Mismatch in CTC expectations',
  'Poor communication',
  'Unclear about role',
  'Offer in hand from another company',
  'Location concerns',
  'Notice period too long',
  'Low relevance to role',
];


const CALL_DURATION_OPTS = [
  { v: 'lt_2min', l: '< 2 min' },
  { v: '2_3min', l: '2–3 min' },
  { v: '3_5min', l: '3–5 min' },
  { v: '5_10min', l: '5–10 min' },
  { v: 'gt_10min', l: '> 10 min' },
  { v: 'not_picking', l: 'Not Picking' },
  { v: 'high_notice', l: 'High Notice' },
  { v: 'not_relevant', l: 'Not Relevant' },
  { v: 'no_good_comm', l: 'No Good Comm' },
  { v: 'call_back', l: 'Call Back' },
  { v: 'already_processed', l: 'Already Processed' },
  { v: 'not_looking', l: 'Not Looking' },
  { v: 'recently_joined', l: 'Recently Joined' },
  { v: 'l1_other_client', l: 'L1 Other Client' },
];

const EXP_RANGES = ['< 1 yr', '1–2 yrs', '2–3 yrs', '3–5 yrs', '5–8 yrs', '8–12 yrs', '12–15 yrs', '15+ yrs'];
const QUALIFICATION_OPTS = ['B.Tech / BE', 'M.Tech / ME', 'BCA', 'MCA', 'B.Sc', 'M.Sc', 'B.Com', 'MBA', 'Diploma', 'PhD', 'Other'];
const TENURE_OPTS = ['< 6 months', '6–12 months', '1–2 yrs', '2–3 yrs', '3–5 yrs', '5+ yrs'];
const NOTICE_OPTS = [
  { v: '0', l: 'Immediate' },
  { v: '2', l: '< 2 wks' },
  { v: '4', l: '1 month' },
  { v: '6', l: '6 wks' },
  { v: '8', l: '2 months' },
  { v: '12', l: '3 months' },
  { v: '16', l: '> 3 months' },
];
const RELOCATION_OPTS = [
  { v: 'Already in location', l: 'Already here' },
  { v: 'Yes - willing', l: 'Yes' },
  { v: 'No', l: 'No' },
];
const WORK_MODE_OPTS = [
  { v: 'Hybrid - 2 days', l: 'Hybrid 2d' },
  { v: 'Hybrid - 3 days', l: 'Hybrid 3d' },
  { v: 'Remote', l: 'Remote' },
  { v: 'Onsite', l: 'Onsite' },
  { v: 'Flexible', l: 'Flexible' },
];
const WORK_AUTH_OPTS = [
  { v: 'Indian citizen', l: 'Indian Citizen' },
  { v: 'PR', l: 'PR' },
  { v: 'Work permit', l: 'Work Permit' },
  { v: 'Other', l: 'Other' },
];
const REASON_OPTS = [
  'Better growth / role',
  'Project ended',
  'Relocation',
  'Layoff',
  'Counter offer dissatisfied',
  'Contract end',
  'Other',
];
const YN = [{ v: 'Y' }, { v: 'N' }];
const YNNA = [{ v: 'Y' }, { v: 'N' }, { v: 'NA' }];
const OFFERS_OPTS = [{ v: '0' }, { v: '1' }, { v: '2' }, { v: '3+' }];
const RISK_OPTS = [{ v: 'Low' }, { v: 'Medium' }, { v: 'High' }];
const SKILL_MATCH_CHIPS = [
  { v: 'Exact match', l: 'Exact' },
  { v: 'Strong match', l: 'Strong' },
  { v: 'Partial match', l: 'Partial' },
  { v: 'Weak match', l: 'Weak' },
  { v: 'No match', l: 'No match' },
];
const PASS_CHIPS = [
  { v: 'YES - Strong pass', l: '✅ Strong Pass' },
  { v: 'YES - Borderline', l: '⚡ Borderline' },
  { v: 'HOLD', l: '⏸ Hold' },
  { v: 'NO', l: '❌ No' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ color, title }: { color: string; title: string }) {
  return (
    <div className={`${color} px-5 py-3 rounded-t-xl`}>
      <h3 className="text-sm font-bold text-white uppercase tracking-wider">{title}</h3>
    </div>
  );
}

function FieldGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 p-5">{children}</div>;
}

function ReadField({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-slate-700">{value ?? '—'}</p>
    </div>
  );
}

function InputField({
  label,
  type = 'text',
  register,
  span2 = false,
  placeholder = '',
}: {
  label: string;
  type?: string;
  register: object;
  span2?: boolean;
  placeholder?: string;
}) {
  return (
    <div className={span2 ? 'col-span-2' : ''}>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
        {...register}
      />
    </div>
  );
}

function SelectField({
  label,
  options,
  register,
  span2 = false,
}: {
  label: string;
  options: string[];
  register: object;
  span2?: boolean;
}) {
  return (
    <div className={span2 ? 'col-span-2' : ''}>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      <select
        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
        {...register}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

function ScorePills({
  label,
  field,
  value,
  onChange,
}: {
  label: string;
  field: string;
  value: number | string;
  onChange: (field: string, val: number) => void;
}) {
  const num = Number(value) || 0;
  return (
    <div className="col-span-1">
      <label className="block text-xs font-semibold text-slate-600 mb-1.5">{label}</label>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(field, v)}
            className={`w-8 h-8 rounded-full text-xs font-bold transition-all border ${
              num === v
                ? v >= 4
                  ? 'bg-green-500 text-white border-green-500'
                  : v === 3
                  ? 'bg-amber-400 text-white border-amber-400'
                  : 'bg-red-500 text-white border-red-500'
                : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300 hover:text-blue-600'
            }`}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

function scoreColor(score: number | null) {
  if (!score) return 'text-slate-400';
  if (score >= 4) return 'text-green-600';
  if (score >= 3.25) return 'text-amber-600';
  return 'text-red-600';
}

function ScoreDisplay({ label, score }: { label: string; score: number | null }) {
  const pct = score ? (score / 5) * 100 : 0;
  const barColor = score
    ? score >= 4
      ? 'bg-green-500'
      : score >= 3.25
      ? 'bg-amber-400'
      : 'bg-red-500'
    : 'bg-slate-200';
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-500 w-24 flex-shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-bold w-8 text-right ${scoreColor(score)}`}>
        {score ? score.toFixed(1) : '—'}
      </span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CandidateDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingDraft, setSavingDraft] = useState(false);
  const [submittingAssessment, setSubmittingAssessment] = useState(false);
  const [validationLoading, setValidationLoading] = useState(false);
  const [showEmailOverlay, setShowEmailOverlay] = useState(false);
  const [mailSending, setMailSending] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);
  const [emailClient, setEmailClient] = useState<{
    name: string; short_name: string | null; website_url: string | null;
    logo_data: string | null; description: string | null;
  } | null>(null);
  const [emailJobSkills, setEmailJobSkills] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [message, setMessage] = useState('');
  const [liveScores, setLiveScores] = useState({ tech: 0, soft: 0, overall: 0 });
  const [validationStatus, setValidationStatus] = useState('');
  const [validationComment, setValidationComment] = useState('');
  const [submittedToClient, setSubmittedToClient] = useState('');
  const [submissionDate, setSubmissionDate] = useState('');
  const [scoreValues, setScoreValues] = useState<Record<string, number>>({});
  const [callDate, setCallDate] = useState(new Date().toISOString().split('T')[0]);
  const [callOutcome, setCallOutcome] = useState('');

  const assessmentForm = useForm<AssessmentForm>({ defaultValues: { red_flags: [] } });
  const profileForm = useForm<ConsultantProfileForm>();

  const role = user?.role ?? '';
  const isRecruiter = role === 'recruiter';
  const isValidator = role === 'delivery_lead' || role === 'admin';

  const showMsg = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 4000);
  };

  // Recompute live scores when pill scores change
  useEffect(() => {
    const techFields = ['self_art_score', 'role_art_score', 'resume_skill_score', 'tech_qa_score', 'paraphrase_score'];
    const softFields = ['comm_score', 'confidence_score', 'gut_score'];
    const avg = (fields: string[]) => {
      const vals = fields.map((f) => scoreValues[f] || 0).filter((v) => v > 0);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    };
    const tech = avg(techFields);
    const soft = avg(softFields);
    const all = [...techFields, ...softFields].map((f) => scoreValues[f] || 0).filter((v) => v > 0);
    const overall = all.length ? all.reduce((a, b) => a + b, 0) / all.length : 0;
    setLiveScores({ tech, soft, overall });
  }, [scoreValues]);

  const setScore = (field: string, val: number) => {
    setScoreValues((prev) => ({ ...prev, [field]: val }));
    assessmentForm.setValue(field as keyof AssessmentForm, val as never);
  };

  const loadCandidate = () => {
    if (!id) return;
    setLoading(true);
    api
      .get<Candidate>(`/candidates/${id}`)
      .then((res) => {
        const c = res.data;
        setCandidate(c);
        // Pre-fill assessment form
        if (c.assessment) {
          const a = c.assessment;
          const textFields: (keyof Assessment)[] = [
            'full_name_confirmed', 'email_verified', 'alt_phone', 'linkedin_verified',
            'qualification', 'last_company', 'last_tenure', 'lwd_confirmed', 'last_working_day',
            'deploying_client', 'role_position', 'primary_skill_stack',
            'skill_match_last_role', 'tech_q_used',
            'project_status', 'open_to_relocation', 'work_mode_pref', 'work_auth_status',
            'current_city', 'reason_for_change', 'interviewing_elsewhere', 'offers_in_hand',
            'counter_offer_risk', 'last_appraisal_context',
            'email_acknowledged', 'validation_slot_locked',
            'pass_to_validation', 'caller_notes',
          ];
          textFields.forEach((f) => {
            if (a[f] !== null && a[f] !== undefined) {
              assessmentForm.setValue(f as keyof AssessmentForm, a[f] as never);
            }
          });
          const numFields: (keyof Assessment)[] = [
            'total_exp', 'relevant_exp', 'notice_period_weeks', 'current_ctc', 'expected_ctc',
          ];
          numFields.forEach((f) => {
            if (a[f] !== null && a[f] !== undefined) {
              assessmentForm.setValue(f as keyof AssessmentForm, a[f] as never);
            }
          });
          // Score pills
          const scoreFields = ['comm_score', 'self_art_score', 'role_art_score', 'resume_skill_score', 'tech_qa_score', 'paraphrase_score', 'confidence_score', 'gut_score'];
          const newScores: Record<string, number> = {};
          scoreFields.forEach((f) => {
            const v = a[f as keyof Assessment];
            if (v !== null && v !== undefined) {
              newScores[f] = Number(v);
              assessmentForm.setValue(f as keyof AssessmentForm, Number(v) as never);
            }
          });
          setScoreValues(newScores);
          // Red flags
          if (a.red_flags) {
            try { assessmentForm.setValue('red_flags', JSON.parse(a.red_flags)); } catch {}
          }
        }
        // Pre-fill validation fields
        if (c.validation) {
          setValidationStatus(c.validation.status ?? '');
          setValidationComment(c.validation.comments ?? '');
          setSubmittedToClient(c.validation.submitted_to_client ?? '');
          setSubmissionDate(c.validation.submission_date ?? '');
        }
        // Pre-fill consultant profile
        if (c.consultant_profile) {
          const cp = c.consultant_profile;
          const profileFields: (keyof ConsultantProfile)[] = [
            'resignation_acceptance', 'replacement_kt_status', 'personal_laptop',
            'role_responsibilities', 'current_work_location', 'client_work_location',
            'current_work_timings', 'notice_negotiable_upto', 'payroll',
            'offers_pipeline', 'interview_pipeline', 'dob', 'telephonic_availability',
            'ide_installed', 'wifi_connectivity', 'marital_status', 'health_issues',
            'planned_leaves', 'interview_availability_2d', 'upcoming_travel',
          ];
          profileFields.forEach((f) => {
            if (cp[f] !== null && cp[f] !== undefined) {
              profileForm.setValue(f as keyof ConsultantProfileForm, cp[f] as string);
            }
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadCandidate(); }, [id]);

  const currentCtc = Number(assessmentForm.watch('current_ctc')) || 0;
  const expectedCtc = Number(assessmentForm.watch('expected_ctc')) || 0;
  const hikePct = currentCtc > 0 ? (((expectedCtc - currentCtc) / currentCtc) * 100).toFixed(1) : '—';

  const saveAssessment = async (submit: boolean) => {
    const data = assessmentForm.getValues();
    if (!id) return;
    const body = {
      ...data,
      candidate_id: Number(id),
      submit_for_review: submit,
      total_exp: Number(data.total_exp) || null,
      relevant_exp: Number(data.relevant_exp) || null,
      notice_period_weeks: Number(data.notice_period_weeks) || null,
      current_ctc: Number(data.current_ctc) || null,
      expected_ctc: Number(data.expected_ctc) || null,
      comm_score: scoreValues['comm_score'] || null,
      self_art_score: scoreValues['self_art_score'] || null,
      role_art_score: scoreValues['role_art_score'] || null,
      resume_skill_score: scoreValues['resume_skill_score'] || null,
      tech_qa_score: scoreValues['tech_qa_score'] || null,
      paraphrase_score: scoreValues['paraphrase_score'] || null,
      confidence_score: scoreValues['confidence_score'] || null,
      gut_score: scoreValues['gut_score'] || null,
      red_flags: JSON.stringify(data.red_flags ?? []),
    };
    try {
      await api.post('/calls/assessment', body);
      showMsg(submit ? 'Submitted for validation!' : 'Draft saved.');
      loadCandidate();
    } catch {
      showMsg('Error saving assessment.');
    }
  };

  const handleSave = async (submit: boolean) => {
    if (!id) return;
    const isSaving = submit ? setSubmittingAssessment : setSavingDraft;
    isSaving(true);
    try {
      // Log the call if outcome is selected
      if (callOutcome) {
        await api.post('/calls/log', {
          candidate_id: Number(id),
          outcome: callOutcome,
          callback_date: callDate,
          notes: '',
        });
      }
      await saveAssessment(submit);
    } catch {
      showMsg('Error saving.');
    } finally {
      isSaving(false);
    }
  };

  const handleValidationAction = async (action: string) => {
    if (!id) return;
    setValidationLoading(true);
    try {
      await api.post('/validation/action', {
        candidate_id: Number(id),
        status: action,
        comments: validationComment,
        submitted_to_client: submittedToClient || null,
        submission_date: submissionDate || null,
      });
      showMsg(`Validation updated: ${action}`);
      loadCandidate();
    } catch {
      showMsg('Action failed.');
    } finally {
      setValidationLoading(false);
    }
  };

  const saveConsultantProfile = async () => {
    if (!id) return;
    setSavingProfile(true);
    try {
      const data = profileForm.getValues();
      await api.post(`/consultant-profile/${id}`, data);
      showMsg('Consultant profile saved.');
      loadCandidate();
    } catch {
      showMsg('Error saving profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  // ─── Email generation ──────────────────────────────────────────────────

  const generateEmailText = (c: Candidate): string => {
    const a = c.assessment;
    const cp = c.consultant_profile;
    const clientUrl = c.client_name
      ? `https://www.${c.client_name.toLowerCase().replace(/\s+/g, '')}.com`
      : '—';

    const row = (label: string, value: string | null | undefined) =>
      `${label}: ${value ?? '—'}`;

    return [
      'Greetings from JoulesToWatts Business Solutions!',
      '',
      `Hi ${c.full_name},`,
      '',
      'We are pleased to be in touch with you through JoulesToWatts Business Solutions, a specialized IT staffing and consulting firm. We work with leading technology companies to connect talented professionals with exciting career opportunities.',
      '',
      'Company URLs:',
      '  J2W: http://www.joulestowatts.com',
      `  Client: ${clientUrl}`,
      '',
      'JoulesToWatts Business Solutions partners with top-tier clients to place skilled IT consultants in high-impact roles. Our team ensures a seamless experience from profile submission to onboarding.',
      '',
      '── Consultant Data ──',
      row('Name', c.full_name) + '  |  ' + row('Phone', c.mobile),
      row('Email ID', c.email) + '  |  ' + row('Alternate no', a?.alt_phone),
      row('Company URL', 'http://www.joulestowatts.com') + '  |  ' + row('Client Company URL', clientUrl),
      row('Resignation acceptance', cp?.resignation_acceptance) + '  |  ' + row('Replacement & KT', cp?.replacement_kt_status),
      row('Skill Set', a?.primary_skill_stack) + '  |  ' + row('Role/Responsibilities', cp?.role_responsibilities),
      row('Personal Laptop', cp?.personal_laptop) + '  |  ' + row('Total experience', a?.total_exp != null ? `${a.total_exp} yrs` : '—'),
      row('Current Residential Location', a?.current_city) + '  |  ' + row('Client Work Location', cp?.client_work_location),
      row('Current Work Location', cp?.current_work_location) + '  |  ' + row('Current Work Timings', cp?.current_work_timings),
      row('Notice Period (on paper)', a?.notice_period_weeks != null ? `${a.notice_period_weeks} weeks` : '—') + '  |  ' + row('Negotiable Upto', cp?.notice_negotiable_upto),
      row('Current Company', a?.last_company) + '  |  ' + row('Payroll', cp?.payroll),
      row('Current CTC', a?.current_ctc != null ? `${a.current_ctc} LPA` : '—') + '  |  ' + row('Expected CTC', a?.expected_ctc != null ? `${a.expected_ctc} LPA` : '—'),
      row('Relevant experience', a?.relevant_exp != null ? `${a.relevant_exp} yrs` : '—') + '  |  ' + row('Deploying Client', a?.deploying_client),
      row('Offers in Hand', a?.offers_in_hand) + '  |  ' + row('Offers Pipeline', cp?.offers_pipeline),
      row('Interview Pipeline', cp?.interview_pipeline) + '  |  ' + row('Reason for change', a?.reason_for_change),
      row('DOB', cp?.dob) + '  |  ' + row('Telephonic availability', cp?.telephonic_availability),
      row('IDE Installed', cp?.ide_installed) + '  |  ' + row('Wifi / Mobile Data', cp?.wifi_connectivity),
      row('Marital Status', cp?.marital_status) + '  |  ' + row('LinkedIn', c.linkedin_url),
      row('Health Issues (self/family)', cp?.health_issues) + '  |  ' + row('Planned Leaves (3 mo)', cp?.planned_leaves),
      row('Interview Avail (next 2 days)', cp?.interview_availability_2d) + '  |  ' + row('Travel Plans', cp?.upcoming_travel),
    ].join('\n');
  };

  const handleMarkMailSent = async () => {
    if (!candidate || candidate.mail_sent) return;
    setMailSending(true);
    try {
      await api.post('/mails', { candidate_id: candidate.id });
      setCandidate(prev => prev ? { ...prev, mail_sent: true } : prev);
      showMsg('Mail marked as sent!');
      setShowEmailOverlay(false);
    } catch {
      showMsg('Error recording mail. Please try again.');
    } finally {
      setMailSending(false);
    }
  };

  // ─── Loading / Not Found ─────────────────────────────────────────────────

  if (loading) {
    return (
      <Layout title="Candidate Profile">
        <div className="animate-pulse space-y-4">
          <div className="h-32 bg-white rounded-2xl" />
          <div className="grid grid-cols-2 gap-4">
            <div className="h-64 bg-white rounded-2xl" />
            <div className="h-64 bg-white rounded-2xl" />
          </div>
        </div>
      </Layout>
    );
  }

  if (!candidate) {
    return (
      <Layout title="Candidate Not Found">
        <div className="text-center py-16 text-slate-400">Candidate not found.</div>
      </Layout>
    );
  }

  const assessment = candidate.assessment;
  const validation = candidate.validation;

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <Layout title="Candidate Profile">
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 mb-5 transition-colors"
      >
        <ArrowLeft size={16} />
        Back to Candidates
      </button>

      {/* Status message */}
      {message && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-700 font-medium">
          {message}
        </div>
      )}

      {/* Header card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-5 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black text-white" style={{ backgroundColor: '#1a2744' }}>
            {candidate.full_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">{candidate.full_name}</h2>
            <p className="text-slate-500 text-sm">{candidate.job_title ?? '—'} · {candidate.client_name ?? '—'}</p>
            {candidate.sourced_by_name && (
              <p className="text-xs text-teal-600 mt-0.5">Sourced by {candidate.sourced_by_name}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={candidate.status} />
          {candidate.overall_score != null && (
            <span className={`px-3 py-1 rounded-full text-sm font-bold ${candidate.overall_score >= 4 ? 'bg-green-100 text-green-700' : candidate.overall_score >= 3.25 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'}`}>
              {candidate.overall_score.toFixed(2)} / 5.0
            </span>
          )}
          {candidate.auto_recommendation && (
            <StatusBadge status={candidate.auto_recommendation} type="recommendation" />
          )}
        </div>
      </div>

      {/* Rejection banner */}
      {candidate.status === 'rejected' && candidate.rejected_by && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3.5 flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="text-red-600 text-sm font-bold">✕</span>
          </div>
          <div>
            <p className="text-sm font-bold text-red-700">Rejected by {candidate.rejected_by}</p>
            {candidate.rejection_reason && (
              <p className="text-sm text-red-600 mt-0.5">{candidate.rejection_reason}</p>
            )}
          </div>
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* ── LEFT COLUMN: Info + Call Logs ─────────────────────────────────── */}
        <div className="space-y-5">

          {/* SECTION 1: SOURCING */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <SectionHeader color="bg-[#1a2744]" title="Sourcing Information" />
            {isRecruiter ? (
              /* Editable sourcing form for sourcing_partner */
              <div className="p-5 space-y-3">
                <p className="text-xs text-slate-400">Sourcing fields are editable. Use the Candidates list to update them.</p>
                <div className="grid grid-cols-2 gap-3">
                  <ReadField label="Name" value={candidate.full_name} />
                  <ReadField label="Mobile" value={candidate.mobile} />
                  <ReadField label="Email" value={candidate.email} />
                  <ReadField label="LinkedIn" value={candidate.linkedin_url} />
                  <ReadField label="Education" value={candidate.education} />
                  <ReadField label="City" value={candidate.city} />
                  <ReadField label="Exp Range" value={candidate.exp_range} />
                  <ReadField label="Current Company" value={candidate.current_company} />
                  <ReadField label="Naukri Active" value={candidate.naukri_active} />
                  <ReadField label="Immediate Joiner" value={candidate.immediate_joiner} />
                  <ReadField label="Lead Source" value={candidate.lead_source} />
                  <ReadField label="Sourcing Date" value={candidate.sourcing_date} />
                  <div className="col-span-2">
                    <ReadField label="Skills" value={candidate.skills} />
                  </div>
                </div>
              </div>
            ) : (
              /* Read-only for other roles */
              <div className="p-5">
                <div className="flex items-start gap-3 py-2 border-b border-slate-50">
                  <Phone size={14} className="text-slate-400 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-slate-700">{candidate.mobile ?? '—'}</span>
                </div>
                <div className="flex items-start gap-3 py-2 border-b border-slate-50">
                  <Mail size={14} className="text-slate-400 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-slate-700">{candidate.email ?? '—'}</span>
                </div>
                {candidate.linkedin_url && (
                  <div className="flex items-start gap-3 py-2 border-b border-slate-50">
                    <LinkedinIcon size={14} className="text-slate-400 flex-shrink-0 mt-0.5" />
                    <a href={candidate.linkedin_url} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline truncate">{candidate.linkedin_url}</a>
                  </div>
                )}
                <div className="flex items-start gap-3 py-2 border-b border-slate-50">
                  <MapPin size={14} className="text-slate-400 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-slate-700">{candidate.city ?? '—'}</span>
                </div>
                <div className="flex items-start gap-3 py-2 border-b border-slate-50">
                  <BookOpen size={14} className="text-slate-400 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-slate-700">{candidate.education ?? '—'}</span>
                </div>
                <div className="flex items-start gap-3 py-2 border-b border-slate-50">
                  <Building2 size={14} className="text-slate-400 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-slate-700">{candidate.current_company ?? '—'}</span>
                </div>
                <div className="flex items-start gap-3 py-2 border-b border-slate-50">
                  <Clock size={14} className="text-slate-400 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-slate-700">{candidate.exp_range ?? '—'} yrs</span>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-3">
                  <ReadField label="Skills" value={candidate.skills} />
                  <ReadField label="Naukri Active" value={candidate.naukri_active} />
                  <ReadField label="Immediate Joiner" value={candidate.immediate_joiner} />
                  <ReadField label="Lead Source" value={candidate.lead_source} />
                  <ReadField label="Sourcing Date" value={candidate.sourcing_date} />
                  <ReadField label="Assigned To" value={candidate.assigned_to_name} />
                </div>
              </div>
            )}
          </div>

          {/* Call Logs */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 py-3 bg-slate-700">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Call Logs</h3>
            </div>
            <div className="p-5">
              {!candidate.call_logs || candidate.call_logs.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">No call logs yet.</p>
              ) : (
                <div className="space-y-3">
                  {candidate.call_logs.map((log) => (
                    <div key={log.id} className="bg-slate-50 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-slate-700">
                          {new Date(log.call_date).toLocaleDateString()}
                        </span>
                      </div>
                      {log.outcome && (
                        <span className="inline-block text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium mb-1">
                          {log.outcome}
                        </span>
                      )}
                      {log.notes && <p className="text-xs text-slate-500 mt-1">{log.notes}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>

        {/* ── RIGHT COLUMN: Role-specific sections ──────────────────────────── */}
        <div className="space-y-5">

          {/* SECTION 2: CALL & VERIFICATION — editable by caller */}
          {(isRecruiter || isValidator) && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
              <SectionHeader color="bg-blue-700" title="Call & Verification" />

              {isRecruiter ? (
                <form onSubmit={(e) => e.preventDefault()}>

                  {/* ── CALL META ───────────────────────────────── */}
                  <div className="px-5 pt-4 pb-3 bg-slate-800">
                    <p className="text-xs font-bold text-slate-300 uppercase tracking-widest mb-3">
                      📞 Call Meta — Opening <span className="font-normal text-slate-500">0:00–0:30</span>
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-1">Call Date</label>
                        <input
                          type="date"
                          value={callDate}
                          onChange={(e) => setCallDate(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-slate-600 bg-slate-700 text-white text-sm focus:outline-none focus:border-blue-400"
                        />
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className="block text-xs font-semibold text-slate-400 mb-1.5">Call Duration / Outcome</label>
                      <div className="flex flex-wrap gap-1.5">
                        {CALL_DURATION_OPTS.map(({ v, l }) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setCallOutcome(callOutcome === v ? '' : v)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                              callOutcome === v
                                ? 'bg-blue-500 text-white border-blue-500'
                                : 'bg-slate-700 text-slate-300 border-slate-600 hover:border-blue-400 hover:text-blue-300'
                            }`}
                          >
                            {l}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* ── STAGE A ────────────────────────────────── */}
                  <div className="px-5 pt-4 pb-3 border-t border-slate-100">
                    <p className="text-xs font-bold text-indigo-700 uppercase tracking-wider mb-3">
                      Stage A — Verify Basics <span className="font-normal text-slate-400">0:30–0:55</span>
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <InputField label="Full Name (confirmed spelling)" register={assessmentForm.register('full_name_confirmed')} placeholder={candidate.full_name} />
                      <InputField label="Verify Email" register={assessmentForm.register('email_verified')} placeholder={candidate.email ?? ''} />
                      <InputField label="Alternate Number" register={assessmentForm.register('alt_phone')} placeholder={candidate.mobile ?? ''} />
                      <InputField label="Verify / Update LinkedIn" register={assessmentForm.register('linkedin_verified')} placeholder={candidate.linkedin_url ?? 'N/A'} />
                      <SelectField label="Total Experience" options={EXP_RANGES} register={assessmentForm.register('total_exp')} />
                      <SelectField label="Relevant Experience" options={EXP_RANGES} register={assessmentForm.register('relevant_exp')} />
                      <SelectField label="Highest Qualification" options={QUALIFICATION_OPTS} register={assessmentForm.register('qualification')} />
                      <InputField label="Last Company" register={assessmentForm.register('last_company')} />
                      <SelectField label="Last Tenure" options={TENURE_OPTS} register={assessmentForm.register('last_tenure')} />
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Notice Period</label>
                        <div className="flex flex-wrap gap-1.5">
                          {NOTICE_OPTS.map(({ v, l }) => {
                            const cur = String(assessmentForm.watch('notice_period_weeks') ?? '');
                            return (
                              <button key={v} type="button"
                                onClick={() => assessmentForm.setValue('notice_period_weeks', Number(v) as never)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                                  cur === v ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                                }`}
                              >{l}</button>
                            );
                          })}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">LWD Confirmed in writing?</label>
                        <div className="flex gap-1.5">
                          {YNNA.map(({ v }) => {
                            const cur = assessmentForm.watch('lwd_confirmed') ?? '';
                            return (
                              <button key={v} type="button"
                                onClick={() => assessmentForm.setValue('lwd_confirmed', cur === v ? '' : v as never)}
                                className={`px-4 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                  cur === v ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                                }`}
                              >{v}</button>
                            );
                          })}
                        </div>
                      </div>
                      <InputField label="Last Working Day" type="date" register={assessmentForm.register('last_working_day')} />
                    </div>
                  </div>

                  {/* ── DEPLOYMENT TARGET ───────────────────────── */}
                  <div className="px-5 pt-3 pb-3 border-t border-slate-100 bg-slate-50">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Deployment Target</p>
                    <div className="grid grid-cols-2 gap-3">
                      <InputField label="Deploying Client" register={assessmentForm.register('deploying_client')} />
                      <InputField label="Role / Position" register={assessmentForm.register('role_position')} />
                      <InputField label="Primary Skill Stack" span2 register={assessmentForm.register('primary_skill_stack')} />
                    </div>
                  </div>

                  {/* ── STAGE B ────────────────────────────────── */}
                  <div className="px-5 pt-3 pb-3 border-t border-slate-100">
                    <p className="text-xs font-bold text-green-700 uppercase tracking-wider mb-3">
                      Stage B — Role Fit Assessment <span className="font-normal text-slate-400">0:55–1:40</span>
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Skill Match w/ Last Role</label>
                        <div className="flex flex-wrap gap-1.5">
                          {SKILL_MATCH_CHIPS.map(({ v, l }) => {
                            const cur = assessmentForm.watch('skill_match_last_role') ?? '';
                            return (
                              <button key={v} type="button"
                                onClick={() => assessmentForm.setValue('skill_match_last_role', cur === v ? '' : v as never)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                                  cur === v ? 'bg-green-600 text-white border-green-600' : 'bg-white text-slate-600 border-slate-200 hover:border-green-300'
                                }`}
                              >{l}</button>
                            );
                          })}
                        </div>
                      </div>
                      <ScorePills label="Self Articulation (Q7)" field="self_art_score" value={scoreValues['self_art_score'] ?? ''} onChange={setScore} />
                      <ScorePills label="Role Articulation (Q8)" field="role_art_score" value={scoreValues['role_art_score'] ?? ''} onChange={setScore} />
                      <ScorePills label="Resume-Skill Match (Q9)" field="resume_skill_score" value={scoreValues['resume_skill_score'] ?? ''} onChange={setScore} />
                      <ScorePills label="Live Tech Q&A (Q10)" field="tech_qa_score" value={scoreValues['tech_qa_score'] ?? ''} onChange={setScore} />
                      <div className="col-span-2">
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Tech Q Used (which question from bank)</label>
                        <input
                          type="text"
                          placeholder="e.g. Q3 — Explain indexing in PostgreSQL"
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-400"
                          {...assessmentForm.register('tech_q_used')}
                        />
                      </div>
                    </div>
                  </div>

                  {/* ── STAGE C ────────────────────────────────── */}
                  <div className="px-5 pt-3 pb-3 border-t border-slate-100 bg-amber-50">
                    <p className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-3">
                      Stage C — Engagement Model <span className="font-normal text-slate-400">1:40–2:15</span>
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <ScorePills label="⭐ Paraphrasing — Deployment Model (Q12)" field="paraphrase_score" value={scoreValues['paraphrase_score'] ?? ''} onChange={setScore} />
                    </div>
                  </div>

                  {/* ── STAGE D ────────────────────────────────── */}
                  <div className="px-5 pt-3 pb-3 border-t border-slate-100">
                    <p className="text-xs font-bold text-purple-700 uppercase tracking-wider mb-3">
                      Stage D — Availability & Commercials <span className="font-normal text-slate-400">2:15–2:50</span>
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Project Status / On-Bench Duration</label>
                        <input type="text" placeholder="e.g. Bench since Jan, 3 months" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-400" {...assessmentForm.register('project_status')} />
                      </div>

                      <div className="col-span-2">
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Open to Relocation</label>
                        <div className="flex gap-1.5 flex-wrap">
                          {RELOCATION_OPTS.map(({ v, l }) => {
                            const cur = assessmentForm.watch('open_to_relocation') ?? '';
                            return (
                              <button key={v} type="button"
                                onClick={() => assessmentForm.setValue('open_to_relocation', cur === v ? '' : v as never)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                                  cur === v ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300'
                                }`}
                              >{l}</button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="col-span-2">
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Work Mode Preference</label>
                        <div className="flex gap-1.5 flex-wrap">
                          {WORK_MODE_OPTS.map(({ v, l }) => {
                            const cur = assessmentForm.watch('work_mode_pref') ?? '';
                            return (
                              <button key={v} type="button"
                                onClick={() => assessmentForm.setValue('work_mode_pref', cur === v ? '' : v as never)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                                  cur === v ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300'
                                }`}
                              >{l}</button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="col-span-2">
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Work Authorization</label>
                        <div className="flex gap-1.5 flex-wrap">
                          {WORK_AUTH_OPTS.map(({ v, l }) => {
                            const cur = assessmentForm.watch('work_auth_status') ?? '';
                            return (
                              <button key={v} type="button"
                                onClick={() => assessmentForm.setValue('work_auth_status', cur === v ? '' : v as never)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                                  cur === v ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300'
                                }`}
                              >{l}</button>
                            );
                          })}
                        </div>
                      </div>

                      <InputField label="Current Residential City" register={assessmentForm.register('current_city')} />

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Current CTC (LPA)</label>
                        <div className="flex items-center gap-1.5">
                          <input type="number" step="0.1" placeholder="e.g. 12.5" className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-400" {...assessmentForm.register('current_ctc')} />
                          <span className="text-xs text-slate-400 font-semibold">LPA</span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Expected CTC (LPA)</label>
                        <div className="flex items-center gap-1.5">
                          <input type="number" step="0.1" placeholder="e.g. 18" className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-400" {...assessmentForm.register('expected_ctc')} />
                          <span className="text-xs text-slate-400 font-semibold">LPA</span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Hike % (auto)</label>
                        <div className={`px-3 py-2 rounded-lg border border-dashed text-sm font-bold ${
                          hikePct === '—' ? 'border-slate-200 bg-slate-50 text-slate-400'
                          : Number(hikePct) > 50 ? 'border-red-200 bg-red-50 text-red-600'
                          : Number(hikePct) > 25 ? 'border-amber-200 bg-amber-50 text-amber-700'
                          : 'border-green-200 bg-green-50 text-green-700'
                        }`}>
                          {hikePct !== '—' ? `${hikePct}%` : '—'}
                        </div>
                      </div>

                      <SelectField label="Reason for Change" options={REASON_OPTS} register={assessmentForm.register('reason_for_change')} />

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Interviewing Elsewhere?</label>
                        <div className="flex gap-1.5">
                          {YN.map(({ v }) => {
                            const cur = assessmentForm.watch('interviewing_elsewhere') ?? '';
                            return (
                              <button key={v} type="button"
                                onClick={() => assessmentForm.setValue('interviewing_elsewhere', cur === v ? '' : v as never)}
                                className={`px-5 py-2 rounded-lg text-xs font-bold border transition-all ${
                                  cur === v ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300'
                                }`}
                              >{v}</button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Offers in Hand</label>
                        <div className="flex gap-1.5">
                          {OFFERS_OPTS.map(({ v }) => {
                            const cur = assessmentForm.watch('offers_in_hand') ?? '';
                            return (
                              <button key={v} type="button"
                                onClick={() => assessmentForm.setValue('offers_in_hand', cur === v ? '' : v as never)}
                                className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all ${
                                  cur === v ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300'
                                }`}
                              >{v}</button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Counter-Offer Risk</label>
                        <div className="flex gap-1.5">
                          {RISK_OPTS.map(({ v }) => {
                            const cur = assessmentForm.watch('counter_offer_risk') ?? '';
                            const color = v === 'Low' ? 'green' : v === 'Medium' ? 'amber' : 'red';
                            return (
                              <button key={v} type="button"
                                onClick={() => assessmentForm.setValue('counter_offer_risk', cur === v ? '' : v as never)}
                                className={`px-3 py-2 rounded-lg text-xs font-bold border transition-all ${
                                  cur === v
                                    ? color === 'green' ? 'bg-green-500 text-white border-green-500'
                                      : color === 'amber' ? 'bg-amber-500 text-white border-amber-500'
                                      : 'bg-red-500 text-white border-red-500'
                                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                                }`}
                              >{v}</button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="col-span-2">
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Last Appraisal Context (when, how much)</label>
                        <input type="text" placeholder="e.g. Jan 2025, 8% hike" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-400" {...assessmentForm.register('last_appraisal_context')} />
                      </div>
                    </div>
                  </div>

                  {/* ── CLOSE ──────────────────────────────────── */}
                  <div className="px-5 pt-3 pb-3 border-t border-slate-100 bg-slate-50">
                    <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-3">
                      Close — Live Email <span className="font-normal text-slate-400">2:50–4:30</span>
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email Acknowledged on Call?</label>
                        <div className="flex gap-1.5">
                          {YN.map(({ v }) => {
                            const cur = assessmentForm.watch('email_acknowledged') ?? '';
                            return (
                              <button key={v} type="button"
                                onClick={() => assessmentForm.setValue('email_acknowledged', cur === v ? '' : v as never)}
                                className={`px-5 py-2 rounded-lg text-xs font-bold border transition-all ${
                                  cur === v ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                                }`}
                              >{v}</button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Validation Slot Locked?</label>
                        <div className="flex gap-1.5">
                          {YNNA.map(({ v }) => {
                            const cur = assessmentForm.watch('validation_slot_locked') ?? '';
                            return (
                              <button key={v} type="button"
                                onClick={() => assessmentForm.setValue('validation_slot_locked', cur === v ? '' : v as never)}
                                className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all ${
                                  cur === v ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                                }`}
                              >{v}</button>
                            );
                          })}
                        </div>
                      </div>

                      <ScorePills label="Communication — Overall (1-5)" field="comm_score" value={scoreValues['comm_score'] ?? ''} onChange={setScore} />
                      <ScorePills label="Confidence & Energy (1-5)" field="confidence_score" value={scoreValues['confidence_score'] ?? ''} onChange={setScore} />
                    </div>
                  </div>

                  {/* ── COMPUTED SCORES ─────────────────────────── */}
                  <div className="px-5 pt-3 pb-4 border-t border-slate-100" style={{ backgroundColor: '#f0f9ff' }}>
                    <p className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-3">Computed Scores — auto-calculated</p>
                    <div className="space-y-2 mb-3">
                      <ScoreDisplay label="Technical Score" score={liveScores.tech || null} />
                      <ScoreDisplay label="Soft-Skill Score" score={liveScores.soft || null} />
                      <ScoreDisplay label="OVERALL Score" score={liveScores.overall || null} />
                    </div>
                    {liveScores.overall > 0 && (
                      <div className={`text-center py-2 rounded-xl text-sm font-black ${
                        liveScores.overall >= 4 ? 'bg-green-100 text-green-700'
                        : liveScores.overall >= 3.25 ? 'bg-amber-100 text-amber-700'
                        : 'bg-red-100 text-red-600'
                      }`}>
                        {liveScores.overall >= 4 ? '✅ Strong Submit'
                        : liveScores.overall >= 3.25 ? '⚡ Consider'
                        : '⏸ Hold'}
                      </div>
                    )}
                  </div>

                  {/* ── RED FLAGS & NOTES ───────────────────────── */}
                  <div className="px-5 pt-3 pb-3 border-t border-slate-100">
                    <p className="text-xs font-bold text-red-600 uppercase tracking-wider mb-3">Red Flags & Notes</p>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {RED_FLAG_OPTIONS.map((flag) => {
                        const flags: string[] = assessmentForm.watch('red_flags') ?? [];
                        const checked = flags.includes(flag);
                        return (
                          <label key={flag} className={`flex items-center gap-1.5 cursor-pointer px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                            checked ? 'bg-red-100 text-red-700 border-red-300' : 'bg-white text-slate-600 border-slate-200 hover:border-red-300'
                          }`}>
                            <input type="checkbox" value={flag} className="hidden" {...assessmentForm.register('red_flags')} />
                            {flag}
                          </label>
                        );
                      })}
                    </div>
                    <textarea
                      rows={2}
                      placeholder="Recruiter notes (max 2 lines) — key observations, concerns…"
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 resize-none"
                      {...assessmentForm.register('caller_notes')}
                    />
                  </div>

                  {/* ── RECRUITER VERDICT ───────────────────────── */}
                  <div className="px-5 pt-3 pb-4 border-t border-slate-100 bg-slate-800">
                    <p className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">Recruiter Verdict</p>
                    <div className="mb-4">
                      <label className="block text-xs font-semibold text-slate-400 mb-2">Pass to Validation?</label>
                      <div className="flex flex-wrap gap-2">
                        {PASS_CHIPS.map(({ v, l }) => {
                          const cur = assessmentForm.watch('pass_to_validation') ?? '';
                          const isSelected = cur === v;
                          const selColor = v.startsWith('YES - Strong') ? 'bg-green-500 border-green-500'
                            : v.startsWith('YES') ? 'bg-blue-500 border-blue-500'
                            : v === 'HOLD' ? 'bg-amber-500 border-amber-500'
                            : 'bg-red-500 border-red-500';
                          return (
                            <button key={v} type="button"
                              onClick={() => assessmentForm.setValue('pass_to_validation', cur === v ? '' : v as never)}
                              className={`px-4 py-2 rounded-xl text-sm font-bold border-2 transition-all ${
                                isSelected ? `${selColor} text-white` : 'bg-slate-700 text-slate-300 border-slate-600 hover:border-slate-400'
                              }`}
                            >{l}</button>
                          );
                        })}
                      </div>
                    </div>
                    <ScorePills label="Recruiter Confidence / Gut (1-5)" field="gut_score" value={scoreValues['gut_score'] ?? ''} onChange={setScore} />
                  </div>

                  {/* ── ACTIONS ─────────────────────────────────── */}
                  <div className="px-5 py-4 flex gap-3 bg-white border-t border-slate-200 sticky bottom-0 shadow-lg">
                    <button
                      type="button"
                      disabled={savingDraft}
                      onClick={() => handleSave(false)}
                      className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                    >
                      {savingDraft ? 'Saving…' : '💾 Save Draft'}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setShowEmailOverlay(true);
                        // Fetch client profile + job skills for the template
                        try {
                          const [cr, jr] = await Promise.all([
                            api.get('/clients').catch(() => ({ data: [] })),
                            candidate?.job_id ? api.get(`/jobs/${candidate.job_id}`).catch(() => ({ data: null })) : Promise.resolve({ data: null }),
                          ]);
                          const matched = (cr.data as { name: string; short_name: string | null; website_url: string | null; logo_data: string | null; description: string | null }[])
                            .find(c => c.name.toLowerCase() === candidate?.client_name?.toLowerCase());
                          setEmailClient(matched ?? null);
                          setEmailJobSkills((jr.data as { skill_stack?: string | null } | null)?.skill_stack ?? null);
                        } catch { /* ignore */ }
                      }}
                      disabled={candidate.mail_sent}
                      className="flex-1 py-3 rounded-xl text-white text-sm font-bold disabled:opacity-60 hover:opacity-90 flex items-center justify-center gap-2"
                      style={{ backgroundColor: candidate.mail_sent ? '#6b7280' : '#2563eb' }}
                    >
                      {candidate.mail_sent ? '✓ Mail Already Sent' : '✉️ Generate Email'}
                    </button>
                  </div>

                </form>
              ) : (
                /* Read-only assessment view for non-callers */
                <div className="p-5">
                  {!assessment ? (
                    <p className="text-sm text-slate-400 text-center py-6">No assessment completed yet.</p>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <ReadField label="Name Confirmed" value={assessment.full_name_confirmed} />
                        <ReadField label="Email Verified" value={assessment.email_verified} />
                        <ReadField label="Total Exp" value={assessment.total_exp ? `${assessment.total_exp} yrs` : null} />
                        <ReadField label="Relevant Exp" value={assessment.relevant_exp ? `${assessment.relevant_exp} yrs` : null} />
                        <ReadField label="Qualification" value={assessment.qualification} />
                        <ReadField label="Last Company" value={assessment.last_company} />
                        <ReadField label="Notice Period" value={assessment.notice_period_weeks ? `${assessment.notice_period_weeks} wks` : null} />
                        <ReadField label="LWD Confirmed" value={assessment.lwd_confirmed} />
                        <ReadField label="Current CTC" value={assessment.current_ctc ? `₹${assessment.current_ctc}L` : null} />
                        <ReadField label="Expected CTC" value={assessment.expected_ctc ? `₹${assessment.expected_ctc}L` : null} />
                        <ReadField label="Hike %" value={assessment.hike_pct ? `${assessment.hike_pct.toFixed(1)}%` : null} />
                        <ReadField label="Skill Match" value={assessment.skill_match_last_role} />
                        <ReadField label="Relocation" value={assessment.open_to_relocation} />
                        <ReadField label="Work Mode Pref" value={assessment.work_mode_pref} />
                        <ReadField label="Offers in Hand" value={assessment.offers_in_hand} />
                        <ReadField label="Counter Offer Risk" value={assessment.counter_offer_risk} />
                        <ReadField label="Pass to Validation" value={assessment.pass_to_validation} />
                      </div>
                      <div className="border-t border-slate-100 pt-4 space-y-2">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Scores</p>
                        <ScoreDisplay label="Communication" score={assessment.comm_score} />
                        <ScoreDisplay label="Self Articulation" score={assessment.self_art_score} />
                        <ScoreDisplay label="Role Articulation" score={assessment.role_art_score} />
                        <ScoreDisplay label="Resume Skills" score={assessment.resume_skill_score} />
                        <ScoreDisplay label="Technical Q&A" score={assessment.tech_qa_score} />
                        <ScoreDisplay label="Paraphrasing" score={assessment.paraphrase_score} />
                        <ScoreDisplay label="Confidence" score={assessment.confidence_score} />
                        <ScoreDisplay label="Gut Score" score={assessment.gut_score} />
                        <div className="border-t border-slate-100 pt-2 mt-2">
                          <ScoreDisplay label="Tech Score" score={assessment.tech_score} />
                          <ScoreDisplay label="Soft Skills" score={assessment.soft_skill_score} />
                          <ScoreDisplay label="Overall Score" score={assessment.overall_score} />
                        </div>
                      </div>
                      {assessment.red_flags && (() => {
                        try {
                          const flags: string[] = JSON.parse(assessment.red_flags);
                          return flags.length > 0 ? (
                            <div>
                              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Red Flags</p>
                              <div className="flex flex-wrap gap-2">
                                {flags.map((f) => <span key={f} className="text-xs px-2.5 py-1 rounded-full bg-red-50 text-red-600 font-medium">{f}</span>)}
                              </div>
                            </div>
                          ) : null;
                        } catch { return null; }
                      })()}
                      {assessment.caller_notes && (
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Caller Notes</p>
                          <p className="text-sm text-slate-600 bg-slate-50 rounded-xl p-3">{assessment.caller_notes}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* SECTION 3: SENIOR VALIDATION */}
          {isValidator && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
              <SectionHeader color="bg-orange-600" title="Senior Validation" />
              <div className="p-5 space-y-4">
                {/* Current validation status */}
                {validation && (
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                    {validation.status === 'validated' ? <CheckCircle2 size={18} className="text-green-500" /> :
                     validation.status === 'rejected' ? <XCircle size={18} className="text-red-500" /> :
                     validation.status === 'on_hold' ? <Clock3 size={18} className="text-amber-500" /> :
                     <AlertCircle size={18} className="text-orange-500" />}
                    <div>
                      <p className="text-sm font-semibold text-slate-700 capitalize">{validation.status?.replace('_', ' ') ?? 'Pending'}</p>
                      {validation.comments && <p className="text-xs text-slate-500 mt-0.5">{validation.comments}</p>}
                    </div>
                  </div>
                )}

                {/* Validation actions */}
                {assessment && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">Validation Status</label>
                      <select
                        value={validationStatus}
                        onChange={(e) => setValidationStatus(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-orange-400"
                      >
                        <option value="">Select status…</option>
                        <option value="validated">Approved</option>
                        <option value="needs_review">Needs Review</option>
                        <option value="rejected">Rejected</option>
                        <option value="on_hold">On Hold</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">Senior Notes</label>
                      <textarea
                        rows={3}
                        value={validationComment}
                        onChange={(e) => setValidationComment(e.target.value)}
                        placeholder="Add validation notes…"
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-orange-400 resize-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Submitted to Client</label>
                        <select
                          value={submittedToClient}
                          onChange={(e) => setSubmittedToClient(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-orange-400"
                        >
                          <option value="">—</option>
                          <option value="Y">Y</option>
                          <option value="N">N</option>
                          <option value="NA">NA</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Submission Date</label>
                        <input
                          type="date"
                          value={submissionDate}
                          onChange={(e) => setSubmissionDate(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-orange-400"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => handleValidationAction('validated')}
                        disabled={validationLoading}
                        className="py-2.5 rounded-xl bg-green-500 text-white text-sm font-semibold hover:bg-green-600 disabled:opacity-60"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleValidationAction('needs_review')}
                        disabled={validationLoading}
                        className="py-2.5 rounded-xl bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-60"
                      >
                        Needs Rework
                      </button>
                      <button
                        onClick={() => handleValidationAction('on_hold')}
                        disabled={validationLoading}
                        className="py-2.5 rounded-xl bg-amber-400 text-white text-sm font-semibold hover:bg-amber-500 disabled:opacity-60"
                      >
                        Hold
                      </button>
                      <button
                        onClick={() => handleValidationAction('rejected')}
                        disabled={validationLoading}
                        className="py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 disabled:opacity-60"
                      >
                        Reject
                      </button>
                    </div>
                  </>
                )}
                {!assessment && (
                  <p className="text-sm text-slate-400 text-center py-4">Assessment must be completed before validation.</p>
                )}
              </div>
            </div>
          )}

          {/* SECTION 4: CONSULTANT EMAIL DETAILS */}
          {isValidator && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
              <SectionHeader color="bg-green-700" title="Consultant Email Details" />
              <form onSubmit={(e) => e.preventDefault()} className="p-5">
                <p className="text-xs text-slate-400 mb-4">Post-validation fields for submission email. Editable by validator.</p>
                <div className="grid grid-cols-2 gap-3">
                  <SelectField label="Resignation Acceptance" options={['Y', 'N', 'NA']} register={profileForm.register('resignation_acceptance')} />
                  <InputField label="Replacement / KT Status" register={profileForm.register('replacement_kt_status')} />
                  <SelectField label="Personal Laptop" options={['Y', 'N']} register={profileForm.register('personal_laptop')} />
                  <InputField label="Payroll Company" register={profileForm.register('payroll')} />
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Role Responsibilities</label>
                    <textarea rows={2} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-green-400 resize-none" {...profileForm.register('role_responsibilities')} />
                  </div>
                  <InputField label="Current Work Location" register={profileForm.register('current_work_location')} />
                  <InputField label="Client Work Location" register={profileForm.register('client_work_location')} />
                  <SelectField label="Current Work Timings" options={['General', '9-5', 'US shift', 'UK shift', 'Flexible']} register={profileForm.register('current_work_timings')} />
                  <InputField label="Notice Negotiable Upto" register={profileForm.register('notice_negotiable_upto')} />
                  <InputField label="Offers Pipeline" register={profileForm.register('offers_pipeline')} />
                  <InputField label="Interview Pipeline" register={profileForm.register('interview_pipeline')} />
                  <InputField label="Date of Birth" type="date" register={profileForm.register('dob')} />
                  <SelectField label="Telephonic Availability" options={['Y', 'N']} register={profileForm.register('telephonic_availability')} />
                  <SelectField label="IDE Installed" options={['Y', 'N']} register={profileForm.register('ide_installed')} />
                  <SelectField label="WiFi Connectivity" options={['Y', 'N']} register={profileForm.register('wifi_connectivity')} />
                  <SelectField label="Marital Status" options={['Single', 'Married', 'Other']} register={profileForm.register('marital_status')} />
                  <SelectField label="Interview Availability (2d)" options={['Y', 'N']} register={profileForm.register('interview_availability_2d')} />
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Health Issues</label>
                    <textarea rows={2} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-green-400 resize-none" {...profileForm.register('health_issues')} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Planned Leaves</label>
                    <textarea rows={2} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-green-400 resize-none" {...profileForm.register('planned_leaves')} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Upcoming Travel</label>
                    <textarea rows={2} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-green-400 resize-none" {...profileForm.register('upcoming_travel')} />
                  </div>
                </div>
                <button
                  type="button"
                  disabled={savingProfile}
                  onClick={saveConsultantProfile}
                  className="mt-4 w-full py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-60 hover:opacity-90"
                  style={{ backgroundColor: '#059669' }}
                >
                  {savingProfile ? 'Saving…' : 'Save Consultant Profile'}
                </button>
              </form>
            </div>
          )}

          {/* Read-only consultant profile for non-validators */}
          {!isValidator && candidate.consultant_profile && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
              <SectionHeader color="bg-green-700" title="Consultant Email Details" />
              <FieldGrid>
                {([
                  ['Resignation Acceptance', candidate.consultant_profile.resignation_acceptance],
                  ['Replacement / KT Status', candidate.consultant_profile.replacement_kt_status],
                  ['Personal Laptop', candidate.consultant_profile.personal_laptop],
                  ['Payroll', candidate.consultant_profile.payroll],
                  ['Current Work Location', candidate.consultant_profile.current_work_location],
                  ['Client Work Location', candidate.consultant_profile.client_work_location],
                  ['Work Timings', candidate.consultant_profile.current_work_timings],
                  ['Notice Negotiable Upto', candidate.consultant_profile.notice_negotiable_upto],
                  ['Offers Pipeline', candidate.consultant_profile.offers_pipeline],
                  ['Interview Pipeline', candidate.consultant_profile.interview_pipeline],
                  ['DOB', candidate.consultant_profile.dob],
                  ['Telephonic Availability', candidate.consultant_profile.telephonic_availability],
                  ['IDE Installed', candidate.consultant_profile.ide_installed],
                  ['WiFi Connectivity', candidate.consultant_profile.wifi_connectivity],
                  ['Marital Status', candidate.consultant_profile.marital_status],
                  ['Interview Availability (2d)', candidate.consultant_profile.interview_availability_2d],
                ] as [string, string | null][]).map(([label, value]) => (
                  <ReadField key={label} label={label} value={value} />
                ))}
              </FieldGrid>
            </div>
          )}

        </div>
      </div>
      {/* Email Overlay */}
      {showEmailOverlay && candidate && (() => {
        const a = candidate.assessment;
        const cp = candidate.consultant_profile;
        const clientUrl = candidate.client_name
          ? `https://www.${candidate.client_name.toLowerCase().replace(/\s+/g, '')}.com`
          : '—';

        const v = (s: string | number | null | undefined) => s ?? '—';
        const rows: [string, string, string, string][] = [
          ['Name',                         v(candidate.full_name),                         'Phone',                    v(candidate.mobile)],
          ['Email ID',                     v(candidate.email),                             'Alternate no',             v(a?.alt_phone)],
          ['Company URL',                  'http://www.joulestowatts.com',                 'Client Company URL',       clientUrl],
          ['Resignation acceptance',       v(cp?.resignation_acceptance),                  'Replacement &amp; KT',     v(cp?.replacement_kt_status)],
          ['Skill Set',                    v(a?.primary_skill_stack),                      'Role/Responsibilities',    v(cp?.role_responsibilities)],
          ['Personal Laptop',              v(cp?.personal_laptop),                         'Total experience',         a?.total_exp != null ? `${a.total_exp} yrs` : '—'],
          ['Current Residential Location', v(a?.current_city),                             'Client Work Location',     v(cp?.client_work_location)],
          ['Current Work Location',        v(cp?.current_work_location),                   'Current Work Timings',     v(cp?.current_work_timings)],
          ['Notice Period (on paper)',      a?.notice_period_weeks != null ? `${a.notice_period_weeks} weeks` : '—', 'Negotiable Upto', v(cp?.notice_negotiable_upto)],
          ['Current Company',              v(a?.last_company),                             'Payroll',                  v(cp?.payroll)],
          ['Current CTC',                  a?.current_ctc != null ? `${a.current_ctc} LPA` : '—', 'Expected CTC',   a?.expected_ctc != null ? `${a.expected_ctc} LPA` : '—'],
          ['Relevant experience',          a?.relevant_exp != null ? `${a.relevant_exp} yrs` : '—', 'Deploying Client', v(a?.deploying_client)],
          ['Offers in Hand',               v(a?.offers_in_hand),                           'Offers Pipeline',          v(cp?.offers_pipeline)],
          ['Interview Pipeline',           v(cp?.interview_pipeline),                      'Reason for change',        v(a?.reason_for_change)],
          ['DOB',                          v(cp?.dob),                                     'Telephonic availability',  v(cp?.telephonic_availability)],
          ['IDE Installed',                v(cp?.ide_installed),                           'Wifi / Mobile Data',       v(cp?.wifi_connectivity)],
          ['Marital Status',               v(cp?.marital_status),                          'LinkedIn',                 v(candidate.linkedin_url)],
          ['Health Issues (self/family)',  v(cp?.health_issues),                           'Planned Leaves (3 mo)',    v(cp?.planned_leaves)],
          ['Interview Avail (next 2 days)',v(cp?.interview_availability_2d),               'Travel Plans',             v(cp?.upcoming_travel)],
        ];

        const ec = emailClient;
        const LABEL = 'border:1px solid #8ea9c1;padding:5px 10px;background:#dce6f1;font-weight:bold;font-size:12px;font-family:Arial,sans-serif;white-space:nowrap;color:#1a202c;';
        const VALUE = 'border:1px solid #8ea9c1;padding:5px 10px;background:#ffffff;font-size:12px;font-family:Arial,sans-serif;color:#1a202c;word-break:break-word;';

        const emailHtml = `<div style="font-family:Arial,sans-serif;font-size:13px;color:#1a202c;line-height:1.8;max-width:720px;">

<p style="margin:0 0 10px;">Hi <b>${candidate.full_name}</b>,</p>

<p style="margin:0 0 10px;">Greetings from <b>JoulesToWatts Business Solutions</b>! It was great talking to you..!!</p>

<p style="margin:0 0 10px;">According to our discussion we have an opening with one of our prestigious clients (<b><span style="background:#ffff00;">${candidate.client_name ?? '—'}</span></b>). I think your candidature best suits our client requirement.</p>

${ec?.short_name ? `<p style="margin:0 0 4px;"><a href="${ec.website_url ?? '#'}" style="color:#2563eb;text-decoration:underline;">${ec.short_name}</a></p>` : ''}
${ec?.website_url ? `<p style="margin:0 0 4px;"><a href="${ec.website_url}" style="color:#2563eb;text-decoration:underline;">${ec.website_url}</a></p>` : `<p style="margin:0 0 4px;"><a href="${clientUrl}" style="color:#2563eb;">${clientUrl}</a></p>`}

<p style="margin:0 0 16px;">Find the Process document for your reference which I will share with my client for the further process. Please acknowledge that the details mentioned below are true and confirm "no further salary negotiation" and "no relocation cost provided." After the selection please acknowledge to work under Joulestowatts Business Solutions pvt. Ltd. Payroll.</p>

${ec?.logo_data ? `<div style="text-align:center;margin:20px 0;padding:20px 0;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;">
<img src="${ec.logo_data}" alt="${ec.name}" style="max-height:120px;max-width:400px;object-fit:contain;display:inline-block;" />
</div>` : ''}

${ec?.description ? `<p style="margin:16px 0;font-size:13px;line-height:1.7;color:#1a202c;">${ec.description}</p>` : ''}

<p style="margin:16px 0 4px;"><b><a href="http://www.joulestowatts.com" style="color:#2563eb;text-decoration:underline;">JoulesToWatts</a></b><br>
<a href="http://www.joulestowatts.com" style="color:#2563eb;text-decoration:none;">www.joulestowatts.com</a></p>
<p style="margin:0 0 16px;font-size:12px;color:#374151;line-height:1.7;">IT SERVICES. JoulesToWatts offers the full spectrum of information technology services. Regardless of your company's position in the IT spectrum, we have the capabilities to extract the best value from your legacy systems and add new technologies to make your business processes highly efficient.</p>
<p style="margin:0 0 20px;font-size:12px;color:#374151;line-height:1.7;">JoulestoWatts has gone through a rigorous workplace cultural assessment process and successfully accomplished the milestone of being recognized as "Great Place To Work 2022". JoulestoWatts is recognized as one of the Top 50 exciting ventures during the "Smart CEO - StartUp 50 2017" award program.</p>

<p style="margin:0 0 6px;font-size:11px;color:#6b7280;font-style:italic;">──&nbsp; CONSULTANT DATA BLOCK &nbsp;·&nbsp; auto-populated from tracker &nbsp;──</p>
<table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:12px;">
<tbody>
${rows.map(([ll, lv, rl, rv]) =>
  `<tr><td style="${LABEL}">${ll} :</td><td style="${VALUE}">${lv}</td><td style="${LABEL}">${rl} :</td><td style="${VALUE}">${rv}</td></tr>`
).join('\n')}
</tbody>
</table>

${emailJobSkills ? `<br><p style="font-size:12px;font-weight:bold;margin:16px 0 4px;">Mandatory Skills</p>
<p style="font-size:12px;margin:0 0 16px;color:#374151;">${emailJobSkills}</p>` : ''}

<br>
<p style="margin:0;font-size:13px;">--</p>
<p style="margin:4px 0 0;font-size:13px;font-weight:bold;">THANKS &amp; REGARDS,<br>
<span style="color:#1e40af;">JoulesToWatts Business Solutions</span></p>
</div>`;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
            <div className="relative bg-white rounded-2xl shadow-2xl flex flex-col" style={{ width: '780px', maxWidth: '96vw', maxHeight: '92vh' }}>

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
                <h2 className="text-base font-bold text-slate-800">Consultant Email Preview</h2>
                <button onClick={() => setShowEmailOverlay(false)} className="text-slate-400 hover:text-slate-700">
                  <X size={20} />
                </button>
              </div>

              {/* Email rendered as raw HTML — no Tailwind interference */}
              <div className="overflow-y-auto flex-1" style={{ padding: '24px 28px' }}>
                <div dangerouslySetInnerHTML={{ __html: emailHtml }} />
              </div>

              {/* Actions */}
              <div className="flex gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 flex-shrink-0 rounded-b-2xl">
                {candidate.mail_sent ? (
                  /* Mail already sent — show locked state */
                  <div className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-100 border-2 border-green-300 text-green-700 text-sm font-bold">
                    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                      <path d="M2 8L6 12L13 4" stroke="#15803d" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Mail Already Sent — Cannot Resend
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={emailCopied}
                      onClick={async () => {
                        // Copy HTML to clipboard
                        const blob = new Blob([emailHtml], { type: 'text/html' });
                        const item = new ClipboardItem({ 'text/html': blob });
                        await navigator.clipboard.write([item]).catch(() =>
                          navigator.clipboard.writeText(generateEmailText(candidate))
                        );
                        setEmailCopied(true);
                      }}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                        emailCopied
                          ? 'border-green-400 bg-green-100 text-green-700 opacity-70 cursor-not-allowed'
                          : 'border-slate-300 text-slate-700 hover:bg-white'
                      }`}
                    >
                      {emailCopied ? (
                        <>
                          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                            <path d="M2 8L6 12L13 4" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy size={15} />
                          Copy Email
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={mailSending || candidate.mail_sent}
                      onClick={handleMarkMailSent}
                      className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-60 hover:opacity-90 transition-opacity"
                      style={{ backgroundColor: candidate.mail_sent ? '#6b7280' : '#059669' }}
                    >
                      {mailSending ? 'Recording…' : candidate.mail_sent ? '✓ Mail Already Sent' : '✉️ Confirm Mail Sent'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </Layout>
  );
}
