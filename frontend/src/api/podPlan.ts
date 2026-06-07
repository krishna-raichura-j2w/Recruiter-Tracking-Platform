import api from './client';

// ── types ─────────────────────────────────────────────────────────────────────

export interface PodSetup {
  id: number;
  pod_id: number;
  bh_user_id: number;
  month: string;
  net_po_target: number;
  exit_budget: number;
  working_days: number;
  target_selects_month: number;
  sel_ob_rate: number;
  subs_per_recruiter_day: number;
  num_recruiters: number;
  interviews_per_kam_day: number;
  num_kams: number;
  week_weights: number[];
  custom_working_days?: string[];
}

export interface CustomerTarget {
  id: number;
  setup_id: number;
  client_id: number | null;
  client_ids?: number[];
  customer_name: string;
  net_po_target_cust: number;
  exit_alloc: number;
  avg_po_per_ob: number;
  open_demand_pool: number;
  repeat_demand_pct: number;
  subs_repeat: number;
  subs_new_phase1: number;
  subs_new_phase2: number;
  target_interviews_day: number;
  int_sel_target: number;
  display_order: number;
}

export interface RecruiterAssignment {
  id?: number;
  user_id: number;
  user_name?: string;
  user_role?: string;
  primary_customer_id: number | null;
  secondary_customer_id: number | null;
  primary_customer?: string;
  secondary_customer?: string;
  subs_per_day: number;
  primary_subs: number | null;
}

export interface KAMAssignment {
  id?: number;
  user_id: number;
  user_name?: string;
  customer_targets: Record<string, number>;
  tat_focus: string;
  key_action: string;
}

export interface WeeklyOBEntry {
  id?: number;
  customer_target_id: number;
  customer_name?: string;
  week_num: number;
  week_label: string;
  week_start: string;
  week_end: string;
  ob_target: number;
}

export interface WeekInfo {
  week_num: number;
  week_label: string;
  week_start: string;
  week_end: string;
}

export interface PodMember {
  id: number;
  name: string;
  email: string;
  role: string;
}

export interface ClientOption {
  id: number;
  client_id: number | null;  // OL user_id — used for matching stored client_ids
  name: string;
  short_name: string | null;
}

export interface CustomerMetrics extends CustomerTarget {
  gross_po: number;
  obs_needed: number;
  selects_needed: number;
  daily_selects: number;
  daily_obs: number;
  avg_subs_demand: number;
  monthly_subs: number;
  daily_subs: number;
  monthly_interviews: number;
  sub_int_required: number;
  expected_selects: number;
  monthly_subs_capacity: number;
  subs_gap: number;
  cap_status: string;
  interviews_per_kam: number;
}

export interface Metrics {
  gross_po_needed: number;
  target_onboards: number;
  avg_po_per_ob_blended: number;
  customers: CustomerMetrics[];
  total_subs_needed: number;
  total_monthly_interviews: number;
  total_selects_needed: number;
  total_obs_needed: number;
  rec_cap_day: number;
  subs_day: number;
  rec_gap: number;
  recs_needed: number;
  int_day: number;
  kam_cap_day: number;
  kam_gap: number;
  kams_needed: number;
  working_days: number;
  kams: KAMAssignment[];
}

export interface CustomerPlan {
  customer_name: string;
  monthly_subs: number;
  max_per_day: number;
  flat_daily: number;
  days_needed: number;
  buffer_days: number;
  daily_plan: number[];
  is_shortfall: boolean;
  recs_needed_full: number;
  assigned_count: number;
  assigned_cap_day: number;
  assigned_cap_month: number;
  rec_count_gap: number;
  rec_cap_gap: number;
  add_primary_needed: number;
  add_secondary_needed: number;
  primary_recs: string[];
  secondary_recs: string[];
}

export interface KAMPlan {
  customer_name: string;
  target_per_day: number;
  monthly_target: number;
  assigned_kams: { user_name: string; daily_target: number }[];
  total_cap_day: number;
  max_per_day: number;
  monthly_cap: number;
  cap_gap: number;
  is_shortfall: boolean;
  kams_needed: number;
  add_kams_needed: number;
  daily_plan: number[];
}

export interface PlanData {
  working_days: string[];
  customer_plans: CustomerPlan[];
  kam_plans: KAMPlan[];
  weekly_obs: WeeklyOBEntry[];
}

// ── API calls ─────────────────────────────────────────────────────────────────

export const podPlanApi = {
  listBHs: () =>
    api.get('/pod-plan/bhs').then(r => r.data as { bhs: { id: number; name: string; email: string; pod_id: number }[] }),

  listSetups: (asBh?: number) =>
    api.get('/pod-plan/setups', { params: asBh ? { as_bh: asBh } : {} }).then(r => r.data as { setups: { id: number; month: string }[]; pod_id: number }),

  getSetup: (month?: string, asBh?: number) =>
    api.get('/pod-plan/setup', { params: { ...(month ? { month } : {}), ...(asBh ? { as_bh: asBh } : {}) } }).then(r => r.data),

  upsertSetup: (data: Partial<PodSetup>, asBh?: number) =>
    api.post('/pod-plan/setup', data, { params: asBh ? { as_bh: asBh } : {} }).then(r => r.data),

  listClients: () =>
    api.get('/pod-plan/clients').then(r => r.data.clients as ClientOption[]),

  listCustomers: (setupId: number) =>
    api.get(`/pod-plan/setup/${setupId}/customers`).then(r => r.data.customers as CustomerTarget[]),

  upsertCustomer: (setupId: number, data: Partial<CustomerTarget> & { client_ids?: number[] }) =>
    api.post(`/pod-plan/setup/${setupId}/customers`, data).then(r => r.data.customer as CustomerTarget),

  deleteCustomer: (setupId: number, customerId: number) =>
    api.delete(`/pod-plan/setup/${setupId}/customers/${customerId}`).then(r => r.data),

  listPodMembers: (setupId: number) =>
    api.get(`/pod-plan/setup/${setupId}/pod-members`).then(r => r.data.members as PodMember[]),

  listRecruiters: (setupId: number) =>
    api.get(`/pod-plan/setup/${setupId}/recruiters`).then(r => r.data.assignments as RecruiterAssignment[]),

  saveRecruiters: (setupId: number, assignments: RecruiterAssignment[]) =>
    api.post(`/pod-plan/setup/${setupId}/recruiters`, { assignments }).then(r => r.data.assignments as RecruiterAssignment[]),

  listKAMs: (setupId: number) =>
    api.get(`/pod-plan/setup/${setupId}/kams`).then(r => r.data.kams as KAMAssignment[]),

  saveKAMs: (setupId: number, assignments: KAMAssignment[]) =>
    api.post(`/pod-plan/setup/${setupId}/kams`, { assignments }).then(r => r.data.kams as KAMAssignment[]),

  listWeeklyOBs: (setupId: number) =>
    api.get(`/pod-plan/setup/${setupId}/weekly-obs`).then(r => r.data.weekly_obs as WeeklyOBEntry[]),

  saveWeeklyOBs: (setupId: number, entries: WeeklyOBEntry[]) =>
    api.post(`/pod-plan/setup/${setupId}/weekly-obs`, { entries }).then(r => r.data.weekly_obs as WeeklyOBEntry[]),

  getDaily: (setupId: number, date: string) =>
    api.get(`/pod-plan/setup/${setupId}/daily/${date}`).then(r => r.data),

  saveDaily: (setupId: number, date: string, entries: { customer_target_id: number; actual_subs: number; actual_interviews: number; actual_selects: number; actual_obs: number }[]) =>
    api.post(`/pod-plan/setup/${setupId}/daily/${date}`, { entries }).then(r => r.data),

  getMonthlyProgress: (setupId: number) =>
    api.get(`/pod-plan/setup/${setupId}/monthly-progress`).then(r => r.data.monthly_actuals as Record<number, { subs: number; interviews: number; selects: number; obs: number }>),

  getWorkingDays: (setupId: number) =>
    api.get(`/pod-plan/setup/${setupId}/working-days`).then(r => r.data.working_days as string[]),

  getMetrics: (setupId: number) =>
    api.get(`/pod-plan/setup/${setupId}/metrics`).then(r => r.data as Metrics),

  getPlan: (setupId: number) =>
    api.get(`/pod-plan/setup/${setupId}/plan`).then(r => r.data as PlanData),

  getBHList: (date: string) =>
    api.get('/pod-plan/bh-leaderboard/bhs', { params: { date } }).then(r => r.data as BHListResponse),

  // start/end define the daily-column window (inclusive IST dates). Omit for single-day.
  getBHDetail: (setupId: number, date: string, start?: string, end?: string) =>
    api.get(`/pod-plan/bh-leaderboard/${setupId}`, { params: { date, start, end } }).then(r => r.data as BHDetailResponse),

  getBHOverview: (date: string, start?: string, end?: string) =>
    api.get('/pod-plan/bh-leaderboard/overview', { params: { date, start, end } }).then(r => r.data as BHOverviewResponse),

  getOlOnly: (date: string, start?: string, end?: string) =>
    api.get('/pod-plan/bh-leaderboard/ol-only', { params: { date, start, end } }).then(r => r.data as OlOnlyResponse),
};

// ── BH Leaderboard types ───────────────────────────────────────────────────────

export interface BHLeaderboardCustomer {
  customer_name: string;
  customer_target_id: number;
  // Demand & PO columns (BH overview only; 0 on per-customer/per-client rows)
  target_demands?: number;
  actual_demands?: number;
  mtd_demands?: number;
  target_po?: number;
  actual_po?: number;
  mtd_po?: number;
  actual_po_margin?: number;
  mtd_po_margin?: number;
  daily_subs_target: number;
  daily_int_target: number;
  daily_sel_target: number;
  daily_obs_target: number;
  actual_subs: number;
  dl_subs: number;
  actual_int: number;
  actual_sel: number;
  actual_obs: number;
  monthly_subs: number;
  monthly_int: number;
  selects_needed: number;
  obs_needed: number;
  mtd_subs: number;
  mtd_int: number;
  mtd_sel: number;
  mtd_obs: number;
}

export interface BHInfo {
  setup_id: number;
  pod_id: number;
  bh_name: string;
}

export interface BHListResponse {
  date: string;
  month: string;
  bhs: BHInfo[];
}

export interface BHDetailResponse {
  date: string;
  month: string;
  setup_id: number;
  bh_name: string;
  pod_id: number;
  customers: BHLeaderboardCustomer[];
}

// Overview: one row per BH (totals across its customers), shaped like a customer row
// so it renders through the same table. customer_name = BH name, customer_target_id = setup_id.
export interface BHOverviewResponse {
  date: string;
  month: string;
  rows: BHLeaderboardCustomer[];
}

// OL-only BHs: present in client_bh_mapping.csv but with no pod-plan setup.
// Per-client rows + per-BH totals, sourced purely from the offer-letter DB (no targets).
export interface OlOnlyBH {
  bh_name: string;
  customers: BHLeaderboardCustomer[];
  totals: BHLeaderboardCustomer;
}

export interface OlOnlyResponse {
  date: string;
  month: string;
  bhs: OlOnlyBH[];
}

// kept for backwards compat — not used
export interface BHLeaderboardEntry {
  bh_name: string;
  pod_id: number;
  setup_id: number;
  month: string;
  customers: BHLeaderboardCustomer[];
}

export interface BHLeaderboardResponse {
  date: string;
  month: string;
  bhs: BHLeaderboardEntry[];
}
