from __future__ import annotations
from typing import Any, Literal, Optional
from datetime import datetime
from pydantic import BaseModel

ControlLevel = Literal["HIGH", "MEDIUM", "LOW"]


class SopDefinitionCreate(BaseModel):
    sop_type:          str
    number:            str
    name:              str
    description:       Optional[str] = None
    trigger_source:    str
    kra_tags:          Optional[list[str]] = None
    control_level:     ControlLevel
    email_templates:   Optional[list[str]] = None
    persons_hierarchy: Any
    steps_definition:  Any


class SopDefinitionUpdate(BaseModel):
    number:            Optional[str] = None
    name:              Optional[str] = None
    description:       Optional[str] = None
    trigger_source:    Optional[str] = None
    kra_tags:          Optional[list[str]] = None
    control_level:     Optional[ControlLevel] = None
    email_templates:   Optional[list[str]] = None
    persons_hierarchy: Optional[Any] = None
    steps_definition:  Optional[Any] = None


class SopDefinitionResponse(BaseModel):
    id:                int
    sop_type:          str
    number:            str
    name:              str
    description:       Optional[str]
    trigger_source:    str
    kra_tags:          Optional[list[str]]
    control_level:     str
    email_templates:   Optional[list[str]]
    persons_hierarchy: Any
    steps_definition:  Any
    created_at:        Optional[datetime]

    class Config:
        from_attributes = True
