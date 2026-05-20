from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

Urgency = Literal["immediate", "same_day", "monitor"]


class SignalDefinitionCreate(BaseModel):
    signal_code: str
    number: str
    name: str
    source: str
    description: str | None = None
    indicators: list[str]
    auto_action: str | None = None
    auto_sop_trigger: str | None = None
    threshold_count: int | None = None
    urgency: Urgency | None = None


class SignalDefinitionUpdate(BaseModel):
    number: str | None = None
    name: str | None = None
    source: str | None = None
    description: str | None = None
    indicators: list[str] | None = None
    auto_action: str | None = None
    auto_sop_trigger: str | None = None
    threshold_count: int | None = None
    urgency: Urgency | None = None


class SignalDefinitionResponse(BaseModel):
    id: int
    signal_code: str
    number: str
    name: str
    source: str
    description: str | None
    indicators: list[str]
    auto_action: str | None
    auto_sop_trigger: str | None
    threshold_count: int | None
    urgency: str | None
    created_at: datetime | None

    class Config:
        from_attributes = True
