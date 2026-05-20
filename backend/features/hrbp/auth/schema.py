from __future__ import annotations
from typing import Optional
from pydantic import BaseModel, EmailStr


class UserResponse(BaseModel):
    id:                   int
    name:                 str
    email:                str
    role:                 str
    secondary_role:       Optional[str]
    recruiter_type:       Optional[str]
    phone:                Optional[str]
    is_active:            bool
    must_change_password: bool

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    name:                 Optional[str]   = None
    email:                Optional[EmailStr] = None
    phone:                Optional[str]   = None
    role:                 Optional[str]   = None
    secondary_role:       Optional[str]   = None
    recruiter_type:       Optional[str]   = None
    is_active:            Optional[bool]  = None
    must_change_password: Optional[bool]  = None
    password:             Optional[str]   = None
