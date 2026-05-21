from __future__ import annotations

from pydantic import BaseModel, EmailStr


class UserResponse(BaseModel):
    id: int
    name: str
    email: str
    role: str
    secondary_role: str | None
    recruiter_type: str | None
    phone: str | None
    is_active: bool
    must_change_password: bool

    class Config:
        from_attributes = True


class RefreshTokenRequest(BaseModel):
    token: str


class UserUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    role: str | None = None
    secondary_role: str | None = None
    recruiter_type: str | None = None
    is_active: bool | None = None
    must_change_password: bool | None = None
    password: str | None = None
