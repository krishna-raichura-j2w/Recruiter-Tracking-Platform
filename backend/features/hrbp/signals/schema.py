from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

SignalType = Literal[
    "s2_performance",
    "s3_bh_feedback",
    "s4_behaviour",
    "s5_upsell",
    "s6_resignation",
    "s7_conversion",
]


class SignalCreate(BaseModel):
    consultant_id: int
    logged_by: int
    signal_type: SignalType
    description: str
    risk_score: int | None = None
    action_taken: str | None = None
    incident_id: int | None = None


class SignalUpdate(BaseModel):
    action_taken: str | None = None
    incident_id: int | None = None
    risk_score: int | None = None


class SignalResponse(BaseModel):
    id: int
    consultant_id: int
    logged_by: int
    signal_type: str
    description: str
    risk_score: int | None
    action_taken: str | None
    incident_id: int | None
    logged_at: datetime | None

    class Config:
        from_attributes = True
