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

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CategoryOption {
  index: number;
  label: string;
  score: number;
}

export interface GovernanceCategory {
  key: string;
  label: string;
  max_score: number;
  escalation_base: number;
  description: string;
  options: CategoryOption[];
}

export interface ScoreEntry {
  category_key: string;
  category_label: string;
  option_index: number;
  option_label: string;
  escalations: number;
  base_score: number;
  net_score: number;
  max_score: number;
  options: CategoryOption[];
  is_custom: boolean;
}

export interface InactiveDefault {
  key: string;
  label: string;
  max_score: number;
}

export interface ScoreSummary {
  consultant_id: number;
  total_score: number;
  total_possible: number;
  grade: string;
  tone: string;
}

export interface FullScoresResponse {
  scores: ScoreEntry[];
  inactive_defaults: InactiveDefault[];
  summary: ScoreSummary;
}

export interface CategoryChange {
  category_label: string;
  max_score: number;
  from_idx: number;
  to_idx: number;
  from_label: string;
  to_label: string;
  from_score: number;
  to_score: number;
  score_diff: number;
}

export interface CommentAnalysisResult {
  adjustments: Record<string, number>;
  esc_adjustments: Record<string, number>;
  changes_detail: Record<string, CategoryChange>;
  explanation: string;
  score_before: number;
  score_after: number;
  score_delta: number;
  history_id: number;
  created_at: string | null;
}

export interface CommentHistoryEntry {
  id: number;
  consultant_id: number;
  comment: string;
  explanation: string | null;
  score_before: number | null;
  score_after: number | null;
  score_delta: number | null;
  changes_detail: Record<string, CategoryChange> | null;
  created_by: number | null;
  created_at: string | null;
}

// ── API functions ──────────────────────────────────────────────────────────────

export async function getCategories(): Promise<GovernanceCategory[]> {
  const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/governance/categories`);
  const json = await handleResponse<{ data: GovernanceCategory[] }>(res);
  return json.data;
}

export async function getScoreSummary(consultantId: number): Promise<ScoreSummary> {
  const res = await fetchWithAuth(
    `${getBaseUrl()}api/hrbp/governance/consultants/${consultantId}/summary`,
  );
  const json = await handleResponse<{ data: ScoreSummary }>(res);
  return json.data;
}

export async function getFullScores(consultantId: number): Promise<FullScoresResponse> {
  const res = await fetchWithAuth(
    `${getBaseUrl()}api/hrbp/governance/consultants/${consultantId}/scores`,
  );
  const json = await handleResponse<{ data: FullScoresResponse }>(res);
  return json.data;
}

export async function updateScoresManual(
  consultantId: number,
  scores: Record<string, { option_index: number; escalations: number }>,
): Promise<ScoreSummary> {
  const res = await fetchWithAuth(
    `${getBaseUrl()}api/hrbp/governance/consultants/${consultantId}/scores`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scores }),
    },
  );
  const json = await handleResponse<{ data: ScoreSummary }>(res);
  return json.data;
}

export async function deactivateCategory(consultantId: number, categoryKey: string): Promise<void> {
  const res = await fetchWithAuth(
    `${getBaseUrl()}api/hrbp/governance/consultants/${consultantId}/categories/${categoryKey}`,
    { method: "DELETE" },
  );
  await handleResponse(res);
}

export async function restoreCategory(consultantId: number, categoryKey: string): Promise<void> {
  const res = await fetchWithAuth(
    `${getBaseUrl()}api/hrbp/governance/consultants/${consultantId}/categories/${categoryKey}/restore`,
    { method: "POST" },
  );
  await handleResponse(res);
}

export async function addCustomCategory(
  consultantId: number,
  payload: { label: string; max_score: number; description?: string },
): Promise<void> {
  const res = await fetchWithAuth(
    `${getBaseUrl()}api/hrbp/governance/consultants/${consultantId}/categories/custom`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  await handleResponse(res);
}

export async function deleteCustomCategory(
  consultantId: number,
  categoryKey: string,
): Promise<void> {
  const res = await fetchWithAuth(
    `${getBaseUrl()}api/hrbp/governance/consultants/${consultantId}/categories/custom/${categoryKey}`,
    { method: "DELETE" },
  );
  await handleResponse(res);
}

export async function analyzeComment(
  consultantId: number,
  comment: string,
  consultantName: string,
): Promise<CommentAnalysisResult> {
  const res = await fetchWithAuth(
    `${getBaseUrl()}api/hrbp/governance/consultants/${consultantId}/analyze-comment`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment, consultant_name: consultantName }),
    },
  );
  const json = await handleResponse<{ data: CommentAnalysisResult }>(res);
  return json.data;
}

export async function getCommentHistory(consultantId: number): Promise<CommentHistoryEntry[]> {
  const res = await fetchWithAuth(
    `${getBaseUrl()}api/hrbp/governance/consultants/${consultantId}/comment-history`,
  );
  const json = await handleResponse<{ data: CommentHistoryEntry[] }>(res);
  return json.data;
}
