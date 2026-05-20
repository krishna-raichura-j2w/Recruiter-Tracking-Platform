from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

EmailDirection = Literal["inbound", "outbound"]


class EmailCreate(BaseModel):
    direction: EmailDirection
    from_address: str
    to_addresses: list[str]
    consultant_id: int | None = None
    incident_id: int | None = None
    cc_addresses: list[str] | None = None
    subject: str | None = None
    body_raw: str | None = None
    body_parsed: str | None = None
    template_id: str | None = None
    intent: str | None = None
    sop_type_mapped: str | None = None
    sent_at: datetime | None = None
    received_at: datetime | None = None
    outlook_msg_id: str | None = None


class EmailUpdate(BaseModel):
    processed: bool | None = None
    intent: str | None = None
    sop_type_mapped: str | None = None
    incident_id: int | None = None
    consultant_id: int | None = None
    body_parsed: str | None = None


class EmailResponse(BaseModel):
    id: int
    direction: str
    consultant_id: int | None
    incident_id: int | None
    from_address: str
    to_addresses: list[str]
    cc_addresses: list[str] | None
    subject: str | None
    body_raw: str | None
    body_parsed: str | None
    template_id: str | None
    intent: str | None
    sop_type_mapped: str | None
    sent_at: datetime | None
    received_at: datetime | None
    processed: bool | None
    outlook_msg_id: str | None
    created_at: datetime | None

    class Config:
        from_attributes = True
