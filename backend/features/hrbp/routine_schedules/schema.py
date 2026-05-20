from __future__ import annotations
from typing import Literal, Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel

TaskType = Literal[
    "day1_intro", "day15_connect", "day45_lock", "day60_tier", "day90_review",
    "biweekly_checkin", "monthly_bh_call", "monthly_nps",
    "quarterly_deep_dive", "hike_flag", "contract_flag", "nps_action",
]
ScheduleStatus = Literal["pending", "done", "overdue", "skipped"]


class RoutineScheduleCreate(BaseModel):
    consultant_id:     UUID
    assigned_to:       UUID
    task_type:         TaskType
    due_at:            datetime
    sop_ref:           Optional[str]            = None
    kra_ref:           Optional[str]            = None
    email_template_id: Optional[str]            = None
    recurrence_days:   Optional[int]            = None
    next_due_at:       Optional[datetime]       = None


class RoutineScheduleUpdate(BaseModel):
    status:          Optional[ScheduleStatus] = None
    completed_at:    Optional[datetime]       = None
    completed_by:    Optional[UUID]           = None
    next_due_at:     Optional[datetime]       = None
    recurrence_days: Optional[int]            = None


class RoutineScheduleResponse(BaseModel):
    id:                UUID
    consultant_id:     UUID
    assigned_to:       UUID
    task_type:         str
    sop_ref:           Optional[str]
    kra_ref:           Optional[str]
    email_template_id: Optional[str]
    due_at:            datetime
    completed_at:      Optional[datetime]
    completed_by:      Optional[UUID]
    status:            Optional[str]
    recurrence_days:   Optional[int]
    next_due_at:       Optional[datetime]
    created_at:        Optional[datetime]
    updated_at:        Optional[datetime]

    class Config:
        from_attributes = True
