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

export interface PoRevision {
  id: number;
  consultant_id: number;
  client_id: number;
  hrbp_id: number | null;
  bh_id: number | null;
  revised_at: string;
  old_po_rate: number | null;
  new_po_rate: number;
  hike_pct: number | null;
  ticket_id: number | null;
  ticket_number: string | null;
  status: "pending_approval" | "approved" | "rejected";
  notes: string | null;
  created_by_id: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface PoRevisionCreate {
  consultant_id: number;
  client_id: number;
  hrbp_id?: number;
  bh_id?: number;
  revised_at: string;
  old_po_rate?: number;
  new_po_rate: number;
  hike_pct?: number;
  ticket_id?: number;
  ticket_number?: string;
  notes?: string;
}

export interface PoRevisionListResponse {
  data: PoRevision[];
  meta: {
    status: boolean;
    message: string;
    page_no: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

export async function listPoRevisions(
  consultantId: number,
  page_no = 1,
  per_page = 10,
): Promise<PoRevisionListResponse> {
  const params = new URLSearchParams({
    page_no: String(page_no),
    per_page: String(per_page),
  });
  const res = await fetchWithAuth(
    `${getBaseUrl()}api/hrbp/po-revisions/consultant/${consultantId}?${params}`,
  );
  return handleResponse<PoRevisionListResponse>(res);
}

export async function createPoRevision(payload: PoRevisionCreate): Promise<PoRevision> {
  const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/po-revisions`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const json = await handleResponse<{ data: PoRevision; meta: { status: boolean; message: string } }>(res);
  return json.data;
}
