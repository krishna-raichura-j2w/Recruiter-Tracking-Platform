import { fetchWithAuth } from "./api";

const getBaseUrl = () => {
  const base = import.meta.env.VITE_BASE_URL || "http://localhost:8000/";
  return base.endsWith("/") ? base : `${base}/`;
};

async function handle<T>(res: Response): Promise<T> {
  const json = await res.json();
  if (!res.ok || json?.meta?.status === false) {
    throw new Error(json?.meta?.message || json?.detail || "Request failed");
  }
  return json as T;
}

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: string;
  phone: string | null;
  is_active: boolean;
  must_change_password: boolean;
}

export interface AdminStats {
  total_users: number;
  total_clients: number;
  total_consultants: number;
  open_tickets: number;
}

export interface AdminUserCreate {
  name: string;
  email: string;
  password: string;
  role: string;
  phone?: string;
}

export interface AdminUserUpdate {
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  is_active?: boolean;
}

// ── Stats ──────────────────────────────────────────────────────────────────

export async function getAdminStats(): Promise<{ meta: any; data: AdminStats }> {
  const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/admin/stats`);
  return handle(res);
}

// ── Users ──────────────────────────────────────────────────────────────────

export async function getAdminUsers(params: { role?: string; include_inactive?: boolean } = {}): Promise<{ meta: any; data: AdminUser[] }> {
  const q = new URLSearchParams();
  if (params.role) q.append("role", params.role);
  if (params.include_inactive) q.append("include_inactive", "true");
  const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/admin/users?${q.toString()}`);
  return handle(res);
}

export async function createAdminUser(payload: AdminUserCreate): Promise<{ meta: any; data: AdminUser }> {
  const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/admin/users`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return handle(res);
}

export async function updateAdminUser(userId: number, payload: AdminUserUpdate): Promise<{ meta: any; data: AdminUser }> {
  const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return handle(res);
}

export async function resetAdminUserPassword(userId: number, newPassword: string): Promise<{ meta: any; data: {} }> {
  const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/admin/users/${userId}/reset-password`, {
    method: "POST",
    body: JSON.stringify({ new_password: newPassword }),
  });
  return handle(res);
}

// ── Client assignment ──────────────────────────────────────────────────────

export async function assignClient(clientId: number, payload: { hrbp_ids?: number[]; hrbp_id?: number; bh_id?: number }): Promise<{ meta: any; data: any }> {
  const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/admin/clients/${clientId}/assign`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return handle(res);
}

// ── Consultant assignment ──────────────────────────────────────────────────

export async function assignConsultant(consultantId: number, payload: { hrbp_id?: number; bh_id?: number }): Promise<{ meta: any; data: any }> {
  const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/admin/consultants/${consultantId}/assign`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return handle(res);
}
