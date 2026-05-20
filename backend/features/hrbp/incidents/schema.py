from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

RiskLevel = Literal["red", "amber", "green"]
IncidentStatus = Literal["open", "in_progress", "escalated", "resolved", "closed"]
IncidentSource = Literal["email", "manual", "signal", "scheduler"]


class IncidentCreate(BaseModel):
    consultant_id: int
    client_id: int
    opened_by: int
    sop_type: str
    kra_tags: list[str] | None = None
    risk_level: RiskLevel | None = None
    description: str | None = None
    source: IncidentSource | None = None
    source_email_id: int | None = None


class IncidentUpdate(BaseModel):
    status: IncidentStatus | None = None
    risk_level: RiskLevel | None = None
    current_step: int | None = None
    description: str | None = None
    kra_tags: list[str] | None = None
    resolved_at: datetime | None = None


class IncidentResponse(BaseModel):
    id: int
    ticket_ref: str | None
    consultant_id: int
    client_id: int
    opened_by: int
    sop_type: str
    kra_tags: list[str] | None
    risk_level: str | None
    status: str | None
    current_step: int | None
    description: str | None
    source: str | None
    source_email_id: int | None
    opened_at: datetime | None
    resolved_at: datetime | None
    created_at: datetime | None
    updated_at: datetime | None

    class Config:
        from_attributes = True
