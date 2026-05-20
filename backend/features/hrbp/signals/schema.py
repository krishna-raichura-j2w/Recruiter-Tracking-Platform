from __future__ import annotations
from typing import Literal, Optional
from datetime import datetime
from pydantic import BaseModel

SignalType = Literal[
    "s2_performance", "s3_bh_feedback", "s4_behaviour",
    "s5_upsell", "s6_resignation", "s7_conversion",
]


class SignalCreate(BaseModel):
    consultant_id: int
    logged_by:     int
    signal_type:   SignalType
    description:   str
    risk_score:    Optional[int]  = None
    action_taken:  Optional[str]  = None
    incident_id:   Optional[int] = None


class SignalUpdate(BaseModel):
    action_taken: Optional[str]  = None
    incident_id:  Optional[int] = None
    risk_score:   Optional[int]  = None


class SignalResponse(BaseModel):
    id:            int
    consultant_id: int
    logged_by:     int
    signal_type:   str
    description:   str
    risk_score:    Optional[int]
    action_taken:  Optional[str]
    incident_id:   Optional[int]
    logged_at:     Optional[datetime]

    class Config:
        from_attributes = True
