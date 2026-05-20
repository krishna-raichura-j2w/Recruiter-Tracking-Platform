from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class ClientCreate(BaseModel):
    name: str
    industry: str | None = None
    bh_id: int | None = None
    hrbp_id: int | None = None
    is_active: bool = True


class ClientUpdate(BaseModel):
    name: str | None = None
    industry: str | None = None
    bh_id: int | None = None
    hrbp_id: int | None = None
    is_active: bool | None = None


class ClientResponse(BaseModel):
    id: int
    name: str
    industry: str | None
    bh_id: int | None
    hrbp_id: int | None
    is_active: bool
    created_at: datetime | None
    updated_at: datetime | None

    class Config:
        from_attributes = True
