const getBaseUrl = () => {
  const base = import.meta.env.VITE_BASE_URL || "http://localhost:8000/";
  return base.endsWith("/") ? base : `${base}/`;
};

function authHeaders(): HeadersInit {
  const token = typeof window !== "undefined" ? localStorage.getItem("j2w_token") : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  const json = await res.json();
  if (!res.ok || json?.meta?.status === false) {
    throw new Error(json?.meta?.message || json?.detail || "Request failed");
  }
  return json.data as T;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DashboardKpis {
  open_tickets: number;
  sla_breaches: number;
  po_at_risk: number;
  cadence_overdue: number;
}

export interface MyTicketItem {
  id: number;
  ticket_number: string;
  title: string;
  sop_type: string | null;
  client_name: string | null;
  sla_deadline: string | null;
  sla_status: "ok" | "warning" | "breached" | "none";
  status: string;
  priority: string;
  current_step: number;
}

export interface TodayCadenceItem {
  id: number;
  schedule_id: number;
  cadence_number: number;
  consultant_name: string | null;
  consultant_initials: string;
  consultant_email: string | null;
  consultant_phone: string | null;
  client_name: string | null;
  meeting_type: string;
  meeting_time: string | null;
  project_name: string | null;
  status: string;
  scheduled_date: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AIChatResult {
  response: string;
}

// ── API calls ─────────────────────────────────────────────────────────────────

export async function fetchKpis(): Promise<DashboardKpis> {
  const res = await fetch(`${getBaseUrl()}api/hrbp/dashboard/kpis`, {
    headers: authHeaders(),
  });
  return handleResponse<DashboardKpis>(res);
}

export async function fetchMyTickets(limit = 5): Promise<MyTicketItem[]> {
  const res = await fetch(`${getBaseUrl()}api/hrbp/dashboard/my-tickets?limit=${limit}`, {
    headers: authHeaders(),
  });
  return handleResponse<MyTicketItem[]>(res);
}

export async function fetchTodayCadence(): Promise<TodayCadenceItem[]> {
  const res = await fetch(`${getBaseUrl()}api/hrbp/dashboard/today-cadence`, {
    headers: authHeaders(),
  });
  return handleResponse<TodayCadenceItem[]>(res);
}

export async function fetchPinnedTicket(): Promise<object | null> {
  const res = await fetch(`${getBaseUrl()}api/hrbp/dashboard/pinned-ticket`, {
    headers: authHeaders(),
  });
  return handleResponse<object | null>(res);
}

export async function pinTicket(ticketId: number): Promise<void> {
  const res = await fetch(`${getBaseUrl()}api/hrbp/dashboard/pin/${ticketId}`, {
    method: "POST",
    headers: authHeaders(),
  });
  await handleResponse<unknown>(res);
}

export async function unpinTicket(): Promise<void> {
  const res = await fetch(`${getBaseUrl()}api/hrbp/dashboard/pin`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  await handleResponse<unknown>(res);
}

export interface ConsultantAtRisk {
  id: number;
  name: string;
  client_name: string | null;
  po_end_date: string | null;
  po_risk: number;
  monthly_po: number;
  days_until_expiry: number | null;
}

export interface ActivityItem {
  id: number;
  ticket_id: number;
  ticket_number: string | null;
  actor_name: string;
  action: string;
  meta_data: Record<string, unknown>;
  created_at: string | null;
}

export async function fetchConsultantsAtRisk(limit = 8): Promise<ConsultantAtRisk[]> {
  const res = await fetch(`${getBaseUrl()}api/hrbp/dashboard/consultants-at-risk?limit=${limit}`, {
    headers: authHeaders(),
  });
  return handleResponse<ConsultantAtRisk[]>(res);
}

export async function fetchRecentActivity(limit = 10): Promise<ActivityItem[]> {
  const res = await fetch(`${getBaseUrl()}api/hrbp/dashboard/recent-activity?limit=${limit}`, {
    headers: authHeaders(),
  });
  return handleResponse<ActivityItem[]>(res);
}

export async function chatWithAI(message: string, history: ChatMessage[]): Promise<AIChatResult> {
  const res = await fetch(`${getBaseUrl()}api/hrbp/ai/chat`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ message, history }),
  });
  return handleResponse<AIChatResult>(res);
}
