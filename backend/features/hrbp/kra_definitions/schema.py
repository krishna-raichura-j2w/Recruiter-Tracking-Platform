from __future__ import annotations
from typing import Literal, Optional
from datetime import datetime
from pydantic import BaseModel


class KraDefinitionCreate(BaseModel):
    kra_code:            str
    name:                str
    description:         Optional[str] = None
    what_you_own:        Optional[str] = None
    target:              Optional[str] = None
    revenue_consequence: Optional[str] = None
    control_level:       Optional[Literal["HIGH", "LOW"]] = None
    sop_refs:            Optional[list[str]] = None


class KraDefinitionUpdate(BaseModel):
    name:                Optional[str] = None
    description:         Optional[str] = None
    what_you_own:        Optional[str] = None
    target:              Optional[str] = None
    revenue_consequence: Optional[str] = None
    control_level:       Optional[Literal["HIGH", "LOW"]] = None
    sop_refs:            Optional[list[str]] = None


class KraDefinitionResponse(BaseModel):
    id:                  int
    kra_code:            str
    name:                str
    description:         Optional[str]
    what_you_own:        Optional[str]
    target:              Optional[str]
    revenue_consequence: Optional[str]
    control_level:       Optional[str]
    sop_refs:            Optional[list[str]]
    created_at:          Optional[datetime]

    class Config:
        from_attributes = True
