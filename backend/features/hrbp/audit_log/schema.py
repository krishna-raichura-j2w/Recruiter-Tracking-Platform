from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    id: int
    entity_type: str
    entity_id: int
    action: str
    actor_id: int | None
    old_value: Any | None
    new_value: Any | None
    ts: datetime | None

    class Config:
        from_attributes = True
