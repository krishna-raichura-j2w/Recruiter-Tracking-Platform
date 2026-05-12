export type UserRole = 'admin' | 'kam' | 'recruiter' | 'delivery_lead';

export interface AuthUser {
  user_id: number;
  name: string;
  role: UserRole;
  email: string;
  access_token: string;
  must_change_password: boolean;
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  recruiter_type: 'sourcer' | 'caller' | 'both' | null;
  is_active: boolean;
  pod_lead_id: number | null;
}

export interface SkillEntry {
  name: string;
  years_of_experience: number | null;
  proficiency: string | null;
}

export interface ParsedJD {
  job_title: string | null;
  company: string | null;
  location: string | null;
  employment_type: string | null;
  work_mode: string | null;
  department: string | null;
  summary: string | null;
  experience_level: string | null;
  min_experience: number | null;
  max_experience: number | null;
  salary_range: string | null;
  required_skills: SkillEntry[];
  preferred_skills: SkillEntry[];
  tech_stack: string[];
  responsibilities: string[];
  requirements: string[];
  education: string[];
  recruiter_contact: string | null;
}

export interface Job {
  id: number;
  client_name: string;
  role_title: string;
  client_job_id: string | null;
  skill_stack: string | null;
  work_mode: string | null;
  work_auth: string | null;
  headcount: number;
  status: 'pending_review' | 'open' | 'on_hold' | 'closed';
  location: string | null;
  jd_summary: string | null;
  jd_parsed: string | null;
  jd_raw_text: string | null;
  min_experience: number | null;
  max_experience: number | null;
  salary_range: string | null;
  assigned_sourcer_id: number | null;
  assigned_sourcer_name: string | null;
  assigned_caller_id: number | null;
  assigned_caller_name: string | null;
  sourcer_names: string[];
  caller_names: string[];
  delivery_lead_id: number | null;
  delivery_lead_name: string | null;
  business_head_id: number | null;
  business_head_name: string | null;
  deadline: string | null;
  sourcing_deadline: string | null;
  calling_deadline: string | null;
  created_by_id: number | null;
  created_at: string | null;
  updated_at: string | null;
  candidate_count: number;
}

export interface TeamMemberLoad {
  id: number;
  name: string;
  email: string;
  role: string;
  recruiter_type: 'sourcer' | 'caller' | 'both' | null;
  sourcing_load: number;
  calling_load: number;
  load: number;
}

export interface TeamLoads {
  sourcers:   TeamMemberLoad[];
  callers:    TeamMemberLoad[];
  validators: TeamMemberLoad[];
}

export interface Candidate {
  id: number;
  job_id: number;
  full_name: string;
  mobile: string | null;
  email: string | null;
  linkedin_url: string | null;
  education: string | null;
  city: string | null;
  exp_range: string | null;
  current_company: string | null;
  skills: string | null;
  naukri_active: string | null;
  immediate_joiner: string | null;
  lead_source: string | null;
  resume_data: string | null;
  pool_verified: boolean;
  status: string;
  sourcing_date: string | null;
  pool_added_at: string | null;
  call_time: string | null;
  validation_done_at: string | null;
  submission_time_ts: string | null;
  feedback_received_at: string | null;
  sourced_by_id: number | null;
  sourced_by_name: string | null;
  rejection_reason: string | null;
  rejected_by: string | null;
  assigned_to_id: number | null;
  assigned_to_name: string | null;
  assigned_validator_id: number | null;
  assigned_validator_name: string | null;
  job_title: string | null;
  client_name: string | null;
  overall_score: number | null;
  auto_recommendation: string | null;
  assessment: Assessment | null;
  validation: ValidationRecord | null;
  consultant_profile: ConsultantProfile | null;
  mail_sent: boolean;
  call_logs?: CallLogRecord[];
}

export interface CallLogRecord {
  id: number;
  call_date: string;
  outcome: string | null;
  notes: string | null;
}

export interface Assessment {
  id: number;
  candidate_id: number;
  caller_id: number;
  // Stage A - Verification
  full_name_confirmed: string | null;
  email_verified: string | null;
  alt_phone: string | null;
  linkedin_verified: string | null;
  total_exp: number | null;
  relevant_exp: number | null;
  qualification: string | null;
  last_company: string | null;
  last_tenure: string | null;
  tenure_from: string | null;
  tenure_to: string | null;
  notice_period_weeks: number | null;
  lwd_confirmed: string | null;
  last_working_day: string | null;
  // Deployment
  deploying_client: string | null;
  role_position: string | null;
  primary_skill_stack: string | null;
  // CTC
  current_ctc: number | null;
  expected_ctc: number | null;
  hike_pct: number | null;
  // Stage B extras
  skill_match_last_role: string | null;
  tech_q_used: string | null;
  // Scores
  comm_score: number | null;
  self_art_score: number | null;
  role_art_score: number | null;
  resume_skill_score: number | null;
  tech_qa_score: number | null;
  paraphrase_score: number | null;
  confidence_score: number | null;
  gut_score: number | null;
  // Stage D
  project_status: string | null;
  open_to_relocation: string | null;
  work_mode_pref: string | null;
  work_auth_status: string | null;
  current_city: string | null;
  reason_for_change: string | null;
  interviewing_elsewhere: string | null;
  offers_in_hand: string | null;
  counter_offer_risk: string | null;
  last_appraisal_context: string | null;
  // Close
  email_acknowledged: string | null;
  validation_slot_locked: string | null;
  // Verdict
  pass_to_validation: string | null;
  // Auto-computed
  tech_score: number | null;
  soft_skill_score: number | null;
  overall_score: number | null;
  auto_recommendation: string | null;
  red_flags: string | null;
  caller_notes: string | null;
}

export interface ValidationRecord {
  id: number;
  candidate_id: number;
  validator_id: number;
  status: string | null;
  comments: string | null;
  submitted_to_client: string | null;
  submission_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConsultantProfile {
  id: number;
  candidate_id: number;
  resignation_acceptance: string | null;
  replacement_kt_status: string | null;
  personal_laptop: string | null;
  role_responsibilities: string | null;
  current_work_location: string | null;
  client_work_location: string | null;
  current_work_timings: string | null;
  notice_negotiable_upto: string | null;
  payroll: string | null;
  offers_pipeline: string | null;
  interview_pipeline: string | null;
  dob: string | null;
  telephonic_availability: string | null;
  ide_installed: string | null;
  wifi_connectivity: string | null;
  marital_status: string | null;
  health_issues: string | null;
  planned_leaves: string | null;
  interview_availability_2d: string | null;
  upcoming_travel: string | null;
  updated_at: string | null;
}

export interface Submission {
  id: number;
  candidate_id: number;
  candidate_name: string | null;
  candidate_mobile: string | null;
  candidate_email: string | null;
  client_name: string | null;
  job_title: string | null;
  kam_name: string | null;
  current_stage: string;
  submitted_at: string | null;
  updated_at: string | null;
  // TA/HM
  ta_feedback: string | null;
  hm_feedback: string | null;
  tat_window: string | null;
  // Interviews
  l1_date: string | null;
  l1_feedback: string | null;
  l1_briefing_done: boolean;
  l2_date: string | null;
  l2_feedback: string | null;
  l2_briefing_done: boolean;
  final_date: string | null;
  final_feedback: string | null;
  final_briefing_done: boolean;
  // Offer
  offered_ctc: number | null;
  offer_date: string | null;
  joining_date_confirmed: string | null;
  actual_joining_date: string | null;
  // Risk
  other_offers_count: string | null;
  counter_offer_risk: string | null;
  // Notes
  last_notes: string | null;
  next_action: string | null;
  next_action_date: string | null;
  // From assessment
  overall_score: number | null;
  current_ctc: number | null;
  expected_ctc: number | null;
  notice_period_weeks: number | null;
  total_exp: number | null;
}


export interface Notification {
  id: number;
  message: string;
  notif_type: string;
  is_read: boolean;
  created_at: string;
}

export interface DemandStatusRow {
  company_name: string | null;
  demand_id: number;
  last_demand_id: number | null;
  job_title_name: string | null;
  no_of_positions: number | null;
  created_by_account_manager_id: number | null;
  account_manager_name: string | null;
  delivery_lead: string | null;
  recruiter: string | null;
}

export interface DemandStatusResponse {
  month: number;
  year: number;
  total: number;
  data: DemandStatusRow[];
}

export interface DashboardData {
  pipeline: { stage: string; count: number }[];
  total_candidates: number;
  total_jobs: number;
  submitted_this_month: number;
  joined_this_month: number;
  recruiter_stats: { name: string; assigned: number; called: number; validated: number }[];
  unread_notifications: number;
}
