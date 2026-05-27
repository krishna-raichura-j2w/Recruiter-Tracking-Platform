import type {
  Ticket,
  TicketCreate,
  TicketCommentCreate,
  TicketListResponse,
  TicketDetailResponse,
  StepSlaExtendPayload,
  StepReassignPayload,
  SopDefinition,
  UserOption,
  EmailTemplateResponse,
} from "./ticketTypes";
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

// ── Tickets ───────────────────────────────────────────────────────────────

export async function createTicket(payload: TicketCreate): Promise<Ticket> {
  const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/tickets`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const json = await handleResponse<TicketDetailResponse>(res);
  return json.data;
}

export interface TicketFilters {
  page_no?: number;
  per_page?: number;
  status?: string;
  priority?: string;
  client_id?: number;
  sop_id?: number;
  search?: string;
}

export async function listTickets(filters: TicketFilters = {}): Promise<TicketListResponse> {
  const params = new URLSearchParams();
  if (filters.page_no)   params.set("page_no",   String(filters.page_no));
  if (filters.per_page)  params.set("per_page",  String(filters.per_page));
  if (filters.status)    params.set("status",    filters.status);
  if (filters.priority)  params.set("priority",  filters.priority);
  if (filters.client_id) params.set("client_id", String(filters.client_id));
  if (filters.sop_id)    params.set("sop_id",    String(filters.sop_id));
  if (filters.search)    params.set("search",    filters.search);

  const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/tickets?${params.toString()}`);
  return handleResponse<TicketListResponse>(res);
}

export async function getTicket(ticketId: number): Promise<Ticket> {
  const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/tickets/${ticketId}`);
  const json = await handleResponse<TicketDetailResponse>(res);
  return json.data;
}

export async function updateTicket(
  ticketId: number,
  payload: Partial<Pick<Ticket, "priority" | "sla_deadline" | "description" | "po_risk_amount" | "attachments">>,
): Promise<Ticket> {
  const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/tickets/${ticketId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  const json = await handleResponse<TicketDetailResponse>(res);
  return json.data;
}

export async function addTicketComment(
  ticketId: number,
  payload: TicketCommentCreate,
): Promise<Ticket> {
  const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/tickets/${ticketId}/comments`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const json = await handleResponse<TicketDetailResponse>(res);
  return json.data;
}

export async function advanceTicketStep(ticketId: number): Promise<Ticket> {
  const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/tickets/${ticketId}/advance`, {
    method: "POST",
  });
  const json = await handleResponse<TicketDetailResponse>(res);
  return json.data;
}

export async function closeTicket(ticketId: number): Promise<Ticket> {
  const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/tickets/${ticketId}/close`, {
    method: "POST",
  });
  const json = await handleResponse<TicketDetailResponse>(res);
  return json.data;
}

// ── Step SLA extension + reassignment ────────────────────────────────────

export async function extendStepSla(
  ticketId: number,
  payload: StepSlaExtendPayload,
): Promise<Ticket> {
  const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/tickets/${ticketId}/extend-step-sla`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const json = await handleResponse<TicketDetailResponse>(res);
  return json.data;
}

export async function reassignStep(
  ticketId: number,
  payload: StepReassignPayload,
): Promise<Ticket> {
  const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/tickets/${ticketId}/reassign-step`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const json = await handleResponse<TicketDetailResponse>(res);
  return json.data;
}

// ── File upload (for ticket attachments) ─────────────────────────────────

export async function uploadTicketFile(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/storage/upload`, {
    method: "POST",
    body: form,
  });
  const json = await res.json();
  if (!res.ok || json?.meta?.status === false) {
    throw new Error(json?.meta?.message || "File upload failed");
  }
  return json.data.url as string;
}

// ── Excel export ─────────────────────────────────────────────────────────

export async function exportTicketsExcel(filters: TicketFilters = {}): Promise<string> {
  const params = new URLSearchParams();
  if (filters.status)    params.set("status",    filters.status);
  if (filters.priority)  params.set("priority",  filters.priority);
  if (filters.client_id) params.set("client_id", String(filters.client_id));
  if (filters.sop_id)    params.set("sop_id",    String(filters.sop_id));
  if (filters.search)    params.set("search",    filters.search);

  const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/tickets/export?${params.toString()}`);
  const json = await handleResponse<{ data: { url: string }; meta: { status: boolean; message: string } }>(res);
  return json.data.url;
}

// ── SOPs (for wizard step 2) ──────────────────────────────────────────────

export async function listSopDefinitions(): Promise<SopDefinition[]> {
  const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/sop-definitions?per_page=-1`);
  const json = await res.json();
  if (!res.ok || json?.meta?.status === false) {
    throw new Error(json?.meta?.message || json?.detail || "Failed to load SOP definitions");
  }
  const raw = json?.data;
  const items: SopDefinition[] = Array.isArray(raw) ? raw : (raw?.items ?? []);
  // SOP-1 (Regular Engagement) is scheduler-driven — exclude from manual tickets
  return items.filter((s) => s.sop_type !== "SOP-1");
}

export async function getSopDefinition(id: number): Promise<SopDefinition | null> {
  const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/sop-definitions/${id}`);
  const json = await res.json();
  if (!res.ok || json?.meta?.status === false) return null;
  return json?.data ?? null;
}

// ── Users (for hierarchy builder) ────────────────────────────────────────

export async function listUsersByRole(role: string): Promise<UserOption[]> {
  const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/users?role=${role}`);
  const json = await res.json();
  const raw = json?.data;
  if (Array.isArray(raw)) return raw;
  return raw?.items ?? [];
}

export async function listAllHrbpUsers(): Promise<UserOption[]> {
  const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/users`);
  const json = await res.json();
  const raw = json?.data;
  if (Array.isArray(raw)) return raw;
  return raw?.items ?? [];
}

// ── Email templates ───────────────────────────────────────────────────────

export async function listEmailTemplates(): Promise<EmailTemplateResponse[]> {
  const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/email-templates?per_page=-1`);
  const json = await res.json();
  if (!res.ok || json?.meta?.status === false) return [];
  const raw = json?.data;
  return Array.isArray(raw) ? raw : (raw?.items ?? []);
}
