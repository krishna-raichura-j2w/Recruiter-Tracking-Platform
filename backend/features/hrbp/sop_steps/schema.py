from __future__ import annotations
from typing import Literal, Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel

StepStatus = Literal["pending", "active", "done", "overdue", "escalated", "skipped"]


class SopStepCreate(BaseModel):
    incident_id:       UUID
    step_number:       int
    action_label:      str
    owner_role:        str
    sla_working_hours: int
    action_detail:     Optional[str]      = None
    owner_user_id:     Optional[UUID]     = None
    due_at:            Optional[datetime] = None
    email_template_id: Optional[str]      = None
    hard_gate:         Optional[str]      = None
    kra_ref:           Optional[str]      = None


class SopStepUpdate(BaseModel):
    status:             Optional[StepStatus] = None
    completion_notes:   Optional[str]        = None
    completed_by:       Optional[UUID]       = None
    completed_at:       Optional[datetime]   = None
    started_at:         Optional[datetime]   = None
    escalated_at:       Optional[datetime]   = None
    escalated_to_role:  Optional[str]        = None
    escalated_to_user:  Optional[UUID]       = None
    hard_gate_cleared:  Optional[bool]       = None
    due_at:             Optional[datetime]   = None
    owner_user_id:      Optional[UUID]       = None


class SopStepResponse(BaseModel):
    id:                UUID
    incident_id:       UUID
    step_number:       int
    action_label:      str
    action_detail:     Optional[str]
    owner_role:        str
    owner_user_id:     Optional[UUID]
    sla_working_hours: int
    due_at:            Optional[datetime]
    started_at:        Optional[datetime]
    completed_at:      Optional[datetime]
    escalated_at:      Optional[datetime]
    escalated_to_role: Optional[str]
    escalated_to_user: Optional[UUID]
    status:            Optional[str]
    completion_notes:  Optional[str]
    completed_by:      Optional[UUID]
    email_template_id: Optional[str]
    hard_gate:         Optional[str]
    hard_gate_cleared: Optional[bool]
    kra_ref:           Optional[str]
    created_at:        Optional[datetime]
    updated_at:        Optional[datetime]

    class Config:
        from_attributes = True
