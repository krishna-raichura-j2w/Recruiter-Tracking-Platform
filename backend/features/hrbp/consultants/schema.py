from __future__ import annotations
from decimal import Decimal
from typing import Literal, Optional
from uuid import UUID
from datetime import date, datetime
from pydantic import BaseModel

CohortType   = Literal["star","high_performer","rising","bedrock","new_joiner","watch_exit","watch_rate_rev","watch_general","rescue"]
PerfTierType = Literal["top_20","mid_60","bottom_20","unrated"]
BhFeedback   = Literal["great","good","mediocre","bad","not_given"]
LDStatus     = Literal["enrolled","not_started","completed","pending"]


class ConsultantCreate(BaseModel):
    emp_id:         str
    name:           str
    client_id:      UUID
    hrbp_id:        UUID
    email:          Optional[str]         = None
    phone:          Optional[str]         = None
    manager_name:   Optional[str]         = None
    modality:       Optional[str]         = None
    skill:          Optional[str]         = None
    cohort:         Optional[CohortType]  = None
    perf_tier:      Optional[PerfTierType]= None
    monthly_po:     Optional[Decimal]     = None
    monthly_ctc:    Optional[Decimal]     = None
    po_end_date:    Optional[date]        = None
    join_date:      Optional[date]        = None
    bh_feedback:    Optional[BhFeedback]  = None
    nps_score:      Optional[int]         = None
    last_hike_date: Optional[date]        = None
    last_hike_pct:  Optional[Decimal]     = None
    l_d_status:     Optional[LDStatus]    = None
    is_active:      bool                  = True


class ConsultantUpdate(BaseModel):
    name:           Optional[str]         = None
    client_id:      Optional[UUID]        = None
    hrbp_id:        Optional[UUID]        = None
    email:          Optional[str]         = None
    phone:          Optional[str]         = None
    manager_name:   Optional[str]         = None
    modality:       Optional[str]         = None
    skill:          Optional[str]         = None
    cohort:         Optional[CohortType]  = None
    perf_tier:      Optional[PerfTierType]= None
    monthly_po:     Optional[Decimal]     = None
    monthly_ctc:    Optional[Decimal]     = None
    po_end_date:    Optional[date]        = None
    join_date:      Optional[date]        = None
    bh_feedback:    Optional[BhFeedback]  = None
    nps_score:      Optional[int]         = None
    last_hike_date: Optional[date]        = None
    last_hike_pct:  Optional[Decimal]     = None
    l_d_status:     Optional[LDStatus]    = None
    is_active:      Optional[bool]        = None


class ConsultantResponse(BaseModel):
    id:             UUID
    emp_id:         str
    name:           str
    email:          Optional[str]
    phone:          Optional[str]
    client_id:      UUID
    hrbp_id:        UUID
    manager_name:   Optional[str]
    modality:       Optional[str]
    skill:          Optional[str]
    cohort:         Optional[str]
    perf_tier:      Optional[str]
    monthly_po:     Optional[Decimal]
    monthly_ctc:    Optional[Decimal]
    po_end_date:    Optional[date]
    join_date:      Optional[date]
    bh_feedback:    Optional[str]
    nps_score:      Optional[int]
    last_hike_date: Optional[date]
    last_hike_pct:  Optional[Decimal]
    l_d_status:     Optional[str]
    is_active:      bool
    created_at:     Optional[datetime]
    updated_at:     Optional[datetime]

    class Config:
        from_attributes = True
