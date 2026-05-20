from __future__ import annotations
from typing import Optional
from datetime import datetime
from pydantic import BaseModel


class ClientCreate(BaseModel):
    name:      str
    industry:  Optional[str] = None
    bh_id:     Optional[int] = None
    hrbp_id:   Optional[int] = None
    is_active: bool          = True


class ClientUpdate(BaseModel):
    name:      Optional[str]  = None
    industry:  Optional[str]  = None
    bh_id:     Optional[int] = None
    hrbp_id:   Optional[int] = None
    is_active: Optional[bool] = None


class ClientResponse(BaseModel):
    id:         int
    name:       str
    industry:   Optional[str]
    bh_id:      Optional[int]
    hrbp_id:    Optional[int]
    is_active:  bool
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True
