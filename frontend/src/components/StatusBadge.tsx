interface StatusBadgeProps {
  status: string;
  type?: 'candidate' | 'job' | 'recommendation';
}

const candidateStatusMap: Record<string, { bg: string; text: string; label: string }> = {
  sourced: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Sourced' },
  pool_verified: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Pool Verified' },
  handed_to_recruiter: { bg: 'bg-indigo-100', text: 'text-indigo-700', label: 'Handed to Recruiter' },
  call_in_progress: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Call in Progress' },
  ready_for_validation: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Ready for Validation' },
  validated: { bg: 'bg-green-100', text: 'text-green-700', label: 'Validated' },
  needs_rework: { bg: 'bg-red-100', text: 'text-red-700', label: 'Needs Rework' },
  on_hold: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'On Hold' },
  rejected: { bg: 'bg-red-100', text: 'text-red-700', label: 'Rejected' },
  submitted_to_client: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Submitted to Client' },
  interview_stage: { bg: 'bg-violet-100', text: 'text-violet-700', label: 'Interview Stage' },
  offer_rolled_out: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Offer Rolled Out' },
  joined: { bg: 'bg-green-700/10', text: 'text-green-800', label: 'Joined' },
  backed_out: { bg: 'bg-slate-200', text: 'text-slate-600', label: 'Backed Out' },
};

const jobStatusMap: Record<string, { bg: string; text: string; label: string }> = {
  open: { bg: 'bg-green-100', text: 'text-green-700', label: 'Open' },
  on_hold: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'On Hold' },
  closed: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Closed' },
};

const recommendationMap: Record<string, { bg: string; text: string; label: string }> = {
  'Strong Submit': { bg: 'bg-green-100', text: 'text-green-700', label: 'Strong Submit' },
  Consider: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Consider' },
  Hold: { bg: 'bg-red-100', text: 'text-red-700', label: 'Hold' },
};

export default function StatusBadge({ status, type = 'candidate' }: StatusBadgeProps) {
  let config: { bg: string; text: string; label: string } | undefined;

  if (type === 'job') {
    config = jobStatusMap[status];
  } else if (type === 'recommendation') {
    config = recommendationMap[status];
  } else {
    config = candidateStatusMap[status];
  }

  if (!config) {
    config = { bg: 'bg-slate-100', text: 'text-slate-600', label: status };
  }

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${config.bg} ${config.text} whitespace-nowrap`}
    >
      {config.label}
    </span>
  );
}
