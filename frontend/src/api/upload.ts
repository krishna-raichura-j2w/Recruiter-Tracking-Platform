import api from './client';

export type UploadFolder = 'resumes' | 'exit-proofs' | 'logos' | 'jd-files';

export interface UploadResult {
  key: string;   // S3 key — store this in the DB
  url: string;   // Presigned URL — use for immediate in-browser display
}

/**
 * Upload a file to S3 via the backend.
 * Returns the S3 key (to persist) and a presigned URL (for display).
 */
export async function uploadToS3(file: File, folder: UploadFolder): Promise<UploadResult> {
  const fd = new FormData();
  fd.append('file', file);
  // Do NOT set Content-Type manually — axios sets multipart boundary automatically
  const res = await api.post<UploadResult>(`/upload?folder=${folder}`, fd);
  return res.data;
}

/**
 * Fetch a fresh presigned URL for an existing S3 key.
 * Use when a presigned URL has expired and you need a new one.
 */
export async function getViewUrl(key: string): Promise<string> {
  const res = await api.get<{ url: string }>(`/upload/url?key=${encodeURIComponent(key)}`);
  return res.data.url;
}
