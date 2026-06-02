from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel


# ── Hierarchy step (snapshot stored on the ticket) ──────────────────────────

class HierarchyStepSchema(BaseModel):
    order: int
    role: str                      # hrbp | bh | ops_head | coo | ceo | custom
    label: str
    user_id: int | None = None     # resolved at creation time
    user_name: str | None = None
    user_email: str | None = None
    sla_window: str | None = None
    sla_hours: int | None = None   # computed from SOP steps_definition at creation
    resolved_at: datetime | None = None
    resolved_by_id: int | None = None
    resolved_by_name: str | None = None


# ── Create ───────────────────────────────────────────────────────────────────

class TicketCreate(BaseModel):
    escalation_mgr_id: int | None = None
    client_id: int
    consultant_ids: list[int]
    sop_id: int
    priority: Literal["critical", "high", "medium", "low"] = "medium"
    sla_deadline: datetime | None = None
    description: str
    po_risk_amount: Decimal | None = None
    hierarchy_json: list[HierarchyStepSchema]
    attachments: list[str] = []


# ── Comment ──────────────────────────────────────────────────────────────────

class TicketCommentCreate(BaseModel):
    content: str
    is_resolution: bool = False    # True → also advances to next step


# ── Step SLA extension ────────────────────────────────────────────────────────

class StepSlaExtendPayload(BaseModel):
    extend_until: datetime          # new deadline for the current step
    reason: str


# ── Step reassignment ─────────────────────────────────────────────────────────

class StepReassignPayload(BaseModel):
    user_id: int
    user_name: str
    user_email: str | None = None
    reason: str


# ── Close (with optional PO outcome) ─────────────────────────────────────────

class CloseTicketPayload(BaseModel):
    po_outcome: Literal["retained", "loss"] | None = None

    # PO Retained — new PO terms (all optional)
    new_po_end_date: date | None = None
    new_po_monthly:  Decimal | None = None
    new_margin:      Decimal | None = None
    new_ctc:         Decimal | None = None

    # PO Loss — exit details (only relevant when consultant_exited=True)
    consultant_exited: bool = False
    exit_date:         date | None = None
    exit_reason:       str | None = None   # resignation | end_of_contract | termination | mutual_separation
    exit_type:         str | None = None   # voluntary | involuntary
    replacement_needed: bool = False
    notes:             str | None = None


# ── Update (partial — only creator can update) ───────────────────────────────

class TicketUpdate(BaseModel):
    priority: Literal["critical", "high", "medium", "low"] | None = None
    sla_deadline: datetime | None = None
    description: str | None = None
    po_risk_amount: Decimal | None = None
    attachments: list[str] | None = None


# ── Response shapes ──────────────────────────────────────────────────────────

class TicketCommentResponse(BaseModel):
    id: int
    ticket_id: int
    author_id: int
    author_name: str | None = None
    hierarchy_step: int
    content: str
    is_resolution: bool
    created_at: datetime | None

    class Config:
        from_attributes = True


class ActivityLogResponse(BaseModel):
    id: int
    ticket_id: int
    actor_id: int | None
    actor_name: str | None = None
    action: str
    metadata: dict[str, Any]
    created_at: datetime | None

    class Config:
        from_attributes = True


class ConsultantSummary(BaseModel):
    id: int
    name: str
    emp_id: str
    cohort: str | None
    monthly_po: Decimal | None
    po_end_date: Any | None
    join_date: Any | None
    po_risk: Decimal | None

    class Config:
        from_attributes = True


class TicketResponse(BaseModel):
    id: int
    ticket_number: str
    title: str
    raised_by_id: int
    raised_by_name: str | None = None
    escalation_mgr_id: int | None
    escalation_mgr_name: str | None = None
    client_id: int
    client_name: str | None = None
    sop_id: int | None
    sop_name: str | None = None
    sop_type: str | None = None
    priority: str
    sla_deadline: datetime | None
    description: str | None
    po_risk_amount: Decimal | None
    status: str
    hierarchy_json: list[dict]
    current_step: int
    attachments: list[str] = []
    step_started_at: datetime | None = None
    step_sla_alerted_at: datetime | None = None
    step_sla_extended_until: datetime | None = None
    closed_at: datetime | None
    created_at: datetime | None
    updated_at: datetime | None
    # enriched on detail fetch
    consultants: list[ConsultantSummary] = []
    comments: list[TicketCommentResponse] = []
    activity_log: list[ActivityLogResponse] = []

    class Config:
        from_attributes = True
