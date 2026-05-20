from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class KraDefinitionCreate(BaseModel):
    kra_code: str
    name: str
    description: str | None = None
    what_you_own: str | None = None
    target: str | None = None
    revenue_consequence: str | None = None
    control_level: Literal["HIGH", "LOW"] | None = None
    sop_refs: list[str] | None = None


class KraDefinitionUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    what_you_own: str | None = None
    target: str | None = None
    revenue_consequence: str | None = None
    control_level: Literal["HIGH", "LOW"] | None = None
    sop_refs: list[str] | None = None


class KraDefinitionResponse(BaseModel):
    id: int
    kra_code: str
    name: str
    description: str | None
    what_you_own: str | None
    target: str | None
    revenue_consequence: str | None
    control_level: str | None
    sop_refs: list[str] | None
    created_at: datetime | None

    class Config:
        from_attributes = True
