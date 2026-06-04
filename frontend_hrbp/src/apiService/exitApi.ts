import { fetchWithAuth } from "./api";

const getBaseUrl = () => {
  const base = import.meta.env.VITE_BASE_URL || "http://localhost:8000/";
  return base.endsWith("/") ? base : `${base}/`;
};

async function handleResponse<T>(res: Response): Promise<T> {
  const json = await res.json();
  if (!res.ok || json?.meta?.status === false) {
    throw new Error(json?.meta?.message || json?.detail || "Request failed");
  }
  return json as T;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type ExitReason = "resignation" | "project_roll_off" | "contract_closure" | "conversion" | "absconding" | "no_show" | "termination";
export type ExitType   = "voluntary" | "involuntary";
export type ExitStatus = "initiated" | "acknowledged" | "completed";

export interface ExitRecord {
  id:                  number;
  consultant_id:       number;
  consultant_name:     string | null;
  client_id:           number;
  client_name:         string | null;
  initiated_by_id:     number;
  initiated_by_name:   string | null;
  exit_reason:         ExitReason;
  exit_type:           ExitType;
  exit_date:           string | null;
  notice_period_start: string | null;
  po_impact:           number | null;
  status:              ExitStatus;
  replacement_needed:  boolean;
  notes:               string | null;
  source_ticket_id:    number | null;
  source_ticket_number: string | null;
  created_at:          string | null;
  updated_at:          string | null;
}

export interface ExitCreate {
  consultant_id:       number;
  client_id:           number;
  initiated_by_id:     number;
  exit_reason:         ExitReason;
  exit_type:           ExitType;
  exit_date?:          string;
  notice_period_start?: string;
  replacement_needed?: boolean;
  notes?:              string;
}

export interface ExitUpdate {
  status?:              ExitStatus;
  exit_date?:           string;
  notice_period_start?: string;
  replacement_needed?:  boolean;
  notes?:               string;
}

export interface ExitStats {
  total_exits:        number;
  exits_this_month:   number;
  exits_this_quarter: number;
  total_po_impact:    number;
  by_status:          Record<string, number>;
  by_reason:          Record<string, number>;
}

export interface ExitListResponse {
  data: ExitRecord[];
  meta: {
    status:      boolean;
    message:     string;
    total:       number;
    page_no:     number;
    per_page:    number;
    total_pages: number;
  };
}

export interface ExitFilters {
  page_no?:      number;
  per_page?:     number;
  status?:       ExitStatus;
  client_id?:    number;
  consultant_id?: number;
  exit_reason?:  ExitReason;
}

// ── API calls ─────────────────────────────────────────────────────────────────

export async function getExitStats(): Promise<ExitStats> {
  const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/exits/stats`);
  const json = await handleResponse<{ data: ExitStats }>(res);
  return json.data;
}

export async function listExits(filters: ExitFilters = {}): Promise<ExitListResponse> {
  const params = new URLSearchParams();
  if (filters.page_no)      params.set("page_no",      String(filters.page_no));
  if (filters.per_page)     params.set("per_page",     String(filters.per_page));
  if (filters.status)       params.set("status",       filters.status);
  if (filters.client_id)    params.set("client_id",    String(filters.client_id));
  if (filters.consultant_id) params.set("consultant_id", String(filters.consultant_id));
  if (filters.exit_reason)  params.set("exit_reason",  filters.exit_reason);

  const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/exits?${params.toString()}`);
  return handleResponse<ExitListResponse>(res);
}

export async function getExit(exitId: number): Promise<ExitRecord> {
  const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/exits/${exitId}`);
  const json = await handleResponse<{ data: ExitRecord }>(res);
  return json.data;
}

export async function createExit(payload: ExitCreate): Promise<ExitRecord> {
  const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/exits`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const json = await handleResponse<{ data: ExitRecord }>(res);
  return json.data;
}

export async function updateExit(exitId: number, payload: ExitUpdate): Promise<ExitRecord> {
  const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/exits/${exitId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  const json = await handleResponse<{ data: ExitRecord }>(res);
  return json.data;
}

export async function deleteExit(exitId: number): Promise<void> {
  const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/exits/${exitId}`, {
    method: "DELETE",
  });
  await handleResponse<unknown>(res);
}
