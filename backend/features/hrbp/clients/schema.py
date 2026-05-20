from __future__ import annotations
from typing import Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel


class ClientCreate(BaseModel):
    name:      str
    industry:  Optional[str] = None
    bh_id:     Optional[UUID] = None
    hrbp_id:   Optional[UUID] = None
    is_active: bool          = True


class ClientUpdate(BaseModel):
    name:      Optional[str]  = None
    industry:  Optional[str]  = None
    bh_id:     Optional[UUID] = None
    hrbp_id:   Optional[UUID] = None
    is_active: Optional[bool] = None


class ClientResponse(BaseModel):
    id:         UUID
    name:       str
    industry:   Optional[str]
    bh_id:      Optional[UUID]
    hrbp_id:    Optional[UUID]
    is_active:  bool
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True
