from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

CohortType = Literal[
    "star",
    "high_performer",
    "rising",
    "bedrock",
    "new_joiner",
    "watch_exit",
    "watch_rate_rev",
    "watch_general",
    "rescue",
]
PerfTierType = Literal["top_20", "mid_60", "bottom_20", "unrated"]
BhFeedback = Literal["great", "good", "mediocre", "bad", "not_given"]
LDStatus = Literal["enrolled", "not_started", "completed", "pending"]


class ConsultantCreate(BaseModel):
    emp_id: str
    name: str
    client_id: int
    hrbp_id: int
    email: str | None = None
    phone: str | None = None
    manager_name: str | None = None
    modality: str | None = None
    skill: str | None = None
    cohort: CohortType | None = None
    perf_tier: PerfTierType | None = None
    monthly_po: Decimal | None = None
    monthly_ctc: Decimal | None = None
    yearly_ctc: Decimal | None = None
    designation: str | None = None
    margin: Decimal | None = None
    po_end_date: date | None = None
    join_date: date | None = None
    bh_feedback: BhFeedback | None = None
    nps_score: int | None = None
    last_hike_date: date | None = None
    last_hike_pct: Decimal | None = None
    l_d_status: LDStatus | None = None
    is_active: bool = True


class ConsultantUpdate(BaseModel):
    name: str | None = None
    client_id: int | None = None
    hrbp_id: int | None = None
    email: str | None = None
    phone: str | None = None
    manager_name: str | None = None
    modality: str | None = None
    designation: str | None = None
    skill: str | None = None
    cohort: CohortType | None = None
    perf_tier: PerfTierType | None = None
    monthly_po: Decimal | None = None
    monthly_ctc: Decimal | None = None
    yearly_ctc: Decimal | None = None
    margin: Decimal | None = None
    po_end_date: date | None = None
    join_date: date | None = None
    bh_feedback: BhFeedback | None = None
    nps_score: int | None = None
    last_hike_date: date | None = None
    last_hike_pct: Decimal | None = None
    l_d_status: LDStatus | None = None
    is_active: bool | None = None
    po_risk: Decimal | None = None


class ConsultantResponse(BaseModel):
    id: int
    emp_id: str
    name: str
    email: str | None
    phone: str | None
    client_id: int
    hrbp_id: int
    manager_name: str | None
    modality: str | None
    designation: str | None
    skill: str | None
    cohort: str | None
    perf_tier: str | None
    monthly_po: Decimal | None
    monthly_ctc: Decimal | None
    yearly_ctc: Decimal | None
    margin: Decimal | None
    po_end_date: date | None
    join_date: date | None
    bh_feedback: str | None
    nps_score: int | None
    last_hike_date: date | None
    last_hike_pct: Decimal | None
    l_d_status: str | None
    po_risk: Decimal | None
    is_active: bool
    created_at: datetime | None
    updated_at: datetime | None

    class Config:
        from_attributes = True
