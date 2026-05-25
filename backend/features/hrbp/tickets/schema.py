from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel


# ── Hierarchy step (snapshot stored on the ticket) ──────────────────────────

class HierarchyStepSchema(BaseModel):
    order: int
    role: str                      # hrbp | bh | ops_head | priti | coo | custom
    label: str
    user_id: int | None = None     # resolved at creation time
    user_name: str | None = None
    user_email: str | None = None
    sla_window: str | None = None
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


# ── Comment ──────────────────────────────────────────────────────────────────

class TicketCommentCreate(BaseModel):
    content: str
    is_resolution: bool = False    # True → also advances to next step


# ── Update (partial — only creator can update) ───────────────────────────────

class TicketUpdate(BaseModel):
    priority: Literal["critical", "high", "medium", "low"] | None = None
    sla_deadline: datetime | None = None
    description: str | None = None
    po_risk_amount: Decimal | None = None


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
    closed_at: datetime | None
    created_at: datetime | None
    updated_at: datetime | None
    # enriched on detail fetch
    consultants: list[ConsultantSummary] = []
    comments: list[TicketCommentResponse] = []
    activity_log: list[ActivityLogResponse] = []

    class Config:
        from_attributes = True
