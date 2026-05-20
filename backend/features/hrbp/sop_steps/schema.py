from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

StepStatus = Literal["pending", "active", "done", "overdue", "escalated", "skipped"]


class SopStepCreate(BaseModel):
    incident_id: int
    step_number: int
    action_label: str
    owner_role: str
    sla_working_hours: int
    action_detail: str | None = None
    owner_user_id: int | None = None
    due_at: datetime | None = None
    email_template_id: str | None = None
    hard_gate: str | None = None
    kra_ref: str | None = None


class SopStepUpdate(BaseModel):
    status: StepStatus | None = None
    completion_notes: str | None = None
    completed_by: int | None = None
    completed_at: datetime | None = None
    started_at: datetime | None = None
    escalated_at: datetime | None = None
    escalated_to_role: str | None = None
    escalated_to_user: int | None = None
    hard_gate_cleared: bool | None = None
    due_at: datetime | None = None
    owner_user_id: int | None = None


class SopStepResponse(BaseModel):
    id: int
    incident_id: int
    step_number: int
    action_label: str
    action_detail: str | None
    owner_role: str
    owner_user_id: int | None
    sla_working_hours: int
    due_at: datetime | None
    started_at: datetime | None
    completed_at: datetime | None
    escalated_at: datetime | None
    escalated_to_role: str | None
    escalated_to_user: int | None
    status: str | None
    completion_notes: str | None
    completed_by: int | None
    email_template_id: str | None
    hard_gate: str | None
    hard_gate_cleared: bool | None
    kra_ref: str | None
    created_at: datetime | None
    updated_at: datetime | None

    class Config:
        from_attributes = True
