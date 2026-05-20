from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel

ControlLevel = Literal["HIGH", "MEDIUM", "LOW"]


class SopDefinitionCreate(BaseModel):
    sop_type: str
    number: str
    name: str
    description: str | None = None
    trigger_source: str
    kra_tags: list[str] | None = None
    control_level: ControlLevel
    email_templates: list[str] | None = None
    persons_hierarchy: Any
    steps_definition: Any


class SopDefinitionUpdate(BaseModel):
    number: str | None = None
    name: str | None = None
    description: str | None = None
    trigger_source: str | None = None
    kra_tags: list[str] | None = None
    control_level: ControlLevel | None = None
    email_templates: list[str] | None = None
    persons_hierarchy: Any | None = None
    steps_definition: Any | None = None


class SopDefinitionResponse(BaseModel):
    id: int
    sop_type: str
    number: str
    name: str
    description: str | None
    trigger_source: str
    kra_tags: list[str] | None
    control_level: str
    email_templates: list[str] | None
    persons_hierarchy: Any
    steps_definition: Any
    created_at: datetime | None

    class Config:
        from_attributes = True
