import type {
  Ticket,
  TicketCreate,
  TicketCommentCreate,
  TicketListResponse,
  TicketDetailResponse,
  SopDefinition,
  UserOption,
} from "./ticketTypes";

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
  return json as T;
}

// ── Tickets ───────────────────────────────────────────────────────────────

export async function createTicket(payload: TicketCreate): Promise<Ticket> {
  const res = await fetch(`${getBaseUrl()}api/hrbp/tickets`, {
    method: "POST",
    headers: authHeaders(),
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

  const res = await fetch(`${getBaseUrl()}api/hrbp/tickets?${params.toString()}`, {
    headers: authHeaders(),
  });
  return handleResponse<TicketListResponse>(res);
}

export async function getTicket(ticketId: number): Promise<Ticket> {
  const res = await fetch(`${getBaseUrl()}api/hrbp/tickets/${ticketId}`, {
    headers: authHeaders(),
  });
  const json = await handleResponse<TicketDetailResponse>(res);
  return json.data;
}

export async function updateTicket(
  ticketId: number,
  payload: Partial<Pick<Ticket, "priority" | "sla_deadline" | "description" | "po_risk_amount">>,
): Promise<Ticket> {
  const res = await fetch(`${getBaseUrl()}api/hrbp/tickets/${ticketId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const json = await handleResponse<TicketDetailResponse>(res);
  return json.data;
}

export async function addTicketComment(
  ticketId: number,
  payload: TicketCommentCreate,
): Promise<Ticket> {
  const res = await fetch(`${getBaseUrl()}api/hrbp/tickets/${ticketId}/comments`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const json = await handleResponse<TicketDetailResponse>(res);
  return json.data;
}

export async function advanceTicketStep(ticketId: number): Promise<Ticket> {
  const res = await fetch(`${getBaseUrl()}api/hrbp/tickets/${ticketId}/advance`, {
    method: "POST",
    headers: authHeaders(),
  });
  const json = await handleResponse<TicketDetailResponse>(res);
  return json.data;
}

export async function closeTicket(ticketId: number): Promise<Ticket> {
  const res = await fetch(`${getBaseUrl()}api/hrbp/tickets/${ticketId}/close`, {
    method: "POST",
    headers: authHeaders(),
  });
  const json = await handleResponse<TicketDetailResponse>(res);
  return json.data;
}

// ── SOPs (for wizard step 2) ──────────────────────────────────────────────

export async function listSopDefinitions(): Promise<SopDefinition[]> {
  const res = await fetch(`${getBaseUrl()}api/hrbp/sop-definitions?per_page=-1`, {
    headers: authHeaders(),
  });
  const json = await res.json();
  if (!res.ok || json?.meta?.status === false) {
    throw new Error(json?.meta?.message || json?.detail || "Failed to load SOP definitions");
  }
  const raw = json?.data;
  // data may be a flat array (paginated endpoint) or have an items key
  const items: SopDefinition[] = Array.isArray(raw) ? raw : (raw?.items ?? []);
  // SOP-1 (Regular Engagement) is scheduler-driven — exclude from manual tickets
  return items.filter((s) => s.sop_type !== "SOP-1");
}

// ── Users (for hierarchy builder) ────────────────────────────────────────

export async function listUsersByRole(role: string): Promise<UserOption[]> {
  const res = await fetch(`${getBaseUrl()}api/hrbp/users?role=${role}`, {
    headers: authHeaders(),
  });
  const json = await res.json();
  // Backend returns data as a plain array (not paginated)
  const raw = json?.data;
  if (Array.isArray(raw)) return raw;
  return raw?.items ?? [];
}

export async function listAllHrbpUsers(): Promise<UserOption[]> {
  const res = await fetch(`${getBaseUrl()}api/hrbp/users`, {
    headers: authHeaders(),
  });
  const json = await res.json();
  const raw = json?.data;
  if (Array.isArray(raw)) return raw;
  return raw?.items ?? [];
}
