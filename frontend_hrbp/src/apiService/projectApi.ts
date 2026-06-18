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

export type Cohort = "star" | "high_performer" | "rising" | "bedrock" | "new_joiner" | "watch" | "rescue";
export type PerfTier = "top_20" | "middle" | "bottom_20";

export interface ProjectSummary {
  id: number;
  name: string;
  description: string;
  client_id: number | null;
  status: string;
  avg_pct: number;
  grade: string;
  tone: string;
  member_count: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface ProjectMember {
  consultant_id: number;
  emp_id: string | null;
  name: string;
  skill: string | null;
  designation: string | null;
  is_active: boolean;
  cohort: Cohort;
  perf_tier: PerfTier;
  role_in_project: string;
  added_at: string | null;
  gov_score: number;
  gov_possible: number;
  gov_grade: string;
  gov_tone: string;
}

export interface MemberChange {
  name: string;
  score_before: number;
  score_after: number;
  score_delta: number;
  changes_detail: Record<string, {
    category_label: string;
    from_label: string;
    to_label: string;
    from_score: number;
    to_score: number;
    score_diff: number;
  }>;
}

export interface TeamCommentResult {
  targeted_count: number;
  targeted_ids: number[];
  adjustments: Record<string, number>;
  changes: Record<string, MemberChange>;
  explanation: string;
  score_before: number;
  score_after: number;
  score_delta: number;
  history_id: number;
  created_at: string | null;
}

export interface ProjectCommentHistory {
  id: number;
  project_id: number;
  comment: string;
  explanation: string | null;
  targeted_consultant_ids: number[];
  changes_detail: Record<string, MemberChange> | null;
  score_before: number | null;
  score_after: number | null;
  score_delta: number | null;
  created_by: number | null;
  created_at: string | null;
}

// ── Project CRUD ───────────────────────────────────────────────────────────────

export async function listProjects(): Promise<ProjectSummary[]> {
  const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/projects`);
  const json = await handleResponse<{ data: ProjectSummary[] }>(res);
  return json.data;
}

export async function createProject(payload: {
  name: string;
  description?: string;
  client_id?: number | null;
}): Promise<{ id: number; name: string }> {
  const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await handleResponse<{ data: { id: number; name: string } }>(res);
  return json.data;
}

export async function getProject(projectId: number): Promise<ProjectSummary> {
  const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/projects/${projectId}`);
  const json = await handleResponse<{ data: ProjectSummary }>(res);
  return json.data;
}

export async function updateProject(
  projectId: number,
  payload: { name?: string; description?: string; status?: string },
): Promise<ProjectSummary> {
  const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/projects/${projectId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await handleResponse<{ data: ProjectSummary }>(res);
  return json.data;
}

export async function deleteProject(projectId: number): Promise<void> {
  const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/projects/${projectId}`, {
    method: "DELETE",
  });
  await handleResponse(res);
}

// ── Members ────────────────────────────────────────────────────────────────────

export async function listMembers(projectId: number): Promise<ProjectMember[]> {
  const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/projects/${projectId}/members`);
  const json = await handleResponse<{ data: ProjectMember[] }>(res);
  return json.data;
}

export async function addMember(
  projectId: number,
  payload: { consultant_id: number; cohort: Cohort; perf_tier: PerfTier; role_in_project?: string },
): Promise<void> {
  const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/projects/${projectId}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  await handleResponse(res);
}

export async function updateMember(
  projectId: number,
  consultantId: number,
  payload: { cohort?: Cohort; perf_tier?: PerfTier; role_in_project?: string },
): Promise<void> {
  const res = await fetchWithAuth(
    `${getBaseUrl()}api/hrbp/projects/${projectId}/members/${consultantId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  await handleResponse(res);
}

export async function removeMember(projectId: number, consultantId: number): Promise<void> {
  const res = await fetchWithAuth(
    `${getBaseUrl()}api/hrbp/projects/${projectId}/members/${consultantId}`,
    { method: "DELETE" },
  );
  await handleResponse(res);
}

// ── Team Comments ──────────────────────────────────────────────────────────────

export async function analyzeTeamComment(
  projectId: number,
  comment: string,
): Promise<TeamCommentResult> {
  const res = await fetchWithAuth(
    `${getBaseUrl()}api/hrbp/projects/${projectId}/analyze-comment`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment }),
    },
  );
  const json = await handleResponse<{ data: TeamCommentResult }>(res);
  return json.data;
}

export async function getProjectCommentHistory(
  projectId: number,
): Promise<ProjectCommentHistory[]> {
  const res = await fetchWithAuth(
    `${getBaseUrl()}api/hrbp/projects/${projectId}/comment-history`,
  );
  const json = await handleResponse<{ data: ProjectCommentHistory[] }>(res);
  return json.data;
}

// ── Project KPIs ───────────────────────────────────────────────────────────────

export interface ProjectKpiDefinition {
  id: number;
  category_key: string;
  label: string;
  max_score: number;
  escalation_base: number;
  description: string;
  is_custom: boolean;
  options: null | Array<{ index: number; label: string; score: number }>;
  sort_order: number;
}

export async function getProjectKpis(projectId: number): Promise<ProjectKpiDefinition[]> {
  const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/projects/${projectId}/kpis`);
  const json = await handleResponse<{ data: ProjectKpiDefinition[] }>(res);
  return json.data;
}

export async function setProjectKpis(
  projectId: number,
  kpis: Omit<ProjectKpiDefinition, "id" | "sort_order">[],
): Promise<ProjectKpiDefinition[]> {
  const res = await fetchWithAuth(`${getBaseUrl()}api/hrbp/projects/${projectId}/kpis`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kpis }),
  });
  const json = await handleResponse<{ data: ProjectKpiDefinition[] }>(res);
  return json.data;
}
