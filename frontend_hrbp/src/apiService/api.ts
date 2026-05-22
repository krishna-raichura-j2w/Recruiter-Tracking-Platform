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

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  let token = typeof window !== "undefined" ? localStorage.getItem("j2w_token") : null;

  if (token && isTokenExpired(token)) {
    if (!isRefreshing) {
      isRefreshing = true;
      refreshPromise = refreshTokenApi(token)
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
            window.location.href = "/";
          }
          throw e;
        });
    }
    // Wait for the ongoing refresh to finish
    token = await refreshPromise;
  }

  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(url, { ...options, headers });
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
} = {}): Promise<ClientListResponse> {
  const baseUrl = getBaseUrl();
  const queryParams = new URLSearchParams({
    page_no: String(params.page_no ?? 1),
    per_page: String(params.per_page ?? 5),
  });
  if (params.date_from) queryParams.append("date_from", params.date_from);
  if (params.date_to) queryParams.append("date_to", params.date_to);
  if (params.is_active !== undefined) queryParams.append("is_active", String(params.is_active));

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

export async function getConsultantsApi(params: {
  client_id?: number;
  page_no?: number;
  per_page?: number;
  date_from?: string;
  date_to?: string;
} = {}): Promise<ConsultantListResponse> {
  const baseUrl = getBaseUrl();
  const queryParams = new URLSearchParams({
    per_page: String(params.per_page ?? -1),
  });
  if (params.client_id !== undefined) queryParams.append("client_id", String(params.client_id));
  if (params.page_no !== undefined) queryParams.append("page_no", String(params.page_no));
  if (params.date_from) queryParams.append("date_from", params.date_from);
  if (params.date_to) queryParams.append("date_to", params.date_to);

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
