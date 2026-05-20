from __future__ import annotations
from typing import Literal, Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel

SignalType = Literal[
    "s2_performance", "s3_bh_feedback", "s4_behaviour",
    "s5_upsell", "s6_resignation", "s7_conversion",
]


class SignalCreate(BaseModel):
    consultant_id: UUID
    logged_by:     UUID
    signal_type:   SignalType
    description:   str
    risk_score:    Optional[int]  = None
    action_taken:  Optional[str]  = None
    incident_id:   Optional[UUID] = None


class SignalUpdate(BaseModel):
    action_taken: Optional[str]  = None
    incident_id:  Optional[UUID] = None
    risk_score:   Optional[int]  = None


class SignalResponse(BaseModel):
    id:            UUID
    consultant_id: UUID
    logged_by:     UUID
    signal_type:   str
    description:   str
    risk_score:    Optional[int]
    action_taken:  Optional[str]
    incident_id:   Optional[UUID]
    logged_at:     Optional[datetime]

    class Config:
        from_attributes = True
