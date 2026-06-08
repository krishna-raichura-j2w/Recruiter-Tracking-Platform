from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class CustomerCreate(BaseModel):
    client_id: int
    bucket: Optional[str] = None
    bh_user_id: Optional[int] = None
    consolidated_net_po_rl: Optional[float] = None


class CustomerUpdate(BaseModel):
    client_id: Optional[int] = None
    bucket: Optional[str] = None
    bh_user_id: Optional[int] = None
    consolidated_net_po_rl: Optional[float] = None


class EffortLineCreate(BaseModel):
    effort_line: Optional[str] = None
    leadership_contact: Optional[str] = None
    opportunity_type: Optional[str] = None
    track: Optional[str] = None
    target_rl: Optional[float] = None
    budget: Optional[str] = None
    bottleneck: Optional[str] = None
    escalation: Optional[str] = None
    current_hc: Optional[int] = None
    six_mo_delta_hc: Optional[int] = None
    six_mo_delta_net_po_rl: Optional[float] = None
    stage: Optional[str] = None
    ldr_mtg: Optional[str] = None
    mtg_date: Optional[str] = None
    next_action: Optional[str] = None
    due_date: Optional[str] = None
    status: Optional[str] = "Not Started"
    comments: Optional[str] = None


class EffortLineUpdate(BaseModel):
    effort_line: Optional[str] = None
    leadership_contact: Optional[str] = None
    opportunity_type: Optional[str] = None
    track: Optional[str] = None
    target_rl: Optional[float] = None
    budget: Optional[str] = None
    bottleneck: Optional[str] = None
    escalation: Optional[str] = None
    current_hc: Optional[int] = None
    six_mo_delta_hc: Optional[int] = None
    six_mo_delta_net_po_rl: Optional[float] = None
    stage: Optional[str] = None
    ldr_mtg: Optional[str] = None
    mtg_date: Optional[str] = None
    next_action: Optional[str] = None
    due_date: Optional[str] = None
    status: Optional[str] = None
    comments: Optional[str] = None
