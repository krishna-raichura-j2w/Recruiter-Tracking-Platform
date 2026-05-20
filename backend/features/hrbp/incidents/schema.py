from __future__ import annotations
from typing import Literal, Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel

RiskLevel    = Literal["red", "amber", "green"]
IncidentStatus = Literal["open", "in_progress", "escalated", "resolved", "closed"]
IncidentSource = Literal["email", "manual", "signal", "scheduler"]


class IncidentCreate(BaseModel):
    consultant_id:   UUID
    client_id:       UUID
    opened_by:       UUID
    sop_type:        str
    kra_tags:        Optional[list[str]]      = None
    risk_level:      Optional[RiskLevel]      = None
    description:     Optional[str]            = None
    source:          Optional[IncidentSource] = None
    source_email_id: Optional[UUID]           = None


class IncidentUpdate(BaseModel):
    status:          Optional[IncidentStatus] = None
    risk_level:      Optional[RiskLevel]      = None
    current_step:    Optional[int]            = None
    description:     Optional[str]            = None
    kra_tags:        Optional[list[str]]      = None
    resolved_at:     Optional[datetime]       = None


class IncidentResponse(BaseModel):
    id:              UUID
    ticket_ref:      Optional[str]
    consultant_id:   UUID
    client_id:       UUID
    opened_by:       UUID
    sop_type:        str
    kra_tags:        Optional[list[str]]
    risk_level:      Optional[str]
    status:          Optional[str]
    current_step:    Optional[int]
    description:     Optional[str]
    source:          Optional[str]
    source_email_id: Optional[UUID]
    opened_at:       Optional[datetime]
    resolved_at:     Optional[datetime]
    created_at:      Optional[datetime]
    updated_at:      Optional[datetime]

    class Config:
        from_attributes = True
