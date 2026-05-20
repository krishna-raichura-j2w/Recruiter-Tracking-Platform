from __future__ import annotations
from typing import Literal, Optional
from datetime import datetime
from pydantic import BaseModel

GroupName      = Literal["routine", "incident", "commercial", "medical"]
SendDirection  = Literal[
    "hrbp_to_consultant", "hrbp_to_bh", "hrbp_to_ops_head",
    "hrbp_to_finance", "hrbp_to_family", "bh_to_client", "finance_to_hospital",
]


class EmailTemplateCreate(BaseModel):
    id:              str
    name:            str
    group_name:      GroupName
    channel:         list[str]
    subject_tpl:     Optional[str] = None
    body_tpl:        str
    required_vars:   Optional[list[str]] = None
    forbidden_words: Optional[list[str]] = None
    locked_cc:       Optional[list[str]] = None
    sop_step_ref:    Optional[list[str]] = None
    kra_ref:         Optional[list[str]] = None
    send_direction:  SendDirection


class EmailTemplateUpdate(BaseModel):
    name:            Optional[str] = None
    group_name:      Optional[GroupName] = None
    channel:         Optional[list[str]] = None
    subject_tpl:     Optional[str] = None
    body_tpl:        Optional[str] = None
    required_vars:   Optional[list[str]] = None
    forbidden_words: Optional[list[str]] = None
    locked_cc:       Optional[list[str]] = None
    sop_step_ref:    Optional[list[str]] = None
    kra_ref:         Optional[list[str]] = None
    send_direction:  Optional[SendDirection] = None


class EmailTemplateResponse(BaseModel):
    id:              str
    name:            str
    group_name:      str
    channel:         list[str]
    subject_tpl:     Optional[str]
    body_tpl:        str
    required_vars:   Optional[list[str]]
    forbidden_words: Optional[list[str]]
    locked_cc:       Optional[list[str]]
    sop_step_ref:    Optional[list[str]]
    kra_ref:         Optional[list[str]]
    send_direction:  str
    created_at:      Optional[datetime]
    updated_at:      Optional[datetime]

    class Config:
        from_attributes = True


class RenderRequest(BaseModel):
    consultant_id: str


class RenderResponse(BaseModel):
    subject:    Optional[str]
    body:       str
    to:         Optional[str]
    cc:         list[str]
    locked_cc:  list[str]
