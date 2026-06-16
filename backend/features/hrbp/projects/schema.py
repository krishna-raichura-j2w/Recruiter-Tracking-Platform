from pydantic import BaseModel
from typing import Optional


class ProjectCreate(BaseModel):
    name: str
    description: str = ""
    client_id: Optional[int] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None


class MemberAdd(BaseModel):
    consultant_id: int
    cohort: str = "bedrock"
    perf_tier: str = "middle"
    role_in_project: str = ""


class MemberUpdate(BaseModel):
    cohort: Optional[str] = None
    perf_tier: Optional[str] = None
    role_in_project: Optional[str] = None


class TeamCommentRequest(BaseModel):
    comment: str
