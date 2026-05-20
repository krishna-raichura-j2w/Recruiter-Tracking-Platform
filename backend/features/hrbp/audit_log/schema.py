from __future__ import annotations
from typing import Any, Optional
from datetime import datetime
from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    id:          int
    entity_type: str
    entity_id:   int
    action:      str
    actor_id:    Optional[int]
    old_value:   Optional[Any]
    new_value:   Optional[Any]
    ts:          Optional[datetime]

    class Config:
        from_attributes = True
