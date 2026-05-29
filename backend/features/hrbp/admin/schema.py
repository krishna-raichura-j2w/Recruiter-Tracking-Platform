from __future__ import annotations

from pydantic import BaseModel, EmailStr


class AdminUserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str
    phone: str | None = None


class AdminUserUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    role: str | None = None
    is_active: bool | None = None


class AdminResetPassword(BaseModel):
    new_password: str


class AdminAssignPayload(BaseModel):
    hrbp_id: int | None = None
    hrbp_ids: list[int] | None = None
    bh_id: int | None = None
