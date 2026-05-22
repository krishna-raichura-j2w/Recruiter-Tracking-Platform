export interface LoginResponse {
  access_token: string;
  token_type: string;
  user_id: number;
  name: string;
  role: string;
  email: string;
  must_change_password: boolean;
}

export interface LoginError {
  detail: string;
}

export interface UserProfileData {
  id: number;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
  last_login_at: string;
  phone?: string;
  secondary_role?: string | null;
  recruiter_type?: string | null;
}

export interface UserProfileResponse {
  meta: {
    status: boolean;
    message: string;
  };
  data: UserProfileData;
}

export interface UpdateUserProfileRequest {
  name: string;
  phone?: string;
  [key: string]: any;
}

export interface UpdateUserProfileResponse {
  meta: {
    status: boolean;
    message: string;
  };
  data: UserProfileData;
}

export interface ClientItem {
  id: number;
  name: string;
  industry: string;
  hrbp_id: number;
  is_active: boolean;
  bh_id?: number;
  bh_name?: string;
  headcount?: number;
  total_monthly_po?: number;
  created_at?: string;
  updated_at?: string;
}

export interface ClientListResponse {
  meta: {
    status: boolean;
    message: string;
    page_no?: number;
    per_page?: number;
    total?: number;
    total_pages?: number;
  };
  data: ClientItem[];
}

export interface ConsultantItem {
  id: number;
  name: string;
  emp_id: string;
  client_id: number;
  hrbp_id: number;
  is_active: boolean;
  skill: string;
  manager_name: string;
  modality?: string;
  cohort?: string;
  monthly_po?: number;
  monthly_ctc?: number;
  l_d_status?: string;
  [key: string]: any;
}

export interface ConsultantListResponse {
  meta: {
    status: boolean;
    message: string;
    page_no?: number;
    per_page?: number;
    total?: number;
    total_pages?: number;
  };
  data: ConsultantItem[];
}

/** Recurring cadence interval sent as `frequency_weeks` on create. */
export const CADENCE_FREQUENCY_OPTIONS = [
  { value: 1, label: "Weekly" },
  { value: 2, label: "Bi-weekly" },
  { value: 4, label: "Monthly" },
  { value: 8, label: "Every 2 months" },
] as const;

export type CadenceFrequencyWeeks = (typeof CADENCE_FREQUENCY_OPTIONS)[number]["value"];

export function getCadenceFrequencyLabel(weeks: number): string {
  return CADENCE_FREQUENCY_OPTIONS.find((o) => o.value === weeks)?.label ?? `Every ${weeks} weeks`;
}

export interface CreateCadenceScheduleRequest {
  client_id: number;
  consultant_id: number;
  meeting_type: string;
  project_name: string;
  meeting_time: string;
  duration_minutes: number;
  start_date: string;
  end_date?: string;
  frequency_weeks?: number;
  supporting_documents?: string[];
}

export interface CreateCadenceScheduleResponse {
  meta: {
    status: boolean;
    message: string;
  };
  data: {
    id: number;
    client_id: number;
    consultant_id: number;
    hrbp_id: number;
    meeting_type: string;
    project_name: string | null;
    start_date: string;
    end_date?: string;
    frequency_weeks?: number;
    status: string;
    supporting_documents: string[];
    created_at: string;
    updated_at: string;
  };
}

export interface CadenceSessionItem {
  id: number;
  schedule_id: number;
  cadence_number: number;
  scheduled_date: string;
  status: string;
  comments: string | null;
  rca_status: string | null;
  supporting_documents: string[];
  completed_at: string | null;
  completed_by: number | null;
  hrbp_id: number;
  meeting_type: string;
  project_name: string | null;
  frequency_weeks: number;
  client_id: number;
  client_name: string;
  consultant_id: number;
  consultant_name: string;
}

export interface CadenceSessionsResponse {
  meta: {
    status: boolean;
    message: string;
    page_no?: number;
    per_page?: number;
    total?: number;
    total_pages?: number;
  };
  data: CadenceSessionItem[];
}

export interface ExportCadenceSessionsResponse {
  meta: {
    status: boolean;
    message: string;
  };
  data: {
    url: string;
  };
}

export interface CadenceSessionSummaryData {
  pending: number;
  completed: number;
}

export interface CadenceSessionSummaryResponse {
  meta: {
    status: boolean;
    message: string;
  };
  data: CadenceSessionSummaryData;
}

export interface UpdateCadenceSessionRequest {
  comments?: string;
  rca_status?: string;
  status?: string;
  completed_by?: number;
}
