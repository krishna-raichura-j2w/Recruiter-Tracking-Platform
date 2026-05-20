from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

TaskType = Literal[
    "day1_intro",
    "day15_connect",
    "day45_lock",
    "day60_tier",
    "day90_review",
    "biweekly_checkin",
    "monthly_bh_call",
    "monthly_nps",
    "quarterly_deep_dive",
    "hike_flag",
    "contract_flag",
    "nps_action",
]
ScheduleStatus = Literal["pending", "done", "overdue", "skipped"]


class RoutineScheduleCreate(BaseModel):
    consultant_id: int
    assigned_to: int
    task_type: TaskType
    due_at: datetime
    sop_ref: str | None = None
    kra_ref: str | None = None
    email_template_id: str | None = None
    recurrence_days: int | None = None
    next_due_at: datetime | None = None


class RoutineScheduleUpdate(BaseModel):
    status: ScheduleStatus | None = None
    completed_at: datetime | None = None
    completed_by: int | None = None
    next_due_at: datetime | None = None
    recurrence_days: int | None = None


class RoutineScheduleResponse(BaseModel):
    id: int
    consultant_id: int
    assigned_to: int
    task_type: str
    sop_ref: str | None
    kra_ref: str | None
    email_template_id: str | None
    due_at: datetime
    completed_at: datetime | None
    completed_by: int | None
    status: str | None
    recurrence_days: int | None
    next_due_at: datetime | None
    created_at: datetime | None
    updated_at: datetime | None

    class Config:
        from_attributes = True
