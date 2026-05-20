from __future__ import annotations
from typing import Any, Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    id:          UUID
    entity_type: str
    entity_id:   UUID
    action:      str
    actor_id:    Optional[UUID]
    old_value:   Optional[Any]
    new_value:   Optional[Any]
    ts:          Optional[datetime]

    class Config:
        from_attributes = True
