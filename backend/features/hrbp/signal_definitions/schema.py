from __future__ import annotations
from typing import Literal, Optional
from datetime import datetime
from pydantic import BaseModel

Urgency = Literal["immediate", "same_day", "monitor"]


class SignalDefinitionCreate(BaseModel):
    signal_code:      str
    number:           str
    name:             str
    source:           str
    description:      Optional[str] = None
    indicators:       list[str]
    auto_action:      Optional[str] = None
    auto_sop_trigger: Optional[str] = None
    threshold_count:  Optional[int] = None
    urgency:          Optional[Urgency] = None


class SignalDefinitionUpdate(BaseModel):
    number:           Optional[str] = None
    name:             Optional[str] = None
    source:           Optional[str] = None
    description:      Optional[str] = None
    indicators:       Optional[list[str]] = None
    auto_action:      Optional[str] = None
    auto_sop_trigger: Optional[str] = None
    threshold_count:  Optional[int] = None
    urgency:          Optional[Urgency] = None


class SignalDefinitionResponse(BaseModel):
    id:               int
    signal_code:      str
    number:           str
    name:             str
    source:           str
    description:      Optional[str]
    indicators:       list[str]
    auto_action:      Optional[str]
    auto_sop_trigger: Optional[str]
    threshold_count:  Optional[int]
    urgency:          Optional[str]
    created_at:       Optional[datetime]

    class Config:
        from_attributes = True
