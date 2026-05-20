from __future__ import annotations
from typing import Literal, Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel

EmailDirection = Literal["inbound", "outbound"]


class EmailCreate(BaseModel):
    direction:       EmailDirection
    from_address:    str
    to_addresses:    list[str]
    consultant_id:   Optional[UUID]      = None
    incident_id:     Optional[UUID]      = None
    cc_addresses:    Optional[list[str]] = None
    subject:         Optional[str]       = None
    body_raw:        Optional[str]       = None
    body_parsed:     Optional[str]       = None
    template_id:     Optional[str]       = None
    intent:          Optional[str]       = None
    sop_type_mapped: Optional[str]       = None
    sent_at:         Optional[datetime]  = None
    received_at:     Optional[datetime]  = None
    outlook_msg_id:  Optional[str]       = None


class EmailUpdate(BaseModel):
    processed:       Optional[bool]  = None
    intent:          Optional[str]   = None
    sop_type_mapped: Optional[str]   = None
    incident_id:     Optional[UUID]  = None
    consultant_id:   Optional[UUID]  = None
    body_parsed:     Optional[str]   = None


class EmailResponse(BaseModel):
    id:              UUID
    direction:       str
    consultant_id:   Optional[UUID]
    incident_id:     Optional[UUID]
    from_address:    str
    to_addresses:    list[str]
    cc_addresses:    Optional[list[str]]
    subject:         Optional[str]
    body_raw:        Optional[str]
    body_parsed:     Optional[str]
    template_id:     Optional[str]
    intent:          Optional[str]
    sop_type_mapped: Optional[str]
    sent_at:         Optional[datetime]
    received_at:     Optional[datetime]
    processed:       Optional[bool]
    outlook_msg_id:  Optional[str]
    created_at:      Optional[datetime]

    class Config:
        from_attributes = True
