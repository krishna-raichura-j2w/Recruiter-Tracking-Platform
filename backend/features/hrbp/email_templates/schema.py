from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

GroupName = Literal["routine", "incident", "commercial", "medical"]
SendDirection = Literal[
    "hrbp_to_consultant",
    "hrbp_to_bh",
    "hrbp_to_ops_head",
    "hrbp_to_finance",
    "hrbp_to_family",
    "bh_to_client",
    "finance_to_hospital",
]


class EmailTemplateCreate(BaseModel):
    id: str
    name: str
    group_name: GroupName
    channel: list[str]
    subject_tpl: str | None = None
    body_tpl: str
    required_vars: list[str] | None = None
    forbidden_words: list[str] | None = None
    locked_cc: list[str] | None = None
    sop_step_ref: list[str] | None = None
    kra_ref: list[str] | None = None
    send_direction: SendDirection


class EmailTemplateUpdate(BaseModel):
    name: str | None = None
    group_name: GroupName | None = None
    channel: list[str] | None = None
    subject_tpl: str | None = None
    body_tpl: str | None = None
    required_vars: list[str] | None = None
    forbidden_words: list[str] | None = None
    locked_cc: list[str] | None = None
    sop_step_ref: list[str] | None = None
    kra_ref: list[str] | None = None
    send_direction: SendDirection | None = None


class EmailTemplateResponse(BaseModel):
    id: str
    name: str
    group_name: str
    channel: list[str]
    subject_tpl: str | None
    body_tpl: str
    required_vars: list[str] | None
    forbidden_words: list[str] | None
    locked_cc: list[str] | None
    sop_step_ref: list[str] | None
    kra_ref: list[str] | None
    send_direction: str
    created_at: datetime | None
    updated_at: datetime | None

    class Config:
        from_attributes = True


class RenderRequest(BaseModel):
    consultant_id: str


class RenderResponse(BaseModel):
    subject: str | None
    body: str
    to: str | None
    cc: list[str]
    locked_cc: list[str]
