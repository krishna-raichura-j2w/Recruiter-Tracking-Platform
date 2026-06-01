from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class SetupUpsert(BaseModel):
    month: str
    net_po_target: int = 100
    exit_budget: int = 5
    working_days: int = 22
    target_selects_month: int = 50
    sel_ob_rate: float = 0.8
    subs_per_recruiter_day: int = 6
    num_recruiters: int = 16
    interviews_per_kam_day: int = 12
    num_kams: int = 4
    week_weights: list[float] = [20, 20, 20, 20, 20]
    custom_working_days: list[str] | None = None


class CustomerUpsert(BaseModel):
    customer_name: str
    client_id: int | None = None
    net_po_target_cust: int = 0
    exit_alloc: int = 0
    avg_po_per_ob: float = 3.5
    open_demand_pool: int = 0
    repeat_demand_pct: float = 0.5
    subs_repeat: int = 0
    subs_new_phase1: int = 0
    subs_new_phase2: int = 0
    target_interviews_day: int = 0
    int_sel_target: float = 0.15
    display_order: int = 0


class RecruiterAssignment(BaseModel):
    user_id: int
    primary_customer_id: int | None = None
    secondary_customer_id: int | None = None
    subs_per_day: int = 6
    primary_subs: int | None = None


class RecruitersBulk(BaseModel):
    assignments: list[RecruiterAssignment]


class KAMAssignment(BaseModel):
    user_id: int
    customer_targets: dict[str, int] = {}
    tat_focus: str = ""
    key_action: str = ""


class KAMsBulk(BaseModel):
    assignments: list[KAMAssignment]


class WeeklyOBEntry(BaseModel):
    customer_target_id: int
    week_num: int
    week_label: str
    week_start: str
    week_end: str
    ob_target: int = 0


class WeeklyOBBulk(BaseModel):
    entries: list[WeeklyOBEntry]


class DailyActualEntry(BaseModel):
    customer_target_id: int
    actual_subs: int = 0
    actual_interviews: int = 0
    actual_selects: int = 0
    actual_obs: int = 0


class DailyActualsBulk(BaseModel):
    entries: list[DailyActualEntry]
