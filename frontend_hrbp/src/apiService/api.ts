import type {
  LoginResponse,
  UserProfileResponse,
  UpdateUserProfileRequest,
  UpdateUserProfileResponse,
  ClientListResponse,
  ConsultantListResponse,
  CreateCadenceScheduleRequest,
  CreateCadenceScheduleResponse,
  CadenceSessionsResponse,
  CadenceSessionSummaryResponse,
  UpdateCadenceSessionRequest,
  ExportCadenceSessionsResponse,
  ConsultantItem,
} from "./types";

const getBaseUrl = () => {
  const base = import.meta.env.VITE_BASE_URL || "http://localhost:8000/";
  return base.endsWith("/") ? base : `${base}/`;
};

// ---- Token Management ----

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    const exp = payload.exp;
    // Buffer of 60 seconds
    if (Date.now() >= exp * 1000 - 60000) {
      return true;
    }
    return false;
  } catch (e) {
    return true; // Treat as expired if parsing fails
  }
}

let isRefreshing = false;
let refreshPromise: Promise<string> | null = null;

async function refreshTokenApi(oldToken: string): Promise<string> {
  const baseUrl = getBaseUrl();
  const response = await fetch(`${baseUrl}api/hrbp/users/refresh_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token: oldToken }),
  });

  if (!response.ok) {
    throw new Error("Token refresh failed");
  }
  
  const data = await response.json();
  if (data.meta?.status && data.data?.access_token) {
    return data.data.access_token;
  }
  throw new Error("Invalid refresh response");
}

async function doRefresh(currentToken: string): Promise<string> {
  if (!isRefreshing) {
    isRefreshing = true;
    refreshPromise = refreshTokenApi(currentToken)
      .then((newToken) => {
        if (typeof window !== "undefined") {
          localStorage.setItem("j2w_token", newToken);
        }
        isRefreshing = false;
        refreshPromise = null;
        return newToken;
      })
      .catch((e) => {
        isRefreshing = false;
        refreshPromise = null;
        if (typeof window !== "undefined") {
          localStorage.removeItem("j2w_token");
          localStorage.removeItem("j2w_user");
          localStorage.removeItem("user_id");
          window.location.href = import.meta.env.BASE_URL || "/";
        }
        throw e;
      });
  }
  return refreshPromise!;
}

export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  let token = typeof window !== "undefined" ? localStorage.getItem("j2w_token") : null;

  // Proactive refresh: token is expired before we even send
  if (token && isTokenExpired(token)) {
    token = await doRefresh(token);
  }

  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(url, { ...options, headers });

  // Reactive refresh: server returned 401 (e.g. clock skew or server-side expiry)
  if (response.status === 401 && token) {
    try {
      const newToken = await doRefresh(token);
      const retryHeaders = new Headers(options.headers || {});
      if (!retryHeaders.has("Content-Type") && !(options.body instanceof FormData)) {
        retryHeaders.set("Content-Type", "application/json");
      }
      retryHeaders.set("Authorization", `Bearer ${newToken}`);
      return fetch(url, { ...options, headers: retryHeaders });
    } catch {
      // doRefresh already redirected to login
      return response;
    }
  }

  return response;
}

// ---- Endpoints ----

export async function loginApi(email: string, password: string): Promise<LoginResponse> {
  const baseUrl = getBaseUrl();
  const response = await fetch(`${baseUrl}api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    let errMsg = "Invalid credentials";
    try {
      const errData = await response.json();
      if (errData && errData.detail) {
        errMsg = errData.detail;
      }
    } catch (e) {}
    throw new Error(errMsg);
  }

  return response.json();
}

export async function changePasswordApi(newPassword: string, confirmPassword: string): Promise<void> {
  const baseUrl = getBaseUrl();
  const response = await fetchWithAuth(`${baseUrl}api/auth/change-password`, {
    method: "POST",
    body: JSON.stringify({ new_password: newPassword, confirm_password: confirmPassword }),
  });
  if (!response.ok) {
    let errMsg = "Failed to change password";
    try {
      const errData = await response.json();
      if (errData?.detail) errMsg = errData.detail;
    } catch {}
    throw new Error(errMsg);
  }
}

export interface AuditLogItem {
  id: number;
  entity_type: string;
  entity_id: number;
  action: string;
  actor_id: number | null;
  actor_name: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  ts: string;
}

export interface AuditLogParams {
  page_no?: number;
  per_page?: number;
  entity_type?: string;
  actor_id?: number;
  action?: string;
  date_from?: string;
  date_to?: string;
}

export async function fetchAuditLog(params: AuditLogParams = {}): Promise<{
  items: AuditLogItem[];
  total: number;
  page_no: number;
  per_page: number;
  total_pages: number;
}> {
  const baseUrl = getBaseUrl();
  const q = new URLSearchParams();
  if (params.page_no) q.set("page_no", String(params.page_no));
  if (params.per_page) q.set("per_page", String(params.per_page));
  if (params.entity_type) q.set("entity_type", params.entity_type);
  if (params.actor_id) q.set("actor_id", String(params.actor_id));
  if (params.action) q.set("action", params.action);
  if (params.date_from) q.set("date_from", params.date_from);
  if (params.date_to) q.set("date_to", params.date_to);
  const res = await fetchWithAuth(`${baseUrl}api/hrbp/audit-log?${q.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch activity log");
  const json = await res.json();
  return {
    items: json.data ?? [],
    total: json.meta?.total ?? 0,
    page_no: json.meta?.page_no ?? 1,
    per_page: json.meta?.per_page ?? 20,
    total_pages: json.meta?.total_pages ?? 1,
  };
}

export async function getUserProfile(userId: number): Promise<UserProfileResponse> {
  const baseUrl = getBaseUrl();
  const response = await fetchWithAuth(`${baseUrl}api/hrbp/users/${userId}`, {
    method: "GET",
  });

  if (!response.ok) {
    let errMsg = "Failed to fetch profile details";
    try {
      const errData = await response.json();
      if (errData && errData.detail) errMsg = errData.detail;
    } catch (e) {}
    throw new Error(errMsg);
  }
  return response.json();
}

export async function updateUserProfile(
  userId: number,
  payload: UpdateUserProfileRequest,
): Promise<UpdateUserProfileResponse> {
  const baseUrl = getBaseUrl();
  const response = await fetchWithAuth(`${baseUrl}api/hrbp/users/${userId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errMsg = "Failed to update profile details";
    try {
      const errData = await response.json();
      if (errData && errData.detail) errMsg = errData.detail;
    } catch (e) {}
    throw new Error(errMsg);
  }
  return response.json();
}

export async function getClientsApi(params: {
  page_no?: number;
  per_page?: number;
  date_from?: string;
  date_to?: string;
  is_active?: boolean;
  search?: string;
  industry?: string;
} = {}): Promise<ClientListResponse> {
  const baseUrl = getBaseUrl();
  const queryParams = new URLSearchParams({
    page_no: String(params.page_no ?? 1),
    per_page: String(params.per_page ?? 5),
  });
  if (params.date_from) queryParams.append("date_from", params.date_from);
  if (params.date_to) queryParams.append("date_to", params.date_to);
  if (params.is_active !== undefined) queryParams.append("is_active", String(params.is_active));
  if (params.search) queryParams.append("search", params.search);
  if (params.industry) queryParams.append("industry", params.industry);

  const response = await fetchWithAuth(`${baseUrl}api/hrbp/clients?${queryParams.toString()}`, {
    method: "GET",
  });

  if (!response.ok) {
    let errMsg = "Failed to fetch clients";
    try {
      const errData = await response.json();
      if (errData && errData.detail) errMsg = errData.detail;
    } catch (e) {}
    throw new Error(errMsg);
  }
  return response.json();
}

export async function exportClientsApi(params: {
  search?: string;
  industry?: string;
  is_active?: boolean;
} = {}): Promise<string> {
  const baseUrl = getBaseUrl();
  const queryParams = new URLSearchParams();
  if (params.search) queryParams.append("search", params.search);
  if (params.industry) queryParams.append("industry", params.industry);
  if (params.is_active !== undefined) queryParams.append("is_active", String(params.is_active));

  const res = await fetchWithAuth(`${baseUrl}api/hrbp/clients/export?${queryParams.toString()}`);
  const json = await res.json();
  if (!res.ok || json?.meta?.status === false) throw new Error(json?.meta?.message || "Export failed");
  return json.data.url;
}

export async function getConsultantsApi(params: {
  client_id?: number;
  page_no?: number;
  per_page?: number;
  date_from?: string;
  date_to?: string;
  search?: string;
  is_active?: boolean;
} = {}): Promise<ConsultantListResponse> {
  const baseUrl = getBaseUrl();
  const queryParams = new URLSearchParams({
    per_page: String(params.per_page ?? -1),
  });
  if (params.client_id !== undefined) queryParams.append("client_id", String(params.client_id));
  if (params.page_no !== undefined) queryParams.append("page_no", String(params.page_no));
  if (params.date_from) queryParams.append("date_from", params.date_from);
  if (params.date_to) queryParams.append("date_to", params.date_to);
  if (params.search) queryParams.append("search", params.search);
  if (params.is_active !== undefined) queryParams.append("is_active", String(params.is_active));

  const response = await fetchWithAuth(
    `${baseUrl}api/hrbp/consultants?${queryParams.toString()}`,
    {
      method: "GET",
    },
  );

  if (!response.ok) {
    let errMsg = "Failed to fetch consultants";
    try {
      const errData = await response.json();
      if (errData && errData.detail) errMsg = errData.detail;
    } catch (e) {}
    throw new Error(errMsg);
  }
  return response.json();
}

export async function getConsultantDetailsApi(consultantId: number): Promise<{ meta: any, data: ConsultantItem }> {
  const baseUrl = getBaseUrl();
  const response = await fetchWithAuth(`${baseUrl}api/hrbp/consultants/${consultantId}`, {
    method: "GET",
  });

  if (!response.ok) {
    let errMsg = "Failed to fetch consultant details";
    try {
      const errData = await response.json();
      if (errData && errData.detail) errMsg = errData.detail;
    } catch (e) {}
    throw new Error(errMsg);
  }
  return response.json();
}

export async function updateConsultantApi(
  id: number,
  payload: Record<string, any>,
): Promise<{ meta: { status: boolean; message: string }; data: any }> {
  const baseUrl = getBaseUrl();
  const response = await fetchWithAuth(`${baseUrl}api/hrbp/consultants/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return response.json();
}

export async function deleteConsultantApi(
  id: number,
): Promise<{ meta: { status: boolean; message: string }; data: any }> {
  const baseUrl = getBaseUrl();
  const response = await fetchWithAuth(`${baseUrl}api/hrbp/consultants/${id}`, {
    method: "DELETE",
  });
  return response.json();
}

export async function downloadConsultantTemplateApi(client_id?: number): Promise<Blob> {
  const baseUrl = getBaseUrl();
  const url = new URL(`${baseUrl}api/hrbp/consultants/download-template`);
  if (client_id !== undefined) url.searchParams.set("client_id", String(client_id));
  const response = await fetchWithAuth(url.toString());
  if (!response.ok) throw new Error("Failed to download template");
  return response.blob();
}

export async function bulkUpsertConsultantsApi(file: File): Promise<{
  meta: { status: boolean; message: string };
  data: { inserted: number; updated: number; errors: { row: number; error: string }[] };
}> {
  const baseUrl = getBaseUrl();
  const form = new FormData();
  form.append("file", file);
  const response = await fetchWithAuth(`${baseUrl}api/hrbp/consultants/bulk-upsert`, {
    method: "POST",
    body: form,
  });
  return response.json();
}

export async function createConsultantApi(payload: Record<string, any>): Promise<{
  meta: { status: boolean; message: string };
  data: ConsultantItem;
}> {
  const baseUrl = getBaseUrl();
  const response = await fetchWithAuth(`${baseUrl}api/hrbp/consultants`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return response.json();
}

export async function createCadenceScheduleApi(
  payload: CreateCadenceScheduleRequest,
): Promise<CreateCadenceScheduleResponse> {
  const baseUrl = getBaseUrl();
  const response = await fetchWithAuth(`${baseUrl}api/hrbp/cadence-schedules`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errMsg = "Failed to create cadence schedule";
    try {
      const errData = await response.json();
      if (errData && errData.detail) errMsg = errData.detail;
    } catch (e) {}
    throw new Error(errMsg);
  }
  return response.json();
}

export async function getCadenceSessionsApi(params: {
  scheduled_date?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
  page_no?: number;
  per_page?: number;
  cadence_tag?: string;
}): Promise<CadenceSessionsResponse> {
  const baseUrl = getBaseUrl();
  const queryParams = new URLSearchParams({
    per_page: String(params.per_page ?? -1),
  });
  if (params.page_no !== undefined) {
    queryParams.append("page_no", String(params.page_no));
  }
  if (params.scheduled_date) {
    queryParams.append("scheduled_date", params.scheduled_date);
  }
  if (params.status) {
    queryParams.append("status", params.status);
  }
  if (params.date_from) {
    queryParams.append("date_from", params.date_from);
  }
  if (params.date_to) {
    queryParams.append("date_to", params.date_to);
  }
  if (params.cadence_tag) {
    queryParams.append("cadence_tag", params.cadence_tag);
  }

  const response = await fetchWithAuth(
    `${baseUrl}api/hrbp/cadence-schedules/sessions?${queryParams.toString()}`,
    {
      method: "GET",
    },
  );

  if (!response.ok) {
    let errMsg = "Failed to fetch cadence sessions";
    try {
      const errData = await response.json();
      if (errData && errData.detail) errMsg = errData.detail;
    } catch (e) {}
    throw new Error(errMsg);
  }
  return response.json();
}

export async function exportCadenceSessionsApi(params: {
  status?: string;
  date_from?: string;
  date_to?: string;
}): Promise<ExportCadenceSessionsResponse> {
  const baseUrl = getBaseUrl();
  const queryParams = new URLSearchParams();

  if (params.status) {
    queryParams.append("status", params.status);
  }
  if (params.date_from) {
    queryParams.append("date_from", params.date_from);
  }
  if (params.date_to) {
    queryParams.append("date_to", params.date_to);
  }

  const response = await fetchWithAuth(
    `${baseUrl}api/hrbp/cadence-schedules/sessions/export?${queryParams.toString()}`,
    {
      method: "GET",
    }
  );

  if (!response.ok) {
    let errMsg = "Failed to export cadence sessions";
    try {
      const errData = await response.json();
      if (errData && errData.detail) errMsg = errData.detail;
    } catch (e) {}
    throw new Error(errMsg);
  }
  
  return response.json();
}

export async function getCadenceSessionsSummaryApi(): Promise<CadenceSessionSummaryResponse> {
  const baseUrl = getBaseUrl();
  const response = await fetchWithAuth(
    `${baseUrl}api/hrbp/cadence-schedules/sessions/summary`,
    {
      method: "GET",
    },
  );

  if (!response.ok) {
    let errMsg = "Failed to fetch cadence sessions summary";
    try {
      const errData = await response.json();
      if (errData && errData.detail) errMsg = errData.detail;
    } catch (e) {}
    throw new Error(errMsg);
  }
  return response.json();
}

export async function updateCadenceSessionApi(
  scheduleId: number,
  sessionId: number,
  payload: UpdateCadenceSessionRequest,
): Promise<any> {
  const baseUrl = getBaseUrl();
  const response = await fetchWithAuth(
    `${baseUrl}api/hrbp/cadence-schedules/${scheduleId}/sessions/${sessionId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    let errMsg = "Failed to update cadence session";
    try {
      const errData = await response.json();
      if (errData && errData.detail) errMsg = errData.detail;
    } catch (e) {}
    throw new Error(errMsg);
  }
  return response.json();
}

export async function getCadenceScheduleSessionsApi(
  scheduleId: number,
): Promise<CadenceSessionsResponse> {
  const baseUrl = getBaseUrl();
  const response = await fetchWithAuth(
    `${baseUrl}api/hrbp/cadence-schedules/${scheduleId}/sessions?per_page=-1`,
    {
      method: "GET",
    }
  );

  if (!response.ok) {
    let errMsg = "Failed to fetch cadence schedule sessions";
    try {
      const errData = await response.json();
      if (errData && errData.detail) errMsg = errData.detail;
    } catch (e) {}
    throw new Error(errMsg);
  }
  return response.json();
}

export async function forgotPasswordApi(email: string): Promise<void> {
  const baseUrl = getBaseUrl();
  await fetch(`${baseUrl}api/hrbp/users/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  // always succeeds on the client side (server never reveals if email exists)
}

export async function resetPasswordApi(token: string, new_password: string): Promise<void> {
  const baseUrl = getBaseUrl();
  const response = await fetch(`${baseUrl}api/hrbp/users/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, new_password }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data?.message || data?.detail || "Failed to reset password");
  }
}
