// ── Hierarchy ─────────────────────────────────────────────────────────────

export interface HierarchyStep {
  order: number;
  role: string;
  label: string;
  user_id: number | null;
  user_name: string | null;
  user_email: string | null;
  sla_window: string | null;
  resolved_at: string | null;
  resolved_by_id: number | null;
  resolved_by_name: string | null;
}

// ── Create payload ────────────────────────────────────────────────────────

export interface TicketCreate {
  escalation_mgr_id: number | null;
  client_id: number;
  consultant_ids: number[];
  sop_id: number;
  priority: "critical" | "high" | "medium" | "low";
  sla_deadline: string | null;        // ISO datetime string
  description: string;
  po_risk_amount: number | null;
  hierarchy_json: HierarchyStep[];
}

// ── Comment ───────────────────────────────────────────────────────────────

export interface TicketCommentCreate {
  content: string;
  is_resolution: boolean;
}

export interface TicketComment {
  id: number;
  ticket_id: number;
  author_id: number;
  author_name: string | null;
  hierarchy_step: number;
  content: string;
  is_resolution: boolean;
  created_at: string;
}

// ── Activity log ──────────────────────────────────────────────────────────

export interface ActivityLogEntry {
  id: number;
  ticket_id: number;
  actor_id: number | null;
  actor_name: string | null;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ── Consultant summary (on ticket) ────────────────────────────────────────

export interface TicketConsultant {
  id: number;
  name: string;
  emp_id: string;
  cohort: string | null;
  monthly_po: number | null;
  po_end_date: string | null;
  join_date: string | null;
  po_risk: number | null;
}

// ── Ticket response ───────────────────────────────────────────────────────

export interface Ticket {
  id: number;
  ticket_number: string;
  title: string;
  raised_by_id: number;
  raised_by_name: string | null;
  escalation_mgr_id: number | null;
  escalation_mgr_name: string | null;
  client_id: number;
  client_name: string | null;
  sop_id: number | null;
  sop_name: string | null;
  sop_type: string | null;
  priority: "critical" | "high" | "medium" | "low";
  sla_deadline: string | null;
  description: string | null;
  po_risk_amount: number | null;
  status: "open" | "closed";
  hierarchy_json: HierarchyStep[];
  current_step: number;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  // enriched
  consultants: TicketConsultant[];
  consultant_count?: number;
  comments: TicketComment[];
  activity_log: ActivityLogEntry[];
}

// ── List response ─────────────────────────────────────────────────────────

export interface TicketListResponse {
  data: Ticket[];
  meta: {
    status: boolean;
    message: string;
    page_no: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

export interface TicketDetailResponse {
  data: Ticket;
  meta: { status: boolean; message: string };
}

// ── SOP (for wizard step 2) ───────────────────────────────────────────────

export interface SopDefinition {
  id: number;
  sop_type: string;
  number: string;
  name: string;
  description: string;
  trigger_source: string;
  kra_tags: string[];
  control_level: string;
  persons_hierarchy: HierarchyStep[];
  steps_definition: Array<{
    number: number;
    action_label: string;
    action_detail: string;
    owner_role: string;
    sla_working_hours: number;
    escalate_to_role: string;
  }>;
}

// ── User (for hierarchy picker) ───────────────────────────────────────────

export interface UserOption {
  id: number;
  name: string;
  email: string;
  role: string;
}
