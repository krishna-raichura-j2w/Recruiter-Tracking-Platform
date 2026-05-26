import { fetchWithAuth } from "./api";

export interface HRBPNotification {
  id: number;
  ticket_id: number | null;
  title: string;
  message: string;
  notif_type: string;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface NotificationListResponse {
  total: number;
  unread_count: number;
  items: HRBPNotification[];
}

const getBaseUrl = () => {
  const base = import.meta.env.VITE_BASE_URL || "http://localhost:8000/";
  return base.endsWith("/") ? base : `${base}/`;
};

async function handleResponse<T>(res: Response): Promise<T> {
  const json = await res.json();
  if (!res.ok) throw new Error(json?.detail || "Request failed");
  return json as T;
}

export async function listNotificationsApi(params: {
  unread_only?: boolean;
  page_no?: number;
  per_page?: number;
}): Promise<NotificationListResponse> {
  const q = new URLSearchParams();
  if (params.unread_only) q.set("unread_only", "true");
  if (params.page_no !== undefined) q.set("page_no", String(params.page_no));
  if (params.per_page !== undefined) q.set("per_page", String(params.per_page));

  const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/notifications?${q.toString()}`);
  return handleResponse<NotificationListResponse>(res);
}

export async function markNotificationReadApi(notifId: number): Promise<HRBPNotification> {
  const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/notifications/${notifId}/read`, {
    method: "PATCH",
  });
  return handleResponse<HRBPNotification>(res);
}

export async function markAllNotificationsReadApi(): Promise<{ marked_read: number }> {
  const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/notifications/mark-all-read`, {
    method: "POST",
  });
  return handleResponse<{ marked_read: number }>(res);
}

export async function deleteNotificationApi(notifId: number): Promise<{ deleted: number }> {
  const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/notifications/${notifId}`, {
    method: "DELETE",
  });
  return handleResponse<{ deleted: number }>(res);
}
